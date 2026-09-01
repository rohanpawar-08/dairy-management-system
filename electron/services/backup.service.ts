import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getCurrentMigrationVersion } from '../db/migrator';
import { closeDatabaseConnection, initDatabaseConnection, applyAndVerifyPragmas } from '../db/connection';

// Internal error codes for backend integration
export const RESTORE_FILE_NOT_FOUND = 'RESTORE_FILE_NOT_FOUND';
export const RESTORE_INVALID_EXTENSION = 'RESTORE_INVALID_EXTENSION';
export const RESTORE_ACTIVE_DATABASE_SELECTED = 'RESTORE_ACTIVE_DATABASE_SELECTED';
export const RESTORE_INVALID_DATABASE = 'RESTORE_INVALID_DATABASE';
export const RESTORE_INTEGRITY_FAILED = 'RESTORE_INTEGRITY_FAILED';
export const RESTORE_FOREIGN_KEY_FAILED = 'RESTORE_FOREIGN_KEY_FAILED';
export const RESTORE_SCHEMA_MISSING = 'RESTORE_SCHEMA_MISSING';
export const RESTORE_SCHEMA_INCOMPATIBLE = 'RESTORE_SCHEMA_INCOMPATIBLE';

// Process-level mutex
let isRestoreOrBackupRunning = false;

export type BackupTriggerType =
  | 'MANUAL'
  | 'AUTOMATIC_SHIFT_CLOSE'
  | 'AUTOMATIC_SCHEDULED'
  | 'APP_SHUTDOWN_BEST_EFFORT'
  | 'PRE_RESTORE_SAFETY'
  | 'PRE_MIGRATION';

export interface BackupOptions {
  destinationDir?: string;
  triggerType?: BackupTriggerType;
  customFilenamePrefix?: string;
}

export interface BackupResult {
  filePath: string;
  checksumSha256: string;
  sizeBytes: number;
  triggerType: BackupTriggerType;
  verificationStatus: 'VERIFIED';
  migrationVersion: number;
  createdAt: string;
}

/**
 * Compute the SHA-256 hash of a file using streams.
 */
export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('error', (err) => reject(err));
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Perform a live, non-blocking asynchronous backup of the SQLite database with rigorous integrity checks.
 * Internal helper that doesn't acquire the mutex.
 */
