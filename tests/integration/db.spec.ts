import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  applyAndVerifyPragmas,
  getDefaultDatabasePath,
} from '../../electron/db/connection';
import {
  runMigrations,
  getAppliedMigrations,
  getCurrentMigrationVersion,
  resolveMigrationsDirectory,
  loadMigrationFiles,
} from '../../electron/db/migrator';

describe('Database Layer & Incremental Migration Engine (Stage 2 Integration)', () => {
  let tempDir: string;
  let testDbPath: string;
  let db: Database.Database | null = null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dairy_test_db_'));
    testDbPath = path.join(tempDir, 'test_dairy.db');
    db = new Database(testDbPath);
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

  it('verifies that test database path NEVER equals the real production database path', () => {
    const prodPath = getDefaultDatabasePath();
    expect(testDbPath).not.toBe(prodPath);
    expect(testDbPath).toContain('dairy_test_db_');
  });

  it('enforces and verifies foreign_keys, journal_mode (WAL), and synchronous (FULL) pragmas', () => {
    if (!db) throw new Error('DB is not initialized');

    const pragmaResult = applyAndVerifyPragmas(db);
    expect(pragmaResult.foreignKeys).toBe(1);
    expect(pragmaResult.journalMode).toBe('wal');
    expect(pragmaResult.synchronous).toBe(2); // FULL in SQLite is 2

    // Query manually to verify
    const fk = db.pragma('foreign_keys', { simple: true });
    const jm = db.pragma('journal_mode', { simple: true });
    const sync = db.pragma('synchronous', { simple: true });

    expect(fk).toBe(1);
    expect(String(jm).toLowerCase()).toBe('wal');
    expect(sync).toBe(2);
  });

  it('applies migrations and creates the expected database tables and indexes', () => {
    if (!db) throw new Error('DB is not initialized');
    applyAndVerifyPragmas(db);

    const result = runMigrations(db);
    expect(result.appliedCount).toBe(4);
    expect(result.totalVersion).toBe(4);

    // Verify all table names
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
      )
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    const expectedTables = [
      'app_settings',
      'audit_logs',
      'backup_history',
      'dairy_profile',
      'farmers',
      'milk_collections',
      'rate_formula_parameters',
      'rate_plans',
      'schema_migrations',
      'shifts',
      'users',
    ];

    expect(tableNames.sort()).toEqual(expectedTables.sort());

    // Verify idx_audit_created index exists
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name = 'idx_audit_created'")
      .all() as { name: string }[];
    expect(indexes.length).toBe(1);
    expect(indexes[0].name).toBe('idx_audit_created');

    // Verify version recorded in schema_migrations
    const applied = getAppliedMigrations(db);
    expect(applied.length).toBe(4);
    expect(applied[0].version).toBe(1);
    expect(applied[0].name).toBe('foundation');
    expect(applied[1].version).toBe(2);
    expect(applied[1].name).toBe('farmers');
    expect(applied[2].version).toBe(3);
    expect(applied[2].name).toBe('rate_plans');
    expect(applied[3].version).toBe(4);
    expect(applied[3].name).toBe('shifts_and_collections');
    expect(applied[0].applied_at).toBeDefined();
  });

  it('ensures running migrations multiple times is strictly idempotent', () => {
    if (!db) throw new Error('DB is not initialized');
    applyAndVerifyPragmas(db);

    const firstRun = runMigrations(db);
    expect(firstRun.appliedCount).toBe(4);
    expect(firstRun.totalVersion).toBe(4);

    const secondRun = runMigrations(db);
    expect(secondRun.appliedCount).toBe(0);
    expect(secondRun.totalVersion).toBe(4);

    const thirdRun = runMigrations(db);
    expect(thirdRun.appliedCount).toBe(0);
    expect(thirdRun.totalVersion).toBe(4);

    const applied = getAppliedMigrations(db);
    expect(applied.length).toBe(4);
  });

  it('preserves database schema across closing and reopening connection', () => {
    if (!db) throw new Error('DB is not initialized');
    applyAndVerifyPragmas(db);
    runMigrations(db);

    // Close first connection
    db.close();

    // Reopen second connection
    const reopenedDb = new Database(testDbPath);
    try {
      applyAndVerifyPragmas(reopenedDb);
      const version = getCurrentMigrationVersion(reopenedDb);
      expect(version).toBe(4);

      const tables = reopenedDb
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        .all() as { name: string }[];
      expect(tables.length).toBe(11);
    } finally {
      reopenedDb.close();
    }
  });

  it('strictly enforces foreign key constraints on audit_logs.user_id', () => {
    if (!db) throw new Error('DB is not initialized');
    applyAndVerifyPragmas(db);
    runMigrations(db);

    // Attempt to insert audit log referencing nonexistent user_id = 999
    expect(() => {
      db!.prepare(
        `INSERT INTO audit_logs (device_id, user_id, action_type, entity_name, entity_id, details_json)
         VALUES ('dev-1', 999, 'CREATE', 'TEST', '1', '{}')`
      ).run();
    }).toThrow(/FOREIGN KEY constraint failed/i);

    // Insert valid user and verify audit log insert succeeds
    db.prepare(
      `INSERT INTO users (username, password_hash, full_name, role, is_active)
       VALUES ('test_owner', 'scrypt_hash_example', 'Test Owner', 'OWNER', 1)`
    ).run();

    const user = db.prepare("SELECT id FROM users WHERE username = 'test_owner'").get() as { id: number };

    db.prepare(
      `INSERT INTO audit_logs (device_id, user_id, action_type, entity_name, entity_id, details_json)
       VALUES ('dev-1', ?, 'CREATE', 'TEST', '1', '{}')`
    ).run(user.id);

    const count = db.prepare('SELECT count(*) as cnt FROM audit_logs').get() as { cnt: number };
    expect(count.cnt).toBe(1);
  });

  it('strictly enforces CHECK constraints on foundation tables', () => {
    if (!db) throw new Error('DB is not initialized');
    applyAndVerifyPragmas(db);
    runMigrations(db);

    // 1. dairy_profile: id MUST be 1 (Singleton check constraint)
    expect(() => {
      db!.prepare(
        `INSERT INTO dairy_profile (id, centre_name, owner_name, phone_primary, default_language, settlement_start_day)
         VALUES (2, 'Dairy Center 2', 'Owner', '9876543210', 'mr', 'MONDAY')`
      ).run();
    }).toThrow(/CHECK constraint failed/i);

    // 2. dairy_profile: default_language CHECK ('mr', 'en')
    expect(() => {
      db!.prepare(
        `INSERT INTO dairy_profile (id, centre_name, owner_name, phone_primary, default_language, settlement_start_day)
         VALUES (1, 'Dairy Center', 'Owner', '9876543210', 'fr', 'MONDAY')`
      ).run();
    }).toThrow(/CHECK constraint failed/i);

    // 3. dairy_profile: settlement_start_day CHECK
    expect(() => {
      db!.prepare(
        `INSERT INTO dairy_profile (id, centre_name, owner_name, phone_primary, default_language, settlement_start_day)
         VALUES (1, 'Dairy Center', 'Owner', '9876543210', 'mr', 'INVALID_DAY')`
      ).run();
    }).toThrow(/CHECK constraint failed/i);

    // 4. users: role CHECK ('OWNER', 'OPERATOR')
    expect(() => {
      db!.prepare(
        `INSERT INTO users (username, password_hash, full_name, role, is_active)
         VALUES ('bad_role_user', 'hash', 'Bad Role', 'ADMIN', 1)`
      ).run();
    }).toThrow(/CHECK constraint failed/i);

    // 5. users: is_active CHECK (0, 1)
    expect(() => {
      db!.prepare(
        `INSERT INTO users (username, password_hash, full_name, role, is_active)
         VALUES ('bad_active_user', 'hash', 'Bad Active', 'OWNER', 2)`
      ).run();
    }).toThrow(/CHECK constraint failed/i);

    // 6. backup_history: trigger_type CHECK
    expect(() => {
      db!.prepare(
        `INSERT INTO backup_history (file_path, checksum_sha256, size_bytes, trigger_type, verification_status)
         VALUES ('/path/b.db', 'sha', 100, 'INVALID_TRIGGER', 'VERIFIED')`
      ).run();
    }).toThrow(/CHECK constraint failed/i);

    // 7. backup_history: verification_status CHECK ('VERIFIED', 'FAILED')
    expect(() => {
      db!.prepare(
        `INSERT INTO backup_history (file_path, checksum_sha256, size_bytes, trigger_type, verification_status)
         VALUES ('/path/b.db', 'sha', 100, 'MANUAL', 'PENDING')`
      ).run();
    }).toThrow(/CHECK constraint failed/i);
  });

  it('rejects duplicate migration versions and malformed filenames', () => {
    const customTestMigrationsDir = path.join(tempDir, 'custom_migrations');
    fs.mkdirSync(customTestMigrationsDir, { recursive: true });

    // Create valid 001
    fs.writeFileSync(
      path.join(customTestMigrationsDir, '001_initial.sql'),
      'CREATE TABLE t1 (id INT);'
    );
    // Create duplicate 001
    fs.writeFileSync(
      path.join(customTestMigrationsDir, '001_duplicate.sql'),
      'CREATE TABLE t2 (id INT);'
    );

    expect(() => {
      loadMigrationFiles(customTestMigrationsDir);
    }).toThrow(/Duplicate migration version detected: 1/i);

    // Malformed filename
    fs.unlinkSync(path.join(customTestMigrationsDir, '001_duplicate.sql'));
    fs.writeFileSync(
      path.join(customTestMigrationsDir, 'bad_migration.sql'),
      'CREATE TABLE t3 (id INT);'
    );

    expect(() => {
      loadMigrationFiles(customTestMigrationsDir);
    }).toThrow(/Malformed migration filename 'bad_migration\.sql'/i);
  });

  it('atomically rolls back a failing migration without leaving partial schema changes or recording migration version', () => {
    if (!db) throw new Error('DB is not initialized');
    applyAndVerifyPragmas(db);

    const customTestMigrationsDir = path.join(tempDir, 'atomic_migrations');
    fs.mkdirSync(customTestMigrationsDir, { recursive: true });

    // Step 1: Valid 001
    fs.writeFileSync(
      path.join(customTestMigrationsDir, '001_first.sql'),
      'CREATE TABLE table_one (id INTEGER PRIMARY KEY);'
    );
    runMigrations(db, customTestMigrationsDir);
    expect(getCurrentMigrationVersion(db)).toBe(1);

    // Step 2: 002 with syntax error in second statement
    fs.writeFileSync(
      path.join(customTestMigrationsDir, '002_failing.sql'),
      `CREATE TABLE table_two (id INTEGER PRIMARY KEY);
       INVALID SQL SYNTAX HERE;`
    );

    expect(() => {
      runMigrations(db!, customTestMigrationsDir);
    }).toThrow(/Failed to apply migration 002_failing\.sql/i);

    // Verification: table_two must NOT exist (rolled back)
    const tableTwo = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'table_two'")
      .all();
    expect(tableTwo.length).toBe(0);

    // Verification: migration version in schema_migrations remains 1
    expect(getCurrentMigrationVersion(db)).toBe(1);
    const applied = getAppliedMigrations(db);
    expect(applied.length).toBe(1);
    expect(applied[0].version).toBe(1);
  });
});
