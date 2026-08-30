import Database from 'better-sqlite3';
import { PaymentMethod, PaymentStatus } from '../../shared/ipc-contracts';

export interface PaymentRow {
  id: number;
  payment_number: string;
  farmer_id: number;
  business_date: string;
  amount_paise: number;
  payment_method: PaymentMethod;
  external_reference: string | null;
  notes: string | null;
  status: PaymentStatus;
  created_by_user_id: number;
  created_at: string;
  voided_by_user_id: number | null;
  voided_at: string | null;
  void_reason: string | null;
  updated_at: string;
  farmer_member_code?: string;
  farmer_name_mr?: string;
  farmer_name_en?: string | null;
  created_by_name?: string;
  voided_by_name?: string;
}

export interface PaymentAllocationRow {
  id: number;
  payment_id: number;
  weekly_settlement_id: number;
  allocated_paise: number;
  created_at: string;
  settlement_period_number?: string;
  period_start?: string;
  period_end?: string;
}

export interface FarmerFinalizedSettlementTarget {
  weeklySettlementId: number;
  settlementPeriodId: number;
  periodNumber: string;
  periodStart: string;
  periodEnd: string;
  netAmountPaise: number;
  allocatedPaise: number;
  remainingPaise: number;
}

export class PaymentRepository {
  createPayment(
    db: Database.Database,
    payment: {
      paymentNumber: string;
      farmerId: number;
      businessDate: string;
      amountPaise: number;
      paymentMethod: PaymentMethod;
      externalReference?: string | null;
      notes?: string | null;
      createdByUserId: number;
      createdAt?: string;
    }
  ): PaymentRow {
    const createdAt = payment.createdAt || new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO payments (
          payment_number, farmer_id, business_date, amount_paise, payment_method,
          external_reference, notes, status, created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'RECORDED', ?, ?, ?)`
      )
      .run(
        payment.paymentNumber,
        payment.farmerId,
        payment.businessDate,
        payment.amountPaise,
        payment.paymentMethod,
        payment.externalReference || null,
        payment.notes || null,
        payment.createdByUserId,
        createdAt,
        createdAt
      );

    return this.getPaymentById(db, Number(result.lastInsertRowid))!;
  }

  createAllocations(
    db: Database.Database,
    allocations: {
      paymentId: number;
      weeklySettlementId: number;
      allocatedPaise: number;
      createdAt?: string;
    }[]
  ): void {
    const stmt = db.prepare(
      `INSERT INTO payment_allocations (
        payment_id, weekly_settlement_id, allocated_paise, created_at
      ) VALUES (?, ?, ?, ?)`
    );

    for (const alloc of allocations) {
      const createdAt = alloc.createdAt || new Date().toISOString();
      stmt.run(alloc.paymentId, alloc.weeklySettlementId, alloc.allocatedPaise, createdAt);
    }
  }

  getPaymentById(db: Database.Database, id: number): PaymentRow | null {
    const row = db
      .prepare(
        `SELECT p.*,
                f.member_code as farmer_member_code,
                f.name_mr as farmer_name_mr,
                f.name_en as farmer_name_en,
                u1.full_name as created_by_name,
                u2.full_name as voided_by_name
         FROM payments p
         JOIN farmers f ON p.farmer_id = f.id
         LEFT JOIN users u1 ON p.created_by_user_id = u1.id
         LEFT JOIN users u2 ON p.voided_by_user_id = u2.id
         WHERE p.id = ?`
      )
      .get(id) as PaymentRow | undefined;

    return row || null;
  }

  listPayments(
    db: Database.Database,
    filter?: {
      farmerId?: number;
      memberCode?: string;
      status?: PaymentStatus;
      fromDate?: string;
      toDate?: string;
    }
  ): PaymentRow[] {
    let sql = `SELECT p.*,
                      f.member_code as farmer_member_code,
                      f.name_mr as farmer_name_mr,
                      f.name_en as farmer_name_en,
                      u1.full_name as created_by_name,
                      u2.full_name as voided_by_name
               FROM payments p
               JOIN farmers f ON p.farmer_id = f.id
               LEFT JOIN users u1 ON p.created_by_user_id = u1.id
               LEFT JOIN users u2 ON p.voided_by_user_id = u2.id
               WHERE 1=1`;

    const params: unknown[] = [];

    if (filter?.farmerId) {
      sql += ' AND p.farmer_id = ?';
      params.push(filter.farmerId);
    }

    if (filter?.memberCode) {
      sql += ' AND UPPER(f.member_code) = UPPER(?)';
      params.push(filter.memberCode.trim());
    }

    if (filter?.status) {
      sql += ' AND p.status = ?';
      params.push(filter.status);
    }

    if (filter?.fromDate) {
      sql += ' AND p.business_date >= ?';
      params.push(filter.fromDate);
    }

    if (filter?.toDate) {
      sql += ' AND p.business_date <= ?';
      params.push(filter.toDate);
    }

    sql += ' ORDER BY p.business_date DESC, p.id DESC';

    return db.prepare(sql).all(...params) as PaymentRow[];
  }

  voidPayment(
    db: Database.Database,
    paymentId: number,
    voidedByUserId: number,
    voidReason: string,
    voidedAt?: string
  ): void {
    const timestamp = voidedAt || new Date().toISOString();
    db.prepare(
      `UPDATE payments
       SET status = 'VOIDED',
           voided_by_user_id = ?,
           voided_at = ?,
           void_reason = ?,
           updated_at = ?
       WHERE id = ? AND status = 'RECORDED'`
    ).run(voidedByUserId, timestamp, voidReason, timestamp, paymentId);
  }

  getAllocationsByPaymentId(db: Database.Database, paymentId: number): PaymentAllocationRow[] {
    const rows = db
      .prepare(
        `SELECT pa.*,
                sp.settlement_number as settlement_period_number,
                sp.period_start,
                sp.period_end
         FROM payment_allocations pa
         JOIN weekly_settlements ws ON pa.weekly_settlement_id = ws.id
         JOIN settlement_periods sp ON ws.settlement_period_id = sp.id
         WHERE pa.payment_id = ?
         ORDER BY pa.id ASC`
      )
      .all(paymentId) as PaymentAllocationRow[];

    return rows;
  }

  getAllocationsBySettlementId(db: Database.Database, settlementId: number): PaymentAllocationRow[] {
    const rows = db
      .prepare(
        `SELECT pa.*
         FROM payment_allocations pa
         JOIN payments p ON pa.payment_id = p.id
         WHERE pa.weekly_settlement_id = ? AND p.status = 'RECORDED'
         ORDER BY pa.id ASC`
      )
      .all(settlementId) as PaymentAllocationRow[];

    return rows;
  }

  getFarmerTotalActivePayments(db: Database.Database, farmerId: number): number {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(amount_paise), 0) as total
         FROM payments
         WHERE farmer_id = ? AND status = 'RECORDED'`
      )
      .get(farmerId) as { total: number };

