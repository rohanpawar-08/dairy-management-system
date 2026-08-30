import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../electron/db/migrator';
import { adjustmentNumberService } from '../../electron/services/adjustment-number.service';

describe('AdjustmentNumberService Unit Tests', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  it('should generate monotonic ADJ-YYYYMMDD-000001 sequence for same business date', () => {
    const ref1 = adjustmentNumberService.generateReferenceNumber(db, '2026-08-30');
    const ref2 = adjustmentNumberService.generateReferenceNumber(db, '2026-08-30');
    const ref3 = adjustmentNumberService.generateReferenceNumber(db, '2026-08-30');

    expect(ref1).toBe('ADJ-20260830-000001');
    expect(ref2).toBe('ADJ-20260830-000002');
    expect(ref3).toBe('ADJ-20260830-000003');
  });

  it('should reset sequence per business date', () => {
    const refDate1 = adjustmentNumberService.generateReferenceNumber(db, '2026-08-30');
    const refDate2 = adjustmentNumberService.generateReferenceNumber(db, '2026-08-31');

    expect(refDate1).toBe('ADJ-20260830-000001');
    expect(refDate2).toBe('ADJ-20260831-000001');
  });

  it('should restore sequence counter when parent transaction rolls back', () => {
    const beforeTxRef = adjustmentNumberService.generateReferenceNumber(db, '2026-08-30');
    expect(beforeTxRef).toBe('ADJ-20260830-000001');

    try {
      const rollbackTx = db.transaction(() => {
        adjustmentNumberService.generateReferenceNumber(db, '2026-08-30');
        throw new Error('Simulated atomic transaction failure');
      });
      rollbackTx();
    } catch (err: unknown) {
      // Expected rollback
    }

    // After rollback, the next generated reference should still be #000002 (not #000003)
    const afterRollbackRef = adjustmentNumberService.generateReferenceNumber(db, '2026-08-30');
    expect(afterRollbackRef).toBe('ADJ-20260830-000002');
  });
});
