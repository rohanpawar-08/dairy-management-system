/**
 * Unified response envelope for all IPC communication.
 */
export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    messageMr: string;
    messageEn: string;
    details?: unknown;
  };
}

/**
 * Result payload from the in-memory SQLite smoke test query.
 */
export interface SqliteSmokeResult {
  ok: boolean;
  version: string;
  queryResult: number;
  database: string;
  timestamp: string;
}

/**
 * Result payload from the IPC ping round trip.
 */
export interface PingResult {
  message: string;
  timestamp: string;
  processType: string;
}

/**
 * Application version metadata.
 */
export interface AppVersionInfo {
  version: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  platform: string;
}

/**
 * Strictly allowlisted IPC Channel Identifiers.
 */
export const IPC_CHANNELS = {
  PING: 'dairy:ping',
  SQLITE_SMOKE: 'dairy:sqlite-smoke',
  APP_VERSION: 'dairy:app-version',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

/**
 * Strongly typed interface for the preload bridge exposed on `window.dairyApi`.
 */
export interface DairyApiBridge {
  ping: () => Promise<IpcResponse<PingResult>>;
  smokeSqlite: () => Promise<IpcResponse<SqliteSmokeResult>>;
  getAppVersion: () => Promise<IpcResponse<AppVersionInfo>>;
}
