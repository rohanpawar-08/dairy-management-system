import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { createVerifiedBackup } from '../services/backup.service';

export interface MigrationFile {
  version: number;
  name: string;
  filename: string;
  filePath: string;
}

export interface AppliedMigration {
  version: number;
  name: string;
  applied_at: string;
}

export interface MigrationResult {
  appliedCount: number;
  appliedMigrations: {
    version: number;
    name: string;
    appliedAt: string;
  }[];
  totalVersion: number;
}

export interface RunMigrationOptions {
  customMigrationsDir?: string;
  backupDir?: string;
  skipPreMigrationBackup?: boolean;
}

const MIGRATION_FILE_PATTERN = /^(\d{3})_([\w-]+)\.sql$/;

/**
 * Resolve the directory containing SQL migration files across dev, test, and packaged runtimes.
 */
export function resolveMigrationsDirectory(customDir?: string): string {
  if (customDir && fs.existsSync(customDir)) {
    return customDir;
  }

  const candidates: string[] = [
    // 1. Relative to __dirname (common in compiled JS: dist-electron/electron/db/migrations)
    path.join(__dirname, 'migrations'),
    // 2. Relative to dist-electron
    path.join(__dirname, '..', 'db', 'migrations'),
    // 3. From project root (development / testing runtime)
    path.join(process.cwd(), 'electron', 'db', 'migrations'),
    // 4. In compiled dist-electron
    path.join(process.cwd(), 'dist-electron', 'electron', 'db', 'migrations'),
  ];

  // Try electron app.getAppPath() if available
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron');
    if (app && typeof app.getAppPath === 'function') {
      const appPath = app.getAppPath();
      candidates.unshift(
        path.join(appPath, 'dist-electron', 'electron', 'db', 'migrations'),
        path.join(appPath, 'electron', 'db', 'migrations')
      );
    }
  } catch {
    // Non-electron runtime
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Migrations directory could not be located. Checked candidates:\n${candidates.join('\n')}`
  );
}

/**
 * Load and validate all SQL migration files in the migrations directory.
 */
export function loadMigrationFiles(migrationsDir: string): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory does not exist: ${migrationsDir}`);
  }

  const files = fs.readdirSync(migrationsDir);
  const migrations: MigrationFile[] = [];
  const versionSet = new Set<number>();

  for (const file of files) {
    // Ignore non-sql files (e.g. .gitkeep, .DS_Store, README)
    if (!file.endsWith('.sql')) {
      continue;
    }

    const match = file.match(MIGRATION_FILE_PATTERN);
    if (!match) {
      throw new Error(
        `Malformed migration filename '${file}'. Migrations must follow the format '001_name.sql'.`
      );
    }

    const version = parseInt(match[1], 10);
    const name = match[2];

    if (versionSet.has(version)) {
      throw new Error(`Duplicate migration version detected: ${version} (${file})`);
    }

    versionSet.add(version);
    migrations.push({
      version,
      name,
      filename: file,
      filePath: path.join(migrationsDir, file),
    });
  }

  // Sort numerically ascending
  migrations.sort((a, b) => a.version - b.version);

  return migrations;
}

/**
 * Ensure the schema_migrations tracking table exists.
 */
export function ensureSchemaMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Fetch all previously applied migrations from the database.
 */
export function getAppliedMigrations(db: Database.Database): AppliedMigration[] {
  ensureSchemaMigrationsTable(db);
  const rows = db
    .prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC')
    .all() as AppliedMigration[];
  return rows;
}

/**
 * Get current maximum applied migration version.
 */
export function getCurrentMigrationVersion(db: Database.Database): number {
  ensureSchemaMigrationsTable(db);
  const row = db
    .prepare('SELECT MAX(version) as max_version FROM schema_migrations')
    .get() as { max_version: number | null };
  return row?.max_version ?? 0;
}

/**
 * Execute pending migrations sequentially inside atomic transactions with PRE_MIGRATION backup.
 */
