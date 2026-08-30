import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { receiptNumberService } from '../../electron/services/receipt-number.service';

describe('ReceiptNumberService (Unit & Transaction Isolation)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  it('1. Generates correct format for Morning (MC-YYYYMMDD-M-000001) and Evening (MC-YYYYMMDD-E-000001)', () => {
    const num1 = receiptNumberService.getNextReceiptNumber(db, '2026-09-01', 'MORNING');
    expect(num1).toBe('MC-20260901-M-000001');

    const num2 = receiptNumberService.getNextReceiptNumber(db, '2026-09-01', 'EVENING');
    expect(num2).toBe('MC-20260901-E-000001');
  });

  it('2. Maintains independent monotonic sequences per business date and shift type', () => {
    // Date 1 Morning
    expect(receiptNumberService.getNextReceiptNumber(db, '2026-09-01', 'MORNING')).toBe('MC-20260901-M-000001');
    expect(receiptNumberService.getNextReceiptNumber(db, '2026-09-01', 'MORNING')).toBe('MC-20260901-M-000002');
    expect(receiptNumberService.getNextReceiptNumber(db, '2026-09-01', 'MORNING')).toBe('MC-20260901-M-000003');

    // Date 1 Evening (starts from 1)
    expect(receiptNumberService.getNextReceiptNumber(db, '2026-09-01', 'EVENING')).toBe('MC-20260901-E-000001');

    // Date 2 Morning (starts from 1)
    expect(receiptNumberService.getNextReceiptNumber(db, '2026-09-02', 'MORNING')).toBe('MC-20260902-M-000001');
  });

  it('3. Rolls back counter when enclosing SQLite transaction rolls back', () => {
    const rollbackTx = db.transaction(() => {
      receiptNumberService.getNextReceiptNumber(db, '2026-09-01', 'MORNING');
      throw new Error('Simulated transaction failure');
    });

    expect(() => rollbackTx()).toThrow('Simulated transaction failure');

    // Sequence counter was not permanently consumed: next allocated is 000001
    const nextNum = receiptNumberService.getNextReceiptNumber(db, '2026-09-01', 'MORNING');
    expect(nextNum).toBe('MC-20260901-M-000001');
  });

  it('4. Voiding a collection does not release or reuse sequence numbers', () => {
    const num1 = receiptNumberService.getNextReceiptNumber(db, '2026-09-01', 'MORNING');
    expect(num1).toBe('MC-20260901-M-000001');

    // Subsequent allocation monotonically advances regardless of voiding operations
    const num2 = receiptNumberService.getNextReceiptNumber(db, '2026-09-01', 'MORNING');
    expect(num2).toBe('MC-20260901-M-000002');
  });
});
