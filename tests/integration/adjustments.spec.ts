import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../electron/db/migrator';
import { adjustmentService } from '../../electron/services/adjustment.service';
import { sessionService } from '../../electron/core/session.service';
import { farmerRepository } from '../../electron/db/farmer.repository';
import { auditService } from '../../electron/services/audit.service';

describe('Adjustments Integration Tests', () => {
  let db: Database.Database;

  const OWNER_SENDER_ID = 1001;
  const OPERATOR_SENDER_ID = 2002;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);

    const nowIso = new Date().toISOString();
    // Create Owner & Operator users
    db.prepare(
      `INSERT INTO users (id, username, full_name, role, password_hash, is_active, created_at, updated_at)
       VALUES (1, 'owner1', 'Owner Admin', 'OWNER', 'hash', 1, ?, ?)`
    ).run(nowIso, nowIso);

    db.prepare(
      `INSERT INTO users (id, username, full_name, role, password_hash, is_active, created_at, updated_at)
       VALUES (2, 'operator1', 'Operator Staff', 'OPERATOR', 'hash', 1, ?, ?)`
    ).run(nowIso, nowIso);

    // Mock active sessions
    sessionService.createSession(OWNER_SENDER_ID, {
      id: 1,
      username: 'owner1',
      full_name: 'Owner Admin',
      role: 'OWNER',
    });

    sessionService.createSession(OPERATOR_SENDER_ID, {
      id: 2,
      username: 'operator1',
      full_name: 'Operator Staff',
      role: 'OPERATOR',
    });

    // Create Active Farmer F101 and Inactive Farmer F102
    farmerRepository.insertFarmer(db, {
      memberCode: 'F101',
      nameMr: 'ज्ञानेश्वर कदम',
      defaultMilkType: 'BOTH',
      openingBalancePaise: 0,
      nowIso,
    });

    farmerRepository.insertFarmer(db, {
      memberCode: 'F102',
      nameMr: 'मंगेश पाटील',
      defaultMilkType: 'BOTH',
      openingBalancePaise: 0,
      nowIso,
    });
    db.prepare("UPDATE farmers SET is_active = 0 WHERE member_code = 'F102'").run();
  });

  afterEach(() => {
    sessionService.clearAllSessions();
    vi.restoreAllMocks();
    if (db && db.open) {
      db.close();
    }
  });

  it('should allow Owner to create ADVANCE, DEDUCTION, and CREDIT entries', () => {
    const adv = adjustmentService.createAdjustment(
      db,
      {
        memberCode: 'F101',
        entryType: 'ADVANCE',
        category: 'CASH_ADVANCE',
        amountRupees: '1000.00',
        businessDate: '2026-08-30',
        reason: 'कॅश उचल',
      },
      OWNER_SENDER_ID
    );

    expect(adv.id).toBeGreaterThan(0);
    expect(adv.referenceNumber).toBe('ADJ-20260830-000001');
    expect(adv.amountPaise).toBe(100000);
    expect(adv.amountRupeesFormatted).toBe('1000.00');
    expect(adv.entryType).toBe('ADVANCE');
    expect(adv.status).toBe('ACTIVE');

    const ded = adjustmentService.createAdjustment(
      db,
      {
        memberCode: 'F101',
        entryType: 'DEDUCTION',
        category: 'CATTLE_FEED',
        amountRupees: '450.50',
        businessDate: '2026-08-30',
        reason: '१ पोते पशुखाद्य',
      },
      OWNER_SENDER_ID
    );

    expect(ded.referenceNumber).toBe('ADJ-20260830-000002');
    expect(ded.amountPaise).toBe(45050);

    const cred = adjustmentService.createAdjustment(
      db,
      {
        memberCode: 'F101',
        entryType: 'CREDIT',
        category: 'BONUS',
        amountRupees: '500.00',
        businessDate: '2026-08-30',
        reason: 'दिवाळी बोनस',
      },
      OWNER_SENDER_ID
    );

    expect(cred.referenceNumber).toBe('ADJ-20260830-000003');
    expect(cred.amountPaise).toBe(50000);
  });

  it('should reject creation attempt by Operator role (RBAC Enforcement)', () => {
    expect(() => {
      adjustmentService.createAdjustment(
        db,
        {
          memberCode: 'F101',
          entryType: 'ADVANCE',
          category: 'CASH_ADVANCE',
          amountRupees: '500.00',
          reason: 'Operator attempt',
        },
        OPERATOR_SENDER_ID
      );
    }).toThrow(/Forbidden/);
  });

  it('should reject creation for inactive farmer', () => {
    expect(() => {
      adjustmentService.createAdjustment(
        db,
        {
          memberCode: 'F102',
          entryType: 'ADVANCE',
          category: 'CASH_ADVANCE',
          amountRupees: '500.00',
          reason: 'Inactive test',
        },
        OWNER_SENDER_ID
      );
    }).toThrow(/Cannot create adjustment for inactive farmer/);
  });

  it('should reject invalid zero or negative amounts', () => {
    expect(() => {
      adjustmentService.createAdjustment(
        db,
        {
          memberCode: 'F101',
          entryType: 'ADVANCE',
          category: 'CASH_ADVANCE',
          amountRupees: '0.00',
          reason: 'Zero amount',
        },
        OWNER_SENDER_ID
      );
    }).toThrow(/Adjustment amount must be strictly greater than zero/);
  });

  it('should allow Owner to void active adjustment and log audit event', () => {
    const created = adjustmentService.createAdjustment(
      db,
      {
        memberCode: 'F101',
        entryType: 'DEDUCTION',
        category: 'CATTLE_FEED',
        amountRupees: '300.00',
        reason: 'चुकीची नोंद',
      },
      OWNER_SENDER_ID
    );

    const voided = adjustmentService.voidAdjustment(
      db,
      {
        adjustmentId: created.id,
        reason: 'चुकीची नोंद रद्द केली',
      },
      OWNER_SENDER_ID
    );

    expect(voided.status).toBe('VOIDED');
    expect(voided.voidedByUserId).toBe(1);
    expect(voided.voidReason).toBe('चुकीची नोंद रद्द केली');

    // Double voiding attempt must fail cleanly
    expect(() => {
      adjustmentService.voidAdjustment(
        db,
        {
          adjustmentId: created.id,
          reason: 'Again',
        },
        OWNER_SENDER_ID
      );
    }).toThrow(/already voided/);
  });

  it('should reject Operator void attempt (RBAC Enforcement)', () => {
    const created = adjustmentService.createAdjustment(
      db,
      {
        memberCode: 'F101',
        entryType: 'DEDUCTION',
        category: 'CATTLE_FEED',
        amountRupees: '300.00',
        reason: 'Valid adjustment',
      },
      OWNER_SENDER_ID
    );

    expect(() => {
      adjustmentService.voidAdjustment(
        db,
        {
          adjustmentId: created.id,
          reason: 'Operator void attempt',
        },
        OPERATOR_SENDER_ID
      );
    }).toThrow(/Forbidden/);
  });

  it('should roll back voiding transaction if audit logging fails', () => {
    const created = adjustmentService.createAdjustment(
      db,
      {
        memberCode: 'F101',
        entryType: 'ADVANCE',
        category: 'CASH_ADVANCE',
        amountRupees: '200.00',
        reason: 'Rollback test advance',
      },
      OWNER_SENDER_ID
    );

    // Mock auditService.logEvent to throw an error during voiding
    vi.spyOn(auditService, 'logEvent').mockImplementationOnce(() => {
      throw new Error('Disk error writing audit log');
    });

    expect(() => {
      adjustmentService.voidAdjustment(
        db,
        {
          adjustmentId: created.id,
          reason: 'Void reason',
        },
        OWNER_SENDER_ID
      );
    }).toThrow(/Disk error writing audit log/);

    // Verify record remains ACTIVE because void transaction rolled back
    const row = adjustmentService.getAdjustmentById(db, created.id, OWNER_SENDER_ID);
    expect(row.status).toBe('ACTIVE');
  });
});