async function doCreateVerifiedBackup(
  sourceDb: Database.Database,
  options: BackupOptions = {}
): Promise<BackupResult> {
  const triggerType: BackupTriggerType = options.triggerType ?? 'MANUAL';
  const destDir = options.destinationDir ?? path.join(process.cwd(), 'backups');

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Generate collision-safe timestamped filename
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:]/g, '').replace('T', '_').replace(/\..+/, '');
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const prefix = options.customFilenamePrefix ? `${options.customFilenamePrefix}_` : 'dairy_backup_';

    const baseName = `${prefix}${timestamp}_${randomSuffix}.db`;
    const partialFilePath = path.join(destDir, `${baseName}.partial`);
    const finalFilePath = path.join(destDir, baseName);

    if (fs.existsSync(finalFilePath) || fs.existsSync(partialFilePath)) {
      throw new Error(`Backup collision error: target file already exists: ${finalFilePath}`);
    }

    // Track created files for rollback on error
    let createdPartialFile: string | null = null;
    let createdFinalFile: string | null = null;

    try {
      // 1. Execute live async backup to partial file path
      createdPartialFile = partialFilePath;
      await sourceDb.backup(partialFilePath);

      // 2. Open candidate backup in read-only mode to verify integrity
      let candidateDb: Database.Database | null = null;
      let backupMigrationVersion = 0;

      try {
        candidateDb = new Database(partialFilePath, {
          readonly: true,
          fileMustExist: true,
        });

        let integrityRows;
        try {
          integrityRows = candidateDb.pragma('integrity_check') as { integrity_check?: string }[];
        } catch (err) {
          if (err instanceof Error && err.message.includes('file is not a database')) {
            throw new Error(RESTORE_INVALID_DATABASE);
          }
          throw err;
        }
        const isIntegrityOk =
          integrityRows &&
          integrityRows.length === 1 &&
          (integrityRows[0].integrity_check === 'ok' || String(integrityRows[0]) === 'ok');

        if (!isIntegrityOk) {
          throw new Error(
            `Backup verification failed: PRAGMA integrity_check returned '${JSON.stringify(integrityRows)}'`
          );
        }

        // Run foreign_key_check
        const fkRows = candidateDb.pragma('foreign_key_check') as unknown[];
        if (fkRows && fkRows.length > 0) {
          throw new Error(
            `Backup verification failed: PRAGMA foreign_key_check found ${fkRows.length} violations`
          );
        }

        // Check migration schema version
        const sourceVersion = getCurrentMigrationVersion(sourceDb);
        backupMigrationVersion = getCurrentMigrationVersion(candidateDb);

        if (sourceVersion !== backupMigrationVersion) {
          throw new Error(
            `Backup verification failed: Migration version mismatch (Source: ${sourceVersion}, Backup: ${backupMigrationVersion})`
          );
        }
      } finally {
        if (candidateDb) {
          candidateDb.close();
        }
      }

      // 3. Compute SHA-256 checksum and file size
      const checksum = await computeFileSha256(partialFilePath);
      const stat = fs.statSync(partialFilePath);
      const sizeBytes = stat.size;

      if (sizeBytes === 0) {
        throw new Error('Backup verification failed: Generated backup file is empty (0 bytes).');
      }

      // 4. Atomically rename verified partial file to final filename
      fs.renameSync(partialFilePath, finalFilePath);
      createdFinalFile = finalFilePath;
      createdPartialFile = null; // Successfully transitioned from partial to final

      // 5. Record verified backup in source database backup_history table
      const createdAt = new Date().toISOString();
      const insertHistoryStmt = sourceDb.prepare(
        `INSERT INTO backup_history (file_path, checksum_sha256, size_bytes, trigger_type, verification_status, created_at)
         VALUES (?, ?, ?, ?, 'VERIFIED', ?)`
      );
      insertHistoryStmt.run(finalFilePath, checksum, sizeBytes, triggerType, createdAt);

      return {
        filePath: finalFilePath,
        checksumSha256: checksum,
        sizeBytes,
        triggerType,
        verificationStatus: 'VERIFIED',
        migrationVersion: backupMigrationVersion,
        createdAt,
      };
    } catch (error) {
      // Atomic rollback: Clean up only files created during this operation
      if (createdPartialFile && fs.existsSync(createdPartialFile)) {
        try {
          fs.unlinkSync(createdPartialFile);
        } catch {
          // Suppress secondary unlink error
        }
      }

      if (createdFinalFile && fs.existsSync(createdFinalFile)) {
        try {
          fs.unlinkSync(createdFinalFile);
        } catch {
          // Suppress secondary unlink error
        }
      }

      throw error;
  }
}

/**
 * Perform a live, non-blocking asynchronous backup of the SQLite database with rigorous integrity checks.
 */
export async function createVerifiedBackup(
  sourceDb: Database.Database,
  options: BackupOptions = {}
): Promise<BackupResult> {
  if (isRestoreOrBackupRunning) {
    throw new Error('Concurrent backup or restore operation is already running.');
  }
  isRestoreOrBackupRunning = true;
  try {
    return await doCreateVerifiedBackup(sourceDb, options);
  } finally {
    isRestoreOrBackupRunning = false;
  }
}

export interface RestoreValidationMetadata {
  sizeBytes: number;
}

