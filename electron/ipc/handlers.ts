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
  Stage4SmokeSummary,
  Stage5SmokeSummary,
} from '../../shared/ipc-contracts';
import { applyAndVerifyPragmas, getDatabaseConnection } from '../db/connection';
import { runMigrations } from '../db/migrator';
import { setupService } from '../services/setup.service';
import { authService } from '../services/auth.service';
import { sessionService } from '../core/session.service';
import { farmerService } from '../services/farmer.service';
import { ratePlanService } from '../services/rate-plan.service';

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

      // 13. Logout cleans session
      const loggedOut = authService.logout(db, smokeWebContentsId);
      const sessionAfterLogout = sessionService.getSession(smokeWebContentsId);
      const logoutOk = loggedOut === true && sessionAfterLogout === null;

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
          migrationOk: migrationResult.totalVersion >= 3 && tables.length >= 9,
          stage3: stage3Smoke,
          stage4: stage4Smoke,
          stage5: stage5Smoke,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: toIpcError('SQLITE_SMOKE_ERROR', `SQLite Smoke Execution Failed: ${message}`),
      };
    } finally {
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
}
