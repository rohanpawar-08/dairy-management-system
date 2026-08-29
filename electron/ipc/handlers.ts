import { app, ipcMain, IpcMainInvokeEvent } from 'electron';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  IPC_CHANNELS,
  IpcResponse,
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
  Stage4SmokeSummary,
} from '../../shared/ipc-contracts';
import { applyAndVerifyPragmas, getDatabaseConnection } from '../db/connection';
import { runMigrations } from '../db/migrator';
import { setupService } from '../services/setup.service';
import { authService } from '../services/auth.service';
import { sessionService } from '../core/session.service';
import { farmerService } from '../services/farmer.service';

/**
 * Registers all allowlisted IPC handlers in the Electron main process.
 */
export function registerIpcHandlers(): void {
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
      } finally {
        sessionService.clearSession(9987);
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

      // 9. Verify Logout clears session
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

      const stage3AllPassed =
        setupStatusBefore.state === 'UNINITIALIZED' &&
        setupStatusAfter.state === 'READY' &&
        credentialVerificationOk &&
        ownerLoginOk &&
        sessionIsolationOk &&
        auditEventsOk &&
        logoutOk;

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

      const stage4AllPassed =
        farmerCreatedOk &&
        memberCodeLeadingZeroPreserved &&
        searchOk &&
        openingBalanceExactOk &&
        maskingOk &&
        operatorMutationRejected &&
        deactivateOk &&
        activeResolutionBlockedForInactive &&
        stage4AuditOk;

      const result: SqliteSmokeResult = {
        ok: true,
        version: versionRow.version,
        queryResult: queryRow.num,
        database: ':temp_smoke_isolated:',
        timestamp: new Date().toISOString(),
        migrationVersion: migrationResult.totalVersion,
        tablesCount: tables.length,
        migrationOk:
          migrationResult.totalVersion >= 2 &&
          tables.length >= 7 &&
          stage3AllPassed &&
          stage4AllPassed,
        stage3: stage3Smoke,
        stage4: stage4Smoke,
      };

      return {
        success: true,
        data: result,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: {
          code: 'SQLITE_SMOKE_ERROR',
          messageMr: 'SQLite डेटाबेस चाचणी अयशस्वी झाली: ' + message,
          messageEn: 'SQLite database smoke test failed: ' + message,
          details: message,
        },
      };
    } finally {
      if (db) {
        try {
          db.close();
        } catch {
          // Ignore close error during teardown
        }
      }
      // Clean up temporary smoke directory
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore unlink error during cleanup
      }
    }
  });

  // 3. Application Version & Environment Metadata Handler
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, async (): Promise<IpcResponse<AppVersionInfo>> => {
    return {
      success: true,
      data: {
        version: app.getVersion() || '0.1.0',
        electronVersion: process.versions.electron || 'unknown',
        chromeVersion: process.versions.chrome || 'unknown',
        nodeVersion: process.versions.node || 'unknown',
        platform: process.platform,
      },
    };
  });

  // 4. Setup: Get Status
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
          error: {
            code: 'SETUP_STATUS_ERROR',
            messageMr: 'सेटअप स्थिती तपासण्यात त्रुटी आली.',
            messageEn: 'Failed to retrieve setup status: ' + message,
            details: message,
          },
        };
      }
    }
  );

  // 5. Setup: Complete First-Run Wizard
  ipcMain.handle(
    IPC_CHANNELS.SETUP_COMPLETE,
    async (
      _event: IpcMainInvokeEvent,
      payload: CompleteSetupPayload
    ): Promise<IpcResponse<DairyProfileSummary>> => {
      try {
        const db = getDatabaseConnection();
        const profile = await setupService.completeSetup(db, payload);
        return {
          success: true,
          data: profile,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: {
            code: 'SETUP_COMPLETION_ERROR',
            messageMr: 'डेअरी सेटअप पूर्ण करताना त्रुटी आली: ' + message,
            messageEn: 'Dairy setup completion failed: ' + message,
            details: message,
          },
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
        const session = await authService.login(db, payload, event.sender.id);
        sessionService.bindWebContents(event.sender);
        return {
          success: true,
          data: session,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: {
            code: 'AUTH_FAILED',
            messageMr: 'वापरकर्तानाव किंवा संकेतशब्द/पिन चुकीचा आहे.',
            messageEn: message.includes('Too many')
              ? message
              : 'Invalid username or credentials.',
            details: message,
          },
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
        const cleared = authService.logout(db, event.sender.id);
        return {
          success: true,
          data: { success: cleared },
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: {
            code: 'LOGOUT_ERROR',
            messageMr: 'लॉगआउट करताना त्रुटी आली.',
            messageEn: 'Logout failed: ' + message,
          },
        };
      }
    }
  );

  // 8. Auth: Get Session
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
          error: {
            code: 'SESSION_ERROR',
            messageMr: 'सत्र माहिती मिळवण्यात त्रुटी आली.',
            messageEn: 'Failed to retrieve session: ' + message,
          },
        };
      }
    }
  );

  // 9. Profile: Get Dairy Profile (Requires Authentication)
  ipcMain.handle(
    IPC_CHANNELS.PROFILE_GET,
    async (event: IpcMainInvokeEvent): Promise<IpcResponse<DairyProfileSummary>> => {
      try {
        // Enforce session authority in main process
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
          error: {
            code: 'PROFILE_ERROR',
            messageMr: 'डेअरी प्रोफाइल माहिती मिळवण्यात त्रुटी आली.',
            messageEn: 'Failed to retrieve dairy profile: ' + message,
            details: message,
          },
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
          error: {
            code: 'FARMER_LIST_ERROR',
            messageMr: 'शेतकऱ्यांची यादी मिळवण्यात त्रुटी आली: ' + message,
            messageEn: 'Failed to list farmers: ' + message,
            details: message,
          },
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
          error: {
            code: 'FARMER_NOT_FOUND',
            messageMr: 'शेतकरी माहिती आढळली नाही: ' + message,
            messageEn: 'Farmer not found: ' + message,
            details: message,
          },
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
          error: {
            code: 'FARMER_NOT_FOUND',
            messageMr: 'सदस्य कोडनुसार शेतकरी आढळला नाही: ' + message,
            messageEn: 'Farmer not found by member code: ' + message,
            details: message,
          },
        };
      }
    }
  );

  // 13. Farmers: Get Edit Detail (OWNER ONLY)
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
          error: {
            code: 'FARMER_DETAIL_ERROR',
            messageMr: 'शेतकऱ्याची संपादन माहिती मिळवण्यात त्रुटी: ' + message,
            messageEn: 'Failed to retrieve farmer edit details: ' + message,
            details: message,
          },
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
          error: {
            code: 'FARMER_CREATE_ERROR',
            messageMr: 'शेतकरी नोंदणी करताना त्रुटी आली: ' + message,
            messageEn: 'Failed to create farmer: ' + message,
            details: message,
          },
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
          error: {
            code: 'FARMER_UPDATE_ERROR',
            messageMr: 'शेतकरी माहिती अपडेट करताना त्रुटी आली: ' + message,
            messageEn: 'Failed to update farmer: ' + message,
            details: message,
          },
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
          error: {
            code: 'FARMER_DEACTIVATE_ERROR',
            messageMr: 'शेतकरी निष्क्रिय करताना त्रुटी आली: ' + message,
            messageEn: 'Failed to deactivate farmer: ' + message,
            details: message,
          },
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
          error: {
            code: 'FARMER_REACTIVATE_ERROR',
            messageMr: 'शेतकरी पुन्हा सक्रिय करताना त्रुटी आली: ' + message,
            messageEn: 'Failed to reactivate farmer: ' + message,
            details: message,
          },
        };
      }
    }
  );
}
