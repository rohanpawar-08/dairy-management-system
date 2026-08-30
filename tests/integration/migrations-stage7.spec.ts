import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../electron/db/migrator';

describe('Migration 005 Stage 7 Integration Tests', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);

    const nowIso = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, username, full_name, role, password_hash, is_active, created_at, updated_at)
       VALUES (1, 'owner1', 'Owner User', 'OWNER', 'hash', 1, ?, ?)`
    ).run(nowIso, nowIso);

    db.prepare(
      `INSERT INTO farmers (id, member_code, name_mr, default_milk_type, is_active, created_at, updated_at)
       VALUES (1, 'F101', 'रमेश पवार', 'BOTH', 1, ?, ?)`
    ).run(nowIso, nowIso);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  it('should apply Migration 005 and set schema user_version to 5 or higher', () => {
    const versionRow = db.pragma('user_version', { simple: true }) as number;
    expect(versionRow).toBeGreaterThanOrEqual(5);
  });

  it('should have at least 12 domain tables in SQLite master schema', () => {
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master 
         WHERE type='table' 
           AND name NOT LIKE 'sqlite_%' 
         ORDER BY name ASC`
      )
      .all() as { name: string }[];

    expect(tables.length).toBeGreaterThanOrEqual(12);
    const names = tables.map((t) => t.name);
    expect(names).toContain('adjustments_and_deductions');
  });

  // 1 & 2: Empty or whitespace-only reference_number
  it('should reject empty or whitespace-only reference_number', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO adjustments_and_deductions (
          reference_number, farmer_id, business_date, entry_type, category, amount_paise, reason, status, created_by_user_id
        ) VALUES ('', 1, '2026-08-30', 'DEDUCTION', 'CATTLE_FEED', 50000, 'Reason', 'ACTIVE', 1)`
      ).run();
    }).toThrow();

    expect(() => {
      db.prepare(
        `INSERT INTO adjustments_and_deductions (
          reference_number, farmer_id, business_date, entry_type, category, amount_paise, reason, status, created_by_user_id
        ) VALUES ('   ', 1, '2026-08-30', 'DEDUCTION', 'CATTLE_FEED', 50000, 'Reason', 'ACTIVE', 1)`
      ).run();
    }).toThrow();
  });

  // 3 & 4: Empty or whitespace-only reason
  it('should reject empty or whitespace-only reason', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO adjustments_and_deductions (
          reference_number, farmer_id, business_date, entry_type, category, amount_paise, reason, status, created_by_user_id
        ) VALUES ('ADJ-001', 1, '2026-08-30', 'DEDUCTION', 'CATTLE_FEED', 50000, '', 'ACTIVE', 1)`
      ).run();
    }).toThrow();

    expect(() => {
      db.prepare(
        `INSERT INTO adjustments_and_deductions (
          reference_number, farmer_id, business_date, entry_type, category, amount_paise, reason, status, created_by_user_id
        ) VALUES ('ADJ-001', 1, '2026-08-30', 'DEDUCTION', 'CATTLE_FEED', 50000, '   ', 'ACTIVE', 1)`
      ).run();
    }).toThrow();
  });

  // 5 & 6: Malformed and non-canonical business_date
  it('should reject malformed and non-canonical business_date values', () => {
    // Malformed format (DD-MM-YYYY)
    expect(() => {
      db.prepare(
        `INSERT INTO adjustments_and_deductions (
          reference_number, farmer_id, business_date, entry_type, category, amount_paise, reason, status, created_by_user_id
        ) VALUES ('ADJ-001', 1, '30-08-2026', 'DEDUCTION', 'CATTLE_FEED', 50000, 'Reason', 'ACTIVE', 1)`
      ).run();
    }).toThrow();

    // Impossible/non-canonical date 2026-02-31
    expect(() => {
      db.prepare(
        `INSERT INTO adjustments_and_deductions (
          reference_number, farmer_id, business_date, entry_type, category, amount_paise, reason, status, created_by_user_id
        ) VALUES ('ADJ-001', 1, '2026-02-31', 'DEDUCTION', 'CATTLE_FEED', 50000, 'Reason', 'ACTIVE', 1)`
      ).run();
    }).toThrow();

    // Impossible/non-canonical date 2026-99-99
    expect(() => {
      db.prepare(
        `INSERT INTO adjustments_and_deductions (
          reference_number, farmer_id, business_date, entry_type, category, amount_paise, reason, status, created_by_user_id
        ) VALUES ('ADJ-001', 1, '2026-99-99', 'DEDUCTION', 'CATTLE_FEED', 50000, 'Reason', 'ACTIVE', 1)`
      ).run();
    }).toThrow();

    // Impossible/non-canonical date 2026-00-10
    expect(() => {
      db.prepare(
        `INSERT INTO adjustments_and_deductions (
          reference_number, farmer_id, business_date, entry_type, category, amount_paise, reason, status, created_by_user_id
        ) VALUES ('ADJ-001', 1, '2026-00-10', 'DEDUCTION', 'CATTLE_FEED', 50000, 'Reason', 'ACTIVE', 1)`
      ).run();
    }).toThrow();

    // Impossible/non-canonical date 2026-12-00
    expect(() => {
      db.prepare(
        `INSERT INTO adjustments_and_deductions (
          reference_number, farmer_id, business_date, entry_type, category, amount_paise, reason, status, created_by_user_id
        ) VALUES ('ADJ-001', 1, '2026-12-00', 'DEDUCTION', 'CATTLE_FEED', 50000, 'Reason', 'ACTIVE', 1)`
      ).run();
    }).toThrow();
  });

  // 7 & 8: ACTIVE with void metadata AND VOIDED without complete valid void metadata
  it('should enforce status and void metadata invariant on insert/update', () => {
    // ACTIVE record with voided_at
    expect(() => {
      db.prepare(
        `INSERT INTO adjustments_and_deductions (
          reference_number, farmer_id, business_date, entry_type, category, amount_paise, reason, status, created_by_user_id, voided_at
        ) VALUES ('ADJ-001', 1, '2026-08-30', 'DEDUCTION', 'CATTLE_FEED', 50000, 'Reason', 'ACTIVE', 1, '2026-08-30T10:00:00Z')`
      ).run();
    }).toThrow();

    // VOIDED record without void_reason or voided_by_user_id
    expect(() => {
      db.prepare(
        `INSERT INTO adjustments_and_deductions (
          reference_number, farmer_id, business_date, entry_type, category, amount_paise, reason, status, created_by_user_id, voided_at
        ) VALUES ('ADJ-001', 1, '2026-08-30', 'DEDUCTION', 'CATTLE_FEED', 50000, 'Reason', 'VOIDED', 1, '2026-08-30T10:00:00Z')`
      ).run();
    }).toThrow();
  });

  it('should reject invalid, empty, or whitespace-only voided_at timestamps on voiding', () => {
    db.prepare(
      `INSERT INTO adjustments_and_deductions (
        reference_number, farmer_id, business_date, entry_type, category, amount_paise, reason, status, created_by_user_id
      ) VALUES ('ADJ-001', 1, '2026-08-30', 'DEDUCTION', 'CATTLE_FEED', 50000, 'Reason', 'ACTIVE', 1)`
    ).run();

    // Voiding with empty voided_at ''
    expect(() => {
      db.prepare(
        `UPDATE adjustments_and_deductions 
         SET status = 'VOIDED', voided_by_user_id = 1, void_reason = 'Valid reason', voided_at = ''
         WHERE id = 1`
      ).run();
    }).toThrow();

    // Voiding with whitespace-only voided_at '   '
    expect(() => {
      db.prepare(
        `UPDATE adjustments_and_deductions 
         SET status = 'VOIDED', voided_by_user_id = 1, void_reason = 'Valid reason', voided_at = '   '
         WHERE id = 1`
      ).run();
    }).toThrow();

    // Voiding with invalid timestamp 'not-a-timestamp'
    expect(() => {
      db.prepare(
        `UPDATE adjustments_and_deductions 
         SET status = 'VOIDED', voided_by_user_id = 1, void_reason = 'Valid reason', voided_at = 'not-a-timestamp'
         WHERE id = 1`
      ).run();
    }).toThrow();
  });

  // 9, 10, 11: Status transitions (ACTIVE->ACTIVE, VOIDED->ACTIVE, VOIDED->VOIDED)
  it('should reject ACTIVE -> ACTIVE, VOIDED -> ACTIVE, and VOIDED -> VOIDED updates', () => {
    db.prepare(
      `INSERT INTO adjustments_and_deductions (
        reference_number, farmer_id, business_date, entry_type, category, amount_paise, reason, status, created_by_user_id
      ) VALUES ('ADJ-001', 1, '2026-08-30', 'DEDUCTION', 'CATTLE_FEED', 50000, 'Reason', 'ACTIVE', 1)`
    ).run();

    // ACTIVE -> ACTIVE update (no status change)
    expect(() => {
      db.prepare("UPDATE adjustments_and_deductions SET notes = 'New Note' WHERE id = 1").run();
    }).toThrow(/prohibited/i);

    // Perform valid ACTIVE -> VOIDED
    db.prepare(
      `UPDATE adjustments_and_deductions 
       SET status = 'VOIDED', voided_by_user_id = 1, void_reason = 'Valid void', voided_at = '2026-08-30T10:00:00Z'
       WHERE id = 1`
    ).run();

    // VOIDED -> ACTIVE update
    expect(() => {
      db.prepare("UPDATE adjustments_and_deductions SET status = 'ACTIVE' WHERE id = 1").run();
    }).toThrow(/immutable/i);

    // VOIDED -> VOIDED update
    expect(() => {
      db.prepare("UPDATE adjustments_and_deductions SET void_reason = 'Updated void reason' WHERE id = 1").run();
    }).toThrow(/immutable/i);
  });

  // 12, 13, 14: Changing void reason, void timestamp, or voiding user after voiding
  it('should reject modifying void metadata after an adjustment is VOIDED', () => {
    db.prepare(
      `INSERT INTO adjustments_and_deductions (
        reference_number, farmer_id, business_date, entry_type, category, amount_paise, reason, status, created_by_user_id
      ) VALUES ('ADJ-001', 1, '2026-08-30', 'DEDUCTION', 'CATTLE_FEED', 50000, 'Reason', 'ACTIVE', 1)`
    ).run();

    db.prepare(
      `UPDATE adjustments_and_deductions 
       SET status = 'VOIDED', voided_by_user_id = 1, void_reason = 'Original void reason', voided_at = '2026-08-30T10:00:00Z'
       WHERE id = 1`
    ).run();

    // Changing void_reason
    expect(() => {
      db.prepare("UPDATE adjustments_and_deductions SET void_reason = 'New reason' WHERE id = 1").run();
    }).toThrow(/immutable/i);

    // Changing voided_at
    expect(() => {
      db.prepare("UPDATE adjustments_and_deductions SET voided_at = '2026-08-30T11:00:00Z' WHERE id = 1").run();
    }).toThrow(/immutable/i);

    // Changing voided_by_user_id
    expect(() => {
      db.prepare("UPDATE adjustments_and_deductions SET voided_by_user_id = 2 WHERE id = 1").run();
    }).toThrow(/immutable/i);
  });

  // 15, 16, 17: Changing ID, changing immutable financial fields, hard deletion
  it('should reject changing ID, immutable fields, or executing hard deletion', () => {
    db.prepare(
      `INSERT INTO adjustments_and_deductions (
        reference_number, farmer_id, business_date, entry_type, category, amount_paise, reason, status, created_by_user_id
      ) VALUES ('ADJ-001', 1, '2026-08-30', 'DEDUCTION', 'CATTLE_FEED', 50000, 'Reason', 'ACTIVE', 1)`
    ).run();

    // Changing ID
    expect(() => {
      db.prepare('UPDATE adjustments_and_deductions SET id = 99 WHERE id = 1').run();
    }).toThrow(/prohibited|immutable/i);

    // Changing amount_paise
    expect(() => {
      db.prepare('UPDATE adjustments_and_deductions SET amount_paise = 99999 WHERE id = 1').run();
    }).toThrow(/prohibited|immutable/i);

    // Changing farmer_id
    expect(() => {
      db.prepare('UPDATE adjustments_and_deductions SET farmer_id = 2 WHERE id = 1').run();
    }).toThrow(/prohibited|immutable/i);

    // Hard deletion
    expect(() => {
      db.prepare('DELETE FROM adjustments_and_deductions WHERE id = 1').run();
    }).toThrow(/prohibited/i);
  });
});
