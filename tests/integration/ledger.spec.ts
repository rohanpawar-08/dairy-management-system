import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../electron/db/migrator';
import { ledgerService } from '../../electron/services/ledger.service';
import { adjustmentService } from '../../electron/services/adjustment.service';
import { milkCollectionRepository } from '../../electron/db/milk-collection.repository';
import { shiftRepository } from '../../electron/db/shift.repository';
import { farmerRepository } from '../../electron/db/farmer.repository';
import { sessionService } from '../../electron/core/session.service';

describe('Farmer Computed Ledger Integration Tests', () => {
  let db: Database.Database;
  const OWNER_SENDER_ID = 1001;
  const OPERATOR_SENDER_ID = 2002;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);

    const nowIso = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, username, full_name, role, password_hash, is_active, created_at, updated_at)
       VALUES (1, 'owner1', 'Owner Admin', 'OWNER', 'hash', 1, ?, ?)`
    ).run(nowIso, nowIso);

    db.prepare(
      `INSERT INTO users (id, username, full_name, role, password_hash, is_active, created_at, updated_at)
       VALUES (2, 'operator1', 'Operator Staff', 'OPERATOR', 'hash', 1, ?, ?)`
    ).run(nowIso, nowIso);

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

    // Create active rate plan and shift for milk collections
    db.prepare(
      `INSERT INTO rate_plans (id, plan_name, milk_type, strategy_type, pricing_basis, effective_from, status, created_by_user_id, approved_by_user_id, approved_at, created_at, updated_at)
       VALUES (1, 'Standard Cow Plan', 'COW', 'FORMULA', 'PER_PERCENT_POINT_PER_LITRE', '2026-08-01', 'APPROVED', 1, 1, ?, ?, ?)`
    ).run(nowIso, nowIso, nowIso);

    db.prepare(
      `INSERT INTO rate_formula_parameters (rate_plan_id, fat_rate_paise_per_point, snf_rate_paise_per_point, minimum_fat_x100, maximum_fat_x100, fat_step_x100, minimum_snf_x100, maximum_snf_x100, snf_step_x100)
       VALUES (1, 900, 300, 300, 500, 10, 800, 1000, 10)`
    ).run();

    shiftRepository.insertShift(db, {
      businessDate: '2026-08-30',
      shiftType: 'MORNING',
      openedByUserId: 1,
      openedAt: nowIso,
      nowIso,
    });
  });

  afterEach(() => {
    sessionService.clearAllSessions();
    if (db && db.open) {
      db.close();
    }
  });

  it('should compute exact running balance for positive opening balance and mixed transactions', () => {
    const nowIso = new Date().toISOString();
    // Farmer F101 with Opening Balance = +₹500.00 (50000 paise)
    const farmerId = farmerRepository.insertFarmer(db, {
      memberCode: 'F101',
      nameMr: 'ज्ञानेश्वर कदम',
      defaultMilkType: 'BOTH',
      openingBalancePaise: 50000,
      nowIso,
    });

    // Milk Collection: 10L, Rate ₹40/L -> ₹400.00 (40000 paise)
    milkCollectionRepository.insertCollection(db, {
      shiftId: 1,
      farmerId,
      milkType: 'COW',
      shiftType: 'MORNING',
      quantityMl: 10000,
      fatX100: 350,
      snfX100: 850,
      ratePlanId: 1,
      rateAppliedPaise: 4000,
      amountPaise: 40000,
      receiptNumber: 'RCP-20260830-000001',
      businessDate: '2026-08-30',
      duplicateConfirmed: false,
      createdByUserId: 1,
      nowIso,
    });

    // Credit adjustment: +₹200.00 (20000 paise)
    adjustmentService.createAdjustment(
      db,
      {
        farmerId,
        entryType: 'CREDIT',
        category: 'BONUS',
        amountRupees: '200.00',
        businessDate: '2026-08-30',
        reason: 'बोनस',
      },
      OWNER_SENDER_ID
    );

    // Deduction adjustment: -₹300.00 (30000 paise)
    adjustmentService.createAdjustment(
      db,
      {
        farmerId,
        entryType: 'DEDUCTION',
        category: 'CATTLE_FEED',
        amountRupees: '300.00',
        businessDate: '2026-08-30',
        reason: 'पशुखाद्य',
      },
      OWNER_SENDER_ID
    );

    // Advance adjustment: -₹100.00 (10000 paise)
    adjustmentService.createAdjustment(
      db,
      {
        farmerId,
        entryType: 'ADVANCE',
        category: 'CASH_ADVANCE',
        amountRupees: '100.00',
        businessDate: '2026-08-30',
        reason: 'उचल',
      },
      OWNER_SENDER_ID
    );

    // Ledger Summary Calculation
    // OB (+500) + Milk (+400) + Bonus (+200) - Feed (-300) - Adv (-100) = +700.00 (70000 paise)
    const ledger = ledgerService.getFarmerLedger(db, { farmerId }, OPERATOR_SENDER_ID);

    expect(ledger.openingBalancePaise).toBe(50000);
    expect(ledger.milkCreditsPaise).toBe(40000);
    expect(ledger.adjustmentCreditsPaise).toBe(20000);
    expect(ledger.deductionsPaise).toBe(30000);
    expect(ledger.advancesPaise).toBe(10000);

    expect(ledger.netMovementPaise).toBe(20000); // 40000 + 20000 - 30000 - 10000 = 20000
    expect(ledger.currentBalancePaise).toBe(70000);
    expect(ledger.currentBalanceFormatted).toBe('700.00');
    expect(ledger.balanceDirection).toBe('PAYABLE_TO_FARMER');
  });

  it('should handle negative opening balance (farmer debt to dairy)', () => {
    const nowIso = new Date().toISOString();
    // Farmer F102 with Opening Balance = -₹1000.00 (-100000 paise)
    const farmerId = farmerRepository.insertFarmer(db, {
      memberCode: 'F102',
      nameMr: 'मंगेश पाटील',
      defaultMilkType: 'BOTH',
      openingBalancePaise: -100000,
      nowIso,
    });

    // Milk Collection: +₹400.00 (40000 paise)
    milkCollectionRepository.insertCollection(db, {
      shiftId: 1,
      farmerId,
      milkType: 'COW',
      shiftType: 'MORNING',
      quantityMl: 10000,
      fatX100: 350,
      snfX100: 850,
      ratePlanId: 1,
      rateAppliedPaise: 4000,
      amountPaise: 40000,
      receiptNumber: 'RCP-20260830-000002',
      businessDate: '2026-08-30',
      duplicateConfirmed: false,
      createdByUserId: 1,
      nowIso,
    });

    // Balance: -1000 + 400 = -600.00 (-60000 paise)
    const ledger = ledgerService.getFarmerLedger(db, { farmerId }, OPERATOR_SENDER_ID);

    expect(ledger.openingBalancePaise).toBe(-100000);
    expect(ledger.currentBalancePaise).toBe(-60000);
    expect(ledger.currentBalanceFormatted).toBe('-600.00');
    expect(ledger.balanceDirection).toBe('FARMER_DEBT_TO_DAIRY');
  });

  it('should exclude voided adjustments from balance and compute running balance correctly', () => {
    const nowIso = new Date().toISOString();
    const farmerId = farmerRepository.insertFarmer(db, {
      memberCode: 'F103',
      nameMr: 'सुनील पवार',
      defaultMilkType: 'BOTH',
      openingBalancePaise: 0,
      nowIso,
    });

    const adj = adjustmentService.createAdjustment(
      db,
      {
        farmerId,
        entryType: 'DEDUCTION',
        category: 'CATTLE_FEED',
        amountRupees: '500.00',
        businessDate: '2026-08-30',
        reason: 'चुकीची कपात',
      },
      OWNER_SENDER_ID
    );

    // Balance before void = -₹500.00
    let ledger = ledgerService.getFarmerLedger(db, { farmerId }, OPERATOR_SENDER_ID);
    expect(ledger.currentBalancePaise).toBe(-50000);

    // Void adjustment
    adjustmentService.voidAdjustment(
      db,
      { adjustmentId: adj.id, reason: 'रद्द' },
      OWNER_SENDER_ID
    );

    // Balance after void = ₹0.00
    ledger = ledgerService.getFarmerLedger(db, { farmerId }, OPERATOR_SENDER_ID);
    expect(ledger.currentBalancePaise).toBe(0);
    expect(ledger.deductionsPaise).toBe(0);
  });

  it('should allow viewing ledger for inactive farmers', () => {
    const nowIso = new Date().toISOString();
    const farmerId = farmerRepository.insertFarmer(db, {
      memberCode: 'F104',
      nameMr: 'बाळासाहेब शिंदे',
      defaultMilkType: 'BOTH',
      openingBalancePaise: 25000,
      nowIso,
    });
    db.prepare("UPDATE farmers SET is_active = 0 WHERE id = ?").run(farmerId);

    const ledger = ledgerService.getFarmerLedger(db, { farmerId }, OPERATOR_SENDER_ID);

    expect(ledger.isActive).toBe(false);
    expect(ledger.openingBalancePaise).toBe(25000);
    expect(ledger.currentBalancePaise).toBe(25000);
  });
});
