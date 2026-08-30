import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
import * as backupService from '../../electron/services/backup.service';

describe('Migration 003: Rate Plans & PRE_MIGRATION Backup (Integration)', () => {
  let tempDir: string;
  let backupDir: string;
  let dbPath: string;
  let db: Database.Database | null = null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dairy_mig003_test_'));
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

  it('proves Migration 001, Migration 002, and Migration 003 apply in sequence to create 9 tables with 0 seed rate plans', () => {
    if (!db) throw new Error('DB not initialized');

    const result = runMigrations(db);
    expect(result.totalVersion).toBeGreaterThanOrEqual(3);
    expect(result.appliedCount).toBeGreaterThanOrEqual(3);

    const version = getCurrentMigrationVersion(db);
    expect(version).toBeGreaterThanOrEqual(3);

    // Verify rate_plans and parameters tables exist
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
      )
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('rate_plans');
    expect(tableNames).toContain('rate_formula_parameters');
    expect(tableNames).toContain('farmers');
    expect(tableNames).toContain('dairy_profile');
    expect(tableNames).toContain('users');

    // Verify Migration 003 indexes exist
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN ('rate_plans', 'rate_formula_parameters')"
      )
      .all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_rate_plans_lookup');
    expect(indexNames).toContain('idx_rate_plans_status');
    expect(indexNames).toContain('idx_rate_plans_effective_dates');
    expect(indexNames).toContain('idx_rate_formula_params_plan');

    // Verify overlap triggers exist
    const triggers = db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger'")
      .all() as { name: string }[];
    const triggerNames = triggers.map((t) => t.name);
    expect(triggerNames).toContain('trg_rate_plans_no_overlap_insert');
    expect(triggerNames).toContain('trg_rate_plans_no_overlap_update');

    // Verify exactly ZERO rate plans exist on clean installation
    const planCount = db.prepare('SELECT count(*) as count FROM rate_plans').get() as {
      count: number;
    };
    expect(planCount.count).toBe(0);

    const paramCount = db
      .prepare('SELECT count(*) as count FROM rate_formula_parameters')
      .get() as { count: number };
    expect(paramCount.count).toBe(0);
  });

  it('proves that running migrations multiple times is strictly idempotent', () => {
    if (!db) throw new Error('DB not initialized');

    runMigrations(db);
    const rerun = runMigrations(db);
    expect(rerun.appliedCount).toBe(0);
    expect(rerun.totalVersion).toBeGreaterThanOrEqual(3);

    const applied = getAppliedMigrations(db);
    expect(applied.length).toBeGreaterThanOrEqual(3);
    expect(applied[0].name).toBe('foundation');
    expect(applied[1].name).toBe('farmers');
    expect(applied[2].name).toBe('rate_plans');
  });

  it('creates and records verified PRE_MIGRATION backup before applying Migration 003 to an initialized Stage 4 (Version 2) DB', async () => {
    if (!db) throw new Error('DB not initialized');

    // 1. Setup isolated migrations directory containing Migration 001 and 002 only
    const isolatedDir = path.join(tempDir, 'isolated_migrations');
    fs.mkdirSync(isolatedDir, { recursive: true });

    const sql001 = fs.readFileSync(
      path.join(process.cwd(), 'electron', 'db', 'migrations', '001_foundation.sql'),
      'utf8'
    );
    const sql002 = fs.readFileSync(
      path.join(process.cwd(), 'electron', 'db', 'migrations', '002_farmers.sql'),
      'utf8'
    );
    fs.writeFileSync(path.join(isolatedDir, '001_foundation.sql'), sql001);
    fs.writeFileSync(path.join(isolatedDir, '002_farmers.sql'), sql002);

    // Run Stage 4 setup
    const step1 = await runMigrationsAsync(db, {
      customMigrationsDir: isolatedDir,
      backupDir,
    });
    expect(step1.totalVersion).toBe(2);

    // Insert dummy farmer in v2 DB
    db.prepare(`
      INSERT INTO farmers (member_code, name_mr, default_milk_type, opening_balance_paise, is_active, created_at, updated_at)
      VALUES ('F-001', 'गणेश शिंदे', 'COW', 50000, 1, datetime('now'), datetime('now'))
    `).run();

    // 2. Now add Migration 003 to directory
    const sql003 = fs.readFileSync(
      path.join(process.cwd(), 'electron', 'db', 'migrations', '003_rate_plans.sql'),
      'utf8'
    );
    fs.writeFileSync(path.join(isolatedDir, '003_rate_plans.sql'), sql003);

    // 3. Run migration to Stage 5
    const step2 = await runMigrationsAsync(db, {
      customMigrationsDir: isolatedDir,
      backupDir,
    });
    expect(step2.totalVersion).toBe(3);
    expect(step2.appliedCount).toBe(1);

    // Verify backup record in backup_history
    const backupHistory = db
      .prepare("SELECT * FROM backup_history WHERE trigger_type = 'PRE_MIGRATION'")
      .all() as any[];

    expect(backupHistory.length).toBeGreaterThanOrEqual(1);
    const lastBackup = backupHistory[backupHistory.length - 1];
    expect(lastBackup.verification_status).toBe('VERIFIED');
    expect(fs.existsSync(lastBackup.file_path)).toBe(true);

    // Verify farmer record persisted
    const farmer = db
      .prepare("SELECT member_code FROM farmers WHERE member_code = 'F-001'")
      .get() as { member_code: string };
    expect(farmer.member_code).toBe('F-001');
  });

  it('aborts migration and preserves Version 2 schema if PRE_MIGRATION backup creation fails', async () => {
    if (!db) throw new Error('DB not initialized');

    // 1. Initialize DB to Version 2
    const isolatedDir = path.join(tempDir, 'isolated_migrations_fail');
    fs.mkdirSync(isolatedDir, { recursive: true });

    const sql001 = fs.readFileSync(
      path.join(process.cwd(), 'electron', 'db', 'migrations', '001_foundation.sql'),
      'utf8'
    );
    const sql002 = fs.readFileSync(
      path.join(process.cwd(), 'electron', 'db', 'migrations', '002_farmers.sql'),
      'utf8'
    );
    fs.writeFileSync(path.join(isolatedDir, '001_foundation.sql'), sql001);
    fs.writeFileSync(path.join(isolatedDir, '002_farmers.sql'), sql002);

    await runMigrationsAsync(db, {
      customMigrationsDir: isolatedDir,
      backupDir,
    });
    expect(getCurrentMigrationVersion(db)).toBe(2);

    // Add Migration 003
    const sql003 = fs.readFileSync(
      path.join(process.cwd(), 'electron', 'db', 'migrations', '003_rate_plans.sql'),
      'utf8'
    );
    fs.writeFileSync(path.join(isolatedDir, '003_rate_plans.sql'), sql003);

    // Spy on createVerifiedBackup to simulate failure
    const backupSpy = vi
      .spyOn(backupService, 'createVerifiedBackup')
      .mockRejectedValueOnce(new Error('Simulated disk full during PRE_MIGRATION backup'));

    try {
      await expect(
        runMigrationsAsync(db, {
          customMigrationsDir: isolatedDir,
          backupDir,
        })
      ).rejects.toThrow(/PRE_MIGRATION backup failed/);

      // Verify DB version is STILL 2 and rate_plans table was NOT created
      expect(getCurrentMigrationVersion(db)).toBe(2);

      const tableCheck = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rate_plans'")
        .get();
      expect(tableCheck).toBeUndefined();
    } finally {
      backupSpy.mockRestore();
    }
  });
});
