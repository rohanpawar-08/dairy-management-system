import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyAndVerifyPragmas } from '../../electron/db/connection';
import { runMigrations } from '../../electron/db/migrator';
import { setupService, CompleteSetupPayload } from '../../electron/services/setup.service';
import { authService } from '../../electron/services/auth.service';
import { SessionService } from '../../electron/core/session.service';
import { RateLimiterService } from '../../electron/core/rate-limiter.service';
import { hashPassword } from '../../electron/core/credential.service';

describe('Local Authentication, Setup & Session Authority (Stage 3 Integration)', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database | null = null;
  let sessionServiceInstance: SessionService;
  let rateLimiterInstance: RateLimiterService;
  let fakeTime: number;

  const validSetupPayload: CompleteSetupPayload = {
    centreName: 'श्री गणेश कृपा दुग्ध संकलन केंद्र',
    registrationCode: 'MH-PUN-01',
    ownerName: 'रामचंद्र पाटील',
    phonePrimary: '9876543210',
    phoneSecondary: '9876543211',
    addressLine: 'मु. पो. बारामती',
    taluka: 'बारामती',
    district: 'पुणे',
    pincode: '413102',
    defaultLanguage: 'mr',
    enabledMilkTypes: 'BOTH',
    settlementStartDay: 'MONDAY',
    username: 'owner_ram',
    password: 'SecurePassword2026', // 18 chars (>= 10)
    pin: '1234',
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dairy_auth_test_'));
    dbPath = path.join(tempDir, 'auth_test.db');
    db = new Database(dbPath);
    applyAndVerifyPragmas(db);
    runMigrations(db);

    fakeTime = 1700000000000;
    sessionServiceInstance = new SessionService();
    rateLimiterInstance = new RateLimiterService({
      clock: () => fakeTime,
      maxFailures: 5,
      windowMs: 5 * 60 * 1000,
      lockDurationMs: 5 * 60 * 1000,
    });
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

  it('correctly evaluates initial setup state as UNINITIALIZED on clean database', () => {
    if (!db) throw new Error('DB not initialized');
    const status = setupService.getSetupStatus(db);
    expect(status.state).toBe('UNINITIALIZED');
    expect(status.dairyProfile).toBeNull();
  });

  it('completes atomic First-Run setup and transitions state to READY', async () => {
    if (!db) throw new Error('DB not initialized');

    const profile = await setupService.completeSetup(db, validSetupPayload);

    expect(profile.centreName).toBe(validSetupPayload.centreName);
    expect(profile.ownerName).toBe(validSetupPayload.ownerName);
    expect(profile.defaultLanguage).toBe('mr');
    expect(profile.enabledMilkTypes).toBe('BOTH');

    // 1. Verify status is now READY
    const status = setupService.getSetupStatus(db);
    expect(status.state).toBe('READY');
    expect(status.dairyProfile?.centreName).toBe(validSetupPayload.centreName);

    // 2. Verify users table contains the single active OWNER user
    const users = db.prepare('SELECT * FROM users').all() as {
      id: number;
      username: string;
      role: string;
      is_active: number;
      password_hash: string;
      pin_hash: string | null;
    }[];
    expect(users.length).toBe(1);
    expect(users[0].username).toBe('owner_ram');
    expect(users[0].role).toBe('OWNER');
    expect(users[0].is_active).toBe(1);
    expect(users[0].password_hash).not.toBe(validSetupPayload.password); // Never plaintext
    expect(users[0].pin_hash).not.toBe(validSetupPayload.pin);

    // 3. Verify app_settings stores enabled_milk_types and stable device_id
    const milkTypeRow = db
      .prepare("SELECT value FROM app_settings WHERE key = 'enabled_milk_types'")
      .get() as { value: string };
    expect(milkTypeRow.value).toBe('BOTH');

    const deviceIdRow = db
      .prepare("SELECT value FROM app_settings WHERE key = 'device_id'")
      .get() as { value: string };
    expect(deviceIdRow?.value).toBeDefined();
    expect(deviceIdRow.value.length).toBeGreaterThan(10);
  });

  it('evaluates setup state as INCONSISTENT for Operator-only databases', async () => {
    if (!db) throw new Error('DB not initialized');

    // Create 1 profile and 1 Operator user (NO Owner)
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO dairy_profile (id, centre_name, owner_name, phone_primary, default_language, settlement_start_day, created_at, updated_at)
      VALUES (1, 'Test Dairy', 'Owner Name', '9876543210', 'mr', 'MONDAY', ?, ?)
    `).run(nowIso, nowIso);

    const opHash = await hashPassword('OperatorPass2026!');
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, is_active, created_at, updated_at)
      VALUES ('operator_only', ?, 'Operator Only', 'OPERATOR', 1, ?, ?)
    `).run(opHash, nowIso, nowIso);

    const status = setupService.getSetupStatus(db);
    expect(status.state).toBe('INCONSISTENT');
    expect(status.dairyProfile).toBeNull();
  });

  it('evaluates setup state as INCONSISTENT for databases with an inactive Owner', async () => {
    if (!db) throw new Error('DB not initialized');

    // Complete setup first
    await setupService.completeSetup(db, validSetupPayload);

    // Deactivate the Owner
    db.prepare("UPDATE users SET is_active = 0 WHERE username = 'owner_ram'").run();

    const status = setupService.getSetupStatus(db);
    expect(status.state).toBe('INCONSISTENT');
    expect(status.dairyProfile).toBeNull();
  });

  it('evaluates setup state as INCONSISTENT when users exist without a dairy profile', async () => {
    if (!db) throw new Error('DB not initialized');

    const opHash = await hashPassword('OperatorPass2026!');
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, is_active, created_at, updated_at)
      VALUES ('lonely_user', ?, 'Lonely User', 'OWNER', 1, ?, ?)
    `).run(opHash, nowIso, nowIso);

    const status = setupService.getSetupStatus(db);
    expect(status.state).toBe('INCONSISTENT');
    expect(status.dairyProfile).toBeNull();
  });

  it('evaluates setup state as INCONSISTENT when dairy profile exists without any users', () => {
    if (!db) throw new Error('DB not initialized');

    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO dairy_profile (id, centre_name, owner_name, phone_primary, default_language, settlement_start_day, created_at, updated_at)
      VALUES (1, 'Test Dairy', 'Owner Name', '9876543210', 'mr', 'MONDAY', ?, ?)
    `).run(nowIso, nowIso);

    const status = setupService.getSetupStatus(db);
    expect(status.state).toBe('INCONSISTENT');
    expect(status.dairyProfile).toBeNull();
  });

  it('rejects login when database setup state is INCONSISTENT', async () => {
    if (!db) throw new Error('DB not initialized');

    // Create inconsistent state: profile exists with inactive owner
    await setupService.completeSetup(db, validSetupPayload);
    db.prepare("UPDATE users SET is_active = 0 WHERE username = 'owner_ram'").run();

    await expect(
      authService.login(
        db,
        { username: 'owner_ram', password: 'SecurePassword2026' },
        401
      )
    ).rejects.toThrow(/Database is in an inconsistent state/i);
  });

  it('rejects login when database setup state is UNINITIALIZED', async () => {
    if (!db) throw new Error('DB not initialized');

    await expect(
      authService.login(
        db,
        { username: 'any_user', password: 'SecurePassword2026' },
        402
      )
    ).rejects.toThrow(/Database is uninitialized/i);
  });

  it('rejects completeSetup when database is in INCONSISTENT state', async () => {
    if (!db) throw new Error('DB not initialized');

    // Make database inconsistent
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO dairy_profile (id, centre_name, owner_name, phone_primary, default_language, settlement_start_day, created_at, updated_at)
      VALUES (1, 'Partial Profile', 'Owner', '9876543210', 'mr', 'MONDAY', ?, ?)
    `).run(nowIso, nowIso);

    await expect(setupService.completeSetup(db, validSetupPayload)).rejects.toThrow(
      /Cannot perform setup: Database is in INCONSISTENT state/i
    );
  });

  it('strictly rejects passwords shorter than 10 characters during setup', async () => {
    if (!db) throw new Error('DB not initialized');

    const shortPasswordPayload = {
      ...validSetupPayload,
      password: 'Pass9char', // 9 characters (rejected)
    };

    await expect(setupService.completeSetup(db, shortPasswordPayload)).rejects.toThrow(
      /Password must be at least 10 characters long/i
    );
  });

  it('strictly rejects duplicate setup attempts once READY', async () => {
    if (!db) throw new Error('DB not initialized');

    await setupService.completeSetup(db, validSetupPayload);

    await expect(setupService.completeSetup(db, validSetupPayload)).rejects.toThrow(
      /Cannot perform setup: Database is in READY state/i
    );
  });

  it('rolls back completely if a setup step fails (atomic consistency)', async () => {
    if (!db) throw new Error('DB not initialized');

    // Inject invalid setup payload with empty ownerName to test rollback
    const invalidPayload = { ...validSetupPayload, ownerName: '' };

    await expect(setupService.completeSetup(db, invalidPayload)).rejects.toThrow();

    // Verify 0 rows in dairy_profile and users
    const profileCount = db
      .prepare('SELECT count(*) as count FROM dairy_profile')
      .get() as { count: number };
    const userCount = db
      .prepare('SELECT count(*) as count FROM users')
      .get() as { count: number };
    expect(profileCount.count).toBe(0);
    expect(userCount.count).toBe(0);
  });

  it('authenticates Owner via password and creates isolated main-process session', async () => {
    if (!db) throw new Error('DB not initialized');

    await setupService.completeSetup(db, validSetupPayload);

    const webContentsId = 101;
    const session = await authService.login(
      db,
      { username: 'owner_ram', password: 'SecurePassword2026' },
      webContentsId
    );

    expect(session.username).toBe('owner_ram');
    expect(session.fullName).toBe(validSetupPayload.ownerName);
    expect(session.role).toBe('OWNER');
    expect((session as unknown as Record<string, unknown>)['password_hash']).toBeUndefined();
    expect((session as unknown as Record<string, unknown>)['password']).toBeUndefined();

    // Session retrieval
    const retrievedSession = sessionServiceInstance.createSession(webContentsId, {
      id: session.userId,
      username: session.username,
      full_name: session.fullName,
      role: session.role,
    });
    expect(retrievedSession.userId).toBe(session.userId);

    // Cross-renderer isolation check: webContents 999 cannot access session 101
    expect(sessionServiceInstance.getSession(999)).toBeNull();
    expect(() => sessionServiceInstance.requireAuthenticated(999)).toThrow(/Unauthorized/);
  });

  it('authenticates Owner via quick-login PIN', async () => {
    if (!db) throw new Error('DB not initialized');

    await setupService.completeSetup(db, validSetupPayload);

    const session = await authService.login(
      db,
      { username: 'owner_ram', pin: '1234' },
      102
    );

    expect(session.username).toBe('owner_ram');
    expect(session.role).toBe('OWNER');
  });

  it('authenticates Operator user and enforces role boundaries', async () => {
    if (!db) throw new Error('DB not initialized');

    await setupService.completeSetup(db, validSetupPayload);

    // Create an Operator user in the database
    const operatorPasswordHash = await hashPassword('OperatorPass123!');
    const nowIso = new Date().toISOString();
    const insertOp = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, is_active, created_at, updated_at)
      VALUES ('operator_sham', ?, 'शाम काळे', 'OPERATOR', 1, ?, ?)
    `);
    const opResult = insertOp.run(operatorPasswordHash, nowIso, nowIso);
    const opId = Number(opResult.lastInsertRowid);

    // Authenticate operator
    const session = await authService.login(
      db,
      { username: 'operator_sham', password: 'OperatorPass123!' },
      103
    );

    expect(session.userId).toBe(opId);
    expect(session.role).toBe('OPERATOR');

    // Test role enforcement helpers
    sessionServiceInstance.createSession(103, {
      id: opId,
      username: 'operator_sham',
      full_name: 'शाम काळे',
      role: 'OPERATOR',
    });

    expect(sessionServiceInstance.requireOwnerOrOperator(103).role).toBe('OPERATOR');
    expect(() => sessionServiceInstance.requireRole(103, 'OWNER')).toThrow(/Forbidden/);
  });

  it('strictly rejects inactive users', async () => {
    if (!db) throw new Error('DB not initialized');

    await setupService.completeSetup(db, validSetupPayload);

    // Deactivate owner
    db.prepare("UPDATE users SET is_active = 0 WHERE username = 'owner_ram'").run();

    await expect(
      authService.login(
        db,
        { username: 'owner_ram', password: 'SecurePassword2026' },
        104
      )
    ).rejects.toThrow(/Database is in an inconsistent state|Invalid username or credentials/);
  });

  it('enforces local rate limiting without real-time delays using clock injection', () => {
    const webContentsId = 201;
    const username = 'owner_ram';

    // 4 failed attempts should not trigger lock yet
    for (let i = 1; i <= 4; i++) {
      const res = rateLimiterInstance.recordFailure(username, webContentsId);
      expect(res.limitedNow).toBe(false);
      expect(res.failureCount).toBe(i);
    }

    // 5th failed attempt triggers lock
    const fifth = rateLimiterInstance.recordFailure(username, webContentsId);
    expect(fifth.limitedNow).toBe(true);
    expect(fifth.retryAfterSeconds).toBe(300);

    // Check rate limit state
    const check = rateLimiterInstance.isRateLimited(username, webContentsId);
    expect(check.limited).toBe(true);
    expect(check.retryAfterSeconds).toBe(300);

    // Advance fake clock by 301 seconds
    fakeTime += 301 * 1000;

    const afterExpire = rateLimiterInstance.isRateLimited(username, webContentsId);
    expect(afterExpire.limited).toBe(false);

    // Successful login resets state
    rateLimiterInstance.recordSuccess(username, webContentsId);
    expect(rateLimiterInstance.isRateLimited(username, webContentsId).limited).toBe(false);
  });

  it('clears session on logout', async () => {
    if (!db) throw new Error('DB not initialized');

    await setupService.completeSetup(db, validSetupPayload);

    await authService.login(
      db,
      { username: 'owner_ram', password: 'SecurePassword2026' },
      105
    );

    const loggedOut = authService.logout(db, 105);
    expect(loggedOut).toBe(true);
  });
});
