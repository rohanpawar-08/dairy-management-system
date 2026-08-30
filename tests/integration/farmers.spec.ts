import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyAndVerifyPragmas } from '../../electron/db/connection';
import { runMigrations } from '../../electron/db/migrator';
import {
  farmerService,
  normalizeMemberCode,
  validateFarmerInput,
  FARMER_VALIDATION,
} from '../../electron/services/farmer.service';
import { farmerRepository } from '../../electron/db/farmer.repository';
import { sessionService } from '../../electron/core/session.service';
import { auditService } from '../../electron/services/audit.service';
import {
  CreateFarmerPayload,
  UpdateFarmerPayload,
} from '../../shared/ipc-contracts';

describe('Farmer Management, Validation, Security & Opening Balances (Stage 4 Integration)', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database | null = null;

  const OWNER_WINDOW_ID = 1001;
  const OPERATOR_WINDOW_ID = 1002;
  const UNAUTH_WINDOW_ID = 1003;

  const sampleFarmerPayload: CreateFarmerPayload = {
    memberCode: '001',
    nameMr: 'तुकाराम विठ्ठल शिंदे',
    nameEn: 'Tukaram Vitthal Shinde',
    phone: '9876543210',
    village: 'वारजे, पुणे',
    bankAccountNumber: '123456789012',
    bankIfsc: 'SBIN0001234',
    bankName: 'State Bank of India',
    upiId: 'tuka@oksbi',
    defaultMilkType: 'COW',
    openingBalancePaise: 150000, // ₹1,500.00
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dairy_farmers_test_'));
    dbPath = path.join(tempDir, 'farmers_test.db');
    db = new Database(dbPath);
    applyAndVerifyPragmas(db);
    runMigrations(db);

    const nowIso = new Date().toISOString();
    // Insert Owner and Operator user records to satisfy audit_logs user_id foreign key constraint
    db.prepare(`
      INSERT INTO users (id, username, password_hash, full_name, role, is_active, created_at, updated_at)
      VALUES (1, 'owner_ram', 'hash', 'रामचंद्र पाटील', 'OWNER', 1, ?, ?)
    `).run(nowIso, nowIso);

    db.prepare(`
      INSERT INTO users (id, username, password_hash, full_name, role, is_active, created_at, updated_at)
      VALUES (2, 'operator_sham', 'hash', 'शाम काळे', 'OPERATOR', 1, ?, ?)
    `).run(nowIso, nowIso);

    // Setup Owner Session on OWNER_WINDOW_ID
    sessionService.createSession(OWNER_WINDOW_ID, {
      id: 1,
      username: 'owner_ram',
      full_name: 'रामचंद्र पाटील',
      role: 'OWNER',
    });

    // Setup Operator Session on OPERATOR_WINDOW_ID
    sessionService.createSession(OPERATOR_WINDOW_ID, {
      id: 2,
      username: 'operator_sham',
      full_name: 'शाम काळे',
      role: 'OPERATOR',
    });
  });

  afterEach(() => {
    sessionService.clearSession(OWNER_WINDOW_ID);
    sessionService.clearSession(OPERATOR_WINDOW_ID);
    sessionService.clearSession(UNAUTH_WINDOW_ID);

    if (db && db.open) {
      db.close();
    }
    db = null;
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Member-Code Validation & Normalization Rules', () => {
    it('proves normalization rule memberCode.trim().toUpperCase() preserves leading zeroes', () => {
      expect(normalizeMemberCode('001')).toBe('001');
      expect(normalizeMemberCode('  001  ')).toBe('001');
      expect(normalizeMemberCode('abc-001')).toBe('ABC-001');
      expect(normalizeMemberCode('farmer_001')).toBe('FARMER_001');
      expect(normalizeMemberCode('FARMER-001')).toBe('FARMER-001');
    });

    it('creates farmer successfully with 001 and preserves leading zeroes as string', () => {
      if (!db) throw new Error('DB not initialized');

      const created = farmerService.createFarmer(db, sampleFarmerPayload, OWNER_WINDOW_ID);

      expect(created.id).toBeGreaterThan(0);
      expect(created.memberCode).toBe('001');
      expect(typeof created.memberCode).toBe('string');
      expect(created.nameMr).toBe('तुकाराम विठ्ठल शिंदे');
      expect(created.defaultMilkType).toBe('COW');
      expect(created.openingBalancePaise).toBe(150000);
      expect(created.isActive).toBe(true);

      // Verify list masking
      expect(created.maskedBankAccount).toBe('••••••••9012');
      expect(created.maskedUpiId).toBe('t••a@oksbi');
    });

    it('accepts FARMER_001 and FARMER-001 and stores normalized uppercase code', () => {
      if (!db) throw new Error('DB not initialized');

      const f1 = farmerService.createFarmer(
        db,
        { ...sampleFarmerPayload, memberCode: 'FARMER_001', nameMr: 'शेतकरी १' },
        OWNER_WINDOW_ID
      );
      expect(f1.memberCode).toBe('FARMER_001');

      const f2 = farmerService.createFarmer(
        db,
        { ...sampleFarmerPayload, memberCode: 'FARMER-001', nameMr: 'शेतकरी २' },
        OWNER_WINDOW_ID
      );
      expect(f2.memberCode).toBe('FARMER-001');

      // abc-001 is stored normalized as ABC-001
      const f3 = farmerService.createFarmer(
        db,
        { ...sampleFarmerPayload, memberCode: 'abc-001', nameMr: 'शेतकरी ३' },
        OWNER_WINDOW_ID
      );
      expect(f3.memberCode).toBe('ABC-001');
    });

    it('strictly rejects differently cased duplicate member codes with bilingual error', () => {
      if (!db) throw new Error('DB not initialized');

      farmerService.createFarmer(
        db,
        { ...sampleFarmerPayload, memberCode: 'ABC-001', nameMr: 'शेतकरी मूळ' },
        OWNER_WINDOW_ID
      );

      // Attempting to create duplicate with lowercase code
      expect(() =>
        farmerService.createFarmer(
          db!,
          { ...sampleFarmerPayload, memberCode: 'abc-001', nameMr: 'शेतकरी डुप्लिकेट' },
          OWNER_WINDOW_ID
        )
      ).toThrow(/already registered/i);
    });

    it('rejects invalid member codes: spaces, slashes, percent, and length > 20', () => {
      // Spaces
      const spaceCheck = validateFarmerInput({
        ...sampleFarmerPayload,
        memberCode: '00 1',
      });
      expect(spaceCheck.valid).toBe(false);
      expect(spaceCheck.error).toContain('spaces');

      // Slash /
      const slashCheck = validateFarmerInput({
        ...sampleFarmerPayload,
        memberCode: '001/A',
      });
      expect(slashCheck.valid).toBe(false);

      // Percent %
      const percentCheck = validateFarmerInput({
        ...sampleFarmerPayload,
        memberCode: '001%',
      });
      expect(percentCheck.valid).toBe(false);

      // Length > 20 (21 characters)
      const longCheck = validateFarmerInput({
        ...sampleFarmerPayload,
        memberCode: '123456789012345678901',
      });
      expect(longCheck.valid).toBe(false);
      expect(longCheck.error).toContain('between 1 and 20');
    });
  });

  describe('Search & SQL Wildcard Escaping', () => {
    it('searches farmers with parameterized literal wildcard escaping for % and _', () => {
      if (!db) throw new Error('DB not initialized');

      farmerService.createFarmer(
        db,
        { ...sampleFarmerPayload, memberCode: 'CODE100', nameMr: '100% शुद्ध दूध' },
        OWNER_WINDOW_ID
      );
      farmerService.createFarmer(
        db,
        { ...sampleFarmerPayload, memberCode: 'CODE_01', nameMr: 'दत्तात्रय _ कदम' },
        OWNER_WINDOW_ID
      );
      farmerService.createFarmer(
        db,
        { ...sampleFarmerPayload, memberCode: 'CODE-02', nameMr: 'गणेश पवार' },
        OWNER_WINDOW_ID
      );

      // Literal % search in name
      const resultsPercent = farmerService.listFarmers(
        db,
        { search: '100%' },
        OWNER_WINDOW_ID
      );
      expect(resultsPercent.length).toBe(1);
      expect(resultsPercent[0].memberCode).toBe('CODE100');

      // Literal _ search in memberCode / name (only matches CODE_01 and दत्तात्रय _ कदम)
      const resultsUnderscore = farmerService.listFarmers(
        db,
        { search: '_' },
        OWNER_WINDOW_ID
      );
      expect(resultsUnderscore.length).toBe(1);
      expect(resultsUnderscore[0].memberCode).toBe('CODE_01');

      // Search by Marathi substring
      const resultsMarathi = farmerService.listFarmers(
        db,
        { search: 'गणेश' },
        OWNER_WINDOW_ID
      );
      expect(resultsMarathi.length).toBe(1);
      expect(resultsMarathi[0].memberCode).toBe('CODE-02');
    });

    it('filters farmers by status and milk type with deterministic ordering', () => {
      if (!db) throw new Error('DB not initialized');

      const f1 = farmerService.createFarmer(
        db,
        { ...sampleFarmerPayload, memberCode: '001', defaultMilkType: 'COW' },
        OWNER_WINDOW_ID
      );
      const f2 = farmerService.createFarmer(
        db,
        { ...sampleFarmerPayload, memberCode: '002', defaultMilkType: 'BUFFALO' },
        OWNER_WINDOW_ID
      );
      farmerService.createFarmer(
        db,
        { ...sampleFarmerPayload, memberCode: '003', defaultMilkType: 'BOTH' },
        OWNER_WINDOW_ID
      );

      // Deactivate farmer 002
      farmerService.deactivateFarmer(db, f2.id, { reason: 'Deactivated' }, OWNER_WINDOW_ID);

      // Filter ACTIVE only
      const activeFarmers = farmerService.listFarmers(
        db,
        { status: 'ACTIVE' },
        OWNER_WINDOW_ID
      );
      expect(activeFarmers.map((f) => f.memberCode)).toEqual(['001', '003']);

      // Filter INACTIVE only
      const inactiveFarmers = farmerService.listFarmers(
        db,
        { status: 'INACTIVE' },
        OWNER_WINDOW_ID
      );
      expect(inactiveFarmers.map((f) => f.memberCode)).toEqual(['002']);

      // Filter ALL
      const allFarmers = farmerService.listFarmers(db, { status: 'ALL' }, OWNER_WINDOW_ID);
      expect(allFarmers.length).toBe(3);
      expect(allFarmers[0].isActive).toBe(true);

      // Filter by Milk Type COW
      const cowFarmers = farmerService.listFarmers(
        db,
        { milkType: 'COW' },
        OWNER_WINDOW_ID
      );
      expect(cowFarmers.length).toBe(1);
      expect(cowFarmers[0].memberCode).toBe('001');
    });
  });

  describe('Non-Destructive Soft Deactivation & Zero Hard-Deletes', () => {
    it('proves no hard-delete methods exist on FarmerRepository and FarmerService', () => {
      expect((farmerRepository as any).deleteFarmer).toBeUndefined();
      expect((farmerRepository as any).hardDelete).toBeUndefined();
      expect((farmerRepository as any).delete).toBeUndefined();
      expect((farmerService as any).deleteFarmer).toBeUndefined();
      expect((farmerService as any).hardDelete).toBeUndefined();
    });

    it('soft-deactivates and reactivates farmers while preserving the database row', () => {
      if (!db) throw new Error('DB not initialized');

      const created = farmerService.createFarmer(db, sampleFarmerPayload, OWNER_WINDOW_ID);

      const countBefore = (
        db.prepare('SELECT count(*) as count FROM farmers').get() as { count: number }
      ).count;

      // Soft-deactivate
      const deactivated = farmerService.deactivateFarmer(
        db,
        created.id,
        { reason: 'Farmer moved' },
        OWNER_WINDOW_ID
      );
      expect(deactivated.isActive).toBe(false);

      // Row count in database remains unchanged
      const countAfter = (
        db.prepare('SELECT count(*) as count FROM farmers').get() as { count: number }
      ).count;
      expect(countAfter).toBe(countBefore);

      // Resolving as active collection member returns null
      const activeLookup = farmerService.getFarmerByMemberCode(
        db,
        '001',
        true,
        OWNER_WINDOW_ID
      );
      expect(activeLookup).toBeNull();

      // Resolving without activeOnly flag returns the inactive record
      const anyLookup = farmerService.getFarmerByMemberCode(
        db,
        '001',
        false,
        OWNER_WINDOW_ID
      );
      expect(anyLookup).not.toBeNull();
      expect(anyLookup?.isActive).toBe(false);

      // Reactivate
      const reactivated = farmerService.reactivateFarmer(db, created.id, OWNER_WINDOW_ID);
      expect(reactivated.isActive).toBe(true);

      const activeLookupAfter = farmerService.getFarmerByMemberCode(
        db,
        '001',
        true,
        OWNER_WINDOW_ID
      );
      expect(activeLookupAfter?.isActive).toBe(true);
    });
  });

  describe('Opening Balances & Immutability Rules', () => {
    it('allows updating opening balance when no financial activity exists', () => {
      if (!db) throw new Error('DB not initialized');

      const created = farmerService.createFarmer(db, sampleFarmerPayload, OWNER_WINDOW_ID);

      const updated = farmerService.updateFarmer(
        db,
        created.id,
        {
          ...sampleFarmerPayload,
          openingBalancePaise: -50000, // ₹500 debt
        },
        OWNER_WINDOW_ID
      );

      expect(updated.openingBalancePaise).toBe(-50000);
    });

    it('locks opening balance modification when financial activity exists', () => {
      if (!db) throw new Error('DB not initialized');

      const created = farmerService.createFarmer(db, sampleFarmerPayload, OWNER_WINDOW_ID);

      // Simulate financial activity by recording a shift and milk collection
      db.exec(`
        INSERT OR IGNORE INTO users (id, username, full_name, role, password_hash, is_active)
        VALUES (1, 'owner', 'Owner', 'OWNER', 'hash', 1);

        INSERT OR IGNORE INTO rate_plans (
          id, plan_name, milk_type, strategy_type, pricing_basis, effective_from, status,
          created_by_user_id, approved_by_user_id, approved_at
        ) VALUES (
          999, 'Test Plan', 'COW', 'FORMULA', 'PER_PERCENT_POINT_PER_LITRE', '2026-09-01', 'APPROVED',
          1, 1, '2026-09-01T00:00:00Z'
        );

        INSERT OR IGNORE INTO shifts (id, business_date, shift_type, status, opened_by_user_id, opened_at)
        VALUES (999, '2026-09-01', 'MORNING', 'OPEN', 1, '2026-09-01T06:00:00Z');

        INSERT INTO milk_collections (
          receipt_number, shift_id, farmer_id, business_date, shift_type, milk_type,
          quantity_ml, fat_x100, snf_x100, rate_plan_id, rate_applied_paise, amount_paise, created_by_user_id, status
        ) VALUES (
          'MC-20260901-M-999001', 999, ${created.id}, '2026-09-01', 'MORNING', 'COW',
          50000, 400, 850, 999, 5950, 297500, 1, 'ACTIVE'
        );
      `);

      // Verify activity checker recognizes it
      expect(farmerRepository.hasFinancialActivity(db, created.id)).toBe(true);

      // Attempting to change opening balance should be rejected
      const updateWithChangedBalance: UpdateFarmerPayload = {
        ...sampleFarmerPayload,
        openingBalancePaise: 200000,
      };

      expect(() =>
        farmerService.updateFarmer(
          db!,
          created.id,
          updateWithChangedBalance,
          OWNER_WINDOW_ID
        )
      ).toThrow(/Cannot modify opening balance: Farmer has existing financial transactions/i);

      // Unrelated fields (e.g. phone, village) should still be editable
      const updateUnrelatedFields: UpdateFarmerPayload = {
        ...sampleFarmerPayload,
        openingBalancePaise: 150000,
        phone: '9822000000',
        village: 'नवीन गाव, बारामती',
      };

      const updatedSuccess = farmerService.updateFarmer(
        db,
        created.id,
        updateUnrelatedFields,
        OWNER_WINDOW_ID
      );
      expect(updatedSuccess.phone).toBe('9822000000');
      expect(updatedSuccess.village).toBe('नवीन गाव, बारामती');
    });
  });

  describe('Authorization, Security & Audit Trail', () => {
    it('enforces RBAC permissions strictly: Operator cannot mutate or access full edit details', () => {
      if (!db) throw new Error('DB not initialized');

      // 1. Unauthenticated request rejected
      expect(() =>
        farmerService.listFarmers(db!, {}, UNAUTH_WINDOW_ID)
      ).toThrow(/Unauthorized/i);

      // 2. Operator CAN list and get (with masked PII)
      const created = farmerService.createFarmer(db, sampleFarmerPayload, OWNER_WINDOW_ID);
      const opList = farmerService.listFarmers(db, {}, OPERATOR_WINDOW_ID);
      expect(opList.length).toBe(1);
      expect(opList[0].maskedBankAccount).toBe('••••••••9012');
      expect(opList[0].maskedUpiId).toBe('t••a@oksbi');

      // 3. Operator CANNOT get unmasked edit details
      expect(() =>
        farmerService.getFarmerEditDetail(db!, created.id, OPERATOR_WINDOW_ID)
      ).toThrow(/Forbidden/i);

      // 4. Owner CAN get unmasked edit details
      const ownerDetail = farmerService.getFarmerEditDetail(
        db,
        created.id,
        OWNER_WINDOW_ID
      );
      expect(ownerDetail.bankAccountNumber).toBe('123456789012');
      expect(ownerDetail.upiId).toBe('tuka@oksbi');

      // 5. Operator CANNOT create
      expect(() =>
        farmerService.createFarmer(db!, sampleFarmerPayload, OPERATOR_WINDOW_ID)
      ).toThrow(/Forbidden/i);

      // 6. Operator CANNOT update
      expect(() =>
        farmerService.updateFarmer(db!, created.id, sampleFarmerPayload, OPERATOR_WINDOW_ID)
      ).toThrow(/Forbidden/i);

      // 7. Operator CANNOT deactivate
      expect(() =>
        farmerService.deactivateFarmer(db!, created.id, {}, OPERATOR_WINDOW_ID)
      ).toThrow(/Forbidden/i);

      // 8. Operator CANNOT reactivate
      expect(() =>
        farmerService.reactivateFarmer(db!, created.id, OPERATOR_WINDOW_ID)
      ).toThrow(/Forbidden/i);
    });

    it('records audit events on mutations without exposing secrets and rolls back atomically on failure', () => {
      if (!db) throw new Error('DB not initialized');

      const created = farmerService.createFarmer(db, sampleFarmerPayload, OWNER_WINDOW_ID);
      farmerService.updateFarmer(
        db,
        created.id,
        { ...sampleFarmerPayload, phone: '9898989898' },
        OWNER_WINDOW_ID
      );
      farmerService.deactivateFarmer(db, created.id, { reason: 'Test' }, OWNER_WINDOW_ID);
      farmerService.reactivateFarmer(db, created.id, OWNER_WINDOW_ID);

      const auditRows = db
        .prepare('SELECT action_type, details_json FROM audit_logs ORDER BY id ASC')
        .all() as { action_type: string; details_json: string }[];

      const actionTypes = auditRows.map((r) => r.action_type);
      expect(actionTypes).toContain('FARMER_CREATED');
      expect(actionTypes).toContain('FARMER_UPDATED');
      expect(actionTypes).toContain('FARMER_DEACTIVATED');
      expect(actionTypes).toContain('FARMER_REACTIVATED');

      // Verify no audit log contains raw bank account or secret tokens
      for (const row of auditRows) {
        expect(row.details_json).not.toContain('123456789012');
      }

      // Test Atomic Rollback if Audit Write Fails
      const countBeforeFail = (
        db.prepare('SELECT count(*) as count FROM farmers').get() as { count: number }
      ).count;

      vi.spyOn(auditService, 'logEvent').mockImplementationOnce(() => {
        throw new Error('Injected Audit Failure');
      });

      expect(() =>
        farmerService.createFarmer(
          db!,
          { ...sampleFarmerPayload, memberCode: 'FAIL_001', nameMr: 'Fail Farmer' },
          OWNER_WINDOW_ID
        )
      ).toThrow('Injected Audit Failure');

      // Verify farmer was NOT inserted due to atomic rollback
      const countAfterFail = (
        db.prepare('SELECT count(*) as count FROM farmers').get() as { count: number }
      ).count;
      expect(countAfterFail).toBe(countBeforeFail);
    });
  });
});
