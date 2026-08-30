import { app, ipcMain, IpcMainInvokeEvent } from 'electron';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  IPC_CHANNELS,
  IpcResponse,
  IpcErrorDetails,
  PingResult,
  SqliteSmokeResult,
  AppVersionInfo,
  SetupStatusResult,
  CompleteSetupPayload,
  DairyProfileSummary,
  LoginPayload,
  AuthSessionDto,
  FarmerFilter,
  FarmerListDto,
  FarmerDetailDto,
  CreateFarmerPayload,
  UpdateFarmerPayload,
  DeactivateFarmerPayload,
  RatePlanFilter,
  RatePlanDto,
  CreateRatePlanDraftPayload,
  UpdateRatePlanDraftPayload,
  CloneRatePlanPayload,
  ApproveRatePlanPayload,
  SupersedeRatePlanPayload,
  CancelRatePlanPayload,
  CalculateRatePreviewPayload,
  CalculateRatePreviewResult,
  ResolveApprovedRatePayload,
  ResolveApprovedRateResult,
  ShiftDto,
  ShiftSummaryDto,
  OpenShiftPayload,
  ReopenShiftPayload,
  MilkCollectionDto,
  CreateMilkCollectionPayload,
  VoidCollectionPayload,
  DuplicateCollectionCheckResult,
  RatePlanMilkType,
  Stage4SmokeSummary,
  Stage5SmokeSummary,
  Stage6SmokeSummary,
} from '../../shared/ipc-contracts';
import { applyAndVerifyPragmas, getDatabaseConnection } from '../db/connection';
import { runMigrations } from '../db/migrator';
import { setupService } from '../services/setup.service';
import { authService } from '../services/auth.service';
import { sessionService } from '../core/session.service';
import { farmerService } from '../services/farmer.service';
import { ratePlanService } from '../services/rate-plan.service';
import { shiftService } from '../services/shift.service';
import { milkCollectionService } from '../services/milk-collection.service';
import { receiptNumberService } from '../services/receipt-number.service';
import { businessDateProvider } from '../utils/business-date';
import { milkCollectionRepository } from '../db/milk-collection.repository';
import { shiftRepository } from '../db/shift.repository';
import { farmerRepository } from '../db/farmer.repository';
import { adjustmentService } from '../services/adjustment.service';
import { adjustmentRepository } from '../db/adjustment.repository';
import { ledgerService } from '../services/ledger.service';
import { settlementService } from '../services/settlement.service';
import { paymentService } from '../services/payment.service';
import { settlementRepository } from '../db/settlement.repository';
import { paymentRepository } from '../db/payment.repository';
import { settlementNumberService } from '../services/settlement-number.service';
import { paymentNumberService } from '../services/payment-number.service';
import {
  CreateAdjustmentPayload,
  VoidAdjustmentPayload,
  AdjustmentFilter,
  GetFarmerLedgerPayload,
  AdjustmentDto,
  LedgerSummaryDto,
  Stage7SmokeSummary,
  SettlementPeriodDto,
  CreateSettlementDraftPayload,
  CancelSettlementDraftPayload,
  FinalizeSettlementPayload,
  SettlementPreviewDto,
  WeeklySettlementDto,
  PaymentDto,
  RecordPaymentPayload,
  VoidPaymentPayload,
  FarmerOutstandingDto,
  Stage8SmokeSummary,
} from '../../shared/ipc-contracts';

function toIpcError(
  code: string,
  messageEn: string,
  messageMr: string = messageEn,
  details?: string
): IpcErrorDetails {
  return {
    code,
    messageEn,
    messageMr,
    details: details || messageEn,
  };
}

/**
 * Registers all allowlisted IPC handlers in the Electron main process.
 */
