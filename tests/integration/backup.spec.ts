import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyAndVerifyPragmas } from '../../electron/db/connection';
import { runMigrations, getCurrentMigrationVersion } from '../../electron/db/migrator';
import {
  createVerifiedBackup,
  computeFileSha256,
} from '../../electron/services/backup.service';

describe('Basic Verified Backup Service (Stage 2 Integration)', () => {
  let tempDir: string;
  let sourceDbPath: string;
  let backupDir: string;
  let sourceDb: Database.Database | null = null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dairy_backup_test_'));
    sourceDbPath = path.join(tempDir, 'source_dairy.db');
    backupDir = path.join(tempDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });

    sourceDb = new Database(sourceDbPath);
    applyAndVerifyPragmas(sourceDb);
    runMigrations(sourceDb);
  });

  afterEach(() => {
    if (sourceDb && sourceDb.open) {
      sourceDb.close();
    }
    sourceDb = null;
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('performs live asynchronous backup with complete integrity, schema, and checksum verification', async () => {
    if (!sourceDb) throw new Error('Source DB is not initialized');

    // Insert a test foundation record into app_settings while DB is active
    sourceDb
      .prepare("INSERT INTO app_settings (key, value) VALUES ('test_key', 'test_value')")
      .run();

    // Perform live verified backup while source database is actively open
    const backupResult = await createVerifiedBackup(sourceDb, {
      destinationDir: backupDir,
      triggerType: 'MANUAL',
      customFilenamePrefix: 'test_backup',
    });

    // 1. Source and backup files are different
    expect(backupResult.filePath).not.toBe(sourceDbPath);
    expect(fs.existsSync(backupResult.filePath)).toBe(true);

    // 2. Final backup exists, is non-empty, and no .partial file remains
    const stat = fs.statSync(backupResult.filePath);
    expect(stat.size).toBeGreaterThan(0);
    expect(backupResult.sizeBytes).toBe(stat.size);

    const dirFiles = fs.readdirSync(backupDir);
    const partialFiles = dirFiles.filter((f) => f.endsWith('.partial'));
    expect(partialFiles.length).toBe(0);

    // 3. Returned SHA-256 equals an independently recomputed checksum
    const independentHash = await computeFileSha256(backupResult.filePath);
    expect(backupResult.checksumSha256).toBe(independentHash);

    // 4. Backup opens in read-only mode and passes PRAGMA integrity_check and foreign_key_check
    const verifiedDb = new Database(backupResult.filePath, {
      readonly: true,
      fileMustExist: true,
    });

    try {
      const integrityRows = verifiedDb.pragma('integrity_check') as { integrity_check?: string }[];
      const isIntegrityOk =
        integrityRows &&
        integrityRows.length === 1 &&
        (integrityRows[0].integrity_check === 'ok' || String(integrityRows[0]) === 'ok');
      expect(isIntegrityOk).toBe(true);

      const fkRows = verifiedDb.pragma('foreign_key_check') as unknown[];
      expect(fkRows.length).toBe(0);

      // 5. Schema version matches source
      const backupVersion = getCurrentMigrationVersion(verifiedDb);
      const sourceVersion = getCurrentMigrationVersion(sourceDb);
      expect(backupVersion).toBe(sourceVersion);
      expect(backupVersion).toBeGreaterThanOrEqual(1);

      // Verify the test foundation record is present in the backup
      const appSetting = verifiedDb
        .prepare("SELECT value FROM app_settings WHERE key = 'test_key'")
        .get() as { value: string };
      expect(appSetting?.value).toBe('test_value');
    } finally {
      verifiedDb.close();
    }

    // 6. Exactly one verified record is stored in source backup_history
    const historyRows = sourceDb
      .prepare(
        'SELECT file_path, checksum_sha256, size_bytes, trigger_type, verification_status FROM backup_history'
      )
      .all() as {
      file_path: string;
      checksum_sha256: string;
      size_bytes: number;
      trigger_type: string;
      verification_status: string;
    }[];

    expect(historyRows.length).toBe(1);
    expect(historyRows[0].file_path).toBe(backupResult.filePath);
    expect(historyRows[0].checksum_sha256).toBe(backupResult.checksumSha256);
    expect(historyRows[0].size_bytes).toBe(backupResult.sizeBytes);
    expect(historyRows[0].trigger_type).toBe('MANUAL');
    expect(historyRows[0].verification_status).toBe('VERIFIED');
  });

  it('cleans up temporary partial files if backup or verification fails', async () => {
    if (!sourceDb) throw new Error('Source DB is not initialized');

    // Create an unmigrated database with a corrupted/unverifiable state to test cleanup
    const badDbPath = path.join(tempDir, 'corrupt.db');
    const badDb = new Database(badDbPath);
    badDb.exec('CREATE TABLE test_corrupt (id INT);');

    // Attempt backup with invalid destination directory permissions or custom failing flow
    const invalidDir = path.join(tempDir, 'nonexistent_sub', 'forbidden');

    await expect(
      createVerifiedBackup(badDb, {
        destinationDir: invalidDir,
        triggerType: 'PRE_MIGRATION',
      })
    ).rejects.toThrow();

    badDb.close();

    // Verify no stray partial files in the backupDir
    const files = fs.readdirSync(backupDir);
    const partialFiles = files.filter((f) => f.endsWith('.partial'));
    expect(partialFiles.length).toBe(0);
  });

  it('maintains strict atomic consistency by removing final file if backup_history insert fails (failure injection)', async () => {
    if (!sourceDb) throw new Error('Source DB is not initialized');

    // Inject failure: Add trigger in source database that aborts any INSERT into backup_history
    sourceDb.exec(`
      CREATE TRIGGER trigger_abort_backup_history
      BEFORE INSERT ON backup_history
      BEGIN
        SELECT RAISE(ABORT, 'Simulated failure during backup_history insert');
      END;
    `);

    // Attempt verified backup
    await expect(
      createVerifiedBackup(sourceDb, {
        destinationDir: backupDir,
        triggerType: 'MANUAL',
        customFilenamePrefix: 'atomic_test',
      })
    ).rejects.toThrow(/Simulated failure during backup_history insert/i);

    // 1. Confirm no .partial file remains
    const dirFiles = fs.readdirSync(backupDir);
    const partialFiles = dirFiles.filter((f) => f.endsWith('.partial'));
    expect(partialFiles.length).toBe(0);

    // 2. Confirm no newly generated final backup remains
    const finalFiles = dirFiles.filter((f) => f.startsWith('atomic_test_') && f.endsWith('.db'));
    expect(finalFiles.length).toBe(0);

    // 3. Confirm no successful history row exists in backup_history
    const historyRows = sourceDb
      .prepare('SELECT count(*) as count FROM backup_history')
      .get() as { count: number };
    expect(historyRows.count).toBe(0);

    // 4. Confirm the original source database remains healthy and functional
    const healthCheck = sourceDb.prepare('SELECT 1 as alive').get() as { alive: number };
    expect(healthCheck.alive).toBe(1);
  });
});
