import Database from 'better-sqlite3';
import { ShiftType, ShiftStatus } from '../../shared/ipc-contracts';

export interface ShiftRow {
  id: number;
  business_date: string;
  shift_type: ShiftType;
  status: ShiftStatus;
  opened_by_user_id: number;
  opened_by_name: string;
  opened_at: string;
  closed_by_user_id: number | null;
  closed_by_name: string | null;
  closed_at: string | null;
  reopened_by_user_id: number | null;
  reopened_by_name: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
  reopen_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShiftSummaryRaw {
  total_active_collections: number;
  unique_farmers_count: number;
  cow_quantity_ml: number;
  cow_amount_paise: number;
  buffalo_quantity_ml: number;
  buffalo_amount_paise: number;
  total_quantity_ml: number;
  total_amount_paise: number;
  total_voided_collections: number;
}

const SELECT_SHIFT_JOIN = `
  SELECT 
    s.id,
    s.business_date,
    s.shift_type,
    s.status,
    s.opened_by_user_id,
    u_open.full_name AS opened_by_name,
    s.opened_at,
    s.closed_by_user_id,
    u_close.full_name AS closed_by_name,
    s.closed_at,
    s.reopened_by_user_id,
    u_reopen.full_name AS reopened_by_name,
    s.reopened_at,
    s.reopen_reason,
    s.reopen_count,
    s.notes,
    s.created_at,
    s.updated_at
  FROM shifts s
  JOIN users u_open ON s.opened_by_user_id = u_open.id
  LEFT JOIN users u_close ON s.closed_by_user_id = u_close.id
  LEFT JOIN users u_reopen ON s.reopened_by_user_id = u_reopen.id
`;

export class ShiftRepository {
  getCurrentOpenShift(db: Database.Database): ShiftRow | null {
    const row = db
      .prepare(`${SELECT_SHIFT_JOIN} WHERE s.status = 'OPEN' LIMIT 1`)
      .get() as ShiftRow | undefined;
    return row ?? null;
  }

  getById(db: Database.Database, id: number): ShiftRow | null {
    const row = db
      .prepare(`${SELECT_SHIFT_JOIN} WHERE s.id = ?`)
      .get(id) as ShiftRow | undefined;
    return row ?? null;
  }

  getByDateAndType(
    db: Database.Database,
    businessDate: string,
    shiftType: ShiftType
  ): ShiftRow | null {
    const row = db
      .prepare(`${SELECT_SHIFT_JOIN} WHERE s.business_date = ? AND s.shift_type = ?`)
      .get(businessDate, shiftType) as ShiftRow | undefined;
    return row ?? null;
  }

  insertShift(
    db: Database.Database,
    data: {
      businessDate: string;
      shiftType: ShiftType;
      openedByUserId: number;
      openedAt: string;
      notes?: string | null;
      nowIso: string;
    }
  ): number {
    const stmt = db.prepare(`
      INSERT INTO shifts (
        business_date,
        shift_type,
        status,
        opened_by_user_id,
        opened_at,
        notes,
        created_at,
        updated_at
      ) VALUES (?, ?, 'OPEN', ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      data.businessDate,
      data.shiftType,
      data.openedByUserId,
      data.openedAt,
      data.notes ?? null,
      data.nowIso,
      data.nowIso
    );

    return Number(info.lastInsertRowid);
  }

  closeShift(
    db: Database.Database,
    id: number,
    closedByUserId: number,
    closedAt: string,
    nowIso: string
  ): void {
    db.prepare(`
      UPDATE shifts
      SET
        status = 'LOCKED',
        closed_by_user_id = ?,
        closed_at = ?,
        updated_at = ?
      WHERE id = ? AND status = 'OPEN'
    `).run(closedByUserId, closedAt, nowIso, id);
  }

  reopenShift(
    db: Database.Database,
    id: number,
    reopenedByUserId: number,
    reopenedAt: string,
    reopenReason: string,
    nowIso: string
  ): void {
    db.prepare(`
      UPDATE shifts
      SET
        status = 'OPEN',
        closed_by_user_id = NULL,
        closed_at = NULL,
        reopened_by_user_id = ?,
        reopened_at = ?,
        reopen_reason = ?,
        reopen_count = reopen_count + 1,
        updated_at = ?
      WHERE id = ? AND status = 'LOCKED'
    `).run(reopenedByUserId, reopenedAt, reopenReason.trim(), nowIso, id);
  }

  getShiftSummaryRaw(db: Database.Database, shiftId: number): ShiftSummaryRaw {
    const summary = db
      .prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END), 0) AS total_active_collections,
          COALESCE(COUNT(DISTINCT CASE WHEN status = 'ACTIVE' THEN farmer_id END), 0) AS unique_farmers_count,
          COALESCE(SUM(CASE WHEN status = 'ACTIVE' AND milk_type = 'COW' THEN quantity_ml ELSE 0 END), 0) AS cow_quantity_ml,
          COALESCE(SUM(CASE WHEN status = 'ACTIVE' AND milk_type = 'COW' THEN amount_paise ELSE 0 END), 0) AS cow_amount_paise,
          COALESCE(SUM(CASE WHEN status = 'ACTIVE' AND milk_type = 'BUFFALO' THEN quantity_ml ELSE 0 END), 0) AS buffalo_quantity_ml,
          COALESCE(SUM(CASE WHEN status = 'ACTIVE' AND milk_type = 'BUFFALO' THEN amount_paise ELSE 0 END), 0) AS buffalo_amount_paise,
          COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN quantity_ml ELSE 0 END), 0) AS total_quantity_ml,
          COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN amount_paise ELSE 0 END), 0) AS total_amount_paise,
          COALESCE(SUM(CASE WHEN status = 'VOIDED' THEN 1 ELSE 0 END), 0) AS total_voided_collections
        FROM milk_collections
        WHERE shift_id = ?
      `)
      .get(shiftId) as ShiftSummaryRaw;

    return summary;
  }
}

export const shiftRepository = new ShiftRepository();
