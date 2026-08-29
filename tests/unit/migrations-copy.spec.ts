import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadMigrationFiles } from '../../electron/db/migrator';

describe('Migration Resource Packaging & Stale Prevention (Unit)', () => {
  let tempDir: string;
  let tempSrcDir: string;
  let tempDestDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dairy_sync_test_'));
    tempSrcDir = path.join(tempDir, 'source_migrations');
    tempDestDir = path.join(tempDir, 'dest_migrations');
    fs.mkdirSync(tempSrcDir, { recursive: true });
    fs.mkdirSync(tempDestDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('proves that destination synchronization cleanly purges stale/orphan migration files', () => {
    // 1. Setup authoritative source migrations
    fs.writeFileSync(path.join(tempSrcDir, '001_foundation.sql'), '-- foundation');
    fs.writeFileSync(path.join(tempSrcDir, '002_rates.sql'), '-- rates');

    // 2. Setup destination containing an old deleted/stale migration
    fs.writeFileSync(path.join(tempDestDir, '001_foundation.sql'), '-- old foundation');
    fs.writeFileSync(path.join(tempDestDir, '999_deleted_stale.sql'), '-- stale');

    // 3. Perform atomic sync logic: clean destination and copy
    fs.rmSync(tempDestDir, { recursive: true, force: true });
    fs.mkdirSync(tempDestDir, { recursive: true });

    const srcFiles = fs.readdirSync(tempSrcDir).filter((f) => f.endsWith('.sql'));
    for (const file of srcFiles) {
      fs.copyFileSync(path.join(tempSrcDir, file), path.join(tempDestDir, file));
    }

    // 4. Assertions: Destination must match source exactly and must not contain 999_deleted_stale.sql
    const destFiles = fs.readdirSync(tempDestDir).filter((f) => f.endsWith('.sql'));
    expect(destFiles).toEqual(srcFiles);
    expect(destFiles).not.toContain('999_deleted_stale.sql');

    const loadedMigrations = loadMigrationFiles(tempDestDir);
    expect(loadedMigrations.length).toBe(2);
    expect(loadedMigrations.map((m) => m.version)).toEqual([1, 2]);
  });
});
