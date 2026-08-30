import Database from 'better-sqlite3';
import {
  MilkCollectionStatus,
  RatePlanMilkType,
  ShiftType,
} from '../../shared/ipc-contracts';

export interface MilkCollectionRow {
  id: number;
  receipt_number: string;
  shift_id: number;
  farmer_id: number;
  farmer_member_code: string;
  farmer_name_mr: string;
  farmer_name_en: string | null;
  business_date: string;
  shift_type: ShiftType;
  milk_type: RatePlanMilkType;
  quantity_ml: number;
  fat_x100: number;
  snf_x100: number;
  rate_plan_id: number;
  rate_plan_name: string;
  rate_applied_paise: number;
  amount_paise: number;
  duplicate_confirmed: number;
  duplicate_reason: string | null;
  status: MilkCollectionStatus;
  voided_at: string | null;
  voided_by_user_id: number | null;
  voided_by_name: string | null;
  void_reason: string | null;
  created_by_user_id: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

const SELECT_COLLECTION_JOIN = `
  SELECT
    mc.id,
    mc.receipt_number,
    mc.shift_id,
    mc.farmer_id,
    f.member_code AS farmer_member_code,
    f.name_mr AS farmer_name_mr,
    f.name_en AS farmer_name_en,
    mc.business_date,
    mc.shift_type,
    mc.milk_type,
    mc.quantity_ml,
    mc.fat_x100,
    mc.snf_x100,
    mc.rate_plan_id,
    rp.plan_name AS rate_plan_name,
    mc.rate_applied_paise,
    mc.amount_paise,
    mc.duplicate_confirmed,
    mc.duplicate_reason,
    mc.status,
    mc.voided_at,
    mc.voided_by_user_id,
    u_void.full_name AS voided_by_name,
    mc.void_reason,
    mc.created_by_user_id,
    u_create.full_name AS created_by_name,
    mc.created_at,
    mc.updated_at
  FROM milk_collections mc
  JOIN farmers f ON mc.farmer_id = f.id
  JOIN rate_plans rp ON mc.rate_plan_id = rp.id
  JOIN users u_create ON mc.created_by_user_id = u_create.id
  LEFT JOIN users u_void ON mc.voided_by_user_id = u_void.id
`;

export class MilkCollectionRepository {
  getById(db: Database.Database, id: number): MilkCollectionRow | null {
    const row = db
      .prepare(`${SELECT_COLLECTION_JOIN} WHERE mc.id = ?`)
      .get(id) as MilkCollectionRow | undefined;
    return row ?? null;
  }

  getByReceipt(db: Database.Database, receiptNumber: string): MilkCollectionRow | null {
    const row = db
      .prepare(`${SELECT_COLLECTION_JOIN} WHERE mc.receipt_number = ?`)
      .get(receiptNumber.trim()) as MilkCollectionRow | undefined;
    return row ?? null;
  }

  listByShift(db: Database.Database, shiftId: number): MilkCollectionRow[] {
    const rows = db
      .prepare(
        `${SELECT_COLLECTION_JOIN} WHERE mc.shift_id = ? ORDER BY mc.id DESC`
      )
      .all(shiftId) as MilkCollectionRow[];
    return rows;
  }

  getActiveDuplicates(
    db: Database.Database,
    shiftId: number,
    farmerId: number,
    milkType: RatePlanMilkType
  ): MilkCollectionRow[] {
    const rows = db
      .prepare(`
        ${SELECT_COLLECTION_JOIN}
        WHERE mc.shift_id = ?
          AND mc.farmer_id = ?
          AND mc.milk_type = ?
          AND mc.status = 'ACTIVE'
        ORDER BY mc.id ASC
      `)
      .all(shiftId, farmerId, milkType) as MilkCollectionRow[];
    return rows;
  }

  insertCollection(
    db: Database.Database,
    data: {
      receiptNumber: string;
      shiftId: number;
      farmerId: number;
      businessDate: string;
      shiftType: ShiftType;
      milkType: RatePlanMilkType;
      quantityMl: number;
      fatX100: number;
      snfX100: number;
      ratePlanId: number;
      rateAppliedPaise: number;
      amountPaise: number;
      duplicateConfirmed: boolean;
      duplicateReason?: string | null;
      createdByUserId: number;
      nowIso: string;
    }
  ): number {
    const stmt = db.prepare(`
      INSERT INTO milk_collections (
        receipt_number,
        shift_id,
        farmer_id,
        business_date,
        shift_type,
        milk_type,
        quantity_ml,
        fat_x100,
        snf_x100,
        rate_plan_id,
        rate_applied_paise,
        amount_paise,
        duplicate_confirmed,
        duplicate_reason,
        status,
        created_by_user_id,
        created_at,
        updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?
      )
    `);

    const info = stmt.run(
      data.receiptNumber,
      data.shiftId,
      data.farmerId,
      data.businessDate,
      data.shiftType,
      data.milkType,
      data.quantityMl,
      data.fatX100,
      data.snfX100,
      data.ratePlanId,
      data.rateAppliedPaise,
      data.amountPaise,
      data.duplicateConfirmed ? 1 : 0,
      data.duplicateReason ? data.duplicateReason.trim() : null,
      data.createdByUserId,
      data.nowIso,
      data.nowIso
    );

    return Number(info.lastInsertRowid);
  }

  voidCollection(
    db: Database.Database,
    id: number,
    voidedByUserId: number,
    voidReason: string,
    nowIso: string
  ): void {
    db.prepare(`
      UPDATE milk_collections
      SET
        status = 'VOIDED',
        voided_at = ?,
        voided_by_user_id = ?,
        void_reason = ?,
        updated_at = ?
      WHERE id = ? AND status = 'ACTIVE'
    `).run(nowIso, voidedByUserId, voidReason.trim(), nowIso, id);
  }
}

export const milkCollectionRepository = new MilkCollectionRepository();
