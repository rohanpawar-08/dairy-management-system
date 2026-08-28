import { app, ipcMain } from 'electron';
import Database from 'better-sqlite3';
import {
  IPC_CHANNELS,
  IpcResponse,
  PingResult,
  SqliteSmokeResult,
  AppVersionInfo,
} from '../../shared/ipc-contracts';

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

  // 2. In-Memory SQLite Smoke Query Handler
  ipcMain.handle(IPC_CHANNELS.SQLITE_SMOKE, async (): Promise<IpcResponse<SqliteSmokeResult>> => {
    let db: Database.Database | null = null;
    try {
      // Open in-memory SQLite database
      db = new Database(':memory:');

      // Execute deterministic query SELECT 1
      const queryRow = db.prepare('SELECT 1 AS num').get() as { num: number } | undefined;

      // Read SQLite library version
      const versionRow = db.prepare('SELECT sqlite_version() AS version').get() as { version: string } | undefined;

      if (!queryRow || queryRow.num !== 1 || !versionRow?.version) {
        throw new Error('SQLite query returned unexpected or empty result');
      }

      const result: SqliteSmokeResult = {
        ok: true,
        version: versionRow.version,
        queryResult: queryRow.num,
        database: ':memory:',
        timestamp: new Date().toISOString(),
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
}
