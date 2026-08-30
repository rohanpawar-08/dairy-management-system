import Database from 'better-sqlite3';
import {
  FarmerFilter,
  FarmerMilkType,
} from '../../shared/ipc-contracts';

/**
 * Raw SQLite database row for farmers table.
 */
export interface FarmerRow {
  id: number;
  member_code: string;
  name_mr: string;
  name_en: string | null;
  phone: string | null;
  village: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  upi_id: string | null;
  default_milk_type: FarmerMilkType;
  opening_balance_paise: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface InsertFarmerParams {
  memberCode: string;
  nameMr: string;
  nameEn?: string | null;
  phone?: string | null;
  village?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankName?: string | null;
  upiId?: string | null;
  defaultMilkType: FarmerMilkType;
  openingBalancePaise: number;
  nowIso: string;
}

export interface UpdateFarmerParams {
  id: number;
  memberCode: string;
  nameMr: string;
  nameEn?: string | null;
  phone?: string | null;
  village?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankName?: string | null;
  upiId?: string | null;
  defaultMilkType: FarmerMilkType;
  openingBalancePaise: number;
  nowIso: string;
}

/**
 * Escape SQL LIKE special characters (% and _) using standard backslash escape.
 */
export function escapeSqlLike(text: string): string {
  return text.replace(/([%_\\])/g, '\\$1');
}

/**
 * Stage 4: Authoritative Farmer Repository
 *
 * Enforces strictly parameterized SQL queries. Zero hard-delete methods.
 */
export class FarmerRepository {
  /**
   * Search and filter farmers with deterministic ordering and wildcard escaping.
   */
  listFarmers(db: Database.Database, filter: FarmerFilter = {}): FarmerRow[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    // Status filter
    if (filter.status === 'ACTIVE' || !filter.status) {
      conditions.push('is_active = 1');
    } else if (filter.status === 'INACTIVE') {
      conditions.push('is_active = 0');
    }
    // 'ALL' has no is_active condition

    // Milk type filter
    if (filter.milkType && filter.milkType !== 'ALL') {
      conditions.push('default_milk_type = ?');
      params.push(filter.milkType);
    }

    // Search filter across member_code, name_mr, name_en, and phone
    if (filter.search && filter.search.trim().length > 0) {
      const searchPattern = `%${escapeSqlLike(filter.search.trim())}%`;
      conditions.push(
        `(member_code LIKE ? ESCAPE '\\' OR name_mr LIKE ? ESCAPE '\\' OR name_en LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')`
      );
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filter.limit ?? 500, 1), 1000);
    const offset = Math.max(filter.offset ?? 0, 0);

    const sql = `
      SELECT * FROM farmers
      ${whereClause}
      ORDER BY is_active DESC, member_code ASC, id ASC
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    return db.prepare(sql).all(...params) as FarmerRow[];
  }

  /**
   * Retrieve a single farmer by ID.
   */
  getById(db: Database.Database, id: number): FarmerRow | undefined {
    return db.prepare('SELECT * FROM farmers WHERE id = ?').get(id) as
      | FarmerRow
      | undefined;
  }

  /**
   * Retrieve a single farmer by member code (case-insensitive).
   */
  getByMemberCode(
    db: Database.Database,
    memberCode: string,
    activeOnly = false
  ): FarmerRow | undefined {
    const trimmed = memberCode.trim();
    if (activeOnly) {
      return db
        .prepare('SELECT * FROM farmers WHERE member_code = ? AND is_active = 1')
        .get(trimmed) as FarmerRow | undefined;
    }
    return db
      .prepare('SELECT * FROM farmers WHERE member_code = ?')
      .get(trimmed) as FarmerRow | undefined;
  }

  /**
   * Insert a new farmer record.
   */
  insertFarmer(db: Database.Database, params: InsertFarmerParams): number {
    const stmt = db.prepare(`
      INSERT INTO farmers (
        member_code,
        name_mr,
        name_en,
        phone,
        village,
        bank_account_number,
        bank_ifsc,
        bank_name,
        upi_id,
        default_milk_type,
        opening_balance_paise,
        is_active,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    const result = stmt.run(
      params.memberCode,
      params.nameMr,
      params.nameEn ?? null,
      params.phone ?? null,
      params.village ?? null,
      params.bankAccountNumber ?? null,
      params.bankIfsc ?? null,
      params.bankName ?? null,
      params.upiId ?? null,
      params.defaultMilkType,
      params.openingBalancePaise,
      params.nowIso,
      params.nowIso
    );

    return Number(result.lastInsertRowid);
  }

  /**
   * Update an existing farmer record.
   */
  updateFarmer(db: Database.Database, params: UpdateFarmerParams): void {
    const stmt = db.prepare(`
      UPDATE farmers SET
        member_code = ?,
        name_mr = ?,
        name_en = ?,
        phone = ?,
        village = ?,
        bank_account_number = ?,
        bank_ifsc = ?,
        bank_name = ?,
        upi_id = ?,
        default_milk_type = ?,
        opening_balance_paise = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      params.memberCode,
      params.nameMr,
      params.nameEn ?? null,
      params.phone ?? null,
      params.village ?? null,
      params.bankAccountNumber ?? null,
      params.bankIfsc ?? null,
      params.bankName ?? null,
      params.upiId ?? null,
      params.defaultMilkType,
      params.openingBalancePaise,
      params.nowIso,
      params.id
    );
  }

  /**
   * Soft-deactivate farmer (sets is_active = 0). Non-destructive.
   */
  deactivateFarmer(db: Database.Database, id: number, nowIso: string): void {
    db.prepare('UPDATE farmers SET is_active = 0, updated_at = ? WHERE id = ?').run(
      nowIso,
      id
    );
  }

  /**
   * Reactivate farmer (sets is_active = 1).
   */
  reactivateFarmer(db: Database.Database, id: number, nowIso: string): void {
    db.prepare('UPDATE farmers SET is_active = 1, updated_at = ? WHERE id = ?').run(
      nowIso,
      id
    );
  }

  /**
   * Check if any financial transactions exist for this farmer in existing tables.
   * Future-compatible: Dynamically inspects sqlite_master and queries existing financial tables.
   */
  hasFinancialActivity(db: Database.Database, farmerId: number): boolean {
    const candidateTables = [
      'milk_collections',
      'adjustments_and_deductions',
      'weekly_settlements',
      'payments',
    ];

    for (const table of candidateTables) {
      const tableExists = db
        .prepare(
          "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name=?"
        )
        .get(table) as { count: number };

      if (tableExists && tableExists.count > 0) {
        const statusCondition =
          table === 'milk_collections' ||
          table === 'adjustments_and_deductions' ||
          table === 'payments'
            ? " AND status != 'VOIDED'"
            : '';
        const row = db
          .prepare(`SELECT count(*) as count FROM ${table} WHERE farmer_id = ?${statusCondition}`)
          .get(farmerId) as { count: number } | undefined;

        if (row && row.count > 0) {
          return true;
        }
      }
    }

    return false;
  }
}

export const farmerRepository = new FarmerRepository();
