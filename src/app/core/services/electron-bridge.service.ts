import { Injectable } from '@angular/core';
import {
  DairyApiBridge,
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
} from '../../../../shared/ipc-contracts';

@Injectable({
  providedIn: 'root',
})
export class ElectronBridgeService {
  private get api(): DairyApiBridge | undefined {
    return typeof window !== 'undefined' ? window.dairyApi : undefined;
  }

  public get isElectron(): boolean {
    return !!this.api;
  }

  /**
   * Ping the Electron main process via typed IPC.
   */
  public async ping(): Promise<IpcResponse<PingResult>> {
    if (!this.api) {
      return {
        success: false,
        error: {
          code: 'NO_ELECTRON_BRIDGE',
          messageMr: 'Electron प्रीलोड ब्रिज उपलब्ध नाही (ब्राउझर मोड)',
          messageEn: 'Electron preload bridge is not available (Browser mode)',
        },
      };
    }
    return this.api.ping();
  }

  /**
   * Run the in-memory SQLite smoke test via Electron main process.
   */
  public async smokeSqlite(): Promise<IpcResponse<SqliteSmokeResult>> {
    if (!this.api) {
      return {
        success: false,
        error: {
          code: 'NO_ELECTRON_BRIDGE',
          messageMr: 'Electron प्रीलोड ब्रिज उपलब्ध नाही (ब्राउझर मोड)',
          messageEn: 'Electron preload bridge is not available (Browser mode)',
        },
      };
    }
    return this.api.smokeSqlite();
  }

  /**
   * Get the application and runtime version info.
   */
  public async getAppVersion(): Promise<IpcResponse<AppVersionInfo>> {
    if (!this.api) {
      return {
        success: true,
        data: {
          version: '0.1.0-web-dev',
          electronVersion: 'N/A',
          chromeVersion: 'N/A',
          nodeVersion: 'N/A',
          platform: 'web',
        },
      };
    }
    return this.api.getAppVersion();
  }

  /**
   * Stage 3: Get first-run setup status.
   */
  public async getSetupStatus(): Promise<IpcResponse<SetupStatusResult>> {
    if (!this.api) {
      return {
        success: true,
        data: { state: 'UNINITIALIZED', dairyProfile: null },
      };
    }
    return this.api.getSetupStatus();
  }

  /**
   * Stage 3: Complete first-run dairy setup.
   */
  public async completeSetup(
    payload: CompleteSetupPayload
  ): Promise<IpcResponse<DairyProfileSummary>> {
    if (!this.api) {
      return {
        success: false,
        error: {
          code: 'NO_ELECTRON_BRIDGE',
          messageMr: 'Electron ब्रिज उपलब्ध नाही',
          messageEn: 'Electron bridge is not available',
        },
      };
    }
    return this.api.completeSetup(payload);
  }

  /**
   * Stage 3: Authenticate user.
   */
  public async login(payload: LoginPayload): Promise<IpcResponse<AuthSessionDto>> {
    if (!this.api) {
      return {
        success: false,
        error: {
          code: 'NO_ELECTRON_BRIDGE',
          messageMr: 'Electron ब्रिज उपलब्ध नाही',
          messageEn: 'Electron bridge is not available',
        },
      };
    }
    return this.api.login(payload);
  }

  /**
   * Stage 3: Log out active session.
   */
  public async logout(): Promise<IpcResponse<{ success: boolean }>> {
    if (!this.api) {
      return { success: true, data: { success: true } };
    }
    return this.api.logout();
  }

  /**
   * Stage 3: Get current authenticated session.
   */
  public async getSession(): Promise<IpcResponse<AuthSessionDto | null>> {
    if (!this.api) {
      return { success: true, data: null };
    }
    return this.api.getSession();
  }

