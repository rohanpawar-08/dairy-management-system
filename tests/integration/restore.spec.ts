import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyAndVerifyPragmas, getDatabaseConnection, initDatabaseConnection, closeDatabaseConnection } from '../../electron/db/connection';
import { runMigrations, getCurrentMigrationVersion } from '../../electron/db/migrator';
import {
  executeSafeRestore,
  validateRestoreCandidate,
  createVerifiedBackup,
  RESTORE_FILE_NOT_FOUND,
  RESTORE_INVALID_EXTENSION,
  RESTORE_ACTIVE_DATABASE_SELECTED,
  RESTORE_INVALID_DATABASE,
  RESTORE_INTEGRITY_FAILED,
  RESTORE_FOREIGN_KEY_FAILED,
  RESTORE_SCHEMA_MISSING,
  RESTORE_SCHEMA_INCOMPATIBLE
} from '../../electron/services/backup.service';

describe('Safe Restore Lifecycle Backend Integration (Stage 10)', () => {
  let tempDir: string;
  let activeDbPath: string;
  let backupDir: string;
  let activeDb: Database.Database | null = null;
  let expectedMigrationVersion: number;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dairy_restore_test_'));
    activeDbPath = path.join(tempDir, 'active_dairy.db');
    backupDir = path.join(tempDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });

    activeDb = initDatabaseConnection({ dbPath: activeDbPath });
    runMigrations(activeDb);
    expectedMigrationVersion = getCurrentMigrationVersion(activeDb);
    
    // Add some test data
    activeDb.prepare("INSERT INTO app_settings (key, value) VALUES ('test_key', 'test_value')").run();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    closeDatabaseConnection();
    activeDb = null;
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    }
  });

  it('1. validates a correct candidate', async () => {
    const backupResult = await createVerifiedBackup(activeDb!, {
      destinationDir: backupDir,
      triggerType: 'MANUAL',
    });
    const meta = validateRestoreCandidate(backupResult.filePath, activeDbPath, expectedMigrationVersion);
    expect(meta.sizeBytes).toBeGreaterThan(0);
  });

  it('2. rejects corrupted/non-SQLite candidate', () => {
    const corruptPath = path.join(tempDir, 'corrupt.db');
    fs.writeFileSync(corruptPath, 'this is not a sqlite database');
    expect(() => validateRestoreCandidate(corruptPath, activeDbPath, expectedMigrationVersion)).toThrow(RESTORE_INVALID_DATABASE);
  });

  it('3. rejects foreign-key violation', () => {
    const fkBadPath = path.join(tempDir, 'fk_bad.db');
    const badDb = new Database(fkBadPath);
    runMigrations(badDb);
    badDb.pragma('foreign_keys = OFF');
    badDb.prepare("INSERT INTO milk_collections (receipt_number, shift_id, farmer_id, rate_plan_id, rate_applied_paise, business_date, shift_type, milk_type, quantity_ml, fat_x100, snf_x100, amount_paise, created_by_user_id) VALUES ('R1', 999, 999, 999, 999, '2026-01-01', 'MORNING', 'COW', 1, 1, 1, 1, 999)").run();
    badDb.close();
    expect(() => validateRestoreCandidate(fkBadPath, activeDbPath, expectedMigrationVersion)).toThrow(RESTORE_FOREIGN_KEY_FAILED);
  });

  it('4. rejects missing application schema', () => {
    const emptyPath = path.join(tempDir, 'empty.db');
    const emptyDb = new Database(emptyPath);
    emptyDb.exec('CREATE TABLE dummy (id INT)');
    emptyDb.close();
    expect(() => validateRestoreCandidate(emptyPath, activeDbPath, expectedMigrationVersion)).toThrow(RESTORE_SCHEMA_MISSING);
  });

  it('5. rejects incompatible migration version', () => {
    const oldVersionPath = path.join(tempDir, 'old_version.db');
    const oldDb = new Database(oldVersionPath);
    runMigrations(oldDb);
    oldDb.prepare("INSERT INTO schema_migrations (version, name) VALUES (99999, 'future')").run();
    oldDb.close();
    expect(() => validateRestoreCandidate(oldVersionPath, activeDbPath, expectedMigrationVersion)).toThrow(RESTORE_SCHEMA_INCOMPATIBLE);
  });

  it('6. rejects active database selected as candidate', () => {
    expect(() => validateRestoreCandidate(activeDbPath, activeDbPath, expectedMigrationVersion)).toThrow(RESTORE_ACTIVE_DATABASE_SELECTED);
  });
  
  it('symlink rejection', () => {
    const validCandidate = path.join(tempDir, 'valid.db');
    const db = new Database(validCandidate);
    runMigrations(db);
    db.close();
    
    const symlinkPath = path.join(tempDir, 'symlink.db');
    try {
      fs.symlinkSync(validCandidate, symlinkPath);
    } catch {
      // If symlinks aren't supported on OS without admin, skip gracefully
      return;
    }
    expect(() => validateRestoreCandidate(symlinkPath, activeDbPath, expectedMigrationVersion)).toThrow(RESTORE_INVALID_DATABASE);
  });

  it('7. safety-backup failure leaves active DB unchanged (rollback test)', async () => {
    const candidatePath = path.join(tempDir, 'candidate.db');
    const candidateDb = new Database(candidatePath);
    runMigrations(candidateDb);
    candidateDb.close();
    
    // Lock active db WAL to force safety backup checkpoint failure
    const lockerDb = new Database(activeDbPath);
    lockerDb.pragma('journal_mode = WAL');
    lockerDb.prepare("INSERT INTO app_settings (key, value) VALUES ('lock', '1')").run();
    lockerDb.prepare('BEGIN IMMEDIATE').run();
    lockerDb.prepare("UPDATE app_settings SET value='2' WHERE key='lock'").run();

    await expect(executeSafeRestore(candidatePath, activeDbPath, expectedMigrationVersion)).rejects.toThrow('database is locked');
    lockerDb.close();
    expect(getDatabaseConnection().open).toBe(true);
  }, 10000);

  it('first rename failure', async () => {
    activeDb!.prepare("UPDATE app_settings SET value = 'original_data' WHERE key = 'test_key'").run();
    const backupResult = await createVerifiedBackup(activeDb!, { destinationDir: backupDir });
    
    const mockFsOps = {
      renameSync: (oldPath: fs.PathLike, newPath: fs.PathLike) => {
        if (oldPath.toString() === activeDbPath) throw new Error('Simulated first rename failure');
        fs.renameSync(oldPath, newPath);
      },
      copyFileSync: fs.copyFileSync
    };
    
    await expect(executeSafeRestore(backupResult.filePath, activeDbPath, expectedMigrationVersion, mockFsOps)).rejects.toThrow('Simulated first rename failure');
    const db = getDatabaseConnection();
    expect(db.open).toBe(true);
  });

  it('activation rename failure', async () => {
    activeDb!.prepare("UPDATE app_settings SET value = 'original_data' WHERE key = 'test_key'").run();
    const backupResult = await createVerifiedBackup(activeDb!, { destinationDir: backupDir });
    
    const mockFsOps = {
      renameSync: (oldPath: fs.PathLike, newPath: fs.PathLike) => {
        if (oldPath.toString().includes('.restore_staging') && newPath.toString() === activeDbPath) {
          throw new Error('Simulated activation rename failure');
        }
        fs.renameSync(oldPath, newPath);
      },
      copyFileSync: fs.copyFileSync
    };
    
    await expect(executeSafeRestore(backupResult.filePath, activeDbPath, expectedMigrationVersion, mockFsOps)).rejects.toThrow('Simulated activation rename failure');
    const db = getDatabaseConnection();
    expect(db.open).toBe(true);
    expect((db.prepare("SELECT value FROM app_settings WHERE key='test_key'").get() as any).value).toBe('original_data');
  });

  it('rollback failure', async () => {
    activeDb!.prepare("UPDATE app_settings SET value = 'original_data' WHERE key = 'test_key'").run();
    const backupResult = await createVerifiedBackup(activeDb!, { destinationDir: backupDir });
    
    const mockFsOps = {
      renameSync: (oldPath: fs.PathLike, newPath: fs.PathLike) => {
        if (oldPath.toString().includes('.restore_staging') && newPath.toString() === activeDbPath) {
          throw new Error('Simulated activation rename failure');
        }
        if (oldPath.toString().includes('.rollback') && newPath.toString() === activeDbPath) {
          throw new Error('Simulated rollback failure');
        }
        fs.renameSync(oldPath, newPath);
      },
      copyFileSync: fs.copyFileSync
    };
    
    await expect(executeSafeRestore(backupResult.filePath, activeDbPath, expectedMigrationVersion, mockFsOps)).rejects.toThrow('CRITICAL: Rollback failed! Original data at');
  });

  it('post-open verification failure', async () => {
    activeDb!.prepare("UPDATE app_settings SET value = 'original_data' WHERE key = 'test_key'").run();
    
    const badCandidatePath = path.join(tempDir, 'bad_candidate.db');
    const badDb = new Database(badCandidatePath);
    runMigrations(badDb);
    // Break schema after validation but before restore copy (race condition simulation using copyFileSync mock)
    badDb.close();

    const mockFsOps = {
      renameSync: fs.renameSync,
      copyFileSync: (src: fs.PathLike, dest: fs.PathLike) => {
        fs.copyFileSync(src, dest);
        // Corrupt the staging file before it gets renamed
        const stagingDb = new Database(dest.toString());
        stagingDb.prepare("DROP TABLE farmers").run();
        stagingDb.close();
      }
    };
    
    await expect(executeSafeRestore(badCandidatePath, activeDbPath, expectedMigrationVersion, mockFsOps)).rejects.toThrow(RESTORE_SCHEMA_MISSING);
    const db = getDatabaseConnection();
    expect(db.open).toBe(true);
    expect((db.prepare("SELECT value FROM app_settings WHERE key='test_key'").get() as any).value).toBe('original_data');
  });

  it('unique staging paths and sidecar cleanup', async () => {
    const backupResult = await createVerifiedBackup(activeDb!, { destinationDir: backupDir });
    const result = await executeSafeRestore(backupResult.filePath, activeDbPath, expectedMigrationVersion);
    expect(result.success).toBe(true);
    
    const dirFiles = fs.readdirSync(tempDir);
    const hasStaging = dirFiles.some(f => f.includes('restore_staging'));
    const hasRollback = dirFiles.some(f => f.includes('rollback'));
    expect(hasStaging).toBe(false);
    expect(hasRollback).toBe(false);
  });

  it('8. successful replacement loads candidate data and 12. safety backup remains', async () => {
    activeDb!.prepare("UPDATE app_settings SET value = 'active_data' WHERE key = 'test_key'").run();

    const candidatePath = path.join(tempDir, 'candidate.db');
    const candidateDb = new Database(candidatePath);
    runMigrations(candidateDb);
    candidateDb.prepare("INSERT INTO app_settings (key, value) VALUES ('test_key', 'candidate_data')").run();
    candidateDb.close();

    const result = await executeSafeRestore(candidatePath, activeDbPath, expectedMigrationVersion);
    expect(result.success).toBe(true);
    expect(result.safetyBackup).not.toBeNull();
    expect(fs.existsSync(result.safetyBackup!.filePath)).toBe(true);

    const newDb = getDatabaseConnection();
    const row = newDb.prepare("SELECT value FROM app_settings WHERE key = 'test_key'").get() as {value: string};
    expect(row.value).toBe('candidate_data');
  });

  it('13. mutex rejects concurrent operations', async () => {
    const backupResult = await createVerifiedBackup(activeDb!, {
      destinationDir: backupDir,
      triggerType: 'MANUAL',
    });
    
    const p1 = executeSafeRestore(backupResult.filePath, activeDbPath, expectedMigrationVersion);
    const p2 = executeSafeRestore(backupResult.filePath, activeDbPath, expectedMigrationVersion);
    
    await expect(p2).rejects.toThrow('Concurrent backup or restore operation is already running.');
    await p1;
  });
});
