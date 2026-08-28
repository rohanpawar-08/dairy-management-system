import { Injectable } from '@angular/core';
import {
  DairyApiBridge,
  IpcResponse,
  PingResult,
  SqliteSmokeResult,
  AppVersionInfo,
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
}
