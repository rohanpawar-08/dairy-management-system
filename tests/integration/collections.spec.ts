import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runMigrations } from '../../electron/db/migrator';
import { applyAndVerifyPragmas } from '../../electron/db/connection';
import { sessionService } from '../../electron/core/session.service';
import { shiftService } from '../../electron/services/shift.service';
import { ratePlanService } from '../../electron/services/rate-plan.service';
import { farmerRepository } from '../../electron/db/farmer.repository';
import { milkCollectionService } from '../../electron/services/milk-collection.service';
import { milkCollectionRepository } from '../../electron/db/milk-collection.repository';
import { auditService } from '../../electron/services/audit.service';
import {
  formatMlAsLitres,
  formatPaiseAsRupees,
  parseLitresToMl,
  parsePercentToX100,
} from '../../shared/money';

describe('Milk Collections Fast Entry & Transactions (Integration)', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;

  const OWNER_WC_ID = 2001;
  const OPERATOR_WC_ID = 2002;

  let activeShiftId: number;
  let cowPlanId: number;
  let buffaloPlanId: number;
  let farmerCowId: number;
  let farmerBuffaloId: number;
  let inactiveFarmerId: number;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-collections-test-'));
    dbPath = path.join(tempDir, 'dairy_collections.db');
    const backupDir = path.join(tempDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });

    db = new Database(dbPath);
    applyAndVerifyPragmas(db);
    runMigrations(db);

    // 1. Seed users
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

    // 2. Seed Farmers
    farmerCowId = farmerRepository.insertFarmer(db, {
      memberCode: '001',
      nameMr: 'गणेश पवार',
      phone: '9822012345',
      defaultMilkType: 'COW',
      openingBalancePaise: 0,
      nowIso: new Date().toISOString(),
    });

    farmerBuffaloId = farmerRepository.insertFarmer(db, {
      memberCode: '002',
      nameMr: 'तानाजी कदम',
      phone: '9822012346',
      defaultMilkType: 'BUFFALO',
      openingBalancePaise: 0,
      nowIso: new Date().toISOString(),
    });

    inactiveFarmerId = farmerRepository.insertFarmer(db, {
      memberCode: '099',
      nameMr: 'बंद शेतकरी',
      phone: '9822099999',
      defaultMilkType: 'COW',
      openingBalancePaise: 0,
      nowIso: new Date().toISOString(),
    });
    farmerRepository.deactivateFarmer(db, inactiveFarmerId, new Date().toISOString());

    // 3. Create and approve rate plans
    const cowDraft = ratePlanService.createDraft(
      db,
      {
        planName: 'सप्टेंबर गाय दर',
        milkType: 'COW',
        effectiveFrom: '2026-09-01',
        parameters: {
          fatRatePaisePerPoint: 850,
          snfRatePaisePerPoint: 300,
          minimumFatX100: 300,
          maximumFatX100: 600,
          fatStepX100: 10,
          minimumSnfX100: 750,
          maximumSnfX100: 950,
          snfStepX100: 10,
        },
      },
      OWNER_WC_ID
    );
    ratePlanService.approvePlan(db, { planId: cowDraft.id }, OWNER_WC_ID);
    cowPlanId = cowDraft.id;

    const buffaloDraft = ratePlanService.createDraft(
      db,
      {
        planName: 'सप्टेंबर म्हैस दर',
        milkType: 'BUFFALO',
        effectiveFrom: '2026-09-01',
        parameters: {
          fatRatePaisePerPoint: 1100,
          snfRatePaisePerPoint: 266,
          minimumFatX100: 500,
          maximumFatX100: 1200,
          fatStepX100: 10,
          minimumSnfX100: 800,
          maximumSnfX100: 1100,
          snfStepX100: 10,
        },
      },
      OWNER_WC_ID
    );
    ratePlanService.approvePlan(db, { planId: buffaloDraft.id }, OWNER_WC_ID);
    buffaloPlanId = buffaloDraft.id;

    // 4. Open active morning shift
    const shift = shiftService.openShift(
      db,
      { businessDate: '2026-09-05', shiftType: 'MORNING' },
      OWNER_WC_ID
    );
    activeShiftId = shift.id;
  });

  afterEach(() => {
    sessionService.clearSession(OWNER_WC_ID);
    sessionService.clearSession(OPERATOR_WC_ID);
    if (db && db.open) {
      db.close();
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('1. Tests exact string parsers for litres, FAT and SNF', () => {
    expect(parseLitresToMl('50')).toBe(50000);
    expect(parseLitresToMl('8.500')).toBe(8500);
    expect(parseLitresToMl('0.125')).toBe(125);
    expect(formatMlAsLitres(8500)).toBe('8.500');

    expect(parsePercentToX100('4.2')).toBe(420);
    expect(parsePercentToX100('8.50')).toBe(850);
    expect(parseLitresToMl('0')).toBe(0);
    expect(() => parseLitresToMl('-5')).toThrow();
    expect(() => parseLitresToMl('1.2345')).toThrow();
    expect(() => parseLitresToMl('abc')).toThrow();
  });

  it('2. Records Cow milk collection with exact rate and amount calculation', () => {
    const col = milkCollectionService.createCollection(
      db,
      {
        shiftId: activeShiftId,
        memberCode: '001',
        milkType: 'COW',
        quantityLitres: '50.000',
        fatPercent: '4.00',
        snfPercent: '8.50',
      },
      OPERATOR_WC_ID
    );

    expect(col.id).toBeGreaterThan(0);
    expect(col.receiptNumber).toBe('MC-20260905-M-000001');
    expect(col.farmerMemberCode).toBe('001');
    expect(col.farmerNameMr).toBe('गणेश पवार');
    expect(col.milkType).toBe('COW');
    expect(col.quantityMl).toBe(50000);
    expect(col.fatX100).toBe(400);
    expect(col.snfX100).toBe(850);
    expect(col.ratePlanId).toBe(cowPlanId);
    expect(col.rateAppliedPaise).toBe(5950);
    expect(col.amountPaise).toBe(297500);
    expect(col.rateRupeesFormatted).toBe('₹59.50/L');
    expect(col.amountRupeesFormatted).toBe('₹2975.00');
    expect(col.status).toBe('ACTIVE');
  });

  it('3. Records Buffalo milk collection with exact rate and amount calculation', () => {
    const col = milkCollectionService.createCollection(
      db,
      {
        shiftId: activeShiftId,
        memberCode: '002',
        milkType: 'BUFFALO',
        quantityLitres: '50.000',
        fatPercent: '6.00',
        snfPercent: '9.00',
      },
      OPERATOR_WC_ID
    );

    expect(col.receiptNumber).toBe('MC-20260905-M-000001');
    expect(col.farmerMemberCode).toBe('002');
    expect(col.milkType).toBe('BUFFALO');
    expect(col.quantityMl).toBe(50000);
    expect(col.fatX100).toBe(600);
    expect(col.snfX100).toBe(900);
    expect(col.ratePlanId).toBe(buffaloPlanId);
    expect(col.rateAppliedPaise).toBe(8994);
    expect(col.amountPaise).toBe(449700);
  });

  it('4. Rejects collection for inactive farmers and missing farmers', () => {
    // Inactive farmer 099
    expect(() =>
      milkCollectionService.createCollection(
        db,
        {
          shiftId: activeShiftId,
          farmerId: inactiveFarmerId,
          milkType: 'COW',
          quantityLitres: '10',
          fatPercent: '4.0',
          snfPercent: '8.5',
        },
        OPERATOR_WC_ID
      )
    ).toThrow(/is deactivated/i);

    // Missing farmer
    expect(() =>
      milkCollectionService.createCollection(
        db,
        {
          shiftId: activeShiftId,
          memberCode: 'NONEXISTENT_999',
          milkType: 'COW',
          quantityLitres: '10',
          fatPercent: '4.0',
          snfPercent: '8.5',
        },
        OPERATOR_WC_ID
      )
    ).toThrow(/Farmer not found/i);
  });

  it('5. Prevents unconfirmed duplicate collection and allows confirmed duplicate with reason', () => {
    // 1. Record first entry
    const first = milkCollectionService.createCollection(
      db,
      {
        shiftId: activeShiftId,
        memberCode: '001',
        milkType: 'COW',
        quantityLitres: '20.000',
        fatPercent: '4.00',
        snfPercent: '8.50',
      },
      OPERATOR_WC_ID
    );

    // 2. Attempt duplicate without confirmation -> throws DUPLICATE_COLLECTION error
    expect(() =>
      milkCollectionService.createCollection(
        db,
        {
          shiftId: activeShiftId,
          memberCode: '001',
          milkType: 'COW',
          quantityLitres: '15.000',
          fatPercent: '4.00',
          snfPercent: '8.50',
        },
        OPERATOR_WC_ID
      )
    ).toThrow(/DUPLICATE_COLLECTION/);

    // 3. Record duplicate with explicit confirmation and reason
    const second = milkCollectionService.createCollection(
      db,
      {
        shiftId: activeShiftId,
        memberCode: '001',
        milkType: 'COW',
        quantityLitres: '15.000',
        fatPercent: '4.00',
        snfPercent: '8.50',
        duplicateConfirmed: true,
        duplicateReason: 'SECOND_CAN',
      },
      OPERATOR_WC_ID
    );

    expect(second.id).not.toBe(first.id);
    expect(second.receiptNumber).toBe('MC-20260905-M-000002');
    expect(second.duplicateConfirmed).toBe(true);
    expect(second.duplicateReason).toBe('SECOND_CAN');

    // Check duplicate audit event was logged
    const dupAudit = db
      .prepare(
        "SELECT action_type FROM audit_logs WHERE action_type = 'COLLECTION_DUPLICATE_CONFIRMED'"
      )
      .get() as { action_type: string };
    expect(dupAudit.action_type).toBe('COLLECTION_DUPLICATE_CONFIRMED');
  });

  it('6. Rejects collection creation in locked shifts', () => {
    // Close shift
    shiftService.closeShift(db, activeShiftId, OWNER_WC_ID);

    expect(() =>
      milkCollectionService.createCollection(
        db,
        {
          shiftId: activeShiftId,
          memberCode: '001',
          milkType: 'COW',
          quantityLitres: '10.0',
          fatPercent: '4.0',
          snfPercent: '8.5',
        },
        OPERATOR_WC_ID
      )
    ).toThrow(/is LOCKED/i);
  });

  it('7. Preserves immutable snapshot when future rate plans supersede existing plan', () => {
    // Record collection on September 5
    const col = milkCollectionService.createCollection(
      db,
      {
        shiftId: activeShiftId,
        memberCode: '001',
        milkType: 'COW',
        quantityLitres: '50.000',
        fatPercent: '4.00',
        snfPercent: '8.50',
      },
      OPERATOR_WC_ID
    );
    expect(col.rateAppliedPaise).toBe(5950);
    expect(col.amountPaise).toBe(297500);

    // Create a new draft to supersede
    const newDraft = ratePlanService.createDraft(
      db,
      {
        planName: 'ऑक्टोबर गाय दर',
        milkType: 'COW',
        effectiveFrom: '2026-10-01',
        parameters: {
          fatRatePaisePerPoint: 1000,
          snfRatePaisePerPoint: 300,
          minimumFatX100: 300,
          maximumFatX100: 600,
          fatStepX100: 10,
          minimumSnfX100: 750,
          maximumSnfX100: 950,
          snfStepX100: 10,
        },
      },
      OWNER_WC_ID
    );

    // Supersede rate plan from October 1
    ratePlanService.supersedePlan(
      db,
      {
        oldPlanId: cowPlanId,
        newPlanId: newDraft.id,
        newEffectiveFrom: '2026-10-01',
      },
      OWNER_WC_ID
    );

    // Historical collection must remain unchanged
    const saved = milkCollectionRepository.getById(db, col.id);
    expect(saved?.rate_applied_paise).toBe(5950);
    expect(saved?.amount_paise).toBe(297500);
    expect(saved?.rate_plan_id).toBe(cowPlanId);
  });

  it('8. Voiding workflow: Operator forbidden, Owner succeeds, voided rows excluded from totals', () => {
    const col = milkCollectionService.createCollection(
      db,
      {
        shiftId: activeShiftId,
        memberCode: '001',
        milkType: 'COW',
        quantityLitres: '50.000',
        fatPercent: '4.00',
        snfPercent: '8.50',
      },
      OPERATOR_WC_ID
    );

    // 1. Operator cannot void
    expect(() =>
      milkCollectionService.voidCollection(
        db,
        { collectionId: col.id, reason: 'Operator void' },
        OPERATOR_WC_ID
      )
    ).toThrow(/Forbidden/i);

    // 2. Owner voids collection with mandatory reason
    const voided = milkCollectionService.voidCollection(
      db,
      { collectionId: col.id, reason: 'चुकीने नोंद झाली' },
      OWNER_WC_ID
    );
    expect(voided.status).toBe('VOIDED');
    expect(voided.voidReason).toBe('चुकीने नोंद झाली');
    expect(voided.voidedByName).toBe('डेअरी मालक');

    // 3. Repeated voiding is rejected
    expect(() =>
      milkCollectionService.voidCollection(
        db,
        { collectionId: col.id, reason: 'Repeated void' },
        OWNER_WC_ID
      )
    ).toThrow(/already VOIDED/i);

    // 4. Shift summary excludes voided rows from active totals
    const summary = shiftService.getShiftSummary(db, activeShiftId, OWNER_WC_ID);
    expect(summary.totalActiveCollections).toBe(0);
    expect(summary.totalVoidedCollections).toBe(1);
    expect(summary.totalQuantityMl).toBe(0);
    expect(summary.totalAmountPaise).toBe(0);
  });

  it('9. Mutation rolls back collection and receipt counter atomically if audit fails', () => {
    const auditSpy = vi.spyOn(auditService, 'logEvent').mockImplementationOnce(() => {
      throw new Error('Audit write failure');
    });

    try {
      expect(() =>
        milkCollectionService.createCollection(
          db,
          {
            shiftId: activeShiftId,
            memberCode: '001',
            milkType: 'COW',
            quantityLitres: '50.000',
            fatPercent: '4.00',
            snfPercent: '8.50',
          },
          OPERATOR_WC_ID
        )
      ).toThrow('Audit write failure');

      // Verify no collection row was inserted
      const rows = milkCollectionRepository.listByShift(db, activeShiftId);
      expect(rows.length).toBe(0);
    } finally {
      auditSpy.mockRestore();
    }

    // Subsequent valid collection receives sequence number 000001
    const col = milkCollectionService.createCollection(
      db,
      {
        shiftId: activeShiftId,
        memberCode: '001',
        milkType: 'COW',
        quantityLitres: '50.000',
        fatPercent: '4.00',
        snfPercent: '8.50',
      },
      OPERATOR_WC_ID
    );
    expect(col.receiptNumber).toBe('MC-20260905-M-000001');
  });

  it('10. Audit atomicity failure-injection for all 6 Stage 6 audit mutations', () => {
    // Close existing open shift first so we can test opening a new shift
    shiftService.closeShift(db, activeShiftId, OWNER_WC_ID);

    // A. SHIFT_OPENED failure -> shift open rolls back
    const shiftOpenSpy = vi.spyOn(auditService, 'logEvent').mockImplementationOnce(() => {
      throw new Error('SHIFT_OPENED audit failure');
    });
    expect(() =>
      shiftService.openShift(
        db,
        { businessDate: '2026-09-10', shiftType: 'EVENING' },
        OWNER_WC_ID
      )
    ).toThrow('SHIFT_OPENED audit failure');
    shiftOpenSpy.mockRestore();
    expect(shiftService.getCurrentShift(db)).toBeNull();

    // Reopen original shift for remaining tests
    shiftService.reopenShift(db, { shiftId: activeShiftId, reason: 'Reopen for audit tests' }, OWNER_WC_ID);

    // B. SHIFT_CLOSED failure -> shift remains OPEN
    const shiftCloseSpy = vi.spyOn(auditService, 'logEvent').mockImplementationOnce(() => {
      throw new Error('SHIFT_CLOSED audit failure');
    });
    expect(() => shiftService.closeShift(db, activeShiftId, OWNER_WC_ID)).toThrow('SHIFT_CLOSED audit failure');
    shiftCloseSpy.mockRestore();
    expect(shiftService.getShiftById(db, activeShiftId).status).toBe('OPEN');

    // Close shift legitimately to test reopen
    shiftService.closeShift(db, activeShiftId, OWNER_WC_ID);

    // C. SHIFT_REOPENED failure -> shift remains LOCKED
    const shiftReopenSpy = vi.spyOn(auditService, 'logEvent').mockImplementationOnce(() => {
      throw new Error('SHIFT_REOPENED audit failure');
    });
    expect(() =>
      shiftService.reopenShift(db, { shiftId: activeShiftId, reason: 'Test Reopen' }, OWNER_WC_ID)
    ).toThrow('SHIFT_REOPENED audit failure');
    shiftReopenSpy.mockRestore();
    expect(shiftService.getShiftById(db, activeShiftId).status).toBe('LOCKED');

    // Reopen legitimately for collection tests
    shiftService.reopenShift(db, { shiftId: activeShiftId, reason: 'Reopen for testing' }, OWNER_WC_ID);

    // D. COLLECTION_DUPLICATE_CONFIRMED failure -> collection creation rolls back
    const dupSpy = vi.spyOn(auditService, 'logEvent').mockImplementation((_db, event) => {
      if (event.actionType === 'COLLECTION_DUPLICATE_CONFIRMED') {
        throw new Error('COLLECTION_DUPLICATE_CONFIRMED audit failure');
      }
      return 1;
    });

    // Create first collection
    const col1 = milkCollectionService.createCollection(
      db,
      {
        shiftId: activeShiftId,
        memberCode: '001',
        milkType: 'COW',
        quantityLitres: '20.000',
        fatPercent: '4.00',
        snfPercent: '8.50',
      },
      OPERATOR_WC_ID
    );

    // Confirmed duplicate fails because COLLECTION_DUPLICATE_CONFIRMED audit fails
    expect(() =>
      milkCollectionService.createCollection(
        db,
        {
          shiftId: activeShiftId,
          memberCode: '001',
          milkType: 'COW',
          quantityLitres: '20.000',
          fatPercent: '4.00',
          snfPercent: '8.50',
          duplicateConfirmed: true,
          duplicateReason: 'SECOND_CAN',
        },
        OPERATOR_WC_ID
      )
    ).toThrow('COLLECTION_DUPLICATE_CONFIRMED audit failure');
    dupSpy.mockRestore();

    // E. MILK_COLLECTION_VOIDED failure -> collection remains ACTIVE
    const voidSpy = vi.spyOn(auditService, 'logEvent').mockImplementationOnce(() => {
      throw new Error('MILK_COLLECTION_VOIDED audit failure');
    });
    expect(() =>
      milkCollectionService.voidCollection(
        db,
        { collectionId: col1.id, reason: 'Mistake' },
        OWNER_WC_ID
      )
    ).toThrow('MILK_COLLECTION_VOIDED audit failure');
    voidSpy.mockRestore();

    const checkCol = milkCollectionRepository.getById(db, col1.id);
    expect(checkCol?.status).toBe('ACTIVE');
  });

  it('11. Enforces dairy centre enabled_milk_types and rejects BOTH collection milkType', () => {
    // 1. Passing 'BOTH' as collection milkType is rejected
    expect(() =>
      milkCollectionService.createCollection(
        db,
        {
          shiftId: activeShiftId,
          memberCode: '001',
          milkType: 'BOTH' as any,
          quantityLitres: '10.000',
          fatPercent: '4.00',
          snfPercent: '8.50',
        },
        OPERATOR_WC_ID
      )
    ).toThrow(/strictly 'COW' or 'BUFFALO'/);

    // 2. Dairy configured for COW rejects BUFFALO
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('enabled_milk_types', 'COW', datetime('now'))").run();
    expect(() =>
      milkCollectionService.createCollection(
        db,
        {
          shiftId: activeShiftId,
          memberCode: '002',
          milkType: 'BUFFALO',
          quantityLitres: '10.000',
          fatPercent: '7.00',
          snfPercent: '9.00',
        },
        OPERATOR_WC_ID
      )
    ).toThrow(/COW milk only/);

    // 3. Dairy configured for BUFFALO rejects COW
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('enabled_milk_types', 'BUFFALO', datetime('now'))").run();
    expect(() =>
      milkCollectionService.createCollection(
        db,
        {
          shiftId: activeShiftId,
          memberCode: '001',
          milkType: 'COW',
          quantityLitres: '10.000',
          fatPercent: '4.00',
          snfPercent: '8.50',
        },
        OPERATOR_WC_ID
      )
    ).toThrow(/BUFFALO milk only/);

    // Reset to BOTH
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('enabled_milk_types', 'BOTH', datetime('now'))").run();
  });

  it('12. Future settlement protection blocks voiding linked collections unless settlement is cancelled', () => {
    const col = milkCollectionService.createCollection(
      db,
      {
        shiftId: activeShiftId,
        memberCode: '001',
        milkType: 'COW',
        quantityLitres: '25.000',
        fatPercent: '4.00',
        snfPercent: '8.50',
      },
      OPERATOR_WC_ID
    );

    // Link collection to finalized settlement
    db.prepare(`
      INSERT INTO settlement_periods (id, settlement_number, period_start, period_end, status, created_by_user_id, finalized_by_user_id, finalized_at)
      VALUES (500, 'SET-20260907-000001', '2026-09-07', '2026-09-13', 'FINALIZED', 1, 1, (datetime('now')))
    `).run();
    db.prepare(`
      INSERT INTO weekly_settlements (id, settlement_period_id, farmer_id, member_code_snapshot, farmer_name_mr_snapshot, opening_balance_paise, milk_amount_paise, net_amount_paise)
      VALUES (501, 500, ${col.farmerId}, '101', 'आनंदराव', 0, ${col.amountPaise}, ${col.amountPaise})
    `).run();
    db.prepare(`
      INSERT INTO settlement_items (id, weekly_settlement_id, source_type, source_id, reference_number, signed_amount_paise)
      VALUES (5001, 501, 'MILK_COLLECTION', ${col.id}, '${col.receiptNumber}', ${col.amountPaise})
    `).run();

    // Voiding is blocked by active finalized settlement
    expect(() =>
      milkCollectionService.voidCollection(
        db,
        { collectionId: col.id, reason: 'Void linked collection' },
        OWNER_WC_ID
      )
    ).toThrow(/Record is linked to finalized settlement/);
  });

  it('13. checkDuplicate provides structured domain response without throw', () => {
    // Initially no duplicates
    const check1 = milkCollectionService.checkDuplicate(
      db,
      { shiftId: activeShiftId, farmerId: farmerCowId, milkType: 'COW' },
      OPERATOR_WC_ID
    );
    expect(check1.isDuplicate).toBe(false);
    expect(check1.existingCollections.length).toBe(0);

    // Create a collection
    milkCollectionService.createCollection(
      db,
      {
        shiftId: activeShiftId,
        memberCode: '001',
        milkType: 'COW',
        quantityLitres: '15.000',
        fatPercent: '4.00',
        snfPercent: '8.50',
      },
      OPERATOR_WC_ID
    );

    // Now duplicate check returns structured data
    const check2 = milkCollectionService.checkDuplicate(
      db,
      { shiftId: activeShiftId, farmerId: farmerCowId, milkType: 'COW' },
      OPERATOR_WC_ID
    );
    expect(check2.isDuplicate).toBe(true);
    expect(check2.existingCollections.length).toBe(1);
    expect(check2.existingCollections[0].receiptNumber).toMatch(/^MC-/);
  });
});
