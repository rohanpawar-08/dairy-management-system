import Database from 'better-sqlite3';
import {
  AdjustmentEntryType,
  AdjustmentCategory,
  AdjustmentStatus,
  AdjustmentFilter,
} from '../../shared/ipc-contracts';

export interface AdjustmentRow {
  id: number;
  reference_number: string;
  farmer_id: number;
  business_date: string;
  entry_type: AdjustmentEntryType;
  category: AdjustmentCategory;
  amount_paise: number;
  reason: string;
  notes: string | null;
  status: AdjustmentStatus;
  created_by_user_id: number;
  created_at: string;
  voided_by_user_id: number | null;
  voided_at: string | null;
  void_reason: string | null;
  updated_at: string;
  // Joined fields
  farmer_member_code?: string;
  farmer_name_mr?: string;
  farmer_name_en?: string | null;
  created_by_name?: string;
  voided_by_name?: string | null;
}

export interface InsertAdjustmentData {
  referenceNumber: string;
  farmerId: number;
  businessDate: string;
  entryType: AdjustmentEntryType;
  category: AdjustmentCategory;
  amountPaise: number;
  reason: string;
  notes?: string | null;
  createdByUserId: number;
  nowIso: string;
}

export class AdjustmentRepository {
  insert(db: Database.Database, data: InsertAdjustmentData): number {
    const stmt = db.prepare(`
      INSERT INTO adjustments_and_deductions (
        reference_number,
        farmer_id,
        business_date,
        entry_type,
        category,
        amount_paise,
        reason,
        notes,
        status,
        created_by_user_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
    `);

    const result = stmt.run(
      data.referenceNumber,
      data.farmerId,
      data.businessDate,
      data.entryType,
      data.category,
      data.amountPaise,
      data.reason,
      data.notes || null,
      data.createdByUserId,
      data.nowIso,
      data.nowIso
    );

    return Number(result.lastInsertRowid);
  }

  getById(db: Database.Database, id: number): AdjustmentRow | null {
    const stmt = db.prepare(`
      SELECT 
        a.*,
        f.member_code AS farmer_member_code,
        f.name_mr AS farmer_name_mr,
        f.name_en AS farmer_name_en,
        u1.full_name AS created_by_name,
        u2.full_name AS voided_by_name
      FROM adjustments_and_deductions a
      JOIN farmers f ON f.id = a.farmer_id
      JOIN users u1 ON u1.id = a.created_by_user_id
      LEFT JOIN users u2 ON u2.id = a.voided_by_user_id
      WHERE a.id = ?
    `);

    const row = stmt.get(id) as AdjustmentRow | undefined;
    return row || null;
  }

  getByReferenceNumber(db: Database.Database, referenceNumber: string): AdjustmentRow | null {
    const stmt = db.prepare(`
      SELECT 
        a.*,
        f.member_code AS farmer_member_code,
        f.name_mr AS farmer_name_mr,
        f.name_en AS farmer_name_en,
        u1.full_name AS created_by_name,
        u2.full_name AS voided_by_name
      FROM adjustments_and_deductions a
      JOIN farmers f ON f.id = a.farmer_id
      JOIN users u1 ON u1.id = a.created_by_user_id
      LEFT JOIN users u2 ON u2.id = a.voided_by_user_id
      WHERE a.reference_number = ?
    `);

    const row = stmt.get(referenceNumber) as AdjustmentRow | undefined;
    return row || null;
  }

  listByFarmer(
    db: Database.Database,
    farmerId: number,
    options?: { status?: AdjustmentStatus; fromDate?: string; toDate?: string }
  ): AdjustmentRow[] {
    let sql = `
      SELECT 
        a.*,
        f.member_code AS farmer_member_code,
        f.name_mr AS farmer_name_mr,
        f.name_en AS farmer_name_en,
        u1.full_name AS created_by_name,
        u2.full_name AS voided_by_name
      FROM adjustments_and_deductions a
      JOIN farmers f ON f.id = a.farmer_id
      JOIN users u1 ON u1.id = a.created_by_user_id
      LEFT JOIN users u2 ON u2.id = a.voided_by_user_id
      WHERE a.farmer_id = ?
    `;

    const params: (string | number)[] = [farmerId];

    if (options?.status) {
      sql += ' AND a.status = ?';
      params.push(options.status);
    }
    if (options?.fromDate) {
      sql += ' AND a.business_date >= ?';
      params.push(options.fromDate);
    }
    if (options?.toDate) {
      sql += ' AND a.business_date <= ?';
      params.push(options.toDate);
    }

    sql += ' ORDER BY a.business_date ASC, a.created_at ASC, a.id ASC';

    return db.prepare(sql).all(...params) as AdjustmentRow[];
  }

  listAll(db: Database.Database, filter?: AdjustmentFilter): AdjustmentRow[] {
    let sql = `
      SELECT 
        a.*,
        f.member_code AS farmer_member_code,
        f.name_mr AS farmer_name_mr,
        f.name_en AS farmer_name_en,
        u1.full_name AS created_by_name,
        u2.full_name AS voided_by_name
      FROM adjustments_and_deductions a
      JOIN farmers f ON f.id = a.farmer_id
      JOIN users u1 ON u1.id = a.created_by_user_id
      LEFT JOIN users u2 ON u2.id = a.voided_by_user_id
      WHERE 1=1
    `;

    const params: (string | number)[] = [];

    if (filter?.farmerId) {
      sql += ' AND a.farmer_id = ?';
      params.push(filter.farmerId);
    }
    if (filter?.memberCode) {
      sql += ' AND f.member_code = ?';
      params.push(filter.memberCode.trim().toUpperCase());
    }
    if (filter?.entryType) {
      sql += ' AND a.entry_type = ?';
      params.push(filter.entryType);
    }
    if (filter?.status) {
      sql += ' AND a.status = ?';
      params.push(filter.status);
    }
    if (filter?.fromDate) {
      sql += ' AND a.business_date >= ?';
      params.push(filter.fromDate);
    }
    if (filter?.toDate) {
      sql += ' AND a.business_date <= ?';
      params.push(filter.toDate);
    }

    sql += ' ORDER BY a.business_date DESC, a.created_at DESC, a.id DESC';

    return db.prepare(sql).all(...params) as AdjustmentRow[];
  }

  voidAdjustment(
    db: Database.Database,
    id: number,
    voidedByUserId: number,
    voidReason: string,
    nowIso: string
  ): void {
    const stmt = db.prepare(`
      UPDATE adjustments_and_deductions
      SET 
        status = 'VOIDED',
        voided_by_user_id = ?,
        void_reason = ?,
        voided_at = ?,
        updated_at = ?
      WHERE id = ? AND status = 'ACTIVE'
    `);

    const result = stmt.run(voidedByUserId, voidReason, nowIso, nowIso, id);
    if (result.changes === 0) {
      throw new Error(`Adjustment #${id} is either not found or already voided.`);
    }
  }
}

export const adjustmentRepository = new AdjustmentRepository();
