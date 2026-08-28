import { contextBridge, ipcRenderer } from 'electron';
import type {
  DairyApiBridge,
  IpcResponse,
  PingResult,
  SqliteSmokeResult,
  AppVersionInfo,
} from '../shared/ipc-contracts';

// Inlined channel constants so preload is completely self-contained in sandboxed renderer
const CHANNELS = {
  PING: 'dairy:ping',
  SQLITE_SMOKE: 'dairy:sqlite-smoke',
  APP_VERSION: 'dairy:app-version',
} as const;

/**
 * Preload Script exposing the allowlisted `window.dairyApi` bridge.
 * Renderer isolation is strictly maintained: no Node.js APIs or raw ipcRenderer methods are exposed.
 */
const dairyApi: DairyApiBridge = {
  ping: (): Promise<IpcResponse<PingResult>> => {
    return ipcRenderer.invoke(CHANNELS.PING);
  },

  smokeSqlite: (): Promise<IpcResponse<SqliteSmokeResult>> => {
    return ipcRenderer.invoke(CHANNELS.SQLITE_SMOKE);
  },

  getAppVersion: (): Promise<IpcResponse<AppVersionInfo>> => {
    return ipcRenderer.invoke(CHANNELS.APP_VERSION);
  },
};

// Safely expose `dairyApi` to renderer context
contextBridge.exposeInMainWorld('dairyApi', dairyApi);
