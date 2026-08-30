import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runMigrations, runMigrationsAsync } from '../../electron/db/migrator';
import { applyAndVerifyPragmas } from '../../electron/db/connection';

describe('Stage 6 Migrations, Triggers & Backup Safety (Integration)', () => {
  let tempDir: string;
  let dbPath: string;
  let backupDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-stage6-test-'));
    dbPath = path.join(tempDir, 'dairy_stage6.db');
    backupDir = path.join(tempDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });

    db = new Database(dbPath);
    applyAndVerifyPragmas(db);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('1. Applies Migration 004 cleanly and produces exactly 11 application tables', () => {
    const result = runMigrations(db);
    expect(result.totalVersion).toBeGreaterThanOrEqual(4);

    const tables = db
      .prepare(`
        SELECT name FROM sqlite_master 
        WHERE type = 'table' 
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name ASC
      `)
      .all() as { name: string }[];

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

    const actualTableNames = tables.map((t) => t.name).sort();
    for (const expected of expectedTables) {
      expect(actualTableNames).toContain(expected);
    }
  });

  it('2. Takes a verified PRE_MIGRATION backup from Version 3 before executing Migration 004', async () => {
    // 1. Setup isolated directory with Migrations 001, 002, and 003
    const isolatedDir = path.join(tempDir, 'isolated_migrations');
    fs.mkdirSync(isolatedDir, { recursive: true });

    const migrationsDir = path.join(process.cwd(), 'electron', 'db', 'migrations');
    fs.copyFileSync(
      path.join(migrationsDir, '001_foundation.sql'),
      path.join(isolatedDir, '001_foundation.sql')
    );
    fs.copyFileSync(
      path.join(migrationsDir, '002_farmers.sql'),
      path.join(isolatedDir, '002_farmers.sql')
    );
    fs.copyFileSync(
      path.join(migrationsDir, '003_rate_plans.sql'),
      path.join(isolatedDir, '003_rate_plans.sql')
    );

    // Run Stage 5 (Version 3) setup
    const v3Result = await runMigrationsAsync(db, {
      customMigrationsDir: isolatedDir,
      backupDir,
    });
    expect(v3Result.totalVersion).toBe(3);

    // Now copy Migration 004 and run migration
    fs.copyFileSync(
      path.join(migrationsDir, '004_shifts_and_collections.sql'),
      path.join(isolatedDir, '004_shifts_and_collections.sql')
    );

    const v4Result = await runMigrationsAsync(db, {
      customMigrationsDir: isolatedDir,
      backupDir,
    });
    expect(v4Result.totalVersion).toBe(4);

    // Verify backup history contains verified PRE_MIGRATION backup
    const backupRows = db
      .prepare("SELECT * FROM backup_history WHERE trigger_type = 'PRE_MIGRATION' ORDER BY id DESC")
      .all() as Array<{ verification_status: string; file_path: string }>;

    expect(backupRows.length).toBeGreaterThanOrEqual(1);
    expect(backupRows[0].verification_status).toBe('VERIFIED');
    expect(fs.existsSync(backupRows[0].file_path)).toBe(true);
  });

  it('3. Enforces single OPEN shift constraint across the entire database via partial unique index', () => {
    runMigrations(db);

    // Insert user
    db.prepare(`
      INSERT INTO users (username, full_name, role, password_hash, is_active)
      VALUES ('admin', 'Admin User', 'OWNER', 'hash', 1)
    `).run();

    // Insert shift 1 (OPEN)
    db.prepare(`
      INSERT INTO shifts (business_date, shift_type, status, opened_by_user_id, opened_at)
      VALUES ('2026-09-01', 'MORNING', 'OPEN', 1, '2026-09-01T06:00:00Z')
    `).run();

    // Attempting to insert shift 2 as OPEN must fail via partial unique index
    expect(() => {
      db.prepare(`
        INSERT INTO shifts (business_date, shift_type, status, opened_by_user_id, opened_at)
        VALUES ('2026-09-01', 'EVENING', 'OPEN', 1, '2026-09-01T17:00:00Z')
      `).run();
    }).toThrow(/UNIQUE constraint failed/);

    // Closing shift 1 allows shift 2 to open
    db.prepare(`
      UPDATE shifts 
      SET status = 'LOCKED', closed_by_user_id = 1, closed_at = '2026-09-01T10:00:00Z'
      WHERE id = 1
    `).run();

    db.prepare(`
      INSERT INTO shifts (business_date, shift_type, status, opened_by_user_id, opened_at)
      VALUES ('2026-09-01', 'EVENING', 'OPEN', 1, '2026-09-01T17:00:00Z')
    `).run();

    const openCount = db
      .prepare("SELECT count(*) as count FROM shifts WHERE status = 'OPEN'")
      .get() as { count: number };
    expect(openCount.count).toBe(1);
  });

  it('4. Database triggers prevent hard deletion and modification of immutable collection snapshots', () => {
    runMigrations(db);

    // Setup base data
    db.prepare(`
      INSERT INTO users (id, username, full_name, role, password_hash, is_active)
      VALUES (1, 'admin', 'Admin User', 'OWNER', 'hash', 1)
    `).run();

    db.prepare(`
      INSERT INTO shifts (id, business_date, shift_type, status, opened_by_user_id, opened_at)
      VALUES (1, '2026-09-01', 'MORNING', 'OPEN', 1, '2026-09-01T06:00:00Z')
    `).run();

    db.prepare(`
      INSERT INTO farmers (id, member_code, name_mr, phone, default_milk_type, opening_balance_paise, is_active)
      VALUES (1, '001', 'शेतकरी १', '9876543210', 'COW', 0, 1)
    `).run();

    db.prepare(`
      INSERT INTO rate_plans (
        id, plan_name, milk_type, strategy_type, pricing_basis, effective_from, status,
        created_by_user_id, approved_by_user_id, approved_at
      ) VALUES (
        1, 'गाय दरपत्रक', 'COW', 'FORMULA', 'PER_PERCENT_POINT_PER_LITRE', '2026-09-01', 'APPROVED',
        1, 1, '2026-09-01T00:00:00Z'
      )
    `).run();

    db.prepare(`
      INSERT INTO milk_collections (
        id, receipt_number, shift_id, farmer_id, business_date, shift_type, milk_type,
        quantity_ml, fat_x100, snf_x100, rate_plan_id, rate_applied_paise, amount_paise,
        status, created_by_user_id
      ) VALUES (
        1, 'MC-20260901-M-000001', 1, 1, '2026-09-01', 'MORNING', 'COW',
        50000, 400, 850, 1, 5950, 297500,
        'ACTIVE', 1
      )
    `).run();

    // 1. DELETE from milk_collections is blocked
    expect(() => {
      db.prepare('DELETE FROM milk_collections WHERE id = 1').run();
    }).toThrow(/Hard deletion of milk collection records is strictly prohibited/);

    // 2. DELETE from shifts is blocked
    expect(() => {
      db.prepare('DELETE FROM shifts WHERE id = 1').run();
    }).toThrow(/Hard deletion of shift records is strictly prohibited/);

    // 3. UPDATE of every category of immutable snapshot fields on milk_collections is blocked
    const immutableMutations = [
      "UPDATE milk_collections SET receipt_number = 'MC-MODIFIED' WHERE id = 1",
      "UPDATE milk_collections SET shift_id = 99 WHERE id = 1",
      "UPDATE milk_collections SET farmer_id = 99 WHERE id = 1",
      "UPDATE milk_collections SET business_date = '2026-09-02' WHERE id = 1",
      "UPDATE milk_collections SET shift_type = 'EVENING' WHERE id = 1",
      "UPDATE milk_collections SET milk_type = 'BUFFALO' WHERE id = 1",
      "UPDATE milk_collections SET quantity_ml = 60000 WHERE id = 1",
      "UPDATE milk_collections SET fat_x100 = 450 WHERE id = 1",
      "UPDATE milk_collections SET snf_x100 = 900 WHERE id = 1",
      "UPDATE milk_collections SET rate_plan_id = 99 WHERE id = 1",
      "UPDATE milk_collections SET rate_applied_paise = 6000 WHERE id = 1",
      "UPDATE milk_collections SET amount_paise = 300000 WHERE id = 1",
      "UPDATE milk_collections SET duplicate_confirmed = 1 WHERE id = 1",
      "UPDATE milk_collections SET duplicate_reason = 'ALTERED' WHERE id = 1",
      "UPDATE milk_collections SET created_by_user_id = 99 WHERE id = 1",
      "UPDATE milk_collections SET created_at = '2026-01-01T00:00:00Z' WHERE id = 1",
    ];

    for (const sql of immutableMutations) {
      expect(() => {
        db.prepare(sql).run();
      }).toThrow(/Milk collection transaction snapshot is immutable/);
    }

    // 4. Updating lifecycle fields (voiding) is allowed on ACTIVE record
    db.prepare(`
      UPDATE milk_collections
      SET status = 'VOIDED', voided_at = '2026-09-01T12:00:00Z', voided_by_user_id = 1, void_reason = 'Test void'
      WHERE id = 1
    `).run();

    const row = db.prepare('SELECT status, void_reason FROM milk_collections WHERE id = 1').get() as { status: string; void_reason: string };
    expect(row.status).toBe('VOIDED');
    expect(row.void_reason).toBe('Test void');

    // 5. VOIDED records can NEVER be reactivated or updated again
    expect(() => {
      db.prepare("UPDATE milk_collections SET status = 'ACTIVE' WHERE id = 1").run();
    }).toThrow(/Voided milk collections cannot be updated or reactivated/);

    expect(() => {
      db.prepare("UPDATE milk_collections SET void_reason = 'Changed Reason' WHERE id = 1").run();
    }).toThrow(/Voided milk collections cannot be updated or reactivated/);

    expect(() => {
      db.prepare("UPDATE milk_collections SET voided_at = '2026-09-02T00:00:00Z' WHERE id = 1").run();
    }).toThrow(/Voided milk collections cannot be updated or reactivated/);
  });
});
