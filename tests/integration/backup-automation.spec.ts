import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyAndVerifyPragmas } from '../../electron/db/connection';
import { runMigrations } from '../../electron/db/migrator';
import {
  createVerifiedBackup,
  pruneOldBackups,
  getAppManagedBackupDir,
} from '../../electron/services/backup.service';
import {
  createUsbToken,
  resolveUsbToken,
  clearAllUsbTokens,
  _setUsbTokenExpiryForTesting,
} from '../../electron/core/usb-token.store';
import {
  detectRemovableDrives,
  revalidateDriveType2,
  ExecFileFunction,
} from '../../electron/services/usb-detection.service';
import {
  getBackupSchedule,
  updateBackupSchedule,
  checkAndRunScheduledBackup,
  startBackupScheduler,
  stopBackupScheduler,
  isSchedulerRunning,
} from '../../electron/services/backup-scheduler.service';

describe('Stage 10 B4: Backup Automation & Retention Integration', () => {
  let tempDir: string;
  let sourceDbPath: string;
  let appManagedDir: string;
  let externalDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dairy_b4_test_'));
    sourceDbPath = path.join(tempDir, 'dairy_source.db');
    appManagedDir = path.join(tempDir, 'app_backups');
    externalDir = path.join(tempDir, 'external_usb');
    fs.mkdirSync(appManagedDir, { recursive: true });
    fs.mkdirSync(externalDir, { recursive: true });

    process.env['TEST_APP_BACKUP_DIR'] = appManagedDir;

    db = new Database(sourceDbPath);
    applyAndVerifyPragmas(db);
    runMigrations(db);

    clearAllUsbTokens();
    stopBackupScheduler();
  });

  afterEach(() => {
    stopBackupScheduler();
    clearAllUsbTokens();
    delete process.env['TEST_APP_BACKUP_DIR'];

    if (db && db.open) {
      db.close();
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('1. Retention Policy & Boundary Enforcement', () => {
    it('keeps newest 30 routine backups and prunes the 31st and older', () => {
      const stmt = db.prepare(
        `INSERT INTO backup_history (file_path, checksum_sha256, size_bytes, trigger_type, verification_status, created_at)
         VALUES (?, 'dummy_hash', 1024, 'MANUAL', 'VERIFIED', ?)`
      );

      // Create 35 dummy files in app-managed directory
      for (let i = 1; i <= 35; i++) {
        const padded = String(i).padStart(2, '0');
        const filename = `dairy_backup_20260101_1000${padded}_12345678.db`;
        const filePath = path.join(appManagedDir, filename);
        fs.writeFileSync(filePath, `content-${i}`);

        // Created timestamps: i=35 is newest, i=1 is oldest
        const createdAt = new Date(Date.now() - (36 - i) * 60000).toISOString();
        stmt.run(filePath, createdAt);
      }

      const beforeCount = db.prepare('SELECT count(*) as c FROM backup_history').get() as { c: number };
      expect(beforeCount.c).toBe(35);

      const result = pruneOldBackups(db, appManagedDir);
      expect(result.prunedCount).toBe(5);
      expect(result.warnings.length).toBe(0);

      const afterCount = db.prepare('SELECT count(*) as c FROM backup_history').get() as { c: number };
      expect(afterCount.c).toBe(30);

      // Check that the oldest 5 files (i=1..5) were deleted from disk
      for (let i = 1; i <= 5; i++) {
        const padded = String(i).padStart(2, '0');
        const filePath = path.join(appManagedDir, `dairy_backup_20260101_1000${padded}_12345678.db`);
        expect(fs.existsSync(filePath)).toBe(false);
      }

      // Check that newest 30 files (i=6..35) remain intact on disk
      for (let i = 6; i <= 35; i++) {
        const padded = String(i).padStart(2, '0');
        const filePath = path.join(appManagedDir, `dairy_backup_20260101_1000${padded}_12345678.db`);
        expect(fs.existsSync(filePath)).toBe(true);
      }
    });

    it('never auto-deletes PRE_RESTORE_SAFETY or PRE_MIGRATION backups', () => {
      const stmt = db.prepare(
        `INSERT INTO backup_history (file_path, checksum_sha256, size_bytes, trigger_type, verification_status, created_at)
         VALUES (?, 'dummy_hash', 1024, ?, 'VERIFIED', ?)`
      );

      // Create 32 routine backups
      for (let i = 1; i <= 32; i++) {
        const padded = String(i).padStart(2, '0');
        const filename = `dairy_backup_20260101_1000${padded}_12345678.db`;
        const filePath = path.join(appManagedDir, filename);
        fs.writeFileSync(filePath, `routine-${i}`);
        stmt.run(filePath, 'MANUAL', new Date(Date.now() - (40 - i) * 60000).toISOString());
      }

      // Create 1 very old PRE_RESTORE_SAFETY backup
      const safetyFile = path.join(appManagedDir, 'dairy_backup_20250101_000001_12345678.db');
      fs.writeFileSync(safetyFile, 'safety-data');
      stmt.run(safetyFile, 'PRE_RESTORE_SAFETY', '2025-01-01T00:00:01.000Z');

      // Create 1 very old PRE_MIGRATION backup
      const migrationFile = path.join(appManagedDir, 'dairy_backup_20250101_000002_12345678.db');
      fs.writeFileSync(migrationFile, 'migration-data');
      stmt.run(migrationFile, 'PRE_MIGRATION', '2025-01-01T00:00:02.000Z');

      const result = pruneOldBackups(db, appManagedDir);
      // Only 2 routine backups (32 - 30 = 2) should be pruned
      expect(result.prunedCount).toBe(2);

      // Exempt safety and migration backups MUST NOT be deleted
      expect(fs.existsSync(safetyFile)).toBe(true);
      expect(fs.existsSync(migrationFile)).toBe(true);

      const safetyInDb = db.prepare('SELECT id FROM backup_history WHERE file_path = ?').get(safetyFile);
      expect(safetyInDb).toBeDefined();

      const migrationInDb = db.prepare('SELECT id FROM backup_history WHERE file_path = ?').get(migrationFile);
      expect(migrationInDb).toBeDefined();
    });

    it('never deletes backups located outside the app-managed directory (e.g. external/USB)', () => {
      const stmt = db.prepare(
        `INSERT INTO backup_history (file_path, checksum_sha256, size_bytes, trigger_type, verification_status, created_at)
         VALUES (?, 'dummy_hash', 1024, 'MANUAL', 'VERIFIED', ?)`
      );

      // Create 32 backups inside app-managed directory
      for (let i = 1; i <= 32; i++) {
        const padded = String(i).padStart(2, '0');
        const filename = `dairy_backup_20260101_1000${padded}_12345678.db`;
        const filePath = path.join(appManagedDir, filename);
        fs.writeFileSync(filePath, `routine-${i}`);
        stmt.run(filePath, new Date(Date.now() - (40 - i) * 60000).toISOString());
      }

      // Create 5 external USB backups with older timestamps
      for (let i = 1; i <= 5; i++) {
        const filename = `dairy_backup_external_${i}.db`;
        const filePath = path.join(externalDir, filename);
        fs.writeFileSync(filePath, `external-${i}`);
        stmt.run(filePath, '2024-01-01T00:00:00.000Z');
      }

      const result = pruneOldBackups(db, appManagedDir);
      expect(result.prunedCount).toBe(2);

      // All external backups must remain untouched
      for (let i = 1; i <= 5; i++) {
        const filePath = path.join(externalDir, `dairy_backup_external_${i}.db`);
        expect(fs.existsSync(filePath)).toBe(true);
      }
    });

    it('safely skips path-traversal or invalid filenames without throwing', () => {
      const stmt = db.prepare(
        `INSERT INTO backup_history (file_path, checksum_sha256, size_bytes, trigger_type, verification_status, created_at)
         VALUES (?, 'dummy_hash', 1024, 'MANUAL', 'VERIFIED', ?)`
      );

      // Populate 31 backups to trigger pruning of 1
      for (let i = 1; i <= 30; i++) {
        const padded = String(i).padStart(2, '0');
        const filename = `dairy_backup_20260101_1000${padded}_12345678.db`;
        const filePath = path.join(appManagedDir, filename);
        fs.writeFileSync(filePath, `routine-${i}`);
        stmt.run(filePath, new Date(Date.now() - (35 - i) * 60000).toISOString());
      }

      // Insert a 31st candidate with an unusual filename not matching pattern
      const oddFile = path.join(appManagedDir, 'important_notes.txt');
      fs.writeFileSync(oddFile, 'do not delete');
      stmt.run(oddFile, '2024-01-01T00:00:00.000Z');

      const result = pruneOldBackups(db, appManagedDir);
      expect(result.prunedCount).toBe(0);
      expect(result.warnings.some((w) => w.includes('Skipping non-standard backup filename'))).toBe(true);
      expect(fs.existsSync(oddFile)).toBe(true);
    });
  });

  describe('2. USB Detection & Token Security', () => {
    it('creates, resolves, and expires opaque USB tokens correctly', () => {
      const senderId = 42;
      const token = createUsbToken('E:', 'E:\\', senderId);

      expect(token).toMatch(/^[0-9a-f]{64}$/);

      // Successful resolution
      const resolved = resolveUsbToken(token, senderId);
      expect(resolved.deviceId).toBe('E:');
      expect(resolved.driveRoot).toBe('E:\\');

      // Rejects forged token format
      expect(() => resolveUsbToken('invalid-token', senderId)).toThrow('USB_INVALID_TOKEN');

      // Rejects non-existent token
      const nonExistent = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      expect(() => resolveUsbToken(nonExistent, senderId)).toThrow('USB_TOKEN_NOT_FOUND');

      // Rejects mismatched sender
      const tokenForSender = createUsbToken('E:', 'E:\\', senderId);
      expect(() => resolveUsbToken(tokenForSender, 999)).toThrow('USB_TOKEN_SENDER_MISMATCH');

      // Rejects expired token
      const tokenForExpiry = createUsbToken('E:', 'E:\\', senderId);
      _setUsbTokenExpiryForTesting(tokenForExpiry, Date.now() - 1000);
      expect(() => resolveUsbToken(tokenForExpiry, senderId)).toThrow('USB_TOKEN_EXPIRED');
    });

    it('parses Windows CIM removable drives output and never returns paths to renderer', async () => {
      const senderId = 101;
      const fakeOutput = JSON.stringify([
        {
          DeviceID: 'F:',
          VolumeName: 'SANDISK',
          FreeSpace: 16000000000,
          Size: 32000000000,
        },
      ]);

      const mockExecFile: ExecFileFunction = (file, args, options, callback) => {
        callback(null, fakeOutput, '');
      };

      // Mock process.platform
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      try {
        const drives = await detectRemovableDrives(senderId, mockExecFile);
        expect(drives.length).toBe(1);
        expect(drives[0].id).toMatch(/^[0-9a-f]{64}$/);
        expect(drives[0].label).toBe('SANDISK');
        expect(drives[0].freeSpaceBytes).toBe(16000000000);
        expect(drives[0].totalSpaceBytes).toBe(32000000000);

        // Crucial security check: Ensure absolute path or drive letter is NEVER exposed to renderer
        expect((drives[0] as any).driveRoot).toBeUndefined();
        expect((drives[0] as any).deviceId).toBeUndefined();
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      }
    });

    it('returns empty list on timeout or execution error safely', async () => {
      const senderId = 101;
      const mockExecFile: ExecFileFunction = (file, args, options, callback) => {
        callback(new Error('Command timed out after 3000ms'), '', 'Timeout');
      };

      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      try {
        const drives = await detectRemovableDrives(senderId, mockExecFile);
        expect(drives).toEqual([]);
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      }
    });

    it('revalidates DriveType=2 accurately and safely rejects command injection', async () => {
      const mockExecFileValid: ExecFileFunction = (file, args, options, callback) => {
        callback(null, JSON.stringify({ DeviceID: 'G:' }), '');
      };

      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      try {
        const isRemovable = await revalidateDriveType2('G:', mockExecFileValid);
        expect(isRemovable).toBe(true);

        // Reject invalid drive format / injection attempt
        const injection = await revalidateDriveType2("G:' ; Remove-Item -Recurse C:\\ ; #", mockExecFileValid);
        expect(injection).toBe(false);
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      }
    });
  });

  describe('3. Scheduled Daily Backup & Duplicate Prevention', () => {
    it('manages schedule configuration in app_settings table', () => {
      const initial = getBackupSchedule(db);
      expect(initial.enabled).toBe(false);
      expect(initial.time).toBe('20:00');
      expect(initial.lastRunDate).toBeNull();

      const updated = updateBackupSchedule(db, { enabled: true, time: '21:30' });
      expect(updated.enabled).toBe(true);
      expect(updated.time).toBe('21:30');

      const reRead = getBackupSchedule(db);
      expect(reRead.enabled).toBe(true);
      expect(reRead.time).toBe('21:30');

      // Invalid time format rejection
      expect(() => updateBackupSchedule(db, { enabled: true, time: '25:99' })).toThrow(
        'BACKUP_SCHEDULE_INVALID_TIME'
      );
    });

    it('executes scheduled backup when due and prevents duplicate execution on the same local date', async () => {
      updateBackupSchedule(db, { enabled: true, time: '20:00' });

      // Simulate time: 2026-03-31 at 19:30 (before scheduled time)
      const beforeTime = new Date(2026, 2, 31, 19, 30, 0);
      const ranBefore = await checkAndRunScheduledBackup(db, beforeTime);
      expect(ranBefore).toBe(false);

      // Simulate time: 2026-03-31 at 20:05 (after scheduled time)
      const atTime = new Date(2026, 2, 31, 20, 5, 0);
      const ranAt = await checkAndRunScheduledBackup(db, atTime);
      expect(ranAt).toBe(true);

      // Verify that history record was created with AUTOMATIC_SCHEDULED
      const historyRow = db
        .prepare("SELECT * FROM backup_history WHERE trigger_type = 'AUTOMATIC_SCHEDULED'")
        .get() as { trigger_type: string };
      expect(historyRow).toBeDefined();
      expect(historyRow.trigger_type).toBe('AUTOMATIC_SCHEDULED');

      // Verify lastRunDate is recorded
      const schedule = getBackupSchedule(db);
      expect(schedule.lastRunDate).toBe('2026-03-31');

      // Subsequent check later on the same date (e.g. 21:00) MUST NOT run again
      const laterSameDay = new Date(2026, 2, 31, 21, 0, 0);
      const ranLater = await checkAndRunScheduledBackup(db, laterSameDay);
      expect(ranLater).toBe(false);

      // But on the next day at 20:01, it SHOULD run again
      const nextDay = new Date(2026, 3, 1, 20, 1, 0);
      const ranNextDay = await checkAndRunScheduledBackup(db, nextDay);
      expect(ranNextDay).toBe(true);

      const nextSchedule = getBackupSchedule(db);
      expect(nextSchedule.lastRunDate).toBe('2026-04-01');
    });

    it('starts and stops the scheduler timer cleanly', () => {
      expect(isSchedulerRunning()).toBe(false);

      startBackupScheduler(() => db, 5000);
      expect(isSchedulerRunning()).toBe(true);

      stopBackupScheduler();
      expect(isSchedulerRunning()).toBe(false);
    });
  });

  describe('4. Shift Close Async Backup Non-Interference', () => {
    it('creates automatic shift close backup without failing shift closing if backup has non-fatal warnings', async () => {
      const result = await createVerifiedBackup(db, {
        triggerType: 'AUTOMATIC_SHIFT_CLOSE',
      });
      expect(result.verificationStatus).toBe('VERIFIED');
      expect(result.triggerType).toBe('AUTOMATIC_SHIFT_CLOSE');
      expect(fs.existsSync(result.filePath)).toBe(true);
    });
  });
});
