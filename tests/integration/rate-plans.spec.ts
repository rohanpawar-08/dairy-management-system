import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyAndVerifyPragmas } from '../../electron/db/connection';
import { runMigrations } from '../../electron/db/migrator';
import { ratePlanService } from '../../electron/services/rate-plan.service';
import { sessionService } from '../../electron/core/session.service';
import { auditService } from '../../electron/services/audit.service';
import { RateFormulaParametersDto } from '../../shared/ipc-contracts';

describe('Stage 5: Rate Plans, Pricing Engine & Security Integration Tests', () => {
  let db: Database.Database;
  let tempDir: string;
  let dbPath: string;

  const OWNER_WC_ID = 1001;
  const OPERATOR_WC_ID = 1002;

  const defaultCowParams: RateFormulaParametersDto = {
    fatRatePaisePerPoint: 850,
    snfRatePaisePerPoint: 300,
    minimumFatX100: 300,
    maximumFatX100: 600,
    fatStepX100: 10,
    minimumSnfX100: 750,
    maximumSnfX100: 950,
    snfStepX100: 10,
  };

  const defaultBuffaloParams: RateFormulaParametersDto = {
    fatRatePaisePerPoint: 900,
    snfRatePaisePerPoint: 300,
    minimumFatX100: 500,
    maximumFatX100: 1200,
    fatStepX100: 10,
    minimumSnfX100: 800,
    maximumSnfX100: 1050,
    snfStepX100: 10,
  };

  beforeEach(() => {
    tempDir = path.join(
      os.tmpdir(),
      `rate_plan_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    );
    fs.mkdirSync(tempDir, { recursive: true });
    dbPath = path.join(tempDir, 'test.db');

    db = new Database(dbPath);
    applyAndVerifyPragmas(db);
    runMigrations(db);

    // Seed dummy users
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, username, password_hash, full_name, role, is_active, created_at, updated_at)
      VALUES (1, 'owner_user', 'hash', 'Test Owner', 'OWNER', 1, ?, ?)
    `).run(now, now);

    db.prepare(`
      INSERT INTO users (id, username, password_hash, full_name, role, is_active, created_at, updated_at)
      VALUES (2, 'operator_user', 'hash', 'Test Operator', 'OPERATOR', 1, ?, ?)
    `).run(now, now);

    // Setup sessions
    sessionService.createSession(OWNER_WC_ID, {
      id: 1,
      username: 'owner_user',
      full_name: 'Test Owner',
      role: 'OWNER',
    });

    sessionService.createSession(OPERATOR_WC_ID, {
      id: 2,
      username: 'operator_user',
      full_name: 'Test Operator',
      role: 'OPERATOR',
    });
  });

  afterEach(() => {
    sessionService.clearSession(OWNER_WC_ID);
    sessionService.clearSession(OPERATOR_WC_ID);
    if (db && db.open) {
      db.close();
    }
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  });

  it('1. Confirms 0 seed rate plans exist on a clean installation', () => {
    const plans = ratePlanService.listPlans(db, {}, OWNER_WC_ID);
    expect(plans).toHaveLength(0);

    const countRow = db.prepare('SELECT count(*) as count FROM rate_plans').get() as { count: number };
    expect(countRow.count).toBe(0);
  });

  it('2. Owner creates Cow and Buffalo draft rate plans with parameters', () => {
    const cowDraft = ratePlanService.createDraft(
      db,
      {
        planName: 'गाय दरपत्रक सप्टेंबर',
        milkType: 'COW',
        effectiveFrom: '2026-09-01',
        parameters: defaultCowParams,
      },
      OWNER_WC_ID
    );

    expect(cowDraft.id).toBeGreaterThan(0);
    expect(cowDraft.status).toBe('DRAFT');
    expect(cowDraft.milkType).toBe('COW');
    expect(cowDraft.parameters.fatRatePaisePerPoint).toBe(850);
    expect(cowDraft.parameters.snfRatePaisePerPoint).toBe(300);

    const buffaloDraft = ratePlanService.createDraft(
      db,
      {
        planName: 'म्हैस दरपत्रक सप्टेंबर',
        milkType: 'BUFFALO',
        effectiveFrom: '2026-09-01',
        parameters: defaultBuffaloParams,
      },
      OWNER_WC_ID
    );

    expect(buffaloDraft.id).toBeGreaterThan(0);
    expect(buffaloDraft.status).toBe('DRAFT');
    expect(buffaloDraft.milkType).toBe('BUFFALO');

    const list = ratePlanService.listPlans(db, {}, OWNER_WC_ID);
    expect(list).toHaveLength(2);
  });

  it('3. Owner edits draft rate plan, but editing approved plan is blocked', () => {
    const draft = ratePlanService.createDraft(
      db,
      {
        planName: 'मसुदा दरपत्रक',
        milkType: 'COW',
        effectiveFrom: '2026-09-01',
        parameters: defaultCowParams,
      },
      OWNER_WC_ID
    );

    // Edit draft
    const updated = ratePlanService.updateDraft(
      db,
      draft.id,
      {
        planName: 'सुधारित मसुदा',
        milkType: 'COW',
        effectiveFrom: '2026-09-05',
        parameters: { ...defaultCowParams, fatRatePaisePerPoint: 860 },
      },
      OWNER_WC_ID
    );

    expect(updated.planName).toBe('सुधारित मसुदा');
    expect(updated.parameters.fatRatePaisePerPoint).toBe(860);

    // Approve plan
    const approved = ratePlanService.approvePlan(db, { planId: draft.id }, OWNER_WC_ID);
    expect(approved.status).toBe('APPROVED');

    // Attempting to edit approved plan must throw
    expect(() =>
      ratePlanService.updateDraft(
        db,
        draft.id,
        {
          planName: 'बेकायदेशीर बदल',
          milkType: 'COW',
          effectiveFrom: '2026-09-05',
          parameters: defaultCowParams,
        },
        OWNER_WC_ID
      )
    ).toThrow('Only DRAFT plans can be modified');
  });

  it('4. Rejects overlapping approved plans for the same milk type', () => {
    const cow1 = ratePlanService.createDraft(
      db,
      {
        planName: 'गाय दरपत्रक १',
        milkType: 'COW',
        effectiveFrom: '2026-09-01',
        parameters: defaultCowParams,
      },
      OWNER_WC_ID
    );
    ratePlanService.approvePlan(db, { planId: cow1.id }, OWNER_WC_ID);

    // Create cow2 overlapping with cow1 (cow1 is open-ended from 2026-09-01)
    const cow2 = ratePlanService.createDraft(
      db,
      {
        planName: 'गाय दरपत्रक २ (ओव्हरलॅप)',
        milkType: 'COW',
        effectiveFrom: '2026-09-15',
        parameters: defaultCowParams,
      },
      OWNER_WC_ID
    );

    // Direct approve must fail because of SQLite overlap trigger
    expect(() =>
      ratePlanService.approvePlan(db, { planId: cow2.id }, OWNER_WC_ID)
    ).toThrow(/Cannot approve rate plan|already exists|overlapping/i);
  });

  it('5. Clones plan and executes atomic supersede workflow', () => {
    // 1. Initial approved plan starting 2026-09-01 (open-ended)
    const cow1 = ratePlanService.createDraft(
      db,
      {
        planName: 'गाय दरपत्रक सप्टेंबर',
        milkType: 'COW',
        effectiveFrom: '2026-09-01',
        parameters: defaultCowParams,
      },
      OWNER_WC_ID
    );
    ratePlanService.approvePlan(db, { planId: cow1.id }, OWNER_WC_ID);

    // 2. Clone to new draft starting 2026-10-01 with updated FAT rate
    const cloned = ratePlanService.clonePlan(
      db,
      {
        sourcePlanId: cow1.id,
        newPlanName: 'गाय दरपत्रक ऑक्टोबर',
        newEffectiveFrom: '2026-10-01',
        parameters: { fatRatePaisePerPoint: 880 },
      },
      OWNER_WC_ID
    );

    expect(cloned.status).toBe('DRAFT');
    expect(cloned.parameters.fatRatePaisePerPoint).toBe(880);

    // 3. Atomically supersede cow1 with cloned plan
    const result = ratePlanService.supersedePlan(
      db,
      {
        oldPlanId: cow1.id,
        newPlanId: cloned.id,
        newEffectiveFrom: '2026-10-01',
      },
      OWNER_WC_ID
    );

    expect(result.oldPlan.effectiveTo).toBe('2026-09-30');
    expect(result.newPlan.status).toBe('APPROVED');
    expect(result.newPlan.effectiveFrom).toBe('2026-10-01');

    // 4. Test date resolutions
    // Date in September resolves old plan
    const sepResolve = ratePlanService.resolveApprovedRate(
      db,
      { milkType: 'COW', businessDate: '2026-09-15', fatX100: 400, snfX100: 850 },
      OPERATOR_WC_ID
    );
    expect(sepResolve.ratePlanId).toBe(cow1.id);
    expect(sepResolve.ratePaisePerLitre).toBe(5950); // 400*8.5 + 850*3 = 5950

    // Date in October resolves new plan
    const octResolve = ratePlanService.resolveApprovedRate(
      db,
      { milkType: 'COW', businessDate: '2026-10-05', fatX100: 400, snfX100: 850 },
      OPERATOR_WC_ID
    );
    expect(octResolve.ratePlanId).toBe(cloned.id);
    expect(octResolve.ratePaisePerLitre).toBe(6070); // 400*8.8 (3520) + 850*3 (2550) = 6070
  });

  it('6. Operator mutations are rejected while public rate resolution is permitted', () => {
    // Approve cow plan as Owner
    const cow = ratePlanService.createDraft(
      db,
      {
        planName: 'गाय दरपत्रक',
        milkType: 'COW',
        effectiveFrom: '2026-09-01',
        parameters: defaultCowParams,
      },
      OWNER_WC_ID
    );
    ratePlanService.approvePlan(db, { planId: cow.id }, OWNER_WC_ID);

    // Operator cannot create drafts
    expect(() =>
      ratePlanService.createDraft(
        db,
        {
          planName: 'Operator Draft',
          milkType: 'COW',
          effectiveFrom: '2026-10-01',
          parameters: defaultCowParams,
        },
        OPERATOR_WC_ID
      )
    ).toThrow(/Forbidden|requires role 'OWNER'/);

    // Operator cannot list owner rate plan administration view
    expect(() => ratePlanService.listPlans(db, {}, OPERATOR_WC_ID)).toThrow(/Forbidden|requires role 'OWNER'/);

    // Operator CAN resolve approved rate
    const resolved = ratePlanService.resolveApprovedRate(
      db,
      {
        milkType: 'COW',
        businessDate: '2026-09-05',
        fatX100: 400,
        snfX100: 850,
        quantityMl: 10000,
      },
      OPERATOR_WC_ID
    );

    expect(resolved.ratePaisePerLitre).toBe(5950);
    expect(resolved.amountPaise).toBe(59500);
  });

  it('7. Rate resolution throws bilingual error when no approved plan covers the date', () => {
    expect(() =>
      ratePlanService.resolveApprovedRate(
        db,
        {
          milkType: 'BUFFALO',
          businessDate: '2026-09-05',
          fatX100: 700,
          snfX100: 900,
        },
        OPERATOR_WC_ID
      )
    ).toThrow(/No approved rate plan exists for BUFFALO milk on date 2026-09-05/);
  });

  it('8. Cancels eligible plan with mandatory reason', () => {
    const draft = ratePlanService.createDraft(
      db,
      {
        planName: 'रद्द करायचे दरपत्रक',
        milkType: 'COW',
        effectiveFrom: '2026-09-01',
        parameters: defaultCowParams,
      },
      OWNER_WC_ID
    );

    // Cancellation without reason throws
    expect(() =>
      ratePlanService.cancelPlan(
        db,
        { planId: draft.id, reason: '' },
        OWNER_WC_ID
      )
    ).toThrow('cancellation reason is required');

    // Cancellation with reason succeeds
    const cancelled = ratePlanService.cancelPlan(
      db,
      { planId: draft.id, reason: 'चाचणी मसुदा रद्द केला' },
      OWNER_WC_ID
    );

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancellationReason).toBe('चाचणी मसुदा रद्द केला');
  });

  it('9. Logs atomic audit events for all rate plan operations including RATE_PLAN_UPDATED and RATE_PLAN_CLONED', () => {
    // 1. Create draft
    const cow = ratePlanService.createDraft(
      db,
      {
        planName: 'ऑडिट चाचणी दरपत्रक',
        milkType: 'COW',
        effectiveFrom: '2026-09-01',
        parameters: defaultCowParams,
      },
      OWNER_WC_ID
    );

    // 2. Update draft -> must log RATE_PLAN_UPDATED
    ratePlanService.updateDraft(
      db,
      cow.id,
      {
        planName: 'सुधारित ऑडिट दरपत्रक',
        milkType: 'COW',
        effectiveFrom: '2026-09-01',
        parameters: { ...defaultCowParams, fatRatePaisePerPoint: 860 },
      },
      OWNER_WC_ID
    );

    // 3. Clone plan -> must log RATE_PLAN_CLONED
    const cloned = ratePlanService.clonePlan(
      db,
      {
        sourcePlanId: cow.id,
        newPlanName: 'क्लोन केलेले दरपत्रक',
        newEffectiveFrom: '2026-10-01',
      },
      OWNER_WC_ID
    );

    // 4. Approve plan -> must log RATE_PLAN_APPROVED
    ratePlanService.approvePlan(db, { planId: cow.id }, OWNER_WC_ID);

    // 5. Cancel cloned draft -> must log RATE_PLAN_CANCELLED
    ratePlanService.cancelPlan(
      db,
      { planId: cloned.id, reason: 'चाचणी रद्द' },
      OWNER_WC_ID
    );

    const auditRows = db
      .prepare('SELECT action_type, entity_name, entity_id FROM audit_logs ORDER BY id ASC')
      .all() as { action_type: string; entity_name: string; entity_id: string }[];

    const actions = auditRows.map((r) => r.action_type);
    expect(actions).toContain('RATE_PLAN_CREATED');
    expect(actions).toContain('RATE_PLAN_UPDATED');
    expect(actions).toContain('RATE_PLAN_CLONED');
    expect(actions).toContain('RATE_PLAN_APPROVED');
    expect(actions).toContain('RATE_PLAN_CANCELLED');
  });

  it('10. DRAFT plan and CANCELLED plan never resolve during collection rate resolution', () => {
    // 1. Create a DRAFT plan
    const draft = ratePlanService.createDraft(
      db,
      {
        planName: 'गाय मसुदा',
        milkType: 'COW',
        effectiveFrom: '2026-09-01',
        parameters: defaultCowParams,
      },
      OWNER_WC_ID
    );

    // DRAFT must not resolve
    expect(() =>
      ratePlanService.resolveApprovedRate(
        db,
        { milkType: 'COW', businessDate: '2026-09-05', fatX100: 400, snfX100: 850 },
        OPERATOR_WC_ID
      )
    ).toThrow(/No approved rate plan exists/);

    // 2. Cancel the plan
    ratePlanService.cancelPlan(db, { planId: draft.id, reason: 'Cancelled before test' }, OWNER_WC_ID);

    // CANCELLED must not resolve
    expect(() =>
      ratePlanService.resolveApprovedRate(
        db,
        { milkType: 'COW', businessDate: '2026-09-05', fatX100: 400, snfX100: 850 },
        OPERATOR_WC_ID
      )
    ).toThrow(/No approved rate plan exists/);
  });

  it('11. Cow and Buffalo rate plans remain strictly independent', () => {
    // Approve Cow only
    const cow = ratePlanService.createDraft(
      db,
      { planName: 'गाय दर', milkType: 'COW', effectiveFrom: '2026-09-01', parameters: defaultCowParams },
      OWNER_WC_ID
    );
    ratePlanService.approvePlan(db, { planId: cow.id }, OWNER_WC_ID);

    // Cow resolves
    const cowRes = ratePlanService.resolveApprovedRate(
      db,
      { milkType: 'COW', businessDate: '2026-09-05', fatX100: 400, snfX100: 850 },
      OPERATOR_WC_ID
    );
    expect(cowRes.milkType).toBe('COW');

    // Buffalo fails to resolve
    expect(() =>
      ratePlanService.resolveApprovedRate(
        db,
        { milkType: 'BUFFALO', businessDate: '2026-09-05', fatX100: 700, snfX100: 900 },
        OPERATOR_WC_ID
      )
    ).toThrow(/No approved rate plan exists for BUFFALO/);
  });

  it('12. Rejects quality values outside configured bounds and misaligned steps with zero interpolation', () => {
    const cow = ratePlanService.createDraft(
      db,
      { planName: 'गाय दर', milkType: 'COW', effectiveFrom: '2026-09-01', parameters: defaultCowParams },
      OWNER_WC_ID
    );
    ratePlanService.approvePlan(db, { planId: cow.id }, OWNER_WC_ID);

    // Out of bounds: FAT 2.50% (min 3.00%)
    expect(() =>
      ratePlanService.resolveApprovedRate(
        db,
        { milkType: 'COW', businessDate: '2026-09-05', fatX100: 250, snfX100: 850 },
        OPERATOR_WC_ID
      )
    ).toThrow(/is outside configured plan range/i);

    // Out of bounds: SNF 10.00% (max 9.50%)
    expect(() =>
      ratePlanService.resolveApprovedRate(
        db,
        { milkType: 'COW', businessDate: '2026-09-05', fatX100: 400, snfX100: 1000 },
        OPERATOR_WC_ID
      )
    ).toThrow(/is outside configured plan range/i);

    // Step mismatch: FAT 4.05% (step is 0.10% / 10 x100)
    expect(() =>
      ratePlanService.resolveApprovedRate(
        db,
        { milkType: 'COW', businessDate: '2026-09-05', fatX100: 405, snfX100: 850 },
        OPERATOR_WC_ID
      )
    ).toThrow(/does not match.*step/i);
  });

  it('13. Mutation rolls back atomically on create, update, and clone if audit log insertion fails', () => {
    // A. createDraft rollback
    let auditSpy = vi
      .spyOn(auditService, 'logEvent')
      .mockImplementationOnce(() => {
        throw new Error('Disk error during create audit write');
      });

    try {
      expect(() =>
        ratePlanService.createDraft(
          db,
          {
            planName: 'Rollback Test Draft',
            milkType: 'COW',
            effectiveFrom: '2026-09-01',
            parameters: defaultCowParams,
          },
          OWNER_WC_ID
        )
      ).toThrow('Disk error during create audit write');

      // Verify no rate plan was inserted in database
      const row = db
        .prepare("SELECT * FROM rate_plans WHERE plan_name = 'Rollback Test Draft'")
        .get();
      expect(row).toBeUndefined();
    } finally {
      auditSpy.mockRestore();
    }

    // B. updateDraft rollback
    const validDraft = ratePlanService.createDraft(
      db,
      {
        planName: 'मूळ मसुदा',
        milkType: 'COW',
        effectiveFrom: '2026-09-01',
        parameters: defaultCowParams,
      },
      OWNER_WC_ID
    );

    auditSpy = vi
      .spyOn(auditService, 'logEvent')
      .mockImplementationOnce(() => {
        throw new Error('Disk error during update audit write');
      });

    try {
      expect(() =>
        ratePlanService.updateDraft(
          db,
          validDraft.id,
          {
            planName: 'बदललेला मसुदा जो रोलबॅक व्हावा',
            milkType: 'COW',
            effectiveFrom: '2026-09-01',
            parameters: { ...defaultCowParams, fatRatePaisePerPoint: 999 },
          },
          OWNER_WC_ID
        )
      ).toThrow('Disk error during update audit write');

      // Verify draft in database retains original name and fat rate
      const rowAfterFailedUpdate = ratePlanService.getPlanById(db, validDraft.id, OWNER_WC_ID);
      expect(rowAfterFailedUpdate.planName).toBe('मूळ मसुदा');
      expect(rowAfterFailedUpdate.parameters.fatRatePaisePerPoint).toBe(defaultCowParams.fatRatePaisePerPoint);
    } finally {
      auditSpy.mockRestore();
    }

    // C. clonePlan rollback
    auditSpy = vi
      .spyOn(auditService, 'logEvent')
      .mockImplementationOnce(() => {
        throw new Error('Disk error during clone audit write');
      });

    try {
      expect(() =>
        ratePlanService.clonePlan(
          db,
          {
            sourcePlanId: validDraft.id,
            newPlanName: 'क्लोन मसुदा जो रोलबॅक व्हावा',
            newEffectiveFrom: '2026-10-01',
          },
          OWNER_WC_ID
        )
      ).toThrow('Disk error during clone audit write');

      // Verify no cloned plan was inserted
      const clonedRow = db
        .prepare("SELECT * FROM rate_plans WHERE plan_name = 'क्लोन मसुदा जो रोलबॅक व्हावा'")
        .get();
      expect(clonedRow).toBeUndefined();
    } finally {
      auditSpy.mockRestore();
    }
  });

  it('14. Asia/Kolkata business date logic correctly resolves boundary dates', () => {
    const cow = ratePlanService.createDraft(
      db,
      {
        planName: 'सप्टेंबर दर',
        milkType: 'COW',
        effectiveFrom: '2026-09-01',
        effectiveTo: '2026-09-30',
        parameters: defaultCowParams,
      },
      OWNER_WC_ID
    );
    ratePlanService.approvePlan(db, { planId: cow.id }, OWNER_WC_ID);

    // Boundary check: 2026-09-01 (first day)
    const firstDay = ratePlanService.resolveApprovedRate(
      db,
      { milkType: 'COW', businessDate: '2026-09-01', fatX100: 400, snfX100: 850 },
      OPERATOR_WC_ID
    );
    expect(firstDay.ratePlanId).toBe(cow.id);

    // Boundary check: 2026-09-30 (last day)
    const lastDay = ratePlanService.resolveApprovedRate(
      db,
      { milkType: 'COW', businessDate: '2026-09-30', fatX100: 400, snfX100: 850 },
      OPERATOR_WC_ID
    );
    expect(lastDay.ratePlanId).toBe(cow.id);

    // Outside boundary: 2026-10-01
    expect(() =>
      ratePlanService.resolveApprovedRate(
        db,
        { milkType: 'COW', businessDate: '2026-10-01', fatX100: 400, snfX100: 850 },
        OPERATOR_WC_ID
      )
    ).toThrow(/No approved rate plan exists/);
  });
});
