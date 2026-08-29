import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyAndVerifyPragmas } from '../../electron/db/connection';
import { runMigrations } from '../../electron/db/migrator';
import { setupService, CompleteSetupPayload } from '../../electron/services/setup.service';
import { authService } from '../../electron/services/auth.service';
import { auditService, sanitizeAuditDetails } from '../../electron/services/audit.service';
import { sessionService } from '../../electron/core/session.service';

describe('Base Append-Only Audit Service (Stage 3 Integration)', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database | null = null;

  const validSetupPayload: CompleteSetupPayload = {
    centreName: 'आनंद दुग्ध संकलन केंद्र',
    ownerName: 'आनंदराव देशमुख',
    phonePrimary: '9822012345',
    defaultLanguage: 'mr',
    enabledMilkTypes: 'COW',
    settlementStartDay: 'MONDAY',
    username: 'owner_anand',
    password: 'SecurePassword123',
    pin: '5678',
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dairy_audit_test_'));
    dbPath = path.join(tempDir, 'audit_test.db');
    db = new Database(dbPath);
    applyAndVerifyPragmas(db);
    runMigrations(db);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
    db = null;
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('records SETUP_COMPLETED audit event with valid JSON and stable device_id', async () => {
    if (!db) throw new Error('DB not initialized');

    await setupService.completeSetup(db, validSetupPayload);

    const auditRows = db.prepare('SELECT * FROM audit_logs WHERE action_type = ?').all('SETUP_COMPLETED') as {
      id: number;
      device_id: string;
      user_id: number;
      action_type: string;
      entity_name: string;
      details_json: string;
      created_at: string;
    }[];

    expect(auditRows.length).toBe(1);
    const row = auditRows[0];
    expect(row.action_type).toBe('SETUP_COMPLETED');
    expect(row.user_id).toBe(1);
    expect(row.device_id).toBeDefined();
    expect(row.device_id.length).toBeGreaterThan(10);

    const details = JSON.parse(row.details_json);
    expect(details.centreName).toBe(validSetupPayload.centreName);
    expect(details.username).toBe('owner_anand');
    expect(details.password).toBeUndefined();
    expect(details.pin).toBeUndefined();
  });

  it('records AUTH_LOGIN_SUCCESS audit event on valid login', async () => {
    if (!db) throw new Error('DB not initialized');

    await setupService.completeSetup(db, validSetupPayload);

    await authService.login(
      db,
      { username: 'owner_anand', password: 'SecurePassword123' },
      301
    );

    const successRows = db
      .prepare("SELECT * FROM audit_logs WHERE action_type = 'AUTH_LOGIN_SUCCESS'")
      .all() as {
      user_id: number;
      details_json: string;
    }[];

    expect(successRows.length).toBe(1);
    expect(successRows[0].user_id).toBe(1);
    const details = JSON.parse(successRows[0].details_json);
    expect(details.authMethod).toBe('PASSWORD');
    expect(details.username).toBe('owner_anand');
  });

  it('records AUTH_LOGIN_FAILED audit event with null user_id for unknown user', async () => {
    if (!db) throw new Error('DB not initialized');

    await setupService.completeSetup(db, validSetupPayload);

    try {
      await authService.login(
        db,
        { username: 'unknown_hacker', password: 'SomePassword' },
        302
      );
    } catch {
      // Expected auth failure
    }

    const failRows = db
      .prepare("SELECT * FROM audit_logs WHERE action_type = 'AUTH_LOGIN_FAILED'")
      .all() as {
      user_id: number | null;
      details_json: string;
    }[];

    expect(failRows.length).toBe(1);
    expect(failRows[0].user_id).toBeNull();
    const details = JSON.parse(failRows[0].details_json);
    expect(details.username).toBe('unknown_hacker');
    expect(details.password).toBeUndefined();
  });

  it('records AUTH_LOGOUT audit event on logout', async () => {
    if (!db) throw new Error('DB not initialized');

    await setupService.completeSetup(db, validSetupPayload);

    await authService.login(
      db,
      { username: 'owner_anand', password: 'SecurePassword123' },
      303
    );

    authService.logout(db, 303);

    const logoutRows = db
      .prepare("SELECT * FROM audit_logs WHERE action_type = 'AUTH_LOGOUT'")
      .all() as {
      user_id: number;
      details_json: string;
    }[];

    expect(logoutRows.length).toBe(1);
    expect(logoutRows[0].user_id).toBe(1);
  });

  it('proves details_json strictly contains no passwords, PINs, or hashes', () => {
    const rawDetails = {
      username: 'test_user',
      password: 'SecretPlaintextPassword',
      pin: '1234',
      password_hash: '$scrypt$v=1$...',
      pin_hash: '$scrypt$v=1$...',
      nested: {
        token: 'secret_token',
        other: 'safe_value',
      },
    };

    const sanitized = sanitizeAuditDetails(rawDetails);

    expect(sanitized['password']).toBe('[REDACTED]');
    expect(sanitized['pin']).toBe('[REDACTED]');
    expect(sanitized['password_hash']).toBe('[REDACTED]');
    expect(sanitized['pin_hash']).toBe('[REDACTED]');
    expect((sanitized['nested'] as Record<string, unknown>)['token']).toBe('[REDACTED]');
    expect((sanitized['nested'] as Record<string, unknown>)['other']).toBe('safe_value');
  });

  it('verifies that AuditService exposes no update, delete, or clear methods', () => {
    const service = auditService as unknown as Record<string, unknown>;
    expect(service['updateEvent']).toBeUndefined();
    expect(service['deleteEvent']).toBeUndefined();
    expect(service['clearLogs']).toBeUndefined();
    expect(service['truncate']).toBeUndefined();
  });

  it('prevents session establishment if success audit log recording fails', async () => {
    if (!db) throw new Error('DB not initialized');

    await setupService.completeSetup(db, validSetupPayload);

    // Create trigger that aborts INSERT ON audit_logs during AUTH_LOGIN_SUCCESS
    db.exec(`
      CREATE TRIGGER abort_auth_success_audit
      BEFORE INSERT ON audit_logs
      WHEN NEW.action_type = 'AUTH_LOGIN_SUCCESS'
      BEGIN
        SELECT RAISE(ABORT, 'Simulated audit log failure');
      END;
    `);

    // Attempt login
    await expect(
      authService.login(
        db,
        { username: 'owner_anand', password: 'SecurePassword123' },
        304
      )
    ).rejects.toThrow(/Unable to record security audit log/i);

    // Confirm session was NOT established in main process
    expect(sessionService.getSession(304)).toBeNull();
  });
});
