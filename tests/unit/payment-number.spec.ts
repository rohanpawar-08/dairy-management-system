import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyAndVerifyPragmas } from '../../electron/db/connection';
import { runMigrations } from '../../electron/db/migrator';
import { paymentNumberService } from '../../electron/services/payment-number.service';

describe('PaymentNumberService Unit Tests', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dairy_paynum_test_'));
    dbPath = path.join(tempDir, 'paynum_test.db');
    db = new Database(dbPath);
    applyAndVerifyPragmas(db);
    runMigrations(db);
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, full_name, created_at, updated_at)
       VALUES (1, 'owner', 'hash', 'OWNER', 'Owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).run();
    db.prepare(
      `INSERT INTO farmers (id, member_code, name_mr, default_milk_type, is_active)
       VALUES (1, '101', 'आनंदराव पाटील', 'BOTH', 1)`
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

  it('generates PAY-YYYYMMDD-000001 for first payment of the day', () => {
    const num = paymentNumberService.generatePaymentNumber(db, '2026-09-15');
    expect(num).toBe('PAY-20260915-000001');
  });

  it('increments sequence atomically within same day', () => {
    const num1 = paymentNumberService.generatePaymentNumber(db, '2026-09-15');
    db.prepare(
      `INSERT INTO payments (payment_number, farmer_id, business_date, amount_paise, payment_method, status, created_by_user_id)
       VALUES (?, 1, '2026-09-15', 10000, 'CASH', 'RECORDED', 1)`
    ).run(num1);

    const num2 = paymentNumberService.generatePaymentNumber(db, '2026-09-15');
    expect(num2).toBe('PAY-20260915-000002');
  });

  it('resets sequence to 000001 on a new date', () => {
    const num1 = paymentNumberService.generatePaymentNumber(db, '2026-09-15');
    db.prepare(
      `INSERT INTO payments (payment_number, farmer_id, business_date, amount_paise, payment_method, status, created_by_user_id)
       VALUES (?, 1, '2026-09-15', 10000, 'CASH', 'RECORDED', 1)`
    ).run(num1);

    const numDay2 = paymentNumberService.generatePaymentNumber(db, '2026-09-16');
    expect(numDay2).toBe('PAY-20260916-000001');
  });

  it('does not consume sequence counter if transaction rolls back', () => {
    try {
      db.transaction(() => {
        const n = paymentNumberService.generatePaymentNumber(db, '2026-09-15');
        expect(n).toBe('PAY-20260915-000001');
        throw new Error('Simulated rollback');
      })();
    } catch {
      // Expected rollback
    }

    const numAfterRollback = paymentNumberService.generatePaymentNumber(db, '2026-09-15');
    expect(numAfterRollback).toBe('PAY-20260915-000001');
  });
});