export async function runMigrationsAsync(
  db: Database.Database,
  options: RunMigrationOptions = {}
): Promise<MigrationResult> {
  const migrationsDir = resolveMigrationsDirectory(options.customMigrationsDir);
  const availableMigrations = loadMigrationFiles(migrationsDir);

  ensureSchemaMigrationsTable(db);
  const appliedMigrations = getAppliedMigrations(db);
  const appliedMap = new Map<number, AppliedMigration>();
  for (const m of appliedMigrations) {
    appliedMap.set(m.version, m);
  }

  // Validate applied migrations against available files
  for (const migration of availableMigrations) {
    const applied = appliedMap.get(migration.version);
    if (applied && applied.name !== migration.name) {
      throw new Error(
        `Migration integrity mismatch for version ${migration.version}. ` +
          `Recorded name: '${applied.name}', File name: '${migration.name}'. ` +
          `Applied migrations must never be renamed or edited.`
      );
    }
  }

  const pendingMigrations = availableMigrations.filter((m) => !appliedMap.has(m.version));
  const currentVersion = getCurrentMigrationVersion(db);

  // If there are pending migrations on an existing initialized database (version > 0),
  // a PRE_MIGRATION backup MUST be created and verified before applying any migrations.
  if (currentVersion > 0 && pendingMigrations.length > 0 && !options.skipPreMigrationBackup) {
    try {
      await createVerifiedBackup(db, {
        triggerType: 'PRE_MIGRATION',
        destinationDir: options.backupDir,
        customFilenamePrefix: 'pre_migration',
      });
    } catch (backupErr) {
      throw new Error(
        `Migration aborted: PRE_MIGRATION backup failed or could not be verified: ${
          backupErr instanceof Error ? backupErr.message : String(backupErr)
        }`
      );
    }
  }

  const result: MigrationResult = {
    appliedCount: 0,
    appliedMigrations: [],
    totalVersion: currentVersion,
  };

  for (const migration of availableMigrations) {
    if (appliedMap.has(migration.version)) {
      continue; // Already applied
    }

    const sqlContent = fs.readFileSync(migration.filePath, 'utf8');
    const appliedAt = new Date().toISOString();

    // Execute migration and recording inside a single atomic transaction
    const executeTx = db.transaction(() => {
      db.exec(sqlContent);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
      ).run(migration.version, migration.name, appliedAt);
    });

    try {
      executeTx();
    } catch (err) {
      throw new Error(
        `Failed to apply migration ${migration.filename}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    result.appliedCount++;
    result.appliedMigrations.push({
      version: migration.version,
      name: migration.name,
      appliedAt,
    });
    result.totalVersion = migration.version;
  }

  return result;
}

/**
 * Synchronous migration runner for backwards-compatibility and synchronous test contexts.
 */
export function runMigrations(
  db: Database.Database,
  customMigrationsDir?: string
): MigrationResult {
  const migrationsDir = resolveMigrationsDirectory(customMigrationsDir);
  const availableMigrations = loadMigrationFiles(migrationsDir);

  ensureSchemaMigrationsTable(db);
  const appliedMigrations = getAppliedMigrations(db);
  const appliedMap = new Map<number, AppliedMigration>();
  for (const m of appliedMigrations) {
    appliedMap.set(m.version, m);
  }

  // Validate applied migrations against available files
  for (const migration of availableMigrations) {
    const applied = appliedMap.get(migration.version);
    if (applied && applied.name !== migration.name) {
      throw new Error(
        `Migration integrity mismatch for version ${migration.version}. ` +
          `Recorded name: '${applied.name}', File name: '${migration.name}'. ` +
          `Applied migrations must never be renamed or edited.`
      );
    }
  }

  const result: MigrationResult = {
    appliedCount: 0,
    appliedMigrations: [],
    totalVersion: getCurrentMigrationVersion(db),
  };

  for (const migration of availableMigrations) {
    if (appliedMap.has(migration.version)) {
      continue; // Already applied
    }

    const sqlContent = fs.readFileSync(migration.filePath, 'utf8');
    const appliedAt = new Date().toISOString();

    // Execute migration and recording inside a single atomic transaction
    const executeTx = db.transaction(() => {
      db.exec(sqlContent);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
      ).run(migration.version, migration.name, appliedAt);
    });

    try {
      executeTx();
    } catch (err) {
      throw new Error(
        `Failed to apply migration ${migration.filename}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    result.appliedCount++;
    result.appliedMigrations.push({
      version: migration.version,
      name: migration.name,
      appliedAt,
    });
    result.totalVersion = migration.version;
  }

  return result;
}