export function validateRestoreCandidate(
  candidatePath: string,
  activeDbPath: string,
  expectedMigrationVersion: number
): RestoreValidationMetadata {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(candidatePath);
  } catch (e) {
    throw new Error(RESTORE_FILE_NOT_FOUND);
  }
  if (stat.isSymbolicLink()) {
    throw new Error(RESTORE_INVALID_DATABASE);
  }
  if (!stat.isFile()) {
    throw new Error(RESTORE_FILE_NOT_FOUND);
  }

  let canonCandidate: string;
  let canonActive: string;
  try {
    canonCandidate = fs.realpathSync(candidatePath);
  } catch (e) {
    throw new Error(RESTORE_FILE_NOT_FOUND);
  }
  try {
    canonActive = fs.realpathSync(activeDbPath);
  } catch (e) {
    canonActive = path.resolve(activeDbPath);
  }

  if (path.extname(canonCandidate).toLowerCase() !== '.db') {
    throw new Error(RESTORE_INVALID_EXTENSION);
  }

  if (canonCandidate.toLowerCase() === canonActive.toLowerCase()) {
    throw new Error(RESTORE_ACTIVE_DATABASE_SELECTED);
  }

  let db: Database.Database | null = null;
  try {
    try {
      db = new Database(canonCandidate, { readonly: true, fileMustExist: true });
    } catch (e) {
      throw new Error(RESTORE_INVALID_DATABASE);
    }

    let integrityRows;
    try {
      integrityRows = db.pragma('integrity_check') as { integrity_check?: string }[];
    } catch (e) {
      if (e instanceof Error && e.message.includes('file is not a database')) {
        throw new Error(RESTORE_INVALID_DATABASE);
      }
      throw e;
    }
    const isIntegrityOk =
      integrityRows &&
      integrityRows.length === 1 &&
      (integrityRows[0].integrity_check === 'ok' || String(integrityRows[0]) === 'ok');
    if (!isIntegrityOk) {
      throw new Error(RESTORE_INTEGRITY_FAILED);
    }

    const fkRows = db.pragma('foreign_key_check') as unknown[];
    if (fkRows && fkRows.length > 0) {
      throw new Error(RESTORE_FOREIGN_KEY_FAILED);
    }

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name: string}[];
    const tableNames = tables.map(t => t.name);
    if (!tableNames.includes('schema_migrations') || !tableNames.includes('farmers')) {
      throw new Error(RESTORE_SCHEMA_MISSING);
    }

    let backupVersion = 0;
    try {
       const row = db.prepare('SELECT MAX(version) as max_version FROM schema_migrations').get() as { max_version: number | null };
       backupVersion = row?.max_version ?? 0;
    } catch {
       throw new Error(RESTORE_SCHEMA_MISSING);
    }

    if (backupVersion !== expectedMigrationVersion) {
      throw new Error(RESTORE_SCHEMA_INCOMPATIBLE);
    }
  } finally {
    if (db) {
      db.close();
    }
  }

  return { sizeBytes: stat.size };
}

export interface RestoreResult {
  success: boolean;
  safetyBackup: BackupResult | null;
}

