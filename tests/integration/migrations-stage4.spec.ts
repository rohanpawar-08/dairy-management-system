import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyAndVerifyPragmas } from '../../electron/db/connection';
import {
  runMigrations,
  runMigrationsAsync,
  getCurrentMigrationVersion,
  getAppliedMigrations,
} from '../../electron/db/migrator';

describe('Migration 002: Farmers & PRE_MIGRATION Backup (Integration)', () => {
  let tempDir: string;
  let backupDir: string;
  let dbPath: string;
  let db: Database.Database | null = null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dairy_mig002_test_'));
    backupDir = path.join(tempDir, 'backups');
    dbPath = path.join(tempDir, 'mig_test.db');
    fs.mkdirSync(backupDir, { recursive: true });

    db = new Database(dbPath);
    applyAndVerifyPragmas(db);
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

  it('successfully applies Migration 001 and Migration 002 in sequence', () => {
    if (!db) throw new Error('DB not initialized');

    const result = runMigrations(db);
    expect(result.totalVersion).toBeGreaterThanOrEqual(2);
    expect(result.appliedCount).toBeGreaterThanOrEqual(2);

    const version = getCurrentMigrationVersion(db);
    expect(version).toBeGreaterThanOrEqual(2);

    // Verify farmers table exists
    const tableRow = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='farmers'")
      .get() as { name: string } | undefined;
    expect(tableRow?.name).toBe('farmers');

    // Verify indexes exist
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='farmers'")
      .all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_farmers_member_code');
    expect(indexNames).toContain('idx_farmers_is_active');
    expect(indexNames).toContain('idx_farmers_default_milk_type');
    expect(indexNames).toContain('idx_farmers_phone');
    expect(indexNames).toContain('idx_farmers_name_mr');
    expect(indexNames).toContain('idx_farmers_name_en');
  });

  it('proves that running migrations again is strictly idempotent (0 applied)', () => {
    if (!db) throw new Error('DB not initialized');

    runMigrations(db);
    const rerun = runMigrations(db);
    expect(rerun.appliedCount).toBe(0);
    expect(rerun.totalVersion).toBeGreaterThanOrEqual(2);
  });

  it('creates and records verified PRE_MIGRATION backup before applying pending migration to initialized DB', async () => {
    if (!db) throw new Error('DB not initialized');

    // 1. Manually apply Migration 001 only (simulate existing Stage 2/3 database)
    const customMigrationsDir = path.join(tempDir, 'isolated_migrations');
    fs.mkdirSync(customMigrationsDir, { recursive: true });

    const sql001 = fs.readFileSync(
      path.join(process.cwd(), 'electron', 'db', 'migrations', '001_foundation.sql'),
      'utf8'
    );
    fs.writeFileSync(path.join(customMigrationsDir, '001_foundation.sql'), sql001);

    const step1 = await runMigrationsAsync(db, {
      customMigrationsDir,
      backupDir,
    });
    expect(step1.totalVersion).toBe(1);

    // Insert dummy user in v1 DB
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, is_active, created_at, updated_at)
      VALUES ('owner_test', 'hash', 'Test Owner', 'OWNER', 1, datetime('now'), datetime('now'))
    `).run();

    // 2. Add Migration 002 to customMigrationsDir
    const sql002 = fs.readFileSync(
      path.join(process.cwd(), 'electron', 'db', 'migrations', '002_farmers.sql'),
      'utf8'
    );
    fs.writeFileSync(path.join(customMigrationsDir, '002_farmers.sql'), sql002);

    // 3. Run migration with PRE_MIGRATION backup
    const step2 = await runMigrationsAsync(db, {
      customMigrationsDir,
      backupDir,
    });
    expect(step2.appliedCount).toBe(1);
    expect(step2.totalVersion).toBe(2);

    // Verify backup_history table contains PRE_MIGRATION entry
    const backupRows = db
      .prepare(
        "SELECT * FROM backup_history WHERE trigger_type = 'PRE_MIGRATION' AND verification_status = 'VERIFIED'"
      )
      .all() as { file_path: string; checksum_sha256: string }[];
    expect(backupRows.length).toBe(1);
    expect(fs.existsSync(backupRows[0].file_path)).toBe(true);
  });

  it('aborts migration if PRE_MIGRATION backup creation fails', async () => {
    if (!db) throw new Error('DB not initialized');

    // Apply v1
    const customMigrationsDir = path.join(tempDir, 'isolated_migrations_fail');
    fs.mkdirSync(customMigrationsDir, { recursive: true });

    const sql001 = fs.readFileSync(
      path.join(process.cwd(), 'electron', 'db', 'migrations', '001_foundation.sql'),
      'utf8'
    );
    fs.writeFileSync(path.join(customMigrationsDir, '001_foundation.sql'), sql001);
    await runMigrationsAsync(db, { customMigrationsDir, backupDir });

    // Add v2
    const sql002 = fs.readFileSync(
      path.join(process.cwd(), 'electron', 'db', 'migrations', '002_farmers.sql'),
      'utf8'
    );
    fs.writeFileSync(path.join(customMigrationsDir, '002_farmers.sql'), sql002);

    // Point backupDir to an invalid read-only/inaccessible path on Windows (e.g. invalid drive/path)
    const invalidBackupDir = 'Z:\\non_existent_invalid_path\\backups';

    await expect(
      runMigrationsAsync(db, {
        customMigrationsDir,
        backupDir: invalidBackupDir,
      })
    ).rejects.toThrow(/Migration aborted: PRE_MIGRATION backup failed/i);

    // Verify Migration 002 was NOT applied due to abort
    expect(getCurrentMigrationVersion(db)).toBe(1);
  });
});
