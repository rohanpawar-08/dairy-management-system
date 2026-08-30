import Database from 'better-sqlite3';
import { MilkCollectionRow } from './milk-collection.repository';
import { AdjustmentRow } from './adjustment.repository';

export interface FarmerLedgerSourceData {
  farmerId: number;
  collections: MilkCollectionRow[];
  adjustments: AdjustmentRow[];
}

export class LedgerRepository {
  getFarmerRawSourceData(db: Database.Database, farmerId: number): FarmerLedgerSourceData {
    const collections = db
      .prepare(
        `SELECT m.*, f.member_code AS farmer_member_code, f.name_mr AS farmer_name_mr
         FROM milk_collections m
         JOIN farmers f ON f.id = m.farmer_id
         WHERE m.farmer_id = ?
         ORDER BY m.business_date ASC, m.created_at ASC, m.id ASC`
      )
      .all(farmerId) as MilkCollectionRow[];

    const adjustments = db
      .prepare(
        `SELECT a.*, f.member_code AS farmer_member_code, f.name_mr AS farmer_name_mr
         FROM adjustments_and_deductions a
         JOIN farmers f ON f.id = a.farmer_id
         WHERE a.farmer_id = ?
         ORDER BY a.business_date ASC, a.created_at ASC, a.id ASC`
      )
      .all(farmerId) as AdjustmentRow[];

    return {
      farmerId,
      collections,
      adjustments,
    };
  }
}

export const ledgerRepository = new LedgerRepository();
