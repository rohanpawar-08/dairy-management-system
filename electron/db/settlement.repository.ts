import Database from 'better-sqlite3';

export type SettlementPeriodStatus = 'DRAFT' | 'FINALIZED' | 'CANCELLED';

export interface SettlementPeriodRow {
  id: number;
  settlement_number: string;
  period_start: string;
  period_end: string;
  status: SettlementPeriodStatus;
  created_by_user_id: number;
  created_at: string;
  finalized_by_user_id: number | null;
  finalized_at: string | null;
  cancelled_by_user_id: number | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  updated_at: string;
  created_by_name?: string;
  finalized_by_name?: string;
  cancelled_by_name?: string;
  settlements_count?: number;
  total_net_paise?: number;
}

export interface WeeklySettlementRow {
  id: number;
  settlement_period_id: number;
  farmer_id: number;
  member_code_snapshot: string;
  farmer_name_mr_snapshot: string;
  farmer_name_en_snapshot: string | null;
  opening_balance_paise: number;
  milk_quantity_ml: number;
  milk_collection_count: number;
  milk_amount_paise: number;
  credit_amount_paise: number;
  deduction_amount_paise: number;
  advance_amount_paise: number;
  net_amount_paise: number;
  created_at: string;
}

export type SettlementItemSourceType = 'OPENING_BALANCE' | 'MILK_COLLECTION' | 'ADJUSTMENT';

export interface SettlementItemRow {
  id: number;
  weekly_settlement_id: number;
  source_type: SettlementItemSourceType;
  source_id: number;
  business_date: string | null;
  reference_number: string;
  signed_amount_paise: number;
  created_at: string;
}

