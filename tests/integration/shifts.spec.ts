import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runMigrations } from '../../electron/db/migrator';
import { applyAndVerifyPragmas } from '../../electron/db/connection';
import { sessionService } from '../../electron/core/session.service';
import { shiftService } from '../../electron/services/shift.service';
import { auditService } from '../../electron/services/audit.service';
import { businessDateProvider } from '../../electron/utils/business-date';

describe('Shift Lifecycle & Business Date (Integration)', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;

  const OWNER_WC_ID = 1001;
  const OPERATOR_WC_ID = 1002;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-shifts-test-'));
    dbPath = path.join(tempDir, 'dairy_shifts.db');
    const backupDir = path.join(tempDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });

    db = new Database(dbPath);
    applyAndVerifyPragmas(db);
    runMigrations(db);

    // Seed users
    db.prepare(`
      INSERT INTO users (id, username, full_name, role, password_hash, is_active)
      VALUES (1, 'owner', 'डेअरी मालक', 'OWNER', 'hash', 1)
    `).run();

    db.prepare(`
      INSERT INTO users (id, username, full_name, role, password_hash, is_active)
      VALUES (2, 'operator', 'संकलन ऑपरेटर', 'OPERATOR', 'hash', 1)
    `).run();

    sessionService.createSession(OWNER_WC_ID, {
      id: 1,
      username: 'owner',
      full_name: 'डेअरी मालक',
      role: 'OWNER',
    });

    sessionService.createSession(OPERATOR_WC_ID, {
      id: 2,
      username: 'operator',
      full_name: 'संकलन ऑपरेटर',
      role: 'OPERATOR',
    });
  });

  afterEach(() => {
    sessionService.clearSession(OWNER_WC_ID);
    sessionService.clearSession(OPERATOR_WC_ID);
    businessDateProvider.resetProvider();
    if (db && db.open) {
      db.close();
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('1. Correctly provides deterministic Asia/Kolkata business date', () => {
    // Test custom injected provider
    businessDateProvider.setProvider({
      getToday: () => '2026-09-01',
      getNowIso: () => '2026-09-01T06:00:00.000Z',
    });

    expect(businessDateProvider.getToday()).toBe('2026-09-01');
    expect(businessDateProvider.getNowIso()).toBe('2026-09-01T06:00:00.000Z');
  });

  it('2. Opens Morning shift and rejects opening a second shift while one is active', () => {
    const shift = shiftService.openShift(
      db,
      { businessDate: '2026-09-01', shiftType: 'MORNING', notes: 'सकाळचे सत्र' },
      OWNER_WC_ID
    );

    expect(shift.id).toBeGreaterThan(0);
    expect(shift.status).toBe('OPEN');
    expect(shift.businessDate).toBe('2026-09-01');
    expect(shift.shiftType).toBe('MORNING');
    expect(shift.openedByName).toBe('डेअरी मालक');

    // Attempting to open another shift must fail
    expect(() =>
      shiftService.openShift(
        db,
        { businessDate: '2026-09-01', shiftType: 'EVENING' },
        OWNER_WC_ID
      )
    ).toThrow(/is currently open/i);
  });

  it('3. Operator can open and close shifts, but cannot reopen a locked shift', () => {
    // 1. Operator opens Morning shift
    const shift = shiftService.openShift(
      db,
      { businessDate: '2026-09-02', shiftType: 'MORNING' },
      OPERATOR_WC_ID
    );
    expect(shift.status).toBe('OPEN');
    expect(shift.openedByName).toBe('संकलन ऑपरेटर');

    // 2. Operator closes shift
    const closed = shiftService.closeShift(db, shift.id, OPERATOR_WC_ID);
    expect(closed.status).toBe('LOCKED');
    expect(closed.closedByName).toBe('संकलन ऑपरेटर');

    // 3. Operator tries to reopen -> must throw forbidden error
    expect(() =>
      shiftService.reopenShift(
        db,
        { shiftId: shift.id, reason: 'Operator Reopen' },
        OPERATOR_WC_ID
      )
    ).toThrow(/Forbidden/i);

    // 4. Owner reopens shift with reason -> succeeds
    const reopened = shiftService.reopenShift(
      db,
      { shiftId: shift.id, reason: 'शेतकऱ्यांचे दूध राहिले होते' },
      OWNER_WC_ID
    );
    expect(reopened.status).toBe('OPEN');
    expect(reopened.reopenedByName).toBe('डेअरी मालक');
    expect(reopened.reopenReason).toBe('शेतकऱ्यांचे दूध राहिले होते');
    expect(reopened.reopenCount).toBe(1);
  });

  it('4. Reopening is rejected if reason is empty or if another shift is currently open', () => {
    // Create and close shift 1
    const shift1 = shiftService.openShift(
      db,
      { businessDate: '2026-09-03', shiftType: 'MORNING' },
      OWNER_WC_ID
    );
    shiftService.closeShift(db, shift1.id, OWNER_WC_ID);

    // Open shift 2
    shiftService.openShift(
      db,
      { businessDate: '2026-09-03', shiftType: 'EVENING' },
      OWNER_WC_ID
    );

    // Reopening shift 1 with empty reason fails
    expect(() =>
      shiftService.reopenShift(db, { shiftId: shift1.id, reason: '   ' }, OWNER_WC_ID)
    ).toThrow(/mandatory reason is required/i);

    // Reopening shift 1 while shift 2 is open fails
    expect(() =>
      shiftService.reopenShift(
        db,
        { shiftId: shift1.id, reason: 'Valid reason' },
        OWNER_WC_ID
      )
    ).toThrow(/is currently open/i);
  });

  it('5. Shift mutations log atomic audit events and roll back if audit fails', () => {
    const auditSpy = vi.spyOn(auditService, 'logEvent').mockImplementationOnce(() => {
      throw new Error('Audit disk write failed');
    });

    try {
      expect(() =>
        shiftService.openShift(
          db,
          { businessDate: '2026-09-04', shiftType: 'MORNING' },
          OWNER_WC_ID
        )
      ).toThrow('Audit disk write failed');

      // Verify no shift row was inserted
      const current = shiftService.getCurrentShift(db, OWNER_WC_ID);
      expect(current).toBeNull();
    } finally {
      auditSpy.mockRestore();
    }

    // Now open successfully and verify audit record
    const shift = shiftService.openShift(
      db,
      { businessDate: '2026-09-04', shiftType: 'MORNING' },
      OWNER_WC_ID
    );
    shiftService.closeShift(db, shift.id, OWNER_WC_ID);
    shiftService.reopenShift(db, { shiftId: shift.id, reason: 'Audit test' }, OWNER_WC_ID);

    const auditRows = db
      .prepare("SELECT action_type FROM audit_logs WHERE entity_name = 'shifts' ORDER BY id ASC")
      .all() as { action_type: string }[];

    const actions = auditRows.map((r) => r.action_type);
    expect(actions).toContain('SHIFT_OPENED');
    expect(actions).toContain('SHIFT_CLOSED');
    expect(actions).toContain('SHIFT_REOPENED');
  });
});
