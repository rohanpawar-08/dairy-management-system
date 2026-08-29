import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getCurrentMigrationVersion } from '../db/migrator';

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
 * Guarantees complete atomic consistency: on any failure (verification, rename, or history recording),
 * all newly created temporary and final files are cleanly unlinked, preventing orphaned backup artifacts.
 */
export async function createVerifiedBackup(
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

      // Run integrity_check
      const integrityRows = candidateDb.pragma('integrity_check') as { integrity_check?: string }[];
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