function safeCleanup(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

export interface FileSystemOperations {
  renameSync: typeof fs.renameSync;
  copyFileSync: typeof fs.copyFileSync;
}
const defaultFsOps: FileSystemOperations = { renameSync: fs.renameSync, copyFileSync: fs.copyFileSync };

export async function executeSafeRestore(
  candidatePath: string,
  activeDbPath: string,
  expectedMigrationVersion: number,
  fsOps: FileSystemOperations = defaultFsOps
): Promise<RestoreResult> {
  if (isRestoreOrBackupRunning) {
    throw new Error('Concurrent backup or restore operation is already running.');
  }
  isRestoreOrBackupRunning = true;

  const runId = crypto.randomBytes(4).toString('hex');
  const stagingPath = `${activeDbPath}.restore_staging_${runId}`;
  const rollbackPath = `${activeDbPath}.rollback_${runId}`;
  let safetyBackup: BackupResult | null = null;

  try {
    // 1. Validate Candidate
    validateRestoreCandidate(candidatePath, activeDbPath, expectedMigrationVersion);

    // 2. Pre-restore Safety Backup
    let activeDb: Database.Database | null = null;
    try {
      activeDb = initDatabaseConnection({ dbPath: activeDbPath });

      safetyBackup = await doCreateVerifiedBackup(activeDb, {
        triggerType: 'PRE_RESTORE_SAFETY',
        customFilenamePrefix: 'dairy_data_pre_restore',
      });

      const cpRows = activeDb.pragma('wal_checkpoint(TRUNCATE)') as any;
      const busy = Array.isArray(cpRows) ? cpRows[0]?.busy : cpRows?.busy;
      if (busy === 1) {
        throw new Error('Database is busy, cannot checkpoint WAL safely.');
      }
    } catch (e) {
      throw e;
    }

    // 3. Staging Candidate
    fsOps.copyFileSync(candidatePath, stagingPath);
    try {
      const fd = fs.openSync(stagingPath, 'r+');
      fs.fdatasyncSync(fd);
      fs.closeSync(fd);
    } catch (e) {
      // Best effort flush
    }

    // 4. Connection Teardown
    closeDatabaseConnection();

    // 5. Atomic Replacement
    try {
      fsOps.renameSync(activeDbPath, rollbackPath);
    } catch (firstRenameErr) {
      initDatabaseConnection({ dbPath: activeDbPath });
      throw firstRenameErr;
    }

    try {
      fsOps.renameSync(stagingPath, activeDbPath);
    } catch (renameErr) {
      try {
        fsOps.renameSync(rollbackPath, activeDbPath);
      } catch (rollbackErr) {
        throw new Error(`CRITICAL: Rollback failed! Original data at ${rollbackPath}`);
      }
      initDatabaseConnection({ dbPath: activeDbPath });
      throw renameErr;
    }

    // Cleanup sidecars now that active is renamed and safely closed
    safeCleanup(`${activeDbPath}-wal`);
    safeCleanup(`${activeDbPath}-shm`);

    // 6. Reopen & Verify
    let newDb: Database.Database | null = null;
    try {
      newDb = initDatabaseConnection({ dbPath: activeDbPath });

      let integrityRows;
      try {
        integrityRows = newDb.pragma('integrity_check') as { integrity_check?: string }[];
      } catch {
        throw new Error(RESTORE_INTEGRITY_FAILED);
      }
      if (!integrityRows || integrityRows.length !== 1 || (integrityRows[0].integrity_check !== 'ok' && String(integrityRows[0]) !== 'ok')) {
        throw new Error(RESTORE_INTEGRITY_FAILED);
      }

      const fkRows = newDb.pragma('foreign_key_check') as unknown[];
      if (fkRows && fkRows.length > 0) {
        throw new Error(RESTORE_FOREIGN_KEY_FAILED);
      }

      const tables = newDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name: string}[];
      const tableNames = tables.map(t => t.name);
      if (!tableNames.includes('schema_migrations') || !tableNames.includes('farmers')) {
        throw new Error(RESTORE_SCHEMA_MISSING);
      }

      const row = newDb.prepare('SELECT MAX(version) as max_version FROM schema_migrations').get() as { max_version: number | null };
      const backupVersion = row?.max_version ?? 0;
      if (backupVersion !== expectedMigrationVersion) {
        throw new Error(RESTORE_SCHEMA_INCOMPATIBLE);
      }

    } catch (verifyErr) {
      if (newDb) {
        closeDatabaseConnection();
      }
      safeCleanup(activeDbPath);
      try {
        fsOps.renameSync(rollbackPath, activeDbPath);
      } catch {
        throw new Error(`CRITICAL: Post-verification rollback failed! Original data at ${rollbackPath}`);
      }
      initDatabaseConnection({ dbPath: activeDbPath });
      throw verifyErr;
    }

    safeCleanup(rollbackPath);

    return {
      success: true,
      safetyBackup
    };

  } finally {
    safeCleanup(stagingPath);
    isRestoreOrBackupRunning = false;
  }
}
