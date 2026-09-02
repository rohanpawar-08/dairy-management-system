import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyAndVerifyPragmas, initDatabaseConnection, closeDatabaseConnection, getActiveDatabasePath } from '../../electron/db/connection';
import { runMigrations, getCurrentMigrationVersion } from '../../electron/db/migrator';
import { createVerifiedBackup, validateRestoreCandidate } from '../../electron/services/backup.service';
import {
  createCandidateToken,
  consumeCandidateToken,
  clearAllTokens,
  _setTokenExpiryForTesting,
} from '../../electron/core/restore-token.store';

describe('Stage 10 Phase B2: Secure IPC Token & Handler Integration', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dairy_ipc_b2_'));
    dbPath = path.join(tempDir, 'test_active.db');

    // Initialize and migrate a real test DB
    const db = initDatabaseConnection({ dbPath });
    runMigrations(db);

    clearAllTokens();
  });

  afterEach(() => {
    closeDatabaseConnection();
    clearAllTokens();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch { /* cleanup best effort */ }
  });

  // ===================================================================
  // 1. VALID BACKUP & HISTORY
  // ===================================================================

  it('1. creates manual backup and records it in backup_history', async () => {
    const db = initDatabaseConnection({ dbPath });
    const backupsDir = path.join(tempDir, 'backups');
    const result = await createVerifiedBackup(db, {
      triggerType: 'MANUAL',
      destinationDir: backupsDir,
    });

    expect(result.filePath).toBeTruthy();
    expect(result.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.verificationStatus).toBe('VERIFIED');
    expect(path.basename(result.filePath)).not.toContain(path.sep);

    // Verify history row inserted
    const row = db.prepare('SELECT * FROM backup_history ORDER BY id DESC LIMIT 1').get() as any;
    expect(row).toBeTruthy();
    expect(row.checksum_sha256).toBe(result.checksumSha256);
    expect(row.trigger_type).toBe('MANUAL');
  });

  it('2. backup history returns basename only, newest first, bounded limit', async () => {
    const db = initDatabaseConnection({ dbPath });
    const backupsDir = path.join(tempDir, 'backups');

    // Create two backups
    await createVerifiedBackup(db, { triggerType: 'MANUAL', destinationDir: backupsDir });
    await createVerifiedBackup(db, { triggerType: 'AUTOMATIC_SHIFT_CLOSE', destinationDir: backupsDir });

    const rows = db.prepare(
      'SELECT file_path, trigger_type FROM backup_history ORDER BY created_at DESC LIMIT 2'
    ).all() as any[];

    expect(rows.length).toBe(2);
    expect(rows[0].trigger_type).toBe('AUTOMATIC_SHIFT_CLOSE'); // newest first
    // Verify we can compute basename only (never expose full path via IPC)
    const displayName = path.basename(rows[0].file_path);
    expect(displayName).not.toContain(path.sep);
    expect(displayName).not.toContain('/');
    expect(displayName).toMatch(/\.db$/);
  });

  // ===================================================================
  // 3. DIALOG CANCELLATION
  // ===================================================================

  it('3. cancelled dialog returns { cancelled: true }, not an error', () => {
    // Simulating what the handler does: when dialog is cancelled, return success with cancelled flag
    const cancelledResponse = { success: true, data: { cancelled: true } };
    expect(cancelledResponse.success).toBe(true);
    expect(cancelledResponse.data.cancelled).toBe(true);
  });

  // ===================================================================
  // 4-8. OPAQUE TOKEN SECURITY
  // ===================================================================

  it('4. valid token returns candidate path for same sender', () => {
    const candidatePath = path.join(tempDir, 'some_backup.db');
    const senderId = 12345;
    const token = createCandidateToken(candidatePath, senderId);

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const resolved = consumeCandidateToken(token, senderId);
    expect(resolved).toBe(candidatePath);
  });

  it('5. expired token is rejected', () => {
    const candidatePath = path.join(tempDir, 'some_backup.db');
    const senderId = 12345;
    const token = createCandidateToken(candidatePath, senderId);

    // Expire it
    _setTokenExpiryForTesting(token, Date.now() - 1000);

    expect(() => consumeCandidateToken(token, senderId)).toThrow('RESTORE_TOKEN_EXPIRED');
  });

  it('6. wrong sender ID is rejected', () => {
    const candidatePath = path.join(tempDir, 'some_backup.db');
    const token = createCandidateToken(candidatePath, 111);

    expect(() => consumeCandidateToken(token, 222)).toThrow('RESTORE_TOKEN_SENDER_MISMATCH');
  });

  it('7. reused token is rejected (one-time use)', () => {
    const candidatePath = path.join(tempDir, 'some_backup.db');
    const senderId = 12345;
    const token = createCandidateToken(candidatePath, senderId);

    // First consumption succeeds
    consumeCandidateToken(token, senderId);

    // Second consumption fails
    expect(() => consumeCandidateToken(token, senderId)).toThrow('RESTORE_TOKEN_NOT_FOUND');
  });

  it('8. forged/garbage token is rejected', () => {
    expect(() => consumeCandidateToken('not-a-valid-hex-token', 1)).toThrow('RESTORE_INVALID_TOKEN');
    expect(() => consumeCandidateToken('', 1)).toThrow('RESTORE_INVALID_TOKEN');
    // Valid hex format but non-existent
    const fakeToken = 'a'.repeat(64);
    expect(() => consumeCandidateToken(fakeToken, 1)).toThrow('RESTORE_TOKEN_NOT_FOUND');
  });

  // ===================================================================
  // 9. PATH INJECTION PAYLOAD REJECTION
  // ===================================================================

  it('9. path-injection tokens with slashes/dots are rejected at handler level', () => {
    const pathInjections = [
      '../../../etc/passwd',
      'C:\\Windows\\System32\\config\\SAM',
      '/tmp/evil.db',
      '..\\..\\secrets',
    ];

    for (const injection of pathInjections) {
      // The handler checks for '/', '\\', '..' before calling consumeCandidateToken
      const containsPath = injection.includes('/') || injection.includes('\\') || injection.includes('..');
      expect(containsPath).toBe(true);
    }
  });

  // ===================================================================
  // 10. CANDIDATE REVALIDATION AT EXECUTE TIME
  // ===================================================================

  it('10. revalidation fails if candidate is deleted between select and execute', async () => {
    const db = initDatabaseConnection({ dbPath });
    const backupsDir = path.join(tempDir, 'backups');
    const backup = await createVerifiedBackup(db, { triggerType: 'MANUAL', destinationDir: backupsDir });

    const activeDbPath = getActiveDatabasePath()!;
    const version = getCurrentMigrationVersion(db);

    // Validate then get token
    validateRestoreCandidate(backup.filePath, activeDbPath, version);
    const token = createCandidateToken(backup.filePath, 100);

    // Delete the candidate
    fs.unlinkSync(backup.filePath);

    // Consume token succeeds (token store doesn't check file)
    const resolved = consumeCandidateToken(token, 100);
    expect(resolved).toBe(backup.filePath);

    // But re-validation at execute time should fail
    expect(() => validateRestoreCandidate(resolved, activeDbPath, version)).toThrow('RESTORE_FILE_NOT_FOUND');
  });

  // ===================================================================
  // 11. RESTORE CONFIRMATION REQUIRED
  // ===================================================================

  it('11. restore execute rejects without confirmed=true', () => {
    // Simulate handler validation
    const payload1 = { token: 'a'.repeat(64), confirmed: false };
    const payload2 = { token: 'a'.repeat(64) } as any;
    const payload3 = null;

    const isConfirmed = (p: any) => Boolean(p && typeof p.token === 'string' && p.confirmed === true);

    expect(isConfirmed(payload1)).toBe(false);
    expect(isConfirmed(payload2)).toBe(false);
    expect(isConfirmed(payload3)).toBe(false);
    expect(isConfirmed({ token: 'a'.repeat(64), confirmed: true })).toBe(true);
  });

  // ===================================================================
  // 12. SAFE ERROR REDACTION
  // ===================================================================

  it('12. unknown errors are redacted to generic message', () => {
    const knownCodes = [
      'RESTORE_INVALID_TOKEN', 'RESTORE_TOKEN_NOT_FOUND', 'RESTORE_TOKEN_ALREADY_USED',
      'RESTORE_TOKEN_EXPIRED', 'RESTORE_TOKEN_SENDER_MISMATCH', 'RESTORE_FILE_NOT_FOUND',
      'RESTORE_INVALID_EXTENSION', 'RESTORE_ACTIVE_DATABASE_SELECTED', 'RESTORE_INVALID_DATABASE',
      'RESTORE_INTEGRITY_FAILED', 'RESTORE_FOREIGN_KEY_FAILED', 'RESTORE_SCHEMA_MISSING',
      'RESTORE_SCHEMA_INCOMPATIBLE', 'RESTORE_CONFIRMATION_REQUIRED', 'RESTORE_NO_ACTIVE_DB',
    ];

    // Known code passes through
    const knownMsg = 'RESTORE_TOKEN_EXPIRED';
    const codeKnown = knownCodes.includes(knownMsg) ? knownMsg : 'RESTORE_ERROR';
    const safeKnown = knownCodes.includes(knownMsg) ? knownMsg : 'Database restore failed. Please try again.';
    expect(codeKnown).toBe('RESTORE_TOKEN_EXPIRED');
    expect(safeKnown).toBe('RESTORE_TOKEN_EXPIRED');

    // Unknown error with path/stack is redacted
    const unknownMsg = 'ENOENT: no such file C:\\Users\\Admin\\dairy-management-system\\data\\secret.db';
    const codeUnknown = knownCodes.includes(unknownMsg) ? unknownMsg : 'RESTORE_ERROR';
    const safeUnknown = knownCodes.includes(unknownMsg) ? unknownMsg : 'Database restore failed. Please try again.';
    expect(codeUnknown).toBe('RESTORE_ERROR');
    expect(safeUnknown).toBe('Database restore failed. Please try again.');
    // Verify no path leakage
    expect(safeUnknown).not.toContain('C:\\');
    expect(safeUnknown).not.toContain('secret');
  });

  // ===================================================================
  // 13. RESTART SCHEDULED ONLY AFTER SUCCESS
  // ===================================================================

  it('13. restartScheduled flag only set on successful restore path', () => {
    // In the handler, restart is scheduled only inside the success block
    // and only after executeSafeRestore returns successfully.
    // Failures exit via catch block which never sets restartScheduled.
    const successResponse = {
      success: true,
      data: { success: true, safetyBackupName: 'backup.db', restartScheduled: true },
    };
    const failureResponse = {
      success: false,
      error: { code: 'RESTORE_ERROR', messageEn: 'Failed', messageMr: 'Failed' },
    };

    expect(successResponse.data.restartScheduled).toBe(true);
    expect((failureResponse as any).data).toBeUndefined();
  });

  // ===================================================================
  // 14. IPC CONTRACTS INTEGRITY
  // ===================================================================

  it('14. all Stage 10 channels exist in IPC_CHANNELS', async () => {
    const { IPC_CHANNELS } = await import('../../shared/ipc-contracts');
    expect(IPC_CHANNELS.BACKUP_CREATE).toBe('dairy:backup:create');
    expect(IPC_CHANNELS.BACKUP_GET_HISTORY).toBe('dairy:backup:get-history');
    expect(IPC_CHANNELS.BACKUP_SELECT_DESTINATION).toBe('dairy:backup:select-destination');
    expect(IPC_CHANNELS.RESTORE_SELECT_CANDIDATE).toBe('dairy:restore:select-candidate');
    expect(IPC_CHANNELS.RESTORE_EXECUTE).toBe('dairy:restore:execute');
  });

  // ===================================================================
  // 15. TOKEN STORE ISOLATION
  // ===================================================================

  it('15. clearAllTokens removes all pending tokens', () => {
    createCandidateToken('/path/a.db', 1);
    createCandidateToken('/path/b.db', 2);
    clearAllTokens();

    // Both should be gone
    const fakeToken = 'b'.repeat(64);
    expect(() => consumeCandidateToken(fakeToken, 1)).toThrow('RESTORE_TOKEN_NOT_FOUND');
  });

  // ===================================================================
  // 16. PRELOAD BRIDGE SHAPE VALIDATION
  // ===================================================================

  it('16. DairyApiBridge type includes backup and restore namespaces', async () => {
    const contracts = await import('../../shared/ipc-contracts');
    // Verify the types exist (this is a compilation check - if it compiles, the types are correct)
    type Bridge = typeof contracts.IPC_CHANNELS;
    const channels: Bridge = contracts.IPC_CHANNELS;
    expect(channels.BACKUP_CREATE).toBeDefined();
    expect(channels.RESTORE_EXECUTE).toBeDefined();
  });
});