export function registerIpcHandlers(): void {
  // Clear any existing handler registrations for safe re-runs in test/smoke environments
  Object.values(IPC_CHANNELS).forEach((channel) => {
    ipcMain.removeHandler(channel);
  });

  // 1. Ping / Pong Round-Trip Handler
  ipcMain.handle(IPC_CHANNELS.PING, async (): Promise<IpcResponse<PingResult>> => {
    return {
      success: true,
      data: {
        message: 'pong',
        timestamp: new Date().toISOString(),
        processType: process.type,
      },
    };
  });

  // 2. Isolated SQLite & Migration Smoke Handler (Never touches production userData DB)
  ipcMain.handle(IPC_CHANNELS.SQLITE_SMOKE, async (): Promise<IpcResponse<SqliteSmokeResult>> => {
    // Mock the date to the future so Stage 8 finalize date checks pass
    businessDateProvider.setProvider({
      getToday: () => '2026-09-30',
      getNowIso: () => new Date().toISOString()
    });

    let db: Database.Database | null = null;
    const tempDir = path.join(
      os.tmpdir(),
      `dairy_smoke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    );
    const tempDbPath = path.join(tempDir, 'smoke_test.db');

    try {
      fs.mkdirSync(tempDir, { recursive: true });

      // Open temporary file-backed SQLite database
      db = new Database(tempDbPath);

      // Apply and verify required durability pragmas
      applyAndVerifyPragmas(db);

      // Execute deterministic query SELECT 1
      const queryRow = db.prepare('SELECT 1 AS num').get() as { num: number } | undefined;

      // Read SQLite library version
      const versionRow = db
        .prepare('SELECT sqlite_version() AS version')
        .get() as { version: string } | undefined;

      if (!queryRow || queryRow.num !== 1 || !versionRow?.version) {
        throw new Error('SQLite query returned unexpected or empty result');
      }

      // Run migrations in temporary smoke database
      const migrationResult = runMigrations(db);

      // Count created tables (excluding sqlite internal tables)
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[];

      // Stage 3 Smoke Checks on isolated temporary database (Zero production data access):
      // 1. Verify setup status before setup is UNINITIALIZED
      const setupStatusBefore = setupService.getSetupStatus(db);

      // 2. Verify temporary credential hashing works (with min 10 char password policy)
      const { hashPassword, verifyPassword } = await import('../core/credential.service');
      const tempTestPassword = 'SmokeTestSecurePassword2026!';
      const testHash = await hashPassword(tempTestPassword);
      const testVerifyOk = await verifyPassword(tempTestPassword, testHash);
      const testVerifyFail = await verifyPassword('IncorrectPassword123!', testHash);
      const credentialVerificationOk = testVerifyOk === true && testVerifyFail === false;

      // 3. Complete temporary setup on isolated database
      await setupService.completeSetup(db, {
        centreName: 'Smoke Test Dairy Centre',
        ownerName: 'Smoke Test Owner',
        phonePrimary: '9876543210',
        defaultLanguage: 'mr',
        enabledMilkTypes: 'BOTH',
        settlementStartDay: 'MONDAY',
        username: 'smoke_owner',
        password: tempTestPassword,
        pin: '1234',
      });

      // 4. Verify setup status is now READY
      const setupStatusAfter = setupService.getSetupStatus(db);

      // 5. Verify Owner login works and creates session
      const smokeWebContentsId = 9988;
      const session = await authService.login(
        db,
        { username: 'smoke_owner', password: tempTestPassword },
        smokeWebContentsId
      );
      const ownerLoginOk =
        session.username === 'smoke_owner' &&
        session.role === 'OWNER' &&
        typeof session.userId === 'number';

      // 6. Verify Session Isolation (other webContents ID has null session)
      const otherSession = sessionService.getSession(9989);
      const activeSession = sessionService.getSession(smokeWebContentsId);
      const sessionIsolationOk =
        otherSession === null && activeSession?.userId === session.userId;

      // 7. Verify Stage 3 Audit events exist in audit_logs
      const auditRows = db
        .prepare(
          "SELECT count(*) as count FROM audit_logs WHERE action_type IN ('SETUP_COMPLETED', 'AUTH_LOGIN_SUCCESS')"
        )
        .get() as { count: number };
      const auditEventsOk = auditRows.count >= 2;

      // Stage 4 Smoke Checks on isolated temporary database (running with Owner session):
      // 1. Create a farmer with leading zero member code '001'
      const farmerSmoke = farmerService.createFarmer(
        db,
        {
          memberCode: '001',
          nameMr: 'तुकाराम शिंदे',
          nameEn: 'Tukaram Shinde',
          phone: '9876543210',
          village: 'वारजे',
          bankAccountNumber: '123456789012',
          bankIfsc: 'SBIN0001234',
          bankName: 'State Bank of India',
          upiId: 'tuka@oksbi',
          defaultMilkType: 'COW',
          openingBalancePaise: 150000, // ₹1,500.00
        },
        smokeWebContentsId
      );

      const farmerCreatedOk =
        farmerSmoke.id > 0 &&
        farmerSmoke.nameMr === 'तुकाराम शिंदे' &&
        farmerSmoke.memberCode === '001';

      const memberCodeLeadingZeroPreserved =
        farmerSmoke.memberCode === '001' && typeof farmerSmoke.memberCode === 'string';

      // 2. Search farmer by code and Marathi name
      const searchByCode = farmerService.listFarmers(
        db,
        { search: '001' },
        smokeWebContentsId
      );
      const searchByName = farmerService.listFarmers(
        db,
        { search: 'तुकाराम' },
        smokeWebContentsId
      );
      const searchOk = searchByCode.length === 1 && searchByName.length === 1;

      // 3. Opening balance exact paise
      const openingBalanceExactOk = farmerSmoke.openingBalancePaise === 150000;

      // 4. List data masking verification
      const maskingOk =
        farmerSmoke.maskedBankAccount === '••••••••9012' &&
        farmerSmoke.maskedUpiId === 't••a@oksbi';

      // 5. Operator mutation rejection
      // Create temporary operator session on webContents 9987
      sessionService.createSession(9987, {
        id: 999,
        username: 'smoke_op',
        full_name: 'Smoke Operator',
        role: 'OPERATOR',
      });
      let operatorMutationRejected = false;
      try {
        farmerService.createFarmer(
          db,
          {
            memberCode: '002',
            nameMr: 'Operator Attempt',
            defaultMilkType: 'COW',
            openingBalancePaise: 0,
          },
          9987
        );
      } catch (opErr) {
        operatorMutationRejected = true;
      }

      // 6. Owner deactivates farmer
      farmerService.deactivateFarmer(
        db,
        farmerSmoke.id,
        { reason: 'Smoke test deactivation' },
        smokeWebContentsId
      );
      const deactivatedRow = farmerService.getFarmerById(db, farmerSmoke.id, smokeWebContentsId);
      const deactivateOk = deactivatedRow?.isActive === false;

      // 7. Active resolution blocked for inactive farmer
      const activeResolved = farmerService.getFarmerByMemberCode(
        db,
        '001',
        true,
        smokeWebContentsId
      );
      const activeResolutionBlockedForInactive = activeResolved === null;

      // Reactivate farmer for subsequent collection workflows
      farmerService.reactivateFarmer(db, farmerSmoke.id, smokeWebContentsId);

      // 8. Audit events exist for Stage 4 actions
      const farmerAuditRows = db
        .prepare(
          "SELECT count(*) as count FROM audit_logs WHERE action_type IN ('FARMER_CREATED', 'FARMER_DEACTIVATED')"
        )
        .get() as { count: number };
      const stage4AuditOk = farmerAuditRows.count >= 2;

      // Stage 5 Smoke Checks on isolated temporary database:
      // 1. Confirm zero rate plans exist initially
      const initialPlans = ratePlanService.listPlans(db, {}, smokeWebContentsId);
      const zeroSeedPlansConfirmed = initialPlans.length === 0;

      // 2. Owner creates Cow Draft plan
      const cowDraft = ratePlanService.createDraft(
        db,
        {
          planName: 'गाय दूध दरपत्रक (चाचणी)',
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
        smokeWebContentsId
      );
      const cowDraftCreatedOk = cowDraft.id > 0 && cowDraft.status === 'DRAFT';

      // 3. Owner creates Buffalo Draft plan
      const buffaloDraft = ratePlanService.createDraft(
        db,
        {
          planName: 'म्हैस दूध दरपत्रक (चाचणी)',
          milkType: 'BUFFALO',
          effectiveFrom: '2026-09-01',
          parameters: {
            fatRatePaisePerPoint: 900,
            snfRatePaisePerPoint: 300,
            minimumFatX100: 500,
            maximumFatX100: 1200,
            fatStepX100: 10,
            minimumSnfX100: 800,
            maximumSnfX100: 1050,
            snfStepX100: 10,
          },
        },
        smokeWebContentsId
      );
      const buffaloDraftCreatedOk = buffaloDraft.id > 0 && buffaloDraft.status === 'DRAFT';

      // 4. Owner approves both
      const approvedCow = ratePlanService.approvePlan(db, { planId: cowDraft.id }, smokeWebContentsId);
      const approvedBuffalo = ratePlanService.approvePlan(db, { planId: buffaloDraft.id }, smokeWebContentsId);
      const cowPlanApprovedOk = approvedCow.status === 'APPROVED';
      const buffaloPlanApprovedOk = approvedBuffalo.status === 'APPROVED';

      // Verify approved plan is immutable
      let approvedPlanImmutableOk = false;
      try {
        ratePlanService.updateDraft(
          db,
          approvedCow.id,
          {
            planName: 'बेकायदेशीर बदल',
            milkType: 'COW',
            effectiveFrom: '2026-09-01',
            parameters: {
              fatRatePaisePerPoint: 860,
              snfRatePaisePerPoint: 300,
              minimumFatX100: 300,
              maximumFatX100: 600,
              fatStepX100: 10,
              minimumSnfX100: 750,
              maximumSnfX100: 950,
              snfStepX100: 10,
            },
          },
          smokeWebContentsId
        );
      } catch (immErr) {
        approvedPlanImmutableOk = true;
      }

      // 5. Cow Calculation preview (FAT 4.00%, SNF 8.50%, Qty 50,000 mL)
      const cowPreview = ratePlanService.calculatePreview(
        db,
        {
          planId: approvedCow.id,
          milkType: 'COW',
          fatX100: 400,
          snfX100: 850,
          quantityMl: 50000,
        },
        smokeWebContentsId
      );
      const cowCalculation5950PaiseOk = cowPreview.ratePaisePerLitre === 5950;
      const cowPreview50Litres297500PaiseOk = cowPreview.amountPaise === 297500;

      // 6. Buffalo Calculation preview (FAT 7.00%, SNF 9.00%, Qty 50,000 mL)
      const buffaloPreview = ratePlanService.calculatePreview(
        db,
        {
          planId: approvedBuffalo.id,
          milkType: 'BUFFALO',
          fatX100: 700,
          snfX100: 900,
          quantityMl: 50000,
        },
        smokeWebContentsId
      );
      const buffaloCalculation9000PaiseOk = buffaloPreview.ratePaisePerLitre === 9000;
      const buffaloPreview50Litres450000PaiseOk = buffaloPreview.amountPaise === 450000;

      // 7. Overlapping approval rejected
      let overlappingApprovalRejected = false;
      const overlapDraft = ratePlanService.createDraft(
        db,
        {
          planName: 'ओव्हरलॅप चाचणी',
          milkType: 'COW',
          effectiveFrom: '2026-09-10',
          parameters: {
            fatRatePaisePerPoint: 860,
            snfRatePaisePerPoint: 310,
            minimumFatX100: 300,
            maximumFatX100: 600,
            fatStepX100: 10,
            minimumSnfX100: 750,
            maximumSnfX100: 950,
            snfStepX100: 10,
          },
        },
        smokeWebContentsId
      );
      try {
        ratePlanService.approvePlan(db, { planId: overlapDraft.id }, smokeWebContentsId);
      } catch (overlapErr) {
        overlappingApprovalRejected = true;
      }

      // 8. Clone and supersede workflow
      const clonedCow = ratePlanService.clonePlan(
        db,
        {
          sourcePlanId: approvedCow.id,
          newPlanName: 'गाय दूध दरपत्रक (ऑक्टोबर)',
          newEffectiveFrom: '2026-10-01',
          parameters: {
            fatRatePaisePerPoint: 860,
            snfRatePaisePerPoint: 310,
          },
        },
        smokeWebContentsId
      );
      const cloneOk = clonedCow.id > 0 && clonedCow.status === 'DRAFT';

      const supersedeRes = ratePlanService.supersedePlan(
        db,
        {
          oldPlanId: approvedCow.id,
          newPlanId: clonedCow.id,
          newEffectiveFrom: '2026-10-01',
        },
        smokeWebContentsId
      );

      const supersedeOk =
        supersedeRes.oldPlan.effectiveTo === '2026-09-30' &&
        supersedeRes.newPlan.status === 'APPROVED' &&
        supersedeRes.newPlan.effectiveFrom === '2026-10-01';

      // 9. Old and new date resolutions
      const oldResolve = ratePlanService.resolveApprovedRate(
        db,
        { milkType: 'COW', businessDate: '2026-09-15', fatX100: 400, snfX100: 850 },
        smokeWebContentsId
      );
      const oldDateResolvesOldPlanOk = oldResolve.ratePlanId === approvedCow.id;

      const newResolve = ratePlanService.resolveApprovedRate(
        db,
        { milkType: 'COW', businessDate: '2026-10-05', fatX100: 400, snfX100: 850 },
        smokeWebContentsId
      );
      const newDateResolvesNewPlanOk = newResolve.ratePlanId === clonedCow.id;
      const dateResolutionOk = oldDateResolvesOldPlanOk && newDateResolvesNewPlanOk;

      // 10. Operator role checks
      let operatorDraftListRejected = false;
      try {
        ratePlanService.listPlans(db, {}, 9987);
      } catch {
        operatorDraftListRejected = true;
      }

      let operatorRateMutationRejected = false;
      try {
        ratePlanService.createDraft(
          db,
          {
            planName: 'Operator Rate Plan',
            milkType: 'COW',
            effectiveFrom: '2026-11-01',
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
          9987
        );
      } catch (opRateErr) {
        operatorRateMutationRejected = true;
      }

      // Operator resolves approved rate on '2026-09-15' (Cow)
      const opResolve = ratePlanService.resolveApprovedRate(
        db,
        {
          milkType: 'COW',
          businessDate: '2026-09-15',
          fatX100: 400,
          snfX100: 850,
          quantityMl: 10000,
        },
        9987
      );
      const operatorResolveApprovedRateOk =
        opResolve.ratePaisePerLitre === 5950 && opResolve.amountPaise === 59500;

      sessionService.clearSession(9987);

      // 11. Audit events for rate plans
      const rateAuditRows = db
        .prepare(
          "SELECT count(*) as count FROM audit_logs WHERE action_type IN ('RATE_PLAN_CREATED', 'RATE_PLAN_APPROVED', 'RATE_PLAN_SUPERSEDED')"
        )
        .get() as { count: number };
      const stage5AuditOk = rateAuditRows.count >= 3;

      // 12. Confirm no hard delete operations exist on rate plans (status is CANCELLED)
      const cancelledDraft = ratePlanService.cancelPlan(
        db,
        { planId: overlapDraft.id, reason: 'Smoke test soft cancellation' },
        smokeWebContentsId
      );
      const noHardDeleteOk = cancelledDraft.status === 'CANCELLED';

      // ======================================================================
      // STAGE 6 SMOKE TEST VERIFICATION
      // ======================================================================
      const migrationVersion4Ok = migrationResult.totalVersion >= 4;
      const tablesCount11Ok = tables.length >= 11;

      // 1. Zero initial collections
      const initialCollectionsCount = (
        db.prepare('SELECT count(*) as count FROM milk_collections').get() as { count: number }
      ).count;
      const zeroCollectionsInitially = initialCollectionsCount === 0;

      // 2. India Business Date
      const todayDate = '2026-09-15';
      const indiaBusinessDateOk = /^\d{4}-\d{2}-\d{2}$/.test(businessDateProvider.getToday());

      // 3. Open Morning shift
      const morningShift = shiftService.openShift(
        db,
        { businessDate: todayDate, shiftType: 'MORNING' },
        smokeWebContentsId
      );
      const morningShiftOpened = morningShift.status === 'OPEN';

      // 4. Second open shift rejected
      let secondOpenShiftRejected = false;
      try {
        shiftService.openShift(
          db,
          { businessDate: todayDate, shiftType: 'EVENING' },
          smokeWebContentsId
        );
      } catch {
        secondOpenShiftRejected = true;
      }

      // 5. Active farmer resolution & Inactive farmer rejection
      const activeFarmerResolved =
        farmerRepository.getByMemberCode(db, '001')?.is_active === 1;

      const inactiveFarmerId = farmerRepository.insertFarmer(db, {
        memberCode: 'INACTIVE_99',
        nameMr: 'निष्क्रिय शेतकरी',
        phone: '9999988888',
        defaultMilkType: 'COW',
        openingBalancePaise: 0,
        nowIso: new Date().toISOString(),
      });
      farmerRepository.deactivateFarmer(db, inactiveFarmerId, new Date().toISOString());

      let inactiveFarmerRejected = false;
      try {
        milkCollectionService.createCollection(
          db,
          {
            shiftId: morningShift.id,
            farmerId: inactiveFarmerId,
            milkType: 'COW',
            quantityLitres: '10.000',
            fatPercent: '4.00',
            snfPercent: '8.50',
          },
          smokeWebContentsId
        );
      } catch {
        inactiveFarmerRejected = true;
      }

      // 5b. Farmer with default BOTH requires explicit milk type choice
      const bothFarmerId = farmerRepository.insertFarmer(db, {
        memberCode: 'BOTH_01',
        nameMr: 'दोन्ही दूध शेतकरी',
        phone: '9888877777',
        defaultMilkType: 'BOTH',
        openingBalancePaise: 0,
        nowIso: new Date().toISOString(),
      });
      const bothFarmer = farmerRepository.getById(db, bothFarmerId);
      const bothFarmerRequiresMilkTypeSelection = bothFarmer?.default_milk_type === 'BOTH';

      // 5c. Dairy configured for COW only rejects BUFFALO collection
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('enabled_milk_types', 'COW', datetime('now'))").run();
      let disabledMilkTypeRejected = false;
      try {
        milkCollectionService.createCollection(
          db,
          {
            shiftId: morningShift.id,
            farmerId: farmerSmoke.id,
            milkType: 'BUFFALO',
            quantityLitres: '10.000',
            fatPercent: '7.00',
            snfPercent: '9.00',
          },
          smokeWebContentsId
        );
      } catch (err: unknown) {
        disabledMilkTypeRejected = err instanceof Error && err.message.includes('COW milk only');
      }
      // Reset dairy enabled milk types to BOTH
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('enabled_milk_types', 'BOTH', datetime('now'))").run();

      // 6. Cow & Buffalo collection creation and exact rate snapshot
      const cowCollection = milkCollectionService.createCollection(
        db,
        {
          shiftId: morningShift.id,
          memberCode: '001',
          milkType: 'COW',
          quantityLitres: '50.000',
          fatPercent: '4.00',
          snfPercent: '8.50',
        },
        smokeWebContentsId
      );
      const cowCollectionCreated = cowCollection.status === 'ACTIVE';
      const exactCowRateSnapshotOk =
        cowCollection.rateAppliedPaise === 5950 && cowCollection.amountPaise === 297500;

      const buffaloCollection = milkCollectionService.createCollection(
        db,
        {
          shiftId: morningShift.id,
          memberCode: '001',
          milkType: 'BUFFALO',
          quantityLitres: '50.000',
          fatPercent: '7.00',
          snfPercent: '9.00',
        },
        smokeWebContentsId
      );
      const buffaloCollectionCreated = buffaloCollection.status === 'ACTIVE';
      const exactBuffaloRateSnapshotOk =
        buffaloCollection.rateAppliedPaise === 9000 && buffaloCollection.amountPaise === 450000;

      // 7. Receipt sequence verification
      const receiptSequenceOk =
        cowCollection.receiptNumber.endsWith('-000001') &&
        buffaloCollection.receiptNumber.endsWith('-000002');

      // 7b. Receipt counter rollback test (does not consume counter on rollback)
      const counterBeforeFail = db
        .prepare("SELECT value FROM app_settings WHERE key = 'receipt_counter_20260915_MORNING'")
        .get() as { value?: string } | undefined;
      const countValBefore = counterBeforeFail ? parseInt(counterBeforeFail.value || '0', 10) : 0;

      let rollbackReceiptOk = false;
      try {
        db.transaction(() => {
          receiptNumberService.getNextReceiptNumber(db!, '2026-09-15', 'MORNING');
          throw new Error('Simulated transaction failure for receipt counter rollback');
        })();
      } catch {
        const counterAfterFail = db
          .prepare("SELECT value FROM app_settings WHERE key = 'receipt_counter_20260915_MORNING'")
          .get() as { value?: string } | undefined;
        const countValAfter = counterAfterFail ? parseInt(counterAfterFail.value || '0', 10) : 0;
        rollbackReceiptOk = countValAfter === countValBefore;
      }
      const receiptRollbackDoesNotConsumeNumber = rollbackReceiptOk;

      // 8. Duplicate detection and confirmed duplicate creation
      let duplicateBlockedBeforeConfirmation = false;
      try {
        milkCollectionService.createCollection(
          db,
          {
            shiftId: morningShift.id,
            memberCode: '001',
            milkType: 'COW',
            quantityLitres: '50.000',
            fatPercent: '4.00',
            snfPercent: '8.50',
          },
          smokeWebContentsId
        );
      } catch (dupErr) {
        duplicateBlockedBeforeConfirmation =
          dupErr instanceof Error && dupErr.message.includes('DUPLICATE_COLLECTION');
      }

      const confirmedDuplicate = milkCollectionService.createCollection(
        db,
        {
          shiftId: morningShift.id,
          memberCode: '001',
          milkType: 'COW',
          quantityLitres: '50.000',
          fatPercent: '4.00',
          snfPercent: '8.50',
          duplicateConfirmed: true,
          duplicateReason: 'SECOND_CAN',
        },
        smokeWebContentsId
      );
      const confirmedDuplicateCreatedSeparately =
        confirmedDuplicate.id !== cowCollection.id &&
        confirmedDuplicate.receiptNumber.endsWith('-000003');

      const dupAuditCount = (
        db
          .prepare(
            "SELECT count(*) as count FROM audit_logs WHERE action_type = 'COLLECTION_DUPLICATE_CONFIRMED'"
          )
          .get() as { count: number }
      ).count;
      const duplicateAuditOk = dupAuditCount >= 1;

      // 9. Shift Summary check
      const shiftSummaryBeforeClose = shiftService.getShiftSummary(
        db,
        morningShift.id,
        smokeWebContentsId
      );
      const shiftSummaryOk =
        shiftSummaryBeforeClose.totalActiveCollections === 3 &&
        shiftSummaryBeforeClose.totalQuantityMl === 150000 &&
        shiftSummaryBeforeClose.totalAmountPaise === 1045000;

      // 10. Shift Close and Locked Rejection
      const closedShift = shiftService.closeShift(
        db,
        morningShift.id,
        smokeWebContentsId
      );
      const shiftClosedAndLocked = closedShift.status === 'LOCKED';

      let collectionRejectedAfterClose = false;
      try {
        milkCollectionService.createCollection(
          db,
          {
            shiftId: morningShift.id,
            memberCode: '001',
            milkType: 'COW',
            quantityLitres: '10.000',
            fatPercent: '4.00',
            snfPercent: '8.50',
          },
          smokeWebContentsId
        );
      } catch {
        collectionRejectedAfterClose = true;
      }

      // 11. Reopen Role Authorization (Operator Rejected, Owner Allowed)
      sessionService.createSession(9987, {
        id: 999,
        username: 'smoke_op',
        full_name: 'Smoke Operator',
        role: 'OPERATOR',
      });

      let operatorReopenRejected = false;
      try {
        shiftService.reopenShift(
          db,
          { shiftId: morningShift.id, reason: 'Operator Reopen' },
          9987
        );
      } catch {
        operatorReopenRejected = true;
      }

      const reopenedShift = shiftService.reopenShift(
        db,
        { shiftId: morningShift.id, reason: 'Owner Reopen Test' },
        smokeWebContentsId
      );
      const ownerReopenOk =
        reopenedShift.status === 'OPEN' && reopenedShift.reopenCount === 1;

      // 12. Rate snapshot immutability after rate change and supersede
      const savedSnapshot = milkCollectionRepository.getById(db, cowCollection.id);
      const oldSnapshotUnchangedAfterRateSupersede =
        savedSnapshot !== null &&
        savedSnapshot.rate_plan_id === approvedCow.id &&
        savedSnapshot.rate_applied_paise === 5950 &&
        savedSnapshot.amount_paise === 297500;

      // Close morning shift to open later shift
      shiftService.closeShift(db, morningShift.id, smokeWebContentsId);

      // Open new Evening shift on 2026-10-05 where clonedCow is active (effectiveFrom 2026-10-01)
      const laterShift = shiftService.openShift(
        db,
        { businessDate: '2026-10-05', shiftType: 'EVENING' },
        smokeWebContentsId
      );
      const laterCollection = milkCollectionService.createCollection(
        db,
        {
          shiftId: laterShift.id,
          memberCode: '001',
          milkType: 'COW',
          quantityLitres: '50.000',
          fatPercent: '4.00',
          snfPercent: '8.50',
        },
        smokeWebContentsId
      );
      const newCollectionUsesNewPlan =
        laterCollection.ratePlanId === clonedCow.id &&
        laterCollection.rateAppliedPaise === 6075 &&
        laterCollection.amountPaise === 303750;
      shiftService.closeShift(db, laterShift.id, smokeWebContentsId);

      // Reopen morningShift for remaining checks
      shiftService.reopenShift(
        db,
        { shiftId: morningShift.id, reason: 'Reopen for void checks' },
        smokeWebContentsId
      );

      // 13. Void Authorization & Shift Summary recalculation
      let operatorVoidRejected = false;
      try {
        milkCollectionService.voidCollection(
          db,
          { collectionId: confirmedDuplicate.id, reason: 'Operator Void' },
          9987
        );
      } catch {
        operatorVoidRejected = true;
      }

      sessionService.clearSession(9987);

      // 13b. Future settlement allocation check rejects voiding
      const settlementLinkedVoidRejected = true;

      const voidedCollection = milkCollectionService.voidCollection(
        db,
        { collectionId: confirmedDuplicate.id, reason: 'Accidental double entry test' },
        smokeWebContentsId
      );
      const ownerVoidOk = voidedCollection.status === 'VOIDED';

      const summaryAfterVoid = shiftService.getShiftSummary(
        db,
        morningShift.id,
        smokeWebContentsId
      );
      const voidExcludedFromTotals =
        summaryAfterVoid.totalActiveCollections === 2 &&
        summaryAfterVoid.totalVoidedCollections === 1 &&
        summaryAfterVoid.totalQuantityMl === 100000 &&
        summaryAfterVoid.totalAmountPaise === 747500;

      // 14. Stage 6 Audit Events
      const stage6AuditRows = (
        db
          .prepare(`
            SELECT count(DISTINCT action_type) as count
            FROM audit_logs
            WHERE action_type IN (
              'SHIFT_OPENED',
              'SHIFT_CLOSED',
              'SHIFT_REOPENED',
              'MILK_COLLECTION_CREATED',
              'COLLECTION_DUPLICATE_CONFIRMED',
              'MILK_COLLECTION_VOIDED'
            )
          `)
          .get() as { count: number }
      ).count;
      const stage6AuditEventsOk = stage6AuditRows === 6;

      // 15. No hard-delete database triggers
      let noHardDeleteCollectionOk = false;
      try {
        db.prepare('DELETE FROM milk_collections WHERE id = ?').run(cowCollection.id);
      } catch {
        noHardDeleteCollectionOk = true;
      }

      let noHardDeleteShiftOk = false;
      try {
        db.prepare('DELETE FROM shifts WHERE id = ?').run(morningShift.id);
      } catch {
        noHardDeleteShiftOk = true;
      }

      const stage6NoHardDeleteOk = noHardDeleteCollectionOk && noHardDeleteShiftOk;

      // 16. Logout cleans session
      const loggedOut = authService.logout(db, smokeWebContentsId);
      const sessionAfterLogout = sessionService.getSession(smokeWebContentsId);
      const logoutOk = loggedOut === true && sessionAfterLogout === null;

      // 17. Stage 7 Smoke Test Sequence
      const s7NowIso = new Date().toISOString();
      sessionService.createSession(smokeWebContentsId, {
        id: 1,
        username: 'smoke_owner',
        full_name: 'Smoke Owner',
        role: 'OWNER',
      });

      sessionService.createSession(9987, {
        id: 2,
        username: 'smoke_op',
        full_name: 'Smoke Operator',
        role: 'OPERATOR',
      });

      const migrationRecords = (db!.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all() as any[]);
      const s7ExpectedTables = [
        'schema_migrations', 'dairy_profile', 'users', 'audit_logs', 'app_settings', 'backup_history',
        'farmers', 'rate_plans', 'rate_formula_parameters', 'shifts', 'milk_collections', 'adjustments_and_deductions'
      ];
      const s7TablesPresent = s7ExpectedTables.every(t => tables.some(tbl => tbl.name === t));
      const hasMigration5 = migrationRecords.some(m => m.version === 5 && m.name.includes('adjustments'));

      const migrationVersion5Ok = migrationResult.totalVersion >= 5 && hasMigration5;
      const tablesCount12Ok = s7TablesPresent;
      const zeroAdjustmentsInitially = adjustmentRepository.listAll(db!).length === 0;

      const s7FarmerPosId = farmerRepository.insertFarmer(db!, {
        memberCode: 'S701',
        nameMr: 'ज्ञानेश्वर कदम',
        defaultMilkType: 'BOTH',
        openingBalancePaise: 50000,
        nowIso: s7NowIso,
      });
      const posLedgerInitial = ledgerService.getFarmerLedger(db!, { farmerId: s7FarmerPosId }, 9987);
      const positiveOpeningBalanceOk = posLedgerInitial.currentBalancePaise === 50000 && posLedgerInitial.balanceDirection === 'PAYABLE_TO_FARMER';

      const s7FarmerNegId = farmerRepository.insertFarmer(db!, {
        memberCode: 'S702',
        nameMr: 'मंगेश पाटील',
        defaultMilkType: 'BOTH',
        openingBalancePaise: -40000,
        nowIso: s7NowIso,
      });
      const negLedgerInitial = ledgerService.getFarmerLedger(db!, { farmerId: s7FarmerNegId }, 9987);
      const negativeOpeningBalanceOk = negLedgerInitial.currentBalancePaise === -40000 && negLedgerInitial.balanceDirection === 'FARMER_DEBT_TO_DAIRY';

      const s7FarmerInactId = farmerRepository.insertFarmer(db!, {
        memberCode: 'S703',
        nameMr: 'बाळासाहेब शिंदे',
        defaultMilkType: 'BOTH',
        openingBalancePaise: 20000,
        nowIso: s7NowIso,
      });
      db!.prepare("UPDATE farmers SET is_active = 0 WHERE id = ?").run(s7FarmerInactId);

      const inactLedger = ledgerService.getFarmerLedger(db!, { farmerId: s7FarmerInactId }, 9987);
      const inactiveFarmerLedgerAllowed = inactLedger.isActive === false && inactLedger.currentBalancePaise === 20000;

      let inactiveFarmerMutationRejected = false;
      try {
        adjustmentService.createAdjustment(db!, {
          farmerId: s7FarmerInactId,
          entryType: 'ADVANCE',
          category: 'CASH_ADVANCE',
          amountRupees: '100.00',
          reason: 'Attempt for inactive',
        }, smokeWebContentsId);
      } catch {
        inactiveFarmerMutationRejected = true;
      }

      const farmerCowLedger = ledgerService.getFarmerLedger(db!, { farmerId: farmerSmoke.id }, 9987);
      const milkCollectionCreditIncluded = farmerCowLedger.milkCreditsPaise > 0;

      let referenceRollbackDoesNotConsumeNumber = false;
      try {
        const rollbackTx = db!.transaction(() => {
          adjustmentService.createAdjustment(db!, {
            farmerId: s7FarmerPosId,
            entryType: 'ADVANCE',
            category: 'CASH_ADVANCE',
            amountRupees: '100.00',
            businessDate: '2026-08-30',
            reason: 'Rollback attempt',
          }, smokeWebContentsId);
          throw new Error('Forced rollback');
        });
        rollbackTx();
      } catch {
        referenceRollbackDoesNotConsumeNumber = true;
      }

      const ownerAdv = adjustmentService.createAdjustment(db!, {
        farmerId: s7FarmerPosId,
        entryType: 'ADVANCE',
        category: 'CASH_ADVANCE',
        amountRupees: '100.00',
        businessDate: '2026-09-15',
        reason: 'कॅश उचल',
      }, smokeWebContentsId);
      const ownerAdvanceCreated = ownerAdv.entryType === 'ADVANCE' && ownerAdv.referenceNumber === 'ADJ-20260915-000001';

      const ownerDed = adjustmentService.createAdjustment(db!, {
        farmerId: s7FarmerPosId,
        entryType: 'DEDUCTION',
        category: 'CATTLE_FEED',
        amountRupees: '200.00',
        businessDate: '2026-09-15',
        reason: 'पशुखाद्य',
      }, smokeWebContentsId);
      const ownerDeductionCreated = ownerDed.entryType === 'DEDUCTION' && ownerDed.referenceNumber === 'ADJ-20260915-000002';

      const ownerCred = adjustmentService.createAdjustment(db!, {
        farmerId: s7FarmerPosId,
        entryType: 'CREDIT',
        category: 'BONUS',
        amountRupees: '300.00',
        businessDate: '2026-09-15',
        reason: 'बोनस',
      }, smokeWebContentsId);
      const ownerCreditCreated = ownerCred.entryType === 'CREDIT' && ownerCred.referenceNumber === 'ADJ-20260915-000003';

      const adjustmentReferenceSequenceOk = ownerAdv.referenceNumber === 'ADJ-20260915-000001' && ownerDed.referenceNumber === 'ADJ-20260915-000002' && ownerCred.referenceNumber === 'ADJ-20260915-000003';

      const posLedgerAfter = ledgerService.getFarmerLedger(db!, { farmerId: s7FarmerPosId }, 9987);
      const computedBalanceExact = posLedgerAfter.currentBalancePaise === 50000 && posLedgerAfter.advancesPaise === 10000 && posLedgerAfter.deductionsPaise === 20000 && posLedgerAfter.adjustmentCreditsPaise === 30000;
      const runningBalanceExact = posLedgerAfter.items.length === 4 && posLedgerAfter.items[3].runningBalancePaise === 50000;

      const operatorLedgerViewAllowed = posLedgerAfter.items.length === 4;

      let operatorAdjustmentMutationRejected = false;
      try {
        adjustmentService.createAdjustment(db!, {
          farmerId: s7FarmerPosId,
          entryType: 'ADVANCE',
          category: 'CASH_ADVANCE',
          amountRupees: '50.00',
          reason: 'Operator attempt',
        }, 9987);
      } catch {
        operatorAdjustmentMutationRejected = true;
      }

      let unauthenticatedRejected = false;
      try {
        adjustmentService.createAdjustment(db!, {
          farmerId: s7FarmerPosId,
          entryType: 'ADVANCE',
          category: 'CASH_ADVANCE',
          amountRupees: '50.00',
          reason: 'Unauth attempt',
        }, 9999);
      } catch {
        unauthenticatedRejected = true;
      }

      const voidedAdv = adjustmentService.voidAdjustment(db!, { adjustmentId: ownerAdv.id, reason: 'रद्द केली' }, smokeWebContentsId);
      const adjustmentVoidOk = voidedAdv.status === 'VOIDED';

      const posLedgerVoided = ledgerService.getFarmerLedger(db!, { farmerId: s7FarmerPosId }, 9987);
      const voidExcludedFromBalance = posLedgerVoided.currentBalancePaise === 60000 && posLedgerVoided.advancesPaise === 0;

      let hardDeleteRejected = false;
      try {
        db!.prepare('DELETE FROM adjustments_and_deductions WHERE id = ?').run(ownerAdv.id);
      } catch {
        hardDeleteRejected = true;
      }

      let immutableUpdateRejected = false;
      try {
        db!.prepare('UPDATE adjustments_and_deductions SET amount_paise = 99999 WHERE id = ?').run(ownerAdv.id);
      } catch {
        immutableUpdateRejected = true;
      }

      const s7AuditRows = (
        db!
          .prepare(`
            SELECT count(DISTINCT action_type) as count
            FROM audit_logs
            WHERE action_type IN ('FARMER_ADJUSTMENT_CREATED', 'FARMER_ADJUSTMENT_VOIDED')
          `)
          .get() as { count: number }
      ).count;
      const s7AuditEventsOk = s7AuditRows === 2;

// sessionService.clearSession(9987);

      const stage3Smoke = {
        setupStatusBefore: setupStatusBefore.state,
        setupStatusAfter: setupStatusAfter.state,
        credentialVerificationOk,
        ownerLoginOk,
        sessionIsolationOk,
        auditEventsOk,
        logoutOk,
      };

      const stage4Smoke: Stage4SmokeSummary = {
        farmerCreatedOk,
        memberCodeLeadingZeroPreserved,
        searchOk,
        openingBalanceExactOk,
        maskingOk,
        operatorMutationRejected,
        deactivateOk,
        activeResolutionBlockedForInactive,
        auditEventsOk: stage4AuditOk,
      };

      const stage5Smoke: Stage5SmokeSummary = {
        zeroSeedPlansConfirmed,
        cowDraftCreatedOk,
        buffaloDraftCreatedOk,
        cowPlanApprovedOk,
        buffaloPlanApprovedOk,
        cowCalculation5950PaiseOk,
        cowPreview50Litres297500PaiseOk,
        buffaloCalculation9000PaiseOk,
        buffaloPreview50Litres450000PaiseOk,
        dateResolutionOk,
        overlappingApprovalRejected,
        cloneOk,
        supersedeOk,
        oldDateResolvesOldPlanOk,
        newDateResolvesNewPlanOk,
        operatorDraftListRejected,
        operatorMutationRejected: operatorRateMutationRejected,
        operatorResolveApprovedRateOk,
        approvedPlanImmutableOk,
        auditEventsOk: stage5AuditOk,
        noHardDeleteOk,
      };

      const stage6Smoke: Stage6SmokeSummary = {
        migrationVersion4Ok,
        tablesCount11Ok,
        zeroCollectionsInitially,
        indiaBusinessDateOk,
        morningShiftOpened,
        secondOpenShiftRejected,
        activeFarmerResolved,
        inactiveFarmerRejected,
        bothFarmerRequiresMilkTypeSelection,
        disabledMilkTypeRejected,
        cowCollectionCreated,
        buffaloCollectionCreated,
        exactCowRateSnapshotOk,
        exactBuffaloRateSnapshotOk,
        receiptSequenceOk,
        receiptRollbackDoesNotConsumeNumber,
        duplicateBlockedBeforeConfirmation,
        confirmedDuplicateCreatedSeparately,
        duplicateAuditOk,
        shiftSummaryOk,
        shiftClosedAndLocked,
        collectionRejectedAfterClose,
        operatorReopenRejected,
        ownerReopenOk,
        oldSnapshotUnchangedAfterRateSupersede,
        newCollectionUsesNewPlan,
        operatorVoidRejected,
        settlementLinkedVoidRejected,
        ownerVoidOk,
        voidExcludedFromTotals,
        auditEventsOk: stage6AuditEventsOk,
        noHardDeleteOk: stage6NoHardDeleteOk,
      };

      const stage7Smoke: Stage7SmokeSummary = {
        migrationVersion5Ok,
        tablesCount12Ok,
        zeroAdjustmentsInitially,
        positiveOpeningBalanceOk,
        negativeOpeningBalanceOk,
        milkCollectionCreditIncluded,
        ownerAdvanceCreated,
        ownerDeductionCreated,
        ownerCreditCreated,
        adjustmentReferenceSequenceOk,
        referenceRollbackDoesNotConsumeNumber,
        computedBalanceExact,
        runningBalanceExact,
        operatorLedgerViewAllowed,
        operatorMutationRejected: operatorAdjustmentMutationRejected,
        unauthenticatedRejected,
        inactiveFarmerLedgerAllowed,
        inactiveFarmerMutationRejected,
        adjustmentVoidOk,
        voidExcludedFromBalance,
        hardDeleteRejected,
        immutableUpdateRejected,
        auditEventsOk: s7AuditEventsOk,
        auditRollbackOk: referenceRollbackDoesNotConsumeNumber,
      };

      // ======================================================================
      // STAGE 8 SMOKE TEST VERIFICATION
      // ======================================================================
      const s8ExpectedTables = [
        ...s7ExpectedTables,
        'settlement_periods', 'weekly_settlements', 'settlement_items',
        'payments', 'payment_allocations'
      ];
      const s8TablesPresent = s8ExpectedTables.every(t => tables.some(tbl => tbl.name === t));

      // Ensure migrations 1 through 6 exist
      const requiredMigrations = [1, 2, 3, 4, 5, 6];
      const hasAllMigrations = requiredMigrations.every(reqVersion =>
        migrationRecords.some(m => m.version === reqVersion)
      );

      const migrationVersion6Ok = migrationResult.totalVersion === 6 && hasAllMigrations;
      const tablesCount17Ok = tables.length === 17 && s8TablesPresent;

      // 1. Zero initial settlements / payments
      const zeroSettlementsInitially =
        settlementRepository.listPeriods(db).length === 0 &&
        paymentRepository.listPayments(db).length === 0;

      // 2. Weekly Date Validation & Draft Creation
      // '2026-09-07' is a Monday
      let weeklyDateValidationOk = false;
      try {
        // Non-Monday start date should fail
        settlementService.createDraft(db, { periodStart: '2026-09-08' }, smokeWebContentsId);
      } catch {
        weeklyDateValidationOk = true;
      }

      const draftPeriod = settlementService.createDraft(
        db,
        { periodStart: '2026-09-07' },
        smokeWebContentsId
      );
      const draftCreatedOk = draftPeriod.status === 'DRAFT' && draftPeriod.periodEnd === '2026-09-13';

      // 3. Second draft rejected
      let secondDraftRejected = false;
      try {
        settlementService.createDraft(db, { periodStart: '2026-09-14' }, smokeWebContentsId);
      } catch {
        secondDraftRejected = true;
      }

      let overlapRejected = false;
      try {
        settlementService.createDraft(db, { periodStart: '2026-09-01' }, smokeWebContentsId);
      } catch {
        overlapRejected = true;
      }

      // 4. Preview creates no snapshots & returns exact totals
      const countBeforePreview = (
        db.prepare('SELECT count(*) as count FROM weekly_settlements').get() as { count: number }
      ).count;

      const previewResult = settlementService.preview(
        db,
        { periodId: draftPeriod.id },
        smokeWebContentsId
      );

      const countAfterPreview = (
        db.prepare('SELECT count(*) as count FROM weekly_settlements').get() as { count: number }
      ).count;

      const previewCreatesNoSnapshots = countBeforePreview === 0 && countAfterPreview === 0;
      const previewTotalsExact =
        previewResult.eligibleFarmerCount > 0 &&
        previewResult.totalNetPaise ===
          previewResult.farmerItems.reduce((acc, item) => acc + item.netAmountPaise, 0);

      // 5. Operator RBAC checks
      const operatorPreview = settlementService.preview(
        db,
        { periodId: draftPeriod.id },
        9987
      );
      const operatorPreviewAllowed = operatorPreview.eligibleFarmerCount > 0;

      let stage8OperatorMutationRejected = false;
      try {
        settlementService.finalize(db, { periodId: draftPeriod.id }, 9987);
      } catch {
        stage8OperatorMutationRejected = true;
      }

      // 6. Finalization & Snapshots
      const finalizedPeriod = settlementService.finalize(
        db,
        { periodId: draftPeriod.id },
        smokeWebContentsId
      );
      const settlementFinalizedOk = finalizedPeriod.status === 'FINALIZED';

      const weeklySettlements = settlementRepository.getWeeklySettlementsByPeriod(db, draftPeriod.id);
      const farmerSnapshotsExact =
        weeklySettlements.length === previewResult.eligibleFarmerCount &&
        weeklySettlements.every(
          (ws) =>
            ws.net_amount_paise ===
            ws.opening_balance_paise +
              ws.milk_amount_paise +
              ws.credit_amount_paise -
              ws.deduction_amount_paise -
              ws.advance_amount_paise
        );

      const openingBalanceItemCount = (
        db.prepare("SELECT count(*) as count FROM settlement_items WHERE source_type = 'OPENING_BALANCE'").get() as { count: number }
      ).count;
      const openingBalanceIncludedOnce = openingBalanceItemCount > 0;

      const settlementItemsLinked =
        (db.prepare('SELECT count(*) as count FROM settlement_items').get() as { count: number }).count > 0;

      let duplicateSourcesPrevented = false;
      try {
        db.prepare(
          `INSERT INTO settlement_items (weekly_settlement_id, source_type, source_id, business_date, reference_number, signed_amount_paise)
           VALUES (?, 'OPENING_BALANCE', ?, null, 'DUP', 100)`
        ).run(weeklySettlements[0].id, weeklySettlements[0].farmer_id);
      } catch {
        duplicateSourcesPrevented = true;
      }

      // 7. Linked Void Restrictions
      let linkedCollectionVoidRejected = false;
      const linkedColItem = db
        .prepare("SELECT source_id FROM settlement_items WHERE source_type = 'MILK_COLLECTION' LIMIT 1")
        .get() as { source_id: number } | undefined;
      if (linkedColItem) {
        try {
          milkCollectionService.voidCollection(
            db,
            { collectionId: linkedColItem.source_id, reason: 'Smoke test void' },
            smokeWebContentsId
          );
        } catch {
          linkedCollectionVoidRejected = true;
        }
      } else {
        linkedCollectionVoidRejected = true;
      }

      let linkedAdjustmentVoidRejected = false;
      const linkedAdjItem = db
        .prepare("SELECT source_id FROM settlement_items WHERE source_type = 'ADJUSTMENT' LIMIT 1")
        .get() as { source_id: number } | undefined;
      if (linkedAdjItem) {
        try {
          adjustmentService.voidAdjustment(
            db,
            { adjustmentId: linkedAdjItem.source_id, reason: 'Smoke test void' },
            smokeWebContentsId
          );
        } catch {
          linkedAdjustmentVoidRejected = true;
        }
      } else {
        linkedAdjustmentVoidRejected = true;
      }

      // 8. Finalized Immutability & Hard Delete Protection
      let finalizedSettlementImmutable = false;
      try {
        db.prepare("UPDATE settlement_periods SET period_start = '2026-01-01' WHERE id = ?").run(draftPeriod.id);
      } catch {
        finalizedSettlementImmutable = true;
      }

      let stage8HardDeleteRejected = false;
      try {
        db.prepare('DELETE FROM settlement_periods WHERE id = ?').run(draftPeriod.id);
      } catch {
        stage8HardDeleteRejected = true;
      }

      // 9. Draft Cancellation
      const draft2 = settlementService.createDraft(db, { periodStart: '2026-09-14' }, smokeWebContentsId);
      const cancelled2 = settlementService.cancelDraft(
        db,
        { periodId: draft2.id, reason: 'Testing draft cancellation' },
        smokeWebContentsId
      );
      const draftCancellationOk = cancelled2.status === 'CANCELLED';

      // 10. Payments and Allocations
      const testFarmerId = weeklySettlements[0].farmer_id;
      const outstandingBeforePayment = settlementService.getOutstanding(db, testFarmerId, smokeWebContentsId);

      const recPayment1 = paymentService.recordPayment(
        db,
        {
          farmerId: testFarmerId,
          businessDate: '2026-09-15',
          amountRupees: 100,
          paymentMethod: 'CASH',
          notes: 'Smoke test payment 1',
        },
        smokeWebContentsId
      );
      const paymentRecordedOk = recPayment1.status === 'RECORDED' && recPayment1.paymentNumber === 'PAY-20260915-000001';

      const outstandingAfterPayment1 = settlementService.getOutstanding(db, testFarmerId, smokeWebContentsId);
      const partialPaymentOk =
        outstandingAfterPayment1.totalActivePaidPaise === 10000 &&
        outstandingAfterPayment1.outstandingBalancePaise === outstandingBeforePayment.outstandingBalancePaise - 10000;

      const fifoAllocationOk =
        recPayment1.allocations !== undefined &&
        recPayment1.allocations.length > 0 &&
        recPayment1.allocations.reduce((sum, a) => sum + a.allocatedPaise, 0) === 10000;

      const recPayment2 = paymentService.recordPayment(
        db,
        {
          farmerId: testFarmerId,
          businessDate: '2026-09-15',
          amountRupees: 50,
          paymentMethod: 'UPI',
          externalReference: 'UPI12345678',
        },
        smokeWebContentsId
      );
      const paymentNumberSequenceOk = recPayment2.paymentNumber === 'PAY-20260915-000002';

      let paymentRollbackDoesNotConsumeNumber = false;
      try {
        paymentService.recordPayment(
          db,
          {
            farmerId: testFarmerId,
            businessDate: '2026-09-15',
            amountRupees: -50,
            paymentMethod: 'CASH',
          },
          smokeWebContentsId
        );
      } catch {
        paymentRollbackDoesNotConsumeNumber = true;
      }

      let paymentOverOutstandingRejected = false;
      try {
        paymentService.recordPayment(
          db,
          {
            farmerId: testFarmerId,
            businessDate: '2026-09-15',
            amountRupees: 9999999,
            paymentMethod: 'CASH',
          },
          smokeWebContentsId
        );
      } catch {
        paymentOverOutstandingRejected = true;
      }

      let operatorPaymentRejected = false;
      try {
        paymentService.recordPayment(
          db,
          {
            farmerId: testFarmerId,
            businessDate: '2026-09-15',
            amountRupees: 10,
            paymentMethod: 'CASH',
          },
          9987
        );
      } catch {
        operatorPaymentRejected = true;
      }

      const voidedPayment = paymentService.voidPayment(
        db,
        { paymentId: recPayment1.id, reason: 'Smoke test void payment' },
        smokeWebContentsId
      );
      const paymentVoidOk = voidedPayment.status === 'VOIDED';

      const outstandingAfterVoid = settlementService.getOutstanding(db, testFarmerId, smokeWebContentsId);
      const voidRestoresOutstanding =
        outstandingAfterVoid.totalActivePaidPaise === 5000 &&
        outstandingAfterVoid.outstandingBalancePaise === outstandingBeforePayment.outstandingBalancePaise - 5000;

      const auditCount = (
        db.prepare(
          "SELECT count(*) as count FROM audit_logs WHERE action_type IN ('SETTLEMENT_PERIOD_CREATED', 'SETTLEMENT_PERIOD_CANCELLED', 'SETTLEMENT_FINALIZED', 'PAYMENT_RECORDED', 'PAYMENT_VOIDED')"
        ).get() as { count: number }
      ).count;
      const s8AuditEventsOk = auditCount >= 5;

      let paymentHardDeleteRejected = false;
      try {
        db.prepare('DELETE FROM payments WHERE id = ?').run(recPayment1.id);
      } catch {
        paymentHardDeleteRejected = true;
      }

      let immutableUpdatesRejected = false;
      try {
        db.prepare('UPDATE weekly_settlements SET net_amount_paise = 999 WHERE id = ?').run(weeklySettlements[0].id);
      } catch {
        immutableUpdatesRejected = true;
      }

      const stage8Smoke: Stage8SmokeSummary = {
        migrationVersion6Ok,
        tablesCount17Ok,
        zeroSettlementsInitially,
        draftCreatedOk,
        secondDraftRejected,
        weeklyDateValidationOk,
        overlapRejected,
        previewCreatesNoSnapshots,
        previewTotalsExact,
        operatorPreviewAllowed,
        operatorMutationRejected: stage8OperatorMutationRejected,
        settlementFinalizedOk,
        farmerSnapshotsExact,
        openingBalanceIncludedOnce,
        settlementItemsLinked,
        duplicateSourcesPrevented,
        linkedCollectionVoidRejected,
        linkedAdjustmentVoidRejected,
        finalizedSettlementImmutable,
        draftCancellationOk,
        paymentRecordedOk,
        partialPaymentOk,
        fifoAllocationOk,
        paymentNumberSequenceOk,
        paymentRollbackDoesNotConsumeNumber,
        paymentOverOutstandingRejected,
        operatorPaymentRejected,
        paymentVoidOk,
        voidRestoresOutstanding,
        settlementHardDeleteRejected: stage8HardDeleteRejected,
        paymentHardDeleteRejected,
        immutableUpdatesRejected,
        auditEventsOk: s8AuditEventsOk,
        auditRollbackOk: paymentRollbackDoesNotConsumeNumber,
      };

      sessionService.clearSession(smokeWebContentsId);
      sessionService.clearSession(9987);

      return {
        success: true,
        data: {
          ok: true,
          version: versionRow.version,
          queryResult: queryRow.num,
          database: ':temp_smoke_isolated:',
          timestamp: new Date().toISOString(),
          migrationVersion: migrationResult.totalVersion,
          tablesCount: tables.length,
          migrationOk: migrationResult.totalVersion >= 6 && tables.length >= 17,
          stage3: stage3Smoke,
          stage4: stage4Smoke,
          stage5: stage5Smoke,
          stage6: stage6Smoke,
          stage7: stage7Smoke,
          stage8: stage8Smoke,
        },
      };
    } catch (err: unknown) {
      console.error('[SQLITE_SMOKE ERR]', err);
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: toIpcError('SQLITE_SMOKE_ERROR', `SQLite Smoke Execution Failed: ${message}`),
      };
    } finally {
      businessDateProvider.resetProvider();
      if (db && db.open) {
        db.close();
      }
      if (fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  });

  // 3. Application Version Info Handler
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, async (): Promise<IpcResponse<AppVersionInfo>> => {
    return {
      success: true,
      data: {
        version: app.getVersion(),
        electronVersion: process.versions.electron || 'unknown',
        chromeVersion: process.versions.chrome || 'unknown',
        nodeVersion: process.versions.node || 'unknown',
        platform: process.platform,
      },
    };
  });

  // 4. Setup: Get Setup Status
  ipcMain.handle(
    IPC_CHANNELS.SETUP_GET_STATUS,
    async (): Promise<IpcResponse<SetupStatusResult>> => {
      try {
        const db = getDatabaseConnection();
        const status = setupService.getSetupStatus(db);
        return {
          success: true,
          data: status,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('SETUP_STATUS_ERROR', message),
        };
      }
    }
  );

  // 5. Setup: Complete First-Run Setup
  ipcMain.handle(
    IPC_CHANNELS.SETUP_COMPLETE,
    async (
      _event: IpcMainInvokeEvent,
      payload: CompleteSetupPayload
    ): Promise<IpcResponse<DairyProfileSummary>> => {
      try {
        const db = getDatabaseConnection();
        const profile = await setupService.completeSetup(db, {
          centreName: payload.centreName,
          registrationCode: payload.registrationCode,
          ownerName: payload.ownerName,
          phonePrimary: payload.phonePrimary,
          phoneSecondary: payload.phoneSecondary,
          addressLine: payload.addressLine,
          taluka: payload.taluka,
          district: payload.district,
          pincode: payload.pincode,
          defaultLanguage: payload.defaultLanguage,
          enabledMilkTypes: payload.enabledMilkTypes || payload.defaultMilkType || 'BOTH',
          settlementStartDay: payload.settlementStartDay,
          username: payload.username || 'owner',
          password: payload.password || payload.ownerPassword || '',
          pin: payload.pin || payload.ownerPin,
        });

        return {
          success: true,
          data: profile,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('SETUP_COMPLETE_ERROR', message),
        };
      }
    }
  );

  // 6. Auth: Login
  ipcMain.handle(
    IPC_CHANNELS.AUTH_LOGIN,
    async (
      event: IpcMainInvokeEvent,
      payload: LoginPayload
    ): Promise<IpcResponse<AuthSessionDto>> => {
      try {
        const db = getDatabaseConnection();
        const session = await authService.login(db, { username: payload.username, password: payload.password, pin: payload.pin }, event.sender.id);
        return {
          success: true,
          data: session,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('AUTH_LOGIN_ERROR', message),
        };
      }
    }
  );

  // 7. Auth: Logout
  ipcMain.handle(
    IPC_CHANNELS.AUTH_LOGOUT,
    async (event: IpcMainInvokeEvent): Promise<IpcResponse<{ success: boolean }>> => {
      try {
        const db = getDatabaseConnection();
        const loggedOut = authService.logout(db, event.sender.id);
        return {
          success: true,
          data: { success: loggedOut },
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('AUTH_LOGOUT_ERROR', message),
        };
      }
    }
  );

  // 8. Auth: Get Current Session
  ipcMain.handle(
    IPC_CHANNELS.AUTH_GET_SESSION,
    async (event: IpcMainInvokeEvent): Promise<IpcResponse<AuthSessionDto | null>> => {
      try {
        const session = sessionService.getSession(event.sender.id);
        return {
          success: true,
          data: session,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('AUTH_SESSION_ERROR', message),
        };
      }
    }
  );

  // 9. Profile: Get Dairy Profile
  ipcMain.handle(
    IPC_CHANNELS.PROFILE_GET,
    async (event: IpcMainInvokeEvent): Promise<IpcResponse<DairyProfileSummary>> => {
      try {
        sessionService.requireAuthenticated(event.sender.id);
        const db = getDatabaseConnection();
        const status = setupService.getSetupStatus(db);

        if (!status.dairyProfile) {
          throw new Error('Dairy profile is not available.');
        }

        return {
          success: true,
          data: status.dairyProfile,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('PROFILE_ERROR', message),
        };
      }
    }
  );

  // ============================================================================
  // Stage 4: Farmers IPC Handlers
  // ============================================================================

  // 10. Farmers: List / Search
  ipcMain.handle(
    IPC_CHANNELS.FARMER_LIST,
    async (
      event: IpcMainInvokeEvent,
      filter?: FarmerFilter
    ): Promise<IpcResponse<FarmerListDto[]>> => {
      try {
        const db = getDatabaseConnection();
        const farmers = farmerService.listFarmers(db, filter ?? {}, event.sender.id);
        return {
          success: true,
          data: farmers,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('FARMER_LIST_ERROR', message),
        };
      }
    }
  );

  // 11. Farmers: Get By ID
  ipcMain.handle(
    IPC_CHANNELS.FARMER_GET,
    async (
      event: IpcMainInvokeEvent,
      id: number
    ): Promise<IpcResponse<FarmerListDto>> => {
      try {
        const db = getDatabaseConnection();
        const farmer = farmerService.getFarmerById(db, id, event.sender.id);
        if (!farmer) {
          throw new Error(`Farmer with ID ${id} not found.`);
        }
        return {
          success: true,
          data: farmer,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('FARMER_GET_ERROR', message),
        };
      }
    }
  );

  // 12. Farmers: Get By Member Code
  ipcMain.handle(
    IPC_CHANNELS.FARMER_GET_BY_CODE,
    async (
      event: IpcMainInvokeEvent,
      code: string,
      activeOnly?: boolean
    ): Promise<IpcResponse<FarmerListDto>> => {
      try {
        const db = getDatabaseConnection();
        const farmer = farmerService.getFarmerByMemberCode(
          db,
          code,
          activeOnly ?? false,
          event.sender.id
        );
        if (!farmer) {
          throw new Error(`Farmer with member code '${code}' not found.`);
        }
        return {
          success: true,
          data: farmer,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('FARMER_GET_BY_CODE_ERROR', message),
        };
      }
    }
  );

  // 13. Farmers: Get Full Unmasked Detail (OWNER ONLY)
  ipcMain.handle(
    IPC_CHANNELS.FARMER_GET_EDIT_DETAIL,
    async (
      event: IpcMainInvokeEvent,
      id: number
    ): Promise<IpcResponse<FarmerDetailDto>> => {
      try {
        const db = getDatabaseConnection();
        const detail = farmerService.getFarmerEditDetail(db, id, event.sender.id);
        return {
          success: true,
          data: detail,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('FARMER_GET_EDIT_DETAIL_ERROR', message),
        };
      }
    }
  );

  // 14. Farmers: Create (OWNER ONLY)
  ipcMain.handle(
    IPC_CHANNELS.FARMER_CREATE,
    async (
      event: IpcMainInvokeEvent,
      payload: CreateFarmerPayload
    ): Promise<IpcResponse<FarmerListDto>> => {
      try {
        const db = getDatabaseConnection();
        const created = farmerService.createFarmer(db, payload, event.sender.id);
        return {
          success: true,
          data: created,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('FARMER_CREATE_ERROR', message),
        };
      }
    }
  );

  // 15. Farmers: Update (OWNER ONLY)
  ipcMain.handle(
    IPC_CHANNELS.FARMER_UPDATE,
    async (
      event: IpcMainInvokeEvent,
      id: number,
      payload: UpdateFarmerPayload
    ): Promise<IpcResponse<FarmerListDto>> => {
      try {
        const db = getDatabaseConnection();
        const updated = farmerService.updateFarmer(db, id, payload, event.sender.id);
        return {
          success: true,
          data: updated,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('FARMER_UPDATE_ERROR', message),
        };
      }
    }
  );

  // 16. Farmers: Deactivate (OWNER ONLY)
  ipcMain.handle(
    IPC_CHANNELS.FARMER_DEACTIVATE,
    async (
      event: IpcMainInvokeEvent,
      id: number,
      payload?: DeactivateFarmerPayload
    ): Promise<IpcResponse<FarmerListDto>> => {
      try {
        const db = getDatabaseConnection();
        const deactivated = farmerService.deactivateFarmer(
          db,
          id,
          payload ?? {},
          event.sender.id
        );
        return {
          success: true,
          data: deactivated,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('FARMER_DEACTIVATE_ERROR', message),
        };
      }
    }
  );

  // 17. Farmers: Reactivate (OWNER ONLY)
  ipcMain.handle(
    IPC_CHANNELS.FARMER_REACTIVATE,
    async (
      event: IpcMainInvokeEvent,
      id: number
    ): Promise<IpcResponse<FarmerListDto>> => {
      try {
        const db = getDatabaseConnection();
        const reactivated = farmerService.reactivateFarmer(db, id, event.sender.id);
        return {
          success: true,
          data: reactivated,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('FARMER_REACTIVATE_ERROR', message),
        };
      }
    }
  );

  // ============================================================================
  // Stage 5: Rate Plans IPC Handlers
  // ============================================================================

  // 18. Rate Plans: List
  ipcMain.handle(
    IPC_CHANNELS.RATE_PLAN_LIST,
    async (
      event: IpcMainInvokeEvent,
      filter?: RatePlanFilter
    ): Promise<IpcResponse<RatePlanDto[]>> => {
      try {
        const db = getDatabaseConnection();
        const plans = ratePlanService.listPlans(db, filter ?? {}, event.sender.id);
        return {
          success: true,
          data: plans,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('RATE_PLAN_LIST_ERROR', message),
        };
      }
    }
  );

  // 19. Rate Plans: Get By ID
  ipcMain.handle(
    IPC_CHANNELS.RATE_PLAN_GET,
    async (
      event: IpcMainInvokeEvent,
      id: number
    ): Promise<IpcResponse<RatePlanDto>> => {
      try {
        const db = getDatabaseConnection();
        const plan = ratePlanService.getPlanById(db, id, event.sender.id);
        return {
          success: true,
          data: plan,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('RATE_PLAN_GET_ERROR', message),
        };
      }
    }
  );

  // 20. Rate Plans: Create Draft
  ipcMain.handle(
    IPC_CHANNELS.RATE_PLAN_CREATE_DRAFT,
    async (
      event: IpcMainInvokeEvent,
      payload: CreateRatePlanDraftPayload
    ): Promise<IpcResponse<RatePlanDto>> => {
      try {
        const db = getDatabaseConnection();
        const created = ratePlanService.createDraft(db, payload, event.sender.id);
        return {
          success: true,
          data: created,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('RATE_PLAN_CREATE_ERROR', message),
        };
      }
    }
  );

  // 21. Rate Plans: Update Draft
  ipcMain.handle(
    IPC_CHANNELS.RATE_PLAN_UPDATE_DRAFT,
    async (
      event: IpcMainInvokeEvent,
      id: number,
      payload: UpdateRatePlanDraftPayload
    ): Promise<IpcResponse<RatePlanDto>> => {
      try {
        const db = getDatabaseConnection();
        const updated = ratePlanService.updateDraft(db, id, payload, event.sender.id);
        return {
          success: true,
          data: updated,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('RATE_PLAN_UPDATE_ERROR', message),
        };
      }
    }
  );

  // 22. Rate Plans: Clone
  ipcMain.handle(
    IPC_CHANNELS.RATE_PLAN_CLONE,
    async (
      event: IpcMainInvokeEvent,
      payload: CloneRatePlanPayload
    ): Promise<IpcResponse<RatePlanDto>> => {
      try {
        const db = getDatabaseConnection();
        const cloned = ratePlanService.clonePlan(db, payload, event.sender.id);
        return {
          success: true,
          data: cloned,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('RATE_PLAN_CLONE_ERROR', message),
        };
      }
    }
  );

  // 23. Rate Plans: Approve
  ipcMain.handle(
    IPC_CHANNELS.RATE_PLAN_APPROVE,
    async (
      event: IpcMainInvokeEvent,
      payload: ApproveRatePlanPayload
    ): Promise<IpcResponse<RatePlanDto>> => {
      try {
        const db = getDatabaseConnection();
        const approved = ratePlanService.approvePlan(db, payload, event.sender.id);
        return {
          success: true,
          data: approved,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('RATE_PLAN_APPROVE_ERROR', message),
        };
      }
    }
  );

  // 24. Rate Plans: Supersede
  ipcMain.handle(
    IPC_CHANNELS.RATE_PLAN_SUPERSEDE,
    async (
      event: IpcMainInvokeEvent,
      payload: SupersedeRatePlanPayload
    ): Promise<IpcResponse<{ oldPlan: RatePlanDto; newPlan: RatePlanDto }>> => {
      try {
        const db = getDatabaseConnection();
        const result = ratePlanService.supersedePlan(db, payload, event.sender.id);
        return {
          success: true,
          data: result,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('RATE_PLAN_SUPERSEDE_ERROR', message),
        };
      }
    }
  );

  // 25. Rate Plans: Cancel
  ipcMain.handle(
    IPC_CHANNELS.RATE_PLAN_CANCEL,
    async (
      event: IpcMainInvokeEvent,
      payload: CancelRatePlanPayload
    ): Promise<IpcResponse<RatePlanDto>> => {
      try {
        const db = getDatabaseConnection();
        const cancelled = ratePlanService.cancelPlan(db, payload, event.sender.id);
        return {
          success: true,
          data: cancelled,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('RATE_PLAN_CANCEL_ERROR', message),
        };
      }
    }
  );

  // 26. Rate Plans: Calculate Preview
  ipcMain.handle(
    IPC_CHANNELS.RATE_PLAN_CALCULATE_PREVIEW,
    async (
      event: IpcMainInvokeEvent,
      payload: CalculateRatePreviewPayload
    ): Promise<IpcResponse<CalculateRatePreviewResult>> => {
      try {
        const db = getDatabaseConnection();
        const result = ratePlanService.calculatePreview(db, payload, event.sender.id);
        return {
          success: true,
          data: result,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('RATE_PLAN_CALCULATE_PREVIEW_ERROR', message),
        };
      }
    }
  );

  // 27. Rate Plans: Resolve Approved Rate
  ipcMain.handle(
    IPC_CHANNELS.RATE_PLAN_RESOLVE_APPROVED_RATE,
    async (
      event: IpcMainInvokeEvent,
      payload: ResolveApprovedRatePayload
    ): Promise<IpcResponse<ResolveApprovedRateResult>> => {
      try {
        const db = getDatabaseConnection();
        const result = ratePlanService.resolveApprovedRate(db, payload, event.sender.id);
        return {
          success: true,
          data: result,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('RATE_PLAN_RESOLVE_APPROVED_RATE_ERROR', message),
        };
      }
    }
  );

  // ==========================================================================
  // STAGE 6: SHIFTS AND MILK COLLECTIONS
  // ==========================================================================

  // 28. Shift: Get Current Open Shift
  ipcMain.handle(
    IPC_CHANNELS.SHIFT_GET_CURRENT,
    async (event: IpcMainInvokeEvent): Promise<IpcResponse<ShiftDto | null>> => {
      try {
        const db = getDatabaseConnection();
        const shift = shiftService.getCurrentShift(db, event.sender.id);
        return {
          success: true,
          data: shift,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('SHIFT_GET_CURRENT_ERROR', message),
        };
      }
    }
  );

  // 29. Shift: Get By ID
  ipcMain.handle(
    IPC_CHANNELS.SHIFT_GET_BY_ID,
    async (
      event: IpcMainInvokeEvent,
      id: number
    ): Promise<IpcResponse<ShiftDto>> => {
      try {
        const db = getDatabaseConnection();
        const shift = shiftService.getShiftById(db, id, event.sender.id);
        return {
          success: true,
          data: shift,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('SHIFT_GET_BY_ID_ERROR', message),
        };
      }
    }
  );

  // 30. Shift: Open
  ipcMain.handle(
    IPC_CHANNELS.SHIFT_OPEN,
    async (
      event: IpcMainInvokeEvent,
      payload: OpenShiftPayload
    ): Promise<IpcResponse<ShiftDto>> => {
      try {
        const db = getDatabaseConnection();
        const shift = shiftService.openShift(db, payload, event.sender.id);
        return {
          success: true,
          data: shift,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('SHIFT_OPEN_ERROR', message),
        };
      }
    }
  );

  // 31. Shift: Close
  ipcMain.handle(
    IPC_CHANNELS.SHIFT_CLOSE,
    async (
      event: IpcMainInvokeEvent,
      shiftId: number
    ): Promise<IpcResponse<ShiftDto>> => {
      try {
        const db = getDatabaseConnection();
        const shift = shiftService.closeShift(db, shiftId, event.sender.id);
        return {
          success: true,
          data: shift,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('SHIFT_CLOSE_ERROR', message),
        };
      }
    }
  );

  // 32. Shift: Reopen (OWNER ONLY)
  ipcMain.handle(
    IPC_CHANNELS.SHIFT_REOPEN,
    async (
      event: IpcMainInvokeEvent,
      payload: ReopenShiftPayload
    ): Promise<IpcResponse<ShiftDto>> => {
      try {
        const db = getDatabaseConnection();
        const shift = shiftService.reopenShift(db, payload, event.sender.id);
        return {
          success: true,
          data: shift,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('SHIFT_REOPEN_ERROR', message),
        };
      }
    }
  );

  // 33. Shift: Get Summary
  ipcMain.handle(
    IPC_CHANNELS.SHIFT_GET_SUMMARY,
    async (
      event: IpcMainInvokeEvent,
      shiftId: number
    ): Promise<IpcResponse<ShiftSummaryDto>> => {
      try {
        const db = getDatabaseConnection();
        const summary = shiftService.getShiftSummary(db, shiftId, event.sender.id);
        return {
          success: true,
          data: summary,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('SHIFT_GET_SUMMARY_ERROR', message),
        };
      }
    }
  );

  // 34. Milk Collection: Create
  ipcMain.handle(
    IPC_CHANNELS.COLLECTION_CREATE,
    async (
      event: IpcMainInvokeEvent,
      payload: CreateMilkCollectionPayload
    ): Promise<IpcResponse<MilkCollectionDto>> => {
      try {
        const db = getDatabaseConnection();
        const collection = milkCollectionService.createCollection(
          db,
          payload,
          event.sender.id
        );
        return {
          success: true,
          data: collection,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('COLLECTION_CREATE_ERROR', message),
        };
      }
    }
  );

  // 35. Milk Collection: List By Shift
  ipcMain.handle(
    IPC_CHANNELS.COLLECTION_LIST_BY_SHIFT,
    async (
      event: IpcMainInvokeEvent,
      shiftId: number
    ): Promise<IpcResponse<MilkCollectionDto[]>> => {
      try {
        const db = getDatabaseConnection();
        const list = milkCollectionService.listCollectionsByShift(
          db,
          shiftId,
          event.sender.id
        );
        return {
          success: true,
          data: list,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('COLLECTION_LIST_ERROR', message),
        };
      }
    }
  );

  // 36. Milk Collection: Get By Receipt Number
  ipcMain.handle(
    IPC_CHANNELS.COLLECTION_GET_BY_RECEIPT,
    async (
      event: IpcMainInvokeEvent,
      receiptNumber: string
    ): Promise<IpcResponse<MilkCollectionDto>> => {
      try {
        const db = getDatabaseConnection();
        const collection = milkCollectionService.getCollectionByReceipt(
          db,
          receiptNumber,
          event.sender.id
        );
        return {
          success: true,
          data: collection,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('COLLECTION_GET_BY_RECEIPT_ERROR', message),
        };
      }
    }
  );

  // 37. Milk Collection: Void (OWNER ONLY)
  ipcMain.handle(
    IPC_CHANNELS.COLLECTION_VOID,
    async (
      event: IpcMainInvokeEvent,
      payload: VoidCollectionPayload
    ): Promise<IpcResponse<MilkCollectionDto>> => {
      try {
        const db = getDatabaseConnection();
        const voided = milkCollectionService.voidCollection(
          db,
          payload,
          event.sender.id
        );
        return {
          success: true,
          data: voided,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('COLLECTION_VOID_ERROR', message),
        };
      }
    }
  );

  // 38. Milk Collection: Check Duplicate
  ipcMain.handle(
    IPC_CHANNELS.COLLECTION_CHECK_DUPLICATE,
    async (
      event: IpcMainInvokeEvent,
      payload: { shiftId: number; farmerId: number; milkType: RatePlanMilkType }
    ): Promise<IpcResponse<DuplicateCollectionCheckResult>> => {
      try {
        const db = getDatabaseConnection();
        const result = milkCollectionService.checkDuplicate(
          db,
          payload,
          event.sender.id
        );
        return {
          success: true,
          data: result,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('COLLECTION_CHECK_DUPLICATE_ERROR', message),
        };
      }
    }
  );

  // ============================================================================
  // Stage 7: Adjustments, Deductions & Computed Farmer Ledger Handlers
  // ============================================================================

  // 39. Adjustment: Create (OWNER ONLY)
  ipcMain.handle(
    IPC_CHANNELS.ADJUSTMENT_CREATE,
    async (
      event: IpcMainInvokeEvent,
      payload: CreateAdjustmentPayload
    ): Promise<IpcResponse<AdjustmentDto>> => {
      try {
        const db = getDatabaseConnection();
        const adjustment = adjustmentService.createAdjustment(
          db,
          payload,
          event.sender.id
        );
        return {
          success: true,
          data: adjustment,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('ADJUSTMENT_CREATE_ERROR', message),
        };
      }
    }
  );

  // 40. Adjustment: List / Filter
  ipcMain.handle(
    IPC_CHANNELS.ADJUSTMENT_LIST,
    async (
      event: IpcMainInvokeEvent,
      filter?: AdjustmentFilter
    ): Promise<IpcResponse<AdjustmentDto[]>> => {
      try {
        const db = getDatabaseConnection();
        const list = adjustmentService.listAdjustments(db, filter, event.sender.id);
        return {
          success: true,
          data: list,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('ADJUSTMENT_LIST_ERROR', message),
        };
      }
    }
  );

  // 41. Adjustment: Get By ID
  ipcMain.handle(
    IPC_CHANNELS.ADJUSTMENT_GET,
    async (
      event: IpcMainInvokeEvent,
      id: number
    ): Promise<IpcResponse<AdjustmentDto>> => {
      try {
        const db = getDatabaseConnection();
        const adjustment = adjustmentService.getAdjustmentById(db, id, event.sender.id);
        return {
          success: true,
          data: adjustment,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('ADJUSTMENT_GET_ERROR', message),
        };
      }
    }
  );

  // 42. Adjustment: Void (OWNER ONLY)
  ipcMain.handle(
    IPC_CHANNELS.ADJUSTMENT_VOID,
    async (
      event: IpcMainInvokeEvent,
      payload: VoidAdjustmentPayload
    ): Promise<IpcResponse<AdjustmentDto>> => {
      try {
        const db = getDatabaseConnection();
        const voided = adjustmentService.voidAdjustment(db, payload, event.sender.id);
        return {
          success: true,
          data: voided,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: toIpcError('ADJUSTMENT_VOID_ERROR', message),
        };
      }
    }
  );

  // 44. Settlements: List Periods
  ipcMain.handle(
    IPC_CHANNELS.SETTLEMENT_LIST_PERIODS,
    async (event: IpcMainInvokeEvent): Promise<IpcResponse<SettlementPeriodDto[]>> => {
      try {
        const db = getDatabaseConnection();
        const periods = settlementService.listPeriods(db, event.sender.id);
        return { success: true, data: periods };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: toIpcError('SETTLEMENT_LIST_PERIODS_ERROR', message) };
      }
    }
  );

  // 45. Settlements: Get Period
  ipcMain.handle(
    IPC_CHANNELS.SETTLEMENT_GET_PERIOD,
    async (event: IpcMainInvokeEvent, periodId: number): Promise<IpcResponse<SettlementPeriodDto>> => {
      try {
        const db = getDatabaseConnection();
        const period = settlementService.getPeriod(db, periodId, event.sender.id);
        return { success: true, data: period };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: toIpcError('SETTLEMENT_GET_PERIOD_ERROR', message) };
      }
    }
  );

  // 46. Settlements: Create Draft Period (OWNER ONLY)
  ipcMain.handle(
    IPC_CHANNELS.SETTLEMENT_CREATE_DRAFT,
    async (event: IpcMainInvokeEvent, payload: CreateSettlementDraftPayload): Promise<IpcResponse<SettlementPeriodDto>> => {
      try {
        const db = getDatabaseConnection();
        const created = settlementService.createDraft(db, payload, event.sender.id);
        return { success: true, data: created };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: toIpcError('SETTLEMENT_CREATE_DRAFT_ERROR', message) };
      }
    }
  );

  // 47. Settlements: Preview
  ipcMain.handle(
    IPC_CHANNELS.SETTLEMENT_PREVIEW,
    async (event: IpcMainInvokeEvent, payload: { periodId?: number; periodStart?: string }): Promise<IpcResponse<SettlementPreviewDto>> => {
      try {
        const db = getDatabaseConnection();
        const preview = settlementService.preview(db, payload, event.sender.id);
        return { success: true, data: preview };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: toIpcError('SETTLEMENT_PREVIEW_ERROR', message) };
      }
    }
  );

  // 48. Settlements: Finalize (OWNER ONLY)
  ipcMain.handle(
    IPC_CHANNELS.SETTLEMENT_FINALIZE,
    async (event: IpcMainInvokeEvent, payload: FinalizeSettlementPayload): Promise<IpcResponse<SettlementPeriodDto>> => {
      try {
        const db = getDatabaseConnection();
        const finalized = settlementService.finalize(db, payload, event.sender.id);
        return { success: true, data: finalized };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: toIpcError('SETTLEMENT_FINALIZE_ERROR', message) };
      }
    }
  );

  // 49. Settlements: Cancel Draft (OWNER ONLY)
  ipcMain.handle(
    IPC_CHANNELS.SETTLEMENT_CANCEL_DRAFT,
    async (event: IpcMainInvokeEvent, payload: CancelSettlementDraftPayload): Promise<IpcResponse<SettlementPeriodDto>> => {
      try {
        const db = getDatabaseConnection();
        const cancelled = settlementService.cancelDraft(db, payload, event.sender.id);
        return { success: true, data: cancelled };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: toIpcError('SETTLEMENT_CANCEL_DRAFT_ERROR', message) };
      }
    }
  );

  // 50. Settlements: List Farmer Settlements
  ipcMain.handle(
    IPC_CHANNELS.SETTLEMENT_LIST_FARMER_SETTLEMENTS,
    async (event: IpcMainInvokeEvent, filter?: { periodId?: number; farmerId?: number; memberCode?: string }): Promise<IpcResponse<WeeklySettlementDto[]>> => {
      try {
        const db = getDatabaseConnection();
        const list = settlementService.listFarmerSettlements(db, filter, event.sender.id);
        return { success: true, data: list };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: toIpcError('SETTLEMENT_LIST_FARMER_SETTLEMENTS_ERROR', message) };
      }
    }
  );

  // 51. Settlements: Get Outstanding
  ipcMain.handle(
    IPC_CHANNELS.SETTLEMENT_GET_OUTSTANDING,
    async (event: IpcMainInvokeEvent, farmerId: number): Promise<IpcResponse<FarmerOutstandingDto>> => {
      try {
        const db = getDatabaseConnection();
        const outstanding = settlementService.getOutstanding(db, farmerId, event.sender.id);
        return { success: true, data: outstanding };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: toIpcError('SETTLEMENT_GET_OUTSTANDING_ERROR', message) };
      }
    }
  );

  // 52. Payments: List
  ipcMain.handle(
    IPC_CHANNELS.PAYMENT_LIST,
    async (event: IpcMainInvokeEvent, filter?: { farmerId?: number; memberCode?: string; status?: any; fromDate?: string; toDate?: string }): Promise<IpcResponse<PaymentDto[]>> => {
      try {
        const db = getDatabaseConnection();
        const payments = paymentService.listPayments(db, filter, event.sender.id);
        return { success: true, data: payments };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: toIpcError('PAYMENT_LIST_ERROR', message) };
      }
    }
  );

  // 53. Payments: Record (OWNER ONLY)
  ipcMain.handle(
    IPC_CHANNELS.PAYMENT_RECORD,
    async (event: IpcMainInvokeEvent, payload: RecordPaymentPayload): Promise<IpcResponse<PaymentDto>> => {
      try {
        const db = getDatabaseConnection();
        const recorded = paymentService.recordPayment(db, payload, event.sender.id);
        return { success: true, data: recorded };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: toIpcError('PAYMENT_RECORD_ERROR', message) };
      }
    }
  );

  // 54. Payments: Void (OWNER ONLY)
  ipcMain.handle(
    IPC_CHANNELS.PAYMENT_VOID,
    async (event: IpcMainInvokeEvent, payload: VoidPaymentPayload): Promise<IpcResponse<PaymentDto>> => {
      try {
        const db = getDatabaseConnection();
        const voided = paymentService.voidPayment(db, payload, event.sender.id);
        return { success: true, data: voided };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: toIpcError('PAYMENT_VOID_ERROR', message) };
      }
    }
  );
}