    return row?.total ?? 0;
  }

  getFarmerFinalizedSettlementsTotalNet(db: Database.Database, farmerId: number): number {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(ws.net_amount_paise), 0) as total
         FROM weekly_settlements ws
         JOIN settlement_periods sp ON ws.settlement_period_id = sp.id
         WHERE ws.farmer_id = ? AND sp.status = 'FINALIZED'`
      )
      .get(farmerId) as { total: number };

    return row?.total ?? 0;
  }

  getFarmerFinalizedSettlementsWithOutstanding(
    db: Database.Database,
    farmerId: number
  ): FarmerFinalizedSettlementTarget[] {
    const rows = db
      .prepare(
        `SELECT ws.id as weeklySettlementId,
                ws.settlement_period_id as settlementPeriodId,
                sp.settlement_number as periodNumber,
                sp.period_start as periodStart,
                sp.period_end as periodEnd,
                ws.net_amount_paise as netAmountPaise,
                COALESCE((
                  SELECT SUM(pa.allocated_paise)
                  FROM payment_allocations pa
                  JOIN payments p ON pa.payment_id = p.id
                  WHERE pa.weekly_settlement_id = ws.id AND p.status = 'RECORDED'
                ), 0) as allocatedPaise
         FROM weekly_settlements ws
         JOIN settlement_periods sp ON ws.settlement_period_id = sp.id
         WHERE ws.farmer_id = ? AND sp.status = 'FINALIZED' AND ws.net_amount_paise > 0
         ORDER BY sp.period_start ASC, ws.id ASC`
      )
      .all(farmerId) as {
        weeklySettlementId: number;
        settlementPeriodId: number;
        periodNumber: string;
        periodStart: string;
        periodEnd: string;
        netAmountPaise: number;
        allocatedPaise: number;
      }[];

    return rows.map((r) => ({
      ...r,
      remainingPaise: r.netAmountPaise - r.allocatedPaise,
    }));
  }
}

export const paymentRepository = new PaymentRepository();
