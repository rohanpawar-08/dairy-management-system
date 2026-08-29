import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export interface DatabaseConnectionOptions {
  dbPath?: string;
  readonly?: boolean;
  fileMustExist?: boolean;
  verbose?: (message?: unknown, ...additionalArgs: unknown[]) => void;
}

export interface PragmaVerificationResult {
  foreignKeys: number;
  journalMode: string;
  synchronous: number;
  busyTimeout: number;
}

let activeConnection: Database.Database | null = null;
let activeDbPath: string | null = null;

/**
 * Configure and verify database durability and integrity pragmas.
 */
export function applyAndVerifyPragmas(db: Database.Database): PragmaVerificationResult {
  // Apply durability & safety pragmas
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('busy_timeout = 5000');

  // Verify foreign_keys
  const fkRow = db.pragma('foreign_keys', { simple: true }) as number;
  if (fkRow !== 1) {
    throw new Error(`Failed to enable foreign_keys pragma. Expected 1, got ${fkRow}`);
  }

  // Verify journal_mode
  const jmRow = db.pragma('journal_mode', { simple: true }) as string;
  if (String(jmRow).toLowerCase() !== 'wal') {
    throw new Error(`Failed to enable WAL journal_mode. Expected 'wal', got '${jmRow}'`);
  }

  // Verify synchronous mode (FULL is 2 in SQLite)
  const syncRow = db.pragma('synchronous', { simple: true }) as number;
  if (syncRow !== 2) {
    throw new Error(`Failed to enable FULL synchronous mode. Expected 2 (FULL), got ${syncRow}`);
  }

  // Verify busy_timeout
  const timeoutRow = db.pragma('busy_timeout', { simple: true }) as number;

  return {
    foreignKeys: fkRow,
    journalMode: String(jmRow).toLowerCase(),
    synchronous: syncRow,
    busyTimeout: timeoutRow,
  };
}

/**
 * Initialize or retrieve the authoritative SQLite database connection.
 */
export function initDatabaseConnection(options: DatabaseConnectionOptions = {}): Database.Database {
  if (activeConnection) {
    return activeConnection;
  }

  const targetPath = options.dbPath || getDefaultDatabasePath();
  const dir = path.dirname(targetPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(targetPath, {
    readonly: options.readonly ?? false,
    fileMustExist: options.fileMustExist ?? false,
    verbose: options.verbose,
  });

  try {
    applyAndVerifyPragmas(db);
  } catch (err) {
    db.close();
    throw err;
  }

  activeConnection = db;
  activeDbPath = targetPath;
  return db;
}

/**
 * Get the currently active database connection, throwing if not initialized.
 */
export function getDatabaseConnection(): Database.Database {
  if (!activeConnection) {
    throw new Error('Database connection has not been initialized. Call initDatabaseConnection() first.');
  }
  return activeConnection;
}

/**
 * Get the path of the currently active database.
 */
export function getActiveDatabasePath(): string | null {
  return activeDbPath;
}

/**
 * Cleanly close the active database connection.
 */
export function closeDatabaseConnection(): void {
  if (activeConnection) {
    try {
      if (activeConnection.open) {
        activeConnection.close();
      }
    } finally {
      activeConnection = null;
      activeDbPath = null;
    }
  }
}

/**
 * Resolve the default database path using Electron app userData or fallback.
 */
export function getDefaultDatabasePath(): string {
  try {
    // Dynamic require so module can be imported in Node test runner without Electron runtime
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'dairy_data.db');
    }
  } catch {
    // Non-electron environment fallback
  }

  return path.resolve(process.cwd(), 'data', 'dairy_data.db');
}
