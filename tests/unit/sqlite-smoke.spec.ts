import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';

describe('better-sqlite3 Native Smoke Test', () => {
  it('should open in-memory database, execute deterministic query, and read SQLite version', () => {
    const db = new Database(':memory:');

    try {
      // 1. Deterministic query
      const queryRow = db.prepare('SELECT 1 AS num').get() as { num: number };
      expect(queryRow).toBeDefined();
      expect(queryRow.num).toBe(1);

      // 2. Version detection
      const versionRow = db.prepare('SELECT sqlite_version() AS version').get() as { version: string };
      expect(versionRow).toBeDefined();
      expect(typeof versionRow.version).toBe('string');
      expect(versionRow.version.length).toBeGreaterThan(0);

      // 3. Mathematical precision check in SQLite
      const mathRow = db.prepare('SELECT 100 * 100 AS paise').get() as { paise: number };
      expect(mathRow.paise).toBe(10000);
    } finally {
      db.close();
    }
  });
});
