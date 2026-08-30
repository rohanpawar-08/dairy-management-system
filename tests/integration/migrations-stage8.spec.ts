import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyAndVerifyPragmas } from '../../electron/db/connection';
import { runMigrations, getAppliedMigrations } from '../../electron/db/migrator';

describe('Migration 006 (Stage 8) Integration Tests', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dairy_mig8_test_'));
    dbPath = path.join(tempDir, 'mig8_test.db');
    db = new Database(dbPath);
    applyAndVerifyPragmas(db);
    runMigrations(db);

    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, full_name)
       VALUES (1, 'owner', 'hash', 'OWNER', 'Owner')`
    ).run();

    db.prepare(
      `INSERT INTO farmers (id, member_code, name_mr, opening_balance_paise)
       VALUES (10, 'F010', 'रामराव पाटील', 0)`
    ).run();
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('runs Migration 006 successfully and creates 5 stage 8 tables', () => {
    const applied = getAppliedMigrations(db);
    const m006 = applied.find((m) => m.version === 6);
    expect(m006).toBeDefined();
    expect(m006?.name).toBe('settlements_and_payments');

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
      )
      .all() as { name: string }[];

    expect(tables.length).toBe(17);
    const names = tables.map((t) => t.name);
    expect(names).toContain('settlement_periods');
    expect(names).toContain('weekly_settlements');
    expect(names).toContain('settlement_items');
    expect(names).toContain('payments');
    expect(names).toContain('payment_allocations');
  });

  it('enforces partial unique index allowing only one DRAFT period at a time', () => {
    db.prepare(
      `INSERT INTO settlement_periods (settlement_number, period_start, period_end, status, created_by_user_id)
       VALUES ('SET-20260907-000001', '2026-09-07', '2026-09-13', 'DRAFT', 1)`
    ).run();

    expect(() => {
      db.prepare(
        `INSERT INTO settlement_periods (settlement_number, period_start, period_end, status, created_by_user_id)
         VALUES ('SET-20260914-000001', '2026-09-14', '2026-09-20', 'DRAFT', 1)`
      ).run();
    }).toThrow();
  });

  it('prevents overlapping active settlement periods via trigger', () => {
    db.prepare(
      `INSERT INTO settlement_periods (settlement_number, period_start, period_end, status, created_by_user_id, finalized_by_user_id, finalized_at)
       VALUES ('SET-20260907-000001', '2026-09-07', '2026-09-13', 'FINALIZED', 1, 1, (datetime('now')))`
    ).run();

    expect(() => {
      db.prepare(
        `INSERT INTO settlement_periods (settlement_number, period_start, period_end, status, created_by_user_id)
         VALUES ('SET-20260910-000001', '2026-09-10', '2026-09-16', 'DRAFT', 1)`
      ).run();
    }).toThrow(/overlaps/);
  });

  it('enforces strict settlement period status transition rules', () => {
    db.prepare(
      `INSERT INTO settlement_periods (id, settlement_number, period_start, period_end, status, created_by_user_id)
       VALUES (1, 'SET-20260907-000001', '2026-09-07', '2026-09-13', 'DRAFT', 1)`
    ).run();

    // DRAFT -> DRAFT invalid
    expect(() => {
      db.prepare("UPDATE settlement_periods SET updated_at = (datetime('now')) WHERE id = 1").run();
    }).toThrow(/Invalid status transition/);

    // Finalize period
    db.prepare(
      `UPDATE settlement_periods
       SET status = 'FINALIZED', finalized_by_user_id = 1, finalized_at = (datetime('now'))
       WHERE id = 1`
    ).run();

    // FINALIZED -> DRAFT invalid
    expect(() => {
      db.prepare("UPDATE settlement_periods SET status = 'DRAFT' WHERE id = 1").run();
    }).toThrow(/immutable/);

    // FINALIZED -> CANCELLED invalid
    expect(() => {
      db.prepare("UPDATE settlement_periods SET status = 'CANCELLED' WHERE id = 1").run();
    }).toThrow(/immutable/);

    // FINALIZED -> FINALIZED invalid
    expect(() => {
      db.prepare("UPDATE settlement_periods SET status = 'FINALIZED' WHERE id = 1").run();
    }).toThrow(/immutable/);
  });

  it('enforces hard DELETE rejection on all 5 Stage 8 tables', () => {
    db.prepare(
      `INSERT INTO settlement_periods (id, settlement_number, period_start, period_end, status, created_by_user_id, finalized_by_user_id, finalized_at)
       VALUES (1, 'SET-20260907-000001', '2026-09-07', '2026-09-13', 'FINALIZED', 1, 1, (datetime('now')))`
    ).run();

    db.prepare(
      `INSERT INTO weekly_settlements (id, settlement_period_id, farmer_id, member_code_snapshot, farmer_name_mr_snapshot, opening_balance_paise, milk_amount_paise, net_amount_paise)
       VALUES (100, 1, 10, 'F010', 'रामराव पाटील', 0, 5000, 5000)`
    ).run();

    db.prepare(
      `INSERT INTO settlement_items (id, weekly_settlement_id, source_type, source_id, reference_number, signed_amount_paise)
       VALUES (1000, 100, 'OPENING_BALANCE', 10, 'F010', 0)`
    ).run();

    db.prepare(
      `INSERT INTO payments (id, payment_number, farmer_id, business_date, amount_paise, payment_method, created_by_user_id)
       VALUES (200, 'PAY-20260915-000001', 10, '2026-09-15', 5000, 'CASH', 1)`
    ).run();

    db.prepare(
      `INSERT INTO payment_allocations (id, payment_id, weekly_settlement_id, allocated_paise)
       VALUES (300, 200, 100, 5000)`
    ).run();

    // 1. settlement_periods DELETE
    expect(() => db.prepare('DELETE FROM settlement_periods WHERE id = 1').run()).toThrow(/prohibited/);

    // 2. weekly_settlements DELETE
    expect(() => db.prepare('DELETE FROM weekly_settlements WHERE id = 100').run()).toThrow(/prohibited/);

    // 3. settlement_items DELETE
    expect(() => db.prepare('DELETE FROM settlement_items WHERE id = 1000').run()).toThrow(/prohibited/);

    // 4. payments DELETE
    expect(() => db.prepare('DELETE FROM payments WHERE id = 200').run()).toThrow(/prohibited/);

    // 5. payment_allocations DELETE
    expect(() => db.prepare('DELETE FROM payment_allocations WHERE id = 300').run()).toThrow(/prohibited/);
  });

  it('enforces UPDATE rejection on weekly_settlements, settlement_items, and payment_allocations', () => {
    db.prepare(
      `INSERT INTO settlement_periods (id, settlement_number, period_start, period_end, status, created_by_user_id, finalized_by_user_id, finalized_at)
       VALUES (1, 'SET-20260907-000001', '2026-09-07', '2026-09-13', 'FINALIZED', 1, 1, (datetime('now')))`
    ).run();

    db.prepare(
      `INSERT INTO weekly_settlements (id, settlement_period_id, farmer_id, member_code_snapshot, farmer_name_mr_snapshot, opening_balance_paise, milk_amount_paise, net_amount_paise)
       VALUES (100, 1, 10, 'F010', 'रामराव पाटील', 0, 5000, 5000)`
    ).run();

    db.prepare(
      `INSERT INTO settlement_items (id, weekly_settlement_id, source_type, source_id, reference_number, signed_amount_paise)
       VALUES (1000, 100, 'OPENING_BALANCE', 10, 'F010', 0)`
    ).run();

    db.prepare(
      `INSERT INTO payments (id, payment_number, farmer_id, business_date, amount_paise, payment_method, created_by_user_id)
       VALUES (200, 'PAY-20260915-000001', 10, '2026-09-15', 5000, 'CASH', 1)`
    ).run();

    db.prepare(
      `INSERT INTO payment_allocations (id, payment_id, weekly_settlement_id, allocated_paise)
       VALUES (300, 200, 100, 5000)`
    ).run();

    // weekly_settlements UPDATE
    expect(() => db.prepare('UPDATE weekly_settlements SET net_amount_paise = 9999 WHERE id = 100').run()).toThrow(/immutable/);

    // settlement_items UPDATE
    expect(() => db.prepare('UPDATE settlement_items SET signed_amount_paise = 9999 WHERE id = 1000').run()).toThrow(/immutable/);

    // payment_allocations UPDATE
    expect(() => db.prepare('UPDATE payment_allocations SET allocated_paise = 9999 WHERE id = 300').run()).toThrow(/immutable/);
  });

  it('enforces payment state machine and immutability', () => {
    db.prepare(
      `INSERT INTO payments (id, payment_number, farmer_id, business_date, amount_paise, payment_method, created_by_user_id)
       VALUES (200, 'PAY-20260915-000001', 10, '2026-09-15', 5000, 'CASH', 1)`
    ).run();

    // RECORDED -> RECORDED update rejected
    expect(() => db.prepare("UPDATE payments SET notes = 'Changed' WHERE id = 200").run()).toThrow();

    // Void payment cleanly
    db.prepare(
      `UPDATE payments
       SET status = 'VOIDED', voided_by_user_id = 1, voided_at = (datetime('now')), void_reason = 'Wrong amount'
       WHERE id = 200`
    ).run();

    // VOIDED -> RECORDED update rejected
    expect(() => db.prepare("UPDATE payments SET status = 'RECORDED' WHERE id = 200").run()).toThrow(/immutable/);

    // VOIDED -> VOIDED update rejected
    expect(() => db.prepare("UPDATE payments SET void_reason = 'Second void attempt' WHERE id = 200").run()).toThrow(/immutable/);
  });

  it('enforces non-cash payment external reference CHECK constraint', () => {
    // CASH can omit external_reference
    expect(() => {
      db.prepare(
        `INSERT INTO payments (payment_number, farmer_id, business_date, amount_paise, payment_method, created_by_user_id)
         VALUES ('PAY-20260915-000001', 10, '2026-09-15', 5000, 'CASH', 1)`
      ).run();
    }).not.toThrow();

    // UPI requires non-empty external_reference
    expect(() => {
      db.prepare(
        `INSERT INTO payments (payment_number, farmer_id, business_date, amount_paise, payment_method, created_by_user_id)
         VALUES ('PAY-20260915-000002', 10, '2026-09-15', 5000, 'UPI', 1)`
      ).run();
    }).toThrow();

    // UPI with external_reference succeeds
    expect(() => {
      db.prepare(
        `INSERT INTO payments (payment_number, farmer_id, business_date, amount_paise, payment_method, external_reference, created_by_user_id)
         VALUES ('PAY-20260915-000003', 10, '2026-09-15', 5000, 'UPI', 'UPI12345678', 1)`
      ).run();
    }).not.toThrow();
  });

  it('validates payment allocation insertion invariants via trigger', () => {
    db.prepare(
      `INSERT INTO farmers (id, member_code, name_mr, opening_balance_paise)
       VALUES (20, 'F020', 'गोपाळराव', 0)`
    ).run();

    db.prepare(
      `INSERT INTO settlement_periods (id, settlement_number, period_start, period_end, status, created_by_user_id, finalized_by_user_id, finalized_at)
       VALUES (1, 'SET-20260907-000001', '2026-09-07', '2026-09-13', 'FINALIZED', 1, 1, (datetime('now')))`
    ).run();

    db.prepare(
      `INSERT INTO weekly_settlements (id, settlement_period_id, farmer_id, member_code_snapshot, farmer_name_mr_snapshot, opening_balance_paise, milk_amount_paise, net_amount_paise)
       VALUES (100, 1, 10, 'F010', 'रामराव पाटील', 0, 5000, 5000)`
    ).run();

    db.prepare(
      `INSERT INTO payments (id, payment_number, farmer_id, business_date, amount_paise, payment_method, created_by_user_id)
       VALUES (200, 'PAY-20260915-000001', 20, '2026-09-15', 5000, 'CASH', 1)`
    ).run();

    // Rejects allocation if farmer IDs do not match (Farmer 20 payment to Farmer 10 settlement)
    expect(() => {
      db.prepare(
        `INSERT INTO payment_allocations (payment_id, weekly_settlement_id, allocated_paise)
         VALUES (200, 100, 5000)`
      ).run();
    }).toThrow(/same farmer/);
  });
});
