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
import { SettlementService } from '../../electron/services/settlement.service';
import { paymentService } from '../../electron/services/payment.service';

describe('Payment Service Integration Tests', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;
  let settlementService: SettlementService;
  const ownerWebContentsId = 1001;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dairy_pay_test_'));
    dbPath = path.join(tempDir, 'pay_test.db');
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

  it('records payment and allocates deterministically using FIFO across finalized settlements', () => {
    const farmer = farmerService.createFarmer(
      db,
      {
        memberCode: '101',
        nameMr: 'आनंदराव पाटील',
        phone: '9822000001',
        defaultMilkType: 'BOTH',
        openingBalancePaise: 100000,
      },
      ownerWebContentsId
    );

    const draft = settlementService.createDraft(db, { periodStart: '2026-09-07' }, ownerWebContentsId);
    const finalized = settlementService.finalize(db, { periodId: draft.id }, ownerWebContentsId);

    const outstanding = settlementService.getOutstanding(db, farmer.id, ownerWebContentsId);
    expect(outstanding.outstandingBalancePaise).toBe(100000);
    expect(outstanding.canRecordPayment).toBe(true);

    const payment = paymentService.recordPayment(
      db,
      {
        farmerId: farmer.id,
        businessDate: '2026-09-15',
        amountRupees: '400.00',
        paymentMethod: 'CASH',
        notes: 'Partial payment',
      },
      ownerWebContentsId
    );

    expect(payment.status).toBe('RECORDED');
    expect(payment.paymentNumber).toBe('PAY-20260915-000001');
    expect(payment.allocations?.length).toBe(1);
    expect(payment.allocations?.[0].allocatedPaise).toBe(40000);

    const updatedOutstanding = settlementService.getOutstanding(db, farmer.id, ownerWebContentsId);
    expect(updatedOutstanding.outstandingBalancePaise).toBe(60000);
  });

  it('rejects recording payment exceeding total positive outstanding balance', () => {
    const farmer = farmerService.createFarmer(
      db,
      {
        memberCode: '101',
        nameMr: 'आनंदराव पाटील',
        phone: '9822000001',
        defaultMilkType: 'BOTH',
        openingBalancePaise: 20000,
      },
      ownerWebContentsId
    );

    const draft = settlementService.createDraft(db, { periodStart: '2026-09-07' }, ownerWebContentsId);
    settlementService.finalize(db, { periodId: draft.id }, ownerWebContentsId);

    expect(() => {
      paymentService.recordPayment(
        db,
        {
          farmerId: farmer.id,
          businessDate: '2026-09-15',
          amountRupees: '500.00',
          paymentMethod: 'CASH',
        },
        ownerWebContentsId
      );
    }).toThrow("exceeds farmer's positive outstanding balance");
  });

  it('voids payment and restores farmer outstanding balance', () => {
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
    settlementService.finalize(db, { periodId: draft.id }, ownerWebContentsId);

    const payment = paymentService.recordPayment(
      db,
      {
        farmerId: farmer.id,
        businessDate: '2026-09-15',
        amountRupees: '300.00',
        paymentMethod: 'CASH',
      },
      ownerWebContentsId
    );

    const outstandingAfterPayment = settlementService.getOutstanding(db, farmer.id, ownerWebContentsId);
    expect(outstandingAfterPayment.outstandingBalancePaise).toBe(20000);

    const voided = paymentService.voidPayment(
      db,
      { paymentId: payment.id, reason: 'Incorrect entry' },
      ownerWebContentsId
    );

    expect(voided.status).toBe('VOIDED');
    expect(voided.voidReason).toBe('Incorrect entry');

    const outstandingAfterVoid = settlementService.getOutstanding(db, farmer.id, ownerWebContentsId);
    expect(outstandingAfterVoid.outstandingBalancePaise).toBe(50000);
  });
});