export class SettlementRepository {
  createPeriod(
    db: Database.Database,
    period: {
      settlementNumber: string;
      periodStart: string;
      periodEnd: string;
      createdByUserId: number;
      createdAt?: string;
    }
  ): SettlementPeriodRow {
    const createdAt = period.createdAt || new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO settlement_periods (
          settlement_number, period_start, period_end, status, created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, 'DRAFT', ?, ?, ?)`
      )
      .run(
        period.settlementNumber,
        period.periodStart,
        period.periodEnd,
        period.createdByUserId,
        createdAt,
        createdAt
      );

    return this.getPeriodById(db, Number(result.lastInsertRowid))!;
  }

  getPeriodById(db: Database.Database, id: number): SettlementPeriodRow | null {
    const row = db
      .prepare(
        `SELECT sp.*,
                u1.full_name as created_by_name,
                u2.full_name as finalized_by_name,
                u3.full_name as cancelled_by_name,
                (SELECT COUNT(*) FROM weekly_settlements ws WHERE ws.settlement_period_id = sp.id) as settlements_count,
                (SELECT COALESCE(SUM(ws.net_amount_paise), 0) FROM weekly_settlements ws WHERE ws.settlement_period_id = sp.id) as total_net_paise
         FROM settlement_periods sp
         LEFT JOIN users u1 ON sp.created_by_user_id = u1.id
         LEFT JOIN users u2 ON sp.finalized_by_user_id = u2.id
         LEFT JOIN users u3 ON sp.cancelled_by_user_id = u3.id
         WHERE sp.id = ?`
      )
      .get(id) as SettlementPeriodRow | undefined;

    return row || null;
  }

  listPeriods(db: Database.Database): SettlementPeriodRow[] {
    const rows = db
      .prepare(
        `SELECT sp.*,
                u1.full_name as created_by_name,
                u2.full_name as finalized_by_name,
                u3.full_name as cancelled_by_name,
                (SELECT COUNT(*) FROM weekly_settlements ws WHERE ws.settlement_period_id = sp.id) as settlements_count,
                (SELECT COALESCE(SUM(ws.net_amount_paise), 0) FROM weekly_settlements ws WHERE ws.settlement_period_id = sp.id) as total_net_paise
         FROM settlement_periods sp
         LEFT JOIN users u1 ON sp.created_by_user_id = u1.id
         LEFT JOIN users u2 ON sp.finalized_by_user_id = u2.id
         LEFT JOIN users u3 ON sp.cancelled_by_user_id = u3.id
         ORDER BY sp.period_start DESC, sp.id DESC`
      )
      .all() as SettlementPeriodRow[];

    return rows;
  }

  getActiveDraftPeriod(db: Database.Database): SettlementPeriodRow | null {
    const row = db
      .prepare(
        `SELECT sp.*,
                u1.full_name as created_by_name,
                (SELECT COUNT(*) FROM weekly_settlements ws WHERE ws.settlement_period_id = sp.id) as settlements_count,
                (SELECT COALESCE(SUM(ws.net_amount_paise), 0) FROM weekly_settlements ws WHERE ws.settlement_period_id = sp.id) as total_net_paise
         FROM settlement_periods sp
         LEFT JOIN users u1 ON sp.created_by_user_id = u1.id
         WHERE sp.status = 'DRAFT'`
      )
      .get() as SettlementPeriodRow | undefined;

    return row || null;
  }

  finalizePeriod(
    db: Database.Database,
    periodId: number,
    finalizedByUserId: number,
    finalizedAt?: string
  ): void {
    const timestamp = finalizedAt || new Date().toISOString();
    db.prepare(
      `UPDATE settlement_periods
       SET status = 'FINALIZED',
           finalized_by_user_id = ?,
           finalized_at = ?,
           updated_at = ?
       WHERE id = ? AND status = 'DRAFT'`
    ).run(finalizedByUserId, timestamp, timestamp, periodId);
  }

  cancelPeriod(
    db: Database.Database,
    periodId: number,
    cancelledByUserId: number,
    cancellationReason: string,
    cancelledAt?: string
  ): void {
    const timestamp = cancelledAt || new Date().toISOString();
    db.prepare(
      `UPDATE settlement_periods
       SET status = 'CANCELLED',
           cancelled_by_user_id = ?,
           cancelled_at = ?,
           cancellation_reason = ?,
           updated_at = ?
       WHERE id = ? AND status = 'DRAFT'`
    ).run(cancelledByUserId, timestamp, cancellationReason, timestamp, periodId);
  }

  insertWeeklySettlement(
    db: Database.Database,
    settlement: {
      settlementPeriodId: number;
      farmerId: number;
      memberCodeSnapshot: string;
      farmerNameMrSnapshot: string;
      farmerNameEnSnapshot: string | null;
      openingBalancePaise: number;
      milkQuantityMl: number;
      milkCollectionCount: number;
      milkAmountPaise: number;
      creditAmountPaise: number;
      deductionAmountPaise: number;
      advanceAmountPaise: number;
      netAmountPaise: number;
      createdAt?: string;
    }
  ): number {
    const createdAt = settlement.createdAt || new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO weekly_settlements (
          settlement_period_id, farmer_id, member_code_snapshot, farmer_name_mr_snapshot,
          farmer_name_en_snapshot, opening_balance_paise, milk_quantity_ml, milk_collection_count,
          milk_amount_paise, credit_amount_paise, deduction_amount_paise, advance_amount_paise,
          net_amount_paise, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        settlement.settlementPeriodId,
        settlement.farmerId,
        settlement.memberCodeSnapshot,
        settlement.farmerNameMrSnapshot,
        settlement.farmerNameEnSnapshot,
        settlement.openingBalancePaise,
        settlement.milkQuantityMl,
        settlement.milkCollectionCount,
        settlement.milkAmountPaise,
        settlement.creditAmountPaise,
        settlement.deductionAmountPaise,
        settlement.advanceAmountPaise,
        settlement.netAmountPaise,
        createdAt
      );

    return Number(result.lastInsertRowid);
  }

  insertSettlementItem(
    db: Database.Database,
    item: {
      weeklySettlementId: number;
      sourceType: SettlementItemSourceType;
      sourceId: number;
      businessDate: string | null;
      referenceNumber: string;
      signedAmountPaise: number;
      createdAt?: string;
    }
  ): number {
    const createdAt = item.createdAt || new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO settlement_items (
          weekly_settlement_id, source_type, source_id, business_date,
          reference_number, signed_amount_paise, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        item.weeklySettlementId,
        item.sourceType,
        item.sourceId,
        item.businessDate,
        item.referenceNumber,
        item.signedAmountPaise,
        createdAt
      );

    return Number(result.lastInsertRowid);
  }

  getWeeklySettlementsByPeriod(db: Database.Database, periodId: number): WeeklySettlementRow[] {
    const rows = db
      .prepare(
        `SELECT * FROM weekly_settlements
         WHERE settlement_period_id = ?
         ORDER BY id ASC`
      )
      .all(periodId) as WeeklySettlementRow[];

    return rows;
  }

  getWeeklySettlementsByFarmer(db: Database.Database, farmerId: number): WeeklySettlementRow[] {
    const rows = db
      .prepare(
        `SELECT ws.* FROM weekly_settlements ws
         JOIN settlement_periods sp ON ws.settlement_period_id = sp.id
         WHERE ws.farmer_id = ? AND sp.status = 'FINALIZED'
         ORDER BY sp.period_start DESC, ws.id DESC`
      )
      .all(farmerId) as WeeklySettlementRow[];

    return rows;
  }

  getWeeklySettlementById(db: Database.Database, id: number): WeeklySettlementRow | null {
    const row = db
      .prepare('SELECT * FROM weekly_settlements WHERE id = ?')
      .get(id) as WeeklySettlementRow | undefined;

    return row || null;
  }

  getSettlementItemsBySettlementId(db: Database.Database, settlementId: number): SettlementItemRow[] {
    const rows = db
      .prepare(
        `SELECT * FROM settlement_items
         WHERE weekly_settlement_id = ?
         ORDER BY id ASC`
      )
      .all(settlementId) as SettlementItemRow[];

    return rows;
  }

  isOpeningBalanceIncluded(db: Database.Database, farmerId: number): boolean {
    const row = db
      .prepare(
        `SELECT 1 FROM settlement_items
         WHERE source_type = 'OPENING_BALANCE' AND source_id = ?`
      )
      .get(farmerId);

    return !!row;
  }

  isSourceSettled(db: Database.Database, sourceType: SettlementItemSourceType, sourceId: number): boolean {
    const row = db
      .prepare(
        `SELECT 1 FROM settlement_items
         WHERE source_type = ? AND source_id = ?`
      )
      .get(sourceType, sourceId);

    return !!row;
  }

  getSettledSourceIds(db: Database.Database, sourceType: SettlementItemSourceType): Set<number> {
    const rows = db
      .prepare(
        `SELECT source_id FROM settlement_items WHERE source_type = ?`
      )
      .all(sourceType) as { source_id: number }[];

    return new Set(rows.map((r) => r.source_id));
  }
}

export const settlementRepository = new SettlementRepository();
