import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyAndVerifyPragmas } from '../../electron/db/connection';
import { runMigrations } from '../../electron/db/migrator';
import { settlementNumberService } from '../../electron/services/settlement-number.service';

describe('SettlementNumberService Unit Tests', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dairy_setnum_test_'));
    dbPath = path.join(tempDir, 'setnum_test.db');
    db = new Database(dbPath);
    applyAndVerifyPragmas(db);
    runMigrations(db);
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, full_name, created_at, updated_at)
       VALUES (1, 'owner', 'hash', 'OWNER', 'Owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
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

  it('generates SET-YYYYMMDD-000001 for first settlement of the day', () => {
    const num = settlementNumberService.generateSettlementNumber(db, '2026-09-07');
    expect(num).toBe('SET-20260907-000001');
  });

  it('increments sequence atomically within same day', () => {
    const num1 = settlementNumberService.generateSettlementNumber(db, '2026-09-07');
    db.prepare(
      `INSERT INTO settlement_periods (settlement_number, period_start, period_end, status, created_by_user_id)
       VALUES (?, '2026-09-07', '2026-09-13', 'DRAFT', 1)`
    ).run(num1);

    const num2 = settlementNumberService.generateSettlementNumber(db, '2026-09-07');
    expect(num2).toBe('SET-20260907-000002');
  });

  it('resets sequence to 000001 on a new date', () => {
    const num1 = settlementNumberService.generateSettlementNumber(db, '2026-09-07');
    db.prepare(
      `INSERT INTO settlement_periods (settlement_number, period_start, period_end, status, created_by_user_id)
       VALUES (?, '2026-09-07', '2026-09-13', 'DRAFT', 1)`
    ).run(num1);

    const numDay2 = settlementNumberService.generateSettlementNumber(db, '2026-09-14');
    expect(numDay2).toBe('SET-20260914-000001');
  });

  it('does not consume sequence counter if transaction fails before insertion', () => {
    try {
      db.transaction(() => {
        const n = settlementNumberService.generateSettlementNumber(db, '2026-09-07');
        expect(n).toBe('SET-20260907-000001');
        throw new Error('Simulated rollback');
      })();
    } catch {
      // Expected rollback
    }

    const numAfterRollback = settlementNumberService.generateSettlementNumber(db, '2026-09-07');
    expect(numAfterRollback).toBe('SET-20260907-000001');
  });
});