  /**
   * Stage 3: Get dairy centre profile summary.
   */
  public async getProfile(): Promise<IpcResponse<DairyProfileSummary>> {
    if (!this.api) {
      return {
        success: false,
        error: {
          code: 'NO_ELECTRON_BRIDGE',
          messageMr: 'Electron ब्रिज उपलब्ध नाही',
          messageEn: 'Electron bridge is not available',
        },
      };
    }
    return this.api.getProfile();
  }

  // ============================================================================
  // Stage 4: Farmers Bridge Methods
  // ============================================================================

  public readonly farmers = {
    list: async (filter?: FarmerFilter): Promise<IpcResponse<FarmerListDto[]>> => {
      if (!this.api?.farmers) {
        return {
          success: false,
          error: {
            code: 'NO_ELECTRON_BRIDGE',
            messageMr: 'Electron ब्रिज उपलब्ध नाही',
            messageEn: 'Electron bridge is not available',
          },
        };
      }
      return this.api.farmers.list(filter);
    },

    getById: async (id: number): Promise<IpcResponse<FarmerListDto>> => {
      if (!this.api?.farmers) {
        return {
          success: false,
          error: {
            code: 'NO_ELECTRON_BRIDGE',
            messageMr: 'Electron ब्रिज उपलब्ध नाही',
            messageEn: 'Electron bridge is not available',
          },
        };
      }
      return this.api.farmers.getById(id);
    },

    getByCode: async (
      code: string,
      activeOnly?: boolean
    ): Promise<IpcResponse<FarmerListDto>> => {
      if (!this.api?.farmers) {
        return {
          success: false,
          error: {
            code: 'NO_ELECTRON_BRIDGE',
            messageMr: 'Electron ब्रिज उपलब्ध नाही',
            messageEn: 'Electron bridge is not available',
          },
        };
      }
      return this.api.farmers.getByCode(code, activeOnly);
    },

    getEditDetail: async (id: number): Promise<IpcResponse<FarmerDetailDto>> => {
      if (!this.api?.farmers) {
        return {
          success: false,
          error: {
            code: 'NO_ELECTRON_BRIDGE',
            messageMr: 'Electron ब्रिज उपलब्ध नाही',
            messageEn: 'Electron bridge is not available',
          },
        };
      }
      return this.api.farmers.getEditDetail(id);
    },

    create: async (payload: CreateFarmerPayload): Promise<IpcResponse<FarmerListDto>> => {
      if (!this.api?.farmers) {
        return {
          success: false,
          error: {
            code: 'NO_ELECTRON_BRIDGE',
            messageMr: 'Electron ब्रिज उपलब्ध नाही',
            messageEn: 'Electron bridge is not available',
          },
        };
      }
      return this.api.farmers.create(payload);
    },

    update: async (
      id: number,
      payload: UpdateFarmerPayload
    ): Promise<IpcResponse<FarmerListDto>> => {
      if (!this.api?.farmers) {
        return {
          success: false,
          error: {
            code: 'NO_ELECTRON_BRIDGE',
            messageMr: 'Electron ब्रिज उपलब्ध नाही',
            messageEn: 'Electron bridge is not available',
          },
        };
      }
      return this.api.farmers.update(id, payload);
    },

    deactivate: async (
      id: number,
      payload?: DeactivateFarmerPayload
    ): Promise<IpcResponse<FarmerListDto>> => {
      if (!this.api?.farmers) {
        return {
          success: false,
          error: {
            code: 'NO_ELECTRON_BRIDGE',
            messageMr: 'Electron ब्रिज उपलब्ध नाही',
            messageEn: 'Electron bridge is not available',
          },
        };
      }
      return this.api.farmers.deactivate(id, payload);
    },

    reactivate: async (id: number): Promise<IpcResponse<FarmerListDto>> => {
      if (!this.api?.farmers) {
        return {
          success: false,
          error: {
            code: 'NO_ELECTRON_BRIDGE',
            messageMr: 'Electron ब्रिज उपलब्ध नाही',
            messageEn: 'Electron bridge is not available',
          },
        };
      }
      return this.api.farmers.reactivate(id);
    },
  };
}
