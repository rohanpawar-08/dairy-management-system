import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyAndVerifyPragmas } from '../../electron/db/connection';
import { runMigrations } from '../../electron/db/migrator';
import { setupService } from '../../electron/services/setup.service';
import { sessionService } from '../../electron/core/session.service';
import { farmerService } from '../../electron/services/farmer.service';
import { shiftService } from '../../electron/services/shift.service';
import { milkCollectionService } from '../../electron/services/milk-collection.service';
import { ratePlanService } from '../../electron/services/rate-plan.service';
import { adjustmentService } from '../../electron/services/adjustment.service';
import { SettlementService } from '../../electron/services/settlement.service';

describe('Settlement Service Integration Tests', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;
  let settlementService: SettlementService;
  const ownerWebContentsId = 1001;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dairy_set_test_'));
    dbPath = path.join(tempDir, 'set_test.db');
    db = new Database(dbPath);
    applyAndVerifyPragmas(db);
    runMigrations(db);

    settlementService = new SettlementService({
      getTodayBusinessDate: () => '2026-09-30',
      getNowIso: () => new Date().toISOString(),
    });

    await setupService.completeSetup(
      db,
      {
        centreName: 'Gokul Dairy Centre',
        ownerName: 'Ramchandra Patil',
        phonePrimary: '9876543210',
        defaultLanguage: 'mr',
        enabledMilkTypes: 'BOTH',
        settlementStartDay: 'MONDAY',
        username: 'owner_ram',
        password: 'SecurePassword123',
        pin: '1234',
      }
    );

    sessionService.createSession(ownerWebContentsId, {
      id: 1,
      username: 'owner_ram',
      full_name: 'Ramchandra Patil',
      role: 'OWNER',
    });
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

  it('validates settlement_start_day and rejects non-Monday start dates', () => {
    expect(() => {
      settlementService.createDraft(db, { periodStart: '2026-09-08' }, ownerWebContentsId);
    }).toThrow('configured settlement start day is MONDAY');
  });

  it('creates draft period and dynamic preview without writing weekly_settlements snapshots', () => {
    const farmer = farmerService.createFarmer(
      db,
      {
        memberCode: '101',
        nameMr: 'आनंदराव पाटील',
        phone: '9822000001',
        defaultMilkType: 'BOTH',
        openingBalancePaise: 10000,
      },
      ownerWebContentsId
    );

    const draft = settlementService.createDraft(db, { periodStart: '2026-09-07' }, ownerWebContentsId);
    expect(draft.status).toBe('DRAFT');
    expect(draft.periodEnd).toBe('2026-09-13');

    const preview = settlementService.preview(db, { periodId: draft.id }, ownerWebContentsId);
    expect(preview.eligibleFarmerCount).toBe(1);
    expect(preview.farmerItems[0].openingBalancePaise).toBe(10000);
    expect(preview.farmerItems[0].netAmountPaise).toBe(10000);

    const count = (
      db.prepare('SELECT count(*) as count FROM weekly_settlements').get() as { count: number }
    ).count;
    expect(count).toBe(0);
  });

  it('finalizes settlement atomically and creates frozen snapshots and settlement items', () => {
    const farmer = farmerService.createFarmer(
      db,
      {
        memberCode: '101',
        nameMr: 'आनंदराव पाटील',
        phone: '9822000001',
        defaultMilkType: 'BOTH',
        openingBalancePaise: 50000,
      },
      ownerWebContentsId
    );

    const draft = settlementService.createDraft(db, { periodStart: '2026-09-07' }, ownerWebContentsId);
    const finalized = settlementService.finalize(db, { periodId: draft.id }, ownerWebContentsId);

    expect(finalized.status).toBe('FINALIZED');
    expect(finalized.finalizedAt).toBeDefined();

    const farmerSettlements = settlementService.listFarmerSettlements(db, { periodId: draft.id }, ownerWebContentsId);
    expect(farmerSettlements.length).toBe(1);
    expect(farmerSettlements[0].netAmountPaise).toBe(50000);
    expect(farmerSettlements[0].openingBalancePaise).toBe(50000);

    const items = db.prepare('SELECT * FROM settlement_items WHERE weekly_settlement_id = ?').all(farmerSettlements[0].id) as any[];
    expect(items.length).toBe(1);
    expect(items[0].source_type).toBe('OPENING_BALANCE');
  });

  it('includes opening balance exactly once across consecutive periods', () => {
    const farmer = farmerService.createFarmer(
      db,
      {
        memberCode: '101',
        nameMr: 'आनंदराव पाटील',
        phone: '9822000001',
        defaultMilkType: 'BOTH',
        openingBalancePaise: 50000,
      },
      ownerWebContentsId
    );

    // Period 1
    const draft1 = settlementService.createDraft(db, { periodStart: '2026-09-07' }, ownerWebContentsId);
    settlementService.finalize(db, { periodId: draft1.id }, ownerWebContentsId);

    // Period 2: no additional activity, opening balance already settled in Period 1
    const draft2 = settlementService.createDraft(db, { periodStart: '2026-09-14' }, ownerWebContentsId);
    const preview2 = settlementService.preview(db, { periodId: draft2.id }, ownerWebContentsId);

    // Farmer is not eligible in Period 2 because opening balance is already included and no new collections exist
    const farmerItem = preview2.farmerItems.find((f) => f.farmerId === farmer.id);
    expect(farmerItem).toBeUndefined();
  });

  it('rejects finalizing empty settlement batch when no eligible activity exists', () => {
    const draft = settlementService.createDraft(db, { periodStart: '2026-09-07' }, ownerWebContentsId);
    expect(() => {
      settlementService.finalize(db, { periodId: draft.id }, ownerWebContentsId);
    }).toThrow('Cannot finalize an empty settlement batch');
  });

  it('blocks finalization if prior unsettled activity exists before period start', () => {
    const farmer = farmerService.createFarmer(
      db,
      {
        memberCode: '101',
        nameMr: 'आनंदराव पाटील',
        phone: '9822000001',
        defaultMilkType: 'BOTH',
        openingBalancePaise: 0,
      },
      ownerWebContentsId
    );

    adjustmentService.createAdjustment(
      db,
      {
        farmerId: farmer.id,
        entryType: 'CREDIT',
        category: 'BONUS',
        amountRupees: '500.00',
        businessDate: '2026-09-01',
        reason: 'Prior credit',
      },
      ownerWebContentsId
    );

    // Draft starts on 2026-09-07, leaving 2026-09-01 unsettled
    const draft = settlementService.createDraft(db, { periodStart: '2026-09-07' }, ownerWebContentsId);
    expect(() => {
      settlementService.finalize(db, { periodId: draft.id }, ownerWebContentsId);
    }).toThrow('UNSETTLED_PRIOR_ACTIVITY');
  });

  it('blocks voiding linked collections or adjustments after period finalization', () => {
    const plan = ratePlanService.createDraft(
      db,
      {
        planName: 'Cow Plan',
        milkType: 'COW',
        effectiveFrom: '2026-09-01',
        parameters: {
          fatRatePaisePerPoint: 800,
          snfRatePaisePerPoint: 300,
          minimumFatX100: 300,
          maximumFatX100: 600,
          fatStepX100: 10,
          minimumSnfX100: 750,
          maximumSnfX100: 950,
          snfStepX100: 10,
        },
      },
      ownerWebContentsId
    );
    ratePlanService.approvePlan(db, { planId: plan.id }, ownerWebContentsId);

    const farmer = farmerService.createFarmer(
      db,
      {
        memberCode: '101',
        nameMr: 'आनंदराव पाटील',
        phone: '9822000001',
        defaultMilkType: 'BOTH',
        openingBalancePaise: 0,
      },
      ownerWebContentsId
    );

    const shift = shiftService.openShift(
      db,
      { businessDate: '2026-09-07', shiftType: 'MORNING' },
      ownerWebContentsId
    );

    const col = milkCollectionService.createCollection(
      db,
      {
        shiftId: shift.id,
        farmerId: farmer.id,
        milkType: 'COW',
        quantityLitres: '10.0',
        fatPercent: '3.5',
        snfPercent: '8.5',
      },
      ownerWebContentsId
    );

    const adj = adjustmentService.createAdjustment(
      db,
      {
        farmerId: farmer.id,
        entryType: 'DEDUCTION',
        category: 'CATTLE_FEED',
        amountRupees: '100.00',
        businessDate: '2026-09-07',
        reason: 'Feed deduction',
      },
      ownerWebContentsId
    );

    const draft = settlementService.createDraft(db, { periodStart: '2026-09-07' }, ownerWebContentsId);
    settlementService.finalize(db, { periodId: draft.id }, ownerWebContentsId);

    expect(() => {
      milkCollectionService.voidCollection(
        db,
        { collectionId: col.id, reason: 'Test void' },
        ownerWebContentsId
      );
    }).toThrow('is linked to finalized settlement');

    expect(() => {
      adjustmentService.voidAdjustment(
        db,
        { adjustmentId: adj.id, reason: 'Test void' },
        ownerWebContentsId
      );
    }).toThrow('is linked to finalized settlement');
  });
});
