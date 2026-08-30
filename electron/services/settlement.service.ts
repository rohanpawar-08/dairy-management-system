import Database from 'better-sqlite3';
import {
  CancelSettlementDraftPayload,
  CreateSettlementDraftPayload,
  FarmerOutstandingDto,
  FinalizeSettlementPayload,
  SettlementPeriodDto,
  SettlementPreviewDto,
  SettlementPreviewItemDto,
  WeeklySettlementDto,
} from '../../shared/ipc-contracts';
import { formatPaiseAsRupees } from '../../shared/money';
import { farmerRepository } from '../db/farmer.repository';
import { paymentRepository } from '../db/payment.repository';
import { settlementRepository, SettlementPeriodRow, WeeklySettlementRow } from '../db/settlement.repository';
import { sessionService } from '../core/session.service';
import { auditService } from './audit.service';
import { settlementNumberService } from './settlement-number.service';

export interface BusinessDateProvider {
  getTodayBusinessDate(): string;
  getNowIso(): string;
}

import { businessDateProvider } from '../utils/business-date';

export const defaultDateProvider: BusinessDateProvider = {
  getTodayBusinessDate(): string {
    return businessDateProvider.getToday();
  },
  getNowIso(): string {
    return businessDateProvider.getNowIso();
  },
};

const WEEKDAY_INDEX: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

export class SettlementService {
  constructor(private dateProvider: BusinessDateProvider = defaultDateProvider) {}

  /**
   * Helper to compute period_end (start + 6 days).
   */
  private addSixDays(startDateStr: string): string {
    const [y, m, d] = startDateStr.split('-').map((v) => parseInt(v, 10));
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + 6);
    return date.toISOString().slice(0, 10);
  }

  /**
   * Helper to get weekday name from YYYY-MM-DD string.
   */
  private getWeekdayName(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10));
    const date = new Date(Date.UTC(y, m - 1, d));
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    return days[date.getUTCDay()];
  }

  /**
   * Get configured settlement start weekday from dairy_profile.
   */
  private getConfiguredStartDay(db: Database.Database): string {
    const row = db
      .prepare('SELECT settlement_start_day FROM dairy_profile WHERE id = 1')
      .get() as { settlement_start_day?: string } | undefined;

    return row?.settlement_start_day || 'MONDAY';
  }

  listPeriods(db: Database.Database, webContentsId: number): SettlementPeriodDto[] {
    sessionService.requireAuthenticated(webContentsId);
    const rows = settlementRepository.listPeriods(db);
    return rows.map((r) => this.mapPeriodToDto(r));
  }

  getPeriod(db: Database.Database, periodId: number, webContentsId: number): SettlementPeriodDto {
    sessionService.requireAuthenticated(webContentsId);
    const period = settlementRepository.getPeriodById(db, periodId);
    if (!period) {
      throw new Error(`Settlement period with ID ${periodId} not found.`);
    }
    return this.mapPeriodToDto(period);
  }

  createDraft(
    db: Database.Database,
    payload: CreateSettlementDraftPayload,
    webContentsId: number
  ): SettlementPeriodDto {
    const session = sessionService.requireRole(webContentsId, 'OWNER');

    const periodStart = payload.periodStart?.trim();
    if (!periodStart || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
      throw new Error('Valid periodStart date in YYYY-MM-DD format is required.');
    }

    const configuredStartDay = this.getConfiguredStartDay(db);
    const actualWeekday = this.getWeekdayName(periodStart);
    if (actualWeekday !== configuredStartDay) {
      throw new Error(
        `Period start date (${periodStart}) is a ${actualWeekday}, but configured settlement start day is ${configuredStartDay}.`
      );
    }

    const activeDraft = settlementRepository.getActiveDraftPeriod(db);
    if (activeDraft) {
      throw new Error(
        `A draft settlement period (${activeDraft.settlement_number}) already exists. Finalize or cancel it first.`
      );
    }

    const periodEnd = this.addSixDays(periodStart);

    // Check overlap with non-cancelled periods
    const overlap = db
      .prepare(
        `SELECT 1 FROM settlement_periods
         WHERE status IN ('DRAFT', 'FINALIZED')
           AND NOT (period_end < ? OR period_start > ?)`
      )
      .get(periodStart, periodEnd);

    if (overlap) {
      throw new Error(
        `Settlement period [${periodStart} to ${periodEnd}] overlaps with an existing settlement period.`
      );
    }

    const settlementNumber = settlementNumberService.generateSettlementNumber(db, periodEnd);

    const createTx = db.transaction(() => {
      const created = settlementRepository.createPeriod(db, {
        settlementNumber,
        periodStart,
        periodEnd,
        createdByUserId: session.userId,
      });

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'SETTLEMENT_PERIOD_CREATED',
        entityName: 'settlement_periods',
        entityId: String(created.id),
        details: {
          settlementNumber: created.settlement_number,
          periodStart: created.period_start,
          periodEnd: created.period_end,
        },
      });

      return created;
    });

    const periodRow = createTx();
    return this.mapPeriodToDto(periodRow);
  }

  cancelDraft(
    db: Database.Database,
    payload: CancelSettlementDraftPayload,
    webContentsId: number
  ): SettlementPeriodDto {
    const session = sessionService.requireRole(webContentsId, 'OWNER');

    const reason = payload.reason?.trim();
    if (!reason) {
      throw new Error('Cancellation reason is required.');
    }

    const period = settlementRepository.getPeriodById(db, payload.periodId);
    if (!period) {
      throw new Error(`Settlement period with ID ${payload.periodId} not found.`);
    }

    if (period.status !== 'DRAFT') {
      throw new Error(`Only DRAFT settlement periods can be cancelled. Current status is ${period.status}.`);
    }

    const cancelTx = db.transaction(() => {
      settlementRepository.cancelPeriod(db, period.id, session.userId, reason);

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'SETTLEMENT_PERIOD_CANCELLED',
        entityName: 'settlement_periods',
        entityId: String(period.id),
        details: {
          settlementNumber: period.settlement_number,
          cancellationReason: reason,
        },
      });
    });

    cancelTx();

    const updated = settlementRepository.getPeriodById(db, period.id)!;
    return this.mapPeriodToDto(updated);
  }

  preview(
    db: Database.Database,
    payload: { periodId?: number; periodStart?: string },
    webContentsId: number
  ): SettlementPreviewDto {
    sessionService.requireAuthenticated(webContentsId);

    let periodStart = '';
    let periodEnd = '';

    if (payload.periodId) {
      const period = settlementRepository.getPeriodById(db, payload.periodId);
      if (!period) {
        throw new Error(`Settlement period with ID ${payload.periodId} not found.`);
      }
      periodStart = period.period_start;
      periodEnd = period.period_end;
    } else if (payload.periodStart) {
      periodStart = payload.periodStart.trim();
      periodEnd = this.addSixDays(periodStart);
    } else {
      throw new Error('Either periodId or periodStart must be provided for settlement preview.');
    }

    const configuredStartDay = this.getConfiguredStartDay(db);

    // Compute per-farmer items
    const allFarmers = farmerRepository.listFarmers(db);

    let eligibleFarmerCount = 0;
    let milkCollectionCount = 0;
    let totalMilkQuantityMl = 0;
    let totalMilkAmountPaise = 0;
    let totalCreditsPaise = 0;
    let totalDeductionsPaise = 0;
    let totalAdvancesPaise = 0;
    let totalNetPaise = 0;

    const farmerItems: SettlementPreviewItemDto[] = [];
    const warnings: string[] = [];

    // Prior unsettled activity check
    const priorUnsettledMilkCount = (
      db
        .prepare(
          `SELECT COUNT(*) as count FROM milk_collections
           WHERE status = 'ACTIVE' AND business_date < ?
             AND id NOT IN (SELECT source_id FROM settlement_items WHERE source_type = 'MILK_COLLECTION')`
        )
        .get(periodStart) as { count: number }
    ).count;

    const priorUnsettledAdjCount = (
      db
        .prepare(
          `SELECT COUNT(*) as count FROM adjustments_and_deductions
           WHERE status = 'ACTIVE' AND business_date < ?
             AND id NOT IN (SELECT source_id FROM settlement_items WHERE source_type = 'ADJUSTMENT')`
        )
        .get(periodStart) as { count: number }
    ).count;

    const hasPriorUnsettledActivity = priorUnsettledMilkCount > 0 || priorUnsettledAdjCount > 0;
    if (hasPriorUnsettledActivity) {
      warnings.push(
        `There are ${priorUnsettledMilkCount} prior milk collections and ${priorUnsettledAdjCount} prior adjustments before ${periodStart} that are not settled.`
      );
    }

    for (const farmer of allFarmers) {
      const openingBalanceIncluded = settlementRepository.isOpeningBalanceIncluded(db, farmer.id);
      const openingBalancePaise = openingBalanceIncluded ? 0 : farmer.opening_balance_paise;

      // Active collections in date range not yet settled
      const collections = db
        .prepare(
          `SELECT id, quantity_ml, amount_paise FROM milk_collections
           WHERE farmer_id = ? AND status = 'ACTIVE'
             AND business_date >= ? AND business_date <= ?
             AND id NOT IN (SELECT source_id FROM settlement_items WHERE source_type = 'MILK_COLLECTION')`
        )
        .all(farmer.id, periodStart, periodEnd) as {
        id: number;
        quantity_ml: number;
        amount_paise: number;
      }[];

      const farmerCollectionCount = collections.length;
      let farmerMilkQty = 0;
      let farmerMilkAmount = 0;
      for (const col of collections) {
        farmerMilkQty += col.quantity_ml;
        farmerMilkAmount += col.amount_paise;
      }

      // Active adjustments in date range not yet settled
      const adjustments = db
        .prepare(
          `SELECT id, entry_type, amount_paise FROM adjustments_and_deductions
           WHERE farmer_id = ? AND status = 'ACTIVE'
             AND business_date >= ? AND business_date <= ?
             AND id NOT IN (SELECT source_id FROM settlement_items WHERE source_type = 'ADJUSTMENT')`
        )
        .all(farmer.id, periodStart, periodEnd) as {
        id: number;
        entry_type: 'ADVANCE' | 'DEDUCTION' | 'CREDIT';
        amount_paise: number;
      }[];

      let farmerCredits = 0;
      let farmerDeductions = 0;
      let farmerAdvances = 0;

      for (const adj of adjustments) {
        if (adj.entry_type === 'CREDIT') {
          farmerCredits += adj.amount_paise;
        } else if (adj.entry_type === 'DEDUCTION') {
          farmerDeductions += adj.amount_paise;
        } else if (adj.entry_type === 'ADVANCE') {
          farmerAdvances += adj.amount_paise;
        }
      }

      const farmerNet =
        openingBalancePaise +
        farmerMilkAmount +
        farmerCredits -
        farmerDeductions -
        farmerAdvances;

      const isEligible =
        !openingBalanceIncluded ||
        farmerCollectionCount > 0 ||
        farmerCredits > 0 ||
        farmerDeductions > 0 ||
        farmerAdvances > 0;

      if (isEligible) {
        eligibleFarmerCount++;
        milkCollectionCount += farmerCollectionCount;
        totalMilkQuantityMl += farmerMilkQty;
        totalMilkAmountPaise += farmerMilkAmount;
        totalCreditsPaise += farmerCredits;
        totalDeductionsPaise += farmerDeductions;
        totalAdvancesPaise += farmerAdvances;
        totalNetPaise += farmerNet;

        farmerItems.push({
          farmerId: farmer.id,
          memberCode: farmer.member_code,
          farmerNameMr: farmer.name_mr,
          farmerNameEn: farmer.name_en,
          openingBalancePaise,
          milkQuantityMl: farmerMilkQty,
          milkCollectionCount: farmerCollectionCount,
          milkAmountPaise: farmerMilkAmount,
          creditAmountPaise: farmerCredits,
          deductionAmountPaise: farmerDeductions,
          advanceAmountPaise: farmerAdvances,
          netAmountPaise: farmerNet,
          openingBalanceIncluded,
        });
      }
    }

    return {
      periodStart,
      periodEnd,
      configuredStartDay,
      eligibleFarmerCount,
      milkCollectionCount,
      totalMilkQuantityMl,
      totalMilkAmountPaise,
      totalCreditsPaise,
      totalDeductionsPaise,
      totalAdvancesPaise,
      totalNetPaise,
      farmerItems,
      warnings,
      hasPriorUnsettledActivity,
    };
  }

  finalize(
    db: Database.Database,
    payload: FinalizeSettlementPayload,
    webContentsId: number
  ): SettlementPeriodDto {
    const session = sessionService.requireRole(webContentsId, 'OWNER');

    const period = settlementRepository.getPeriodById(db, payload.periodId);
    if (!period) {
      throw new Error(`Settlement period with ID ${payload.periodId} not found.`);
    }

    if (period.status !== 'DRAFT') {
      throw new Error(`Only DRAFT settlement periods can be finalized. Current status is ${period.status}.`);
    }

    const todayDate = this.dateProvider.getTodayBusinessDate();
    if (period.period_end > todayDate) {
      throw new Error(
        `Settlement period cannot be finalized before period end date (${period.period_end}). Current business date is ${todayDate}.`
      );
    }

    // Atomic Finalization Transaction
    const finalizeTx = db.transaction(() => {
      // 1. Prior unsettled activity check
      const priorUnsettledMilkCount = (
        db
          .prepare(
            `SELECT COUNT(*) as count FROM milk_collections
             WHERE status = 'ACTIVE' AND business_date < ?
               AND id NOT IN (SELECT source_id FROM settlement_items WHERE source_type = 'MILK_COLLECTION')`
          )
          .get(period.period_start) as { count: number }
      ).count;

      const priorUnsettledAdjCount = (
        db
          .prepare(
            `SELECT COUNT(*) as count FROM adjustments_and_deductions
             WHERE status = 'ACTIVE' AND business_date < ?
               AND id NOT IN (SELECT source_id FROM settlement_items WHERE source_type = 'ADJUSTMENT')`
          )
          .get(period.period_start) as { count: number }
      ).count;

      if (priorUnsettledMilkCount > 0 || priorUnsettledAdjCount > 0) {
        const err = new Error(
          `UNSETTLED_PRIOR_ACTIVITY: There are prior unsettled milk collections (${priorUnsettledMilkCount}) or adjustments (${priorUnsettledAdjCount}) before ${period.period_start}.`
        );
        (err as unknown as { code: string }).code = 'UNSETTLED_PRIOR_ACTIVITY';
        throw err;
      }

      // 2. Recompute preview inside transaction
      const allFarmers = farmerRepository.listFarmers(db);
      let totalBatchNet = 0;
      let totalBatchItemsCount = 0;
      let eligibleFarmerCount = 0;

      for (const farmer of allFarmers) {
        const openingBalanceIncluded = settlementRepository.isOpeningBalanceIncluded(db, farmer.id);
        const openingBalancePaise = openingBalanceIncluded ? 0 : farmer.opening_balance_paise;

        const collections = db
          .prepare(
            `SELECT id, receipt_number, business_date, amount_paise, quantity_ml FROM milk_collections
             WHERE farmer_id = ? AND status = 'ACTIVE'
               AND business_date >= ? AND business_date <= ?
               AND id NOT IN (SELECT source_id FROM settlement_items WHERE source_type = 'MILK_COLLECTION')`
          )
          .all(farmer.id, period.period_start, period.period_end) as {
          id: number;
          receipt_number: string;
          business_date: string;
          amount_paise: number;
          quantity_ml: number;
        }[];

        const adjustments = db
          .prepare(
            `SELECT id, reference_number, business_date, entry_type, amount_paise FROM adjustments_and_deductions
             WHERE farmer_id = ? AND status = 'ACTIVE'
               AND business_date >= ? AND business_date <= ?
               AND id NOT IN (SELECT source_id FROM settlement_items WHERE source_type = 'ADJUSTMENT')`
          )
          .all(farmer.id, period.period_start, period.period_end) as {
          id: number;
          reference_number: string;
          business_date: string;
          entry_type: 'ADVANCE' | 'DEDUCTION' | 'CREDIT';
          amount_paise: number;
        }[];

        let milkQty = 0;
        let milkAmount = 0;
        for (const c of collections) {
          milkQty += c.quantity_ml;
          milkAmount += c.amount_paise;
        }

        let credits = 0;
        let deductions = 0;
        let advances = 0;

        for (const a of adjustments) {
          if (a.entry_type === 'CREDIT') credits += a.amount_paise;
          else if (a.entry_type === 'DEDUCTION') deductions += a.amount_paise;
          else if (a.entry_type === 'ADVANCE') advances += a.amount_paise;
        }

        const netAmountPaise =
          openingBalancePaise + milkAmount + credits - deductions - advances;

        const isEligible =
          !openingBalanceIncluded ||
          collections.length > 0 ||
          adjustments.length > 0;

        if (!isEligible) {
          continue;
        }

        eligibleFarmerCount++;

        // Insert immutable weekly_settlements snapshot
        const weeklySettlementId = settlementRepository.insertWeeklySettlement(db, {
          settlementPeriodId: period.id,
          farmerId: farmer.id,
          memberCodeSnapshot: farmer.member_code,
          farmerNameMrSnapshot: farmer.name_mr,
          farmerNameEnSnapshot: farmer.name_en,
          openingBalancePaise,
          milkQuantityMl: milkQty,
          milkCollectionCount: collections.length,
          milkAmountPaise: milkAmount,
          creditAmountPaise: credits,
          deductionAmountPaise: deductions,
          advanceAmountPaise: advances,
          netAmountPaise,
        });

        // Insert settlement_items
        if (!openingBalanceIncluded) {
          settlementRepository.insertSettlementItem(db, {
            weeklySettlementId,
            sourceType: 'OPENING_BALANCE',
            sourceId: farmer.id,
            businessDate: null,
            referenceNumber: farmer.member_code,
            signedAmountPaise: farmer.opening_balance_paise,
          });
          totalBatchItemsCount++;
        }

        for (const c of collections) {
          settlementRepository.insertSettlementItem(db, {
            weeklySettlementId,
            sourceType: 'MILK_COLLECTION',
            sourceId: c.id,
            businessDate: c.business_date,
            referenceNumber: c.receipt_number,
            signedAmountPaise: c.amount_paise,
          });
          totalBatchItemsCount++;
        }

        for (const a of adjustments) {
          let signedAmount = a.amount_paise;
          if (a.entry_type === 'DEDUCTION' || a.entry_type === 'ADVANCE') {
            signedAmount = -a.amount_paise;
          }
          settlementRepository.insertSettlementItem(db, {
            weeklySettlementId,
            sourceType: 'ADJUSTMENT',
            sourceId: a.id,
            businessDate: a.business_date,
            referenceNumber: a.reference_number,
            signedAmountPaise: signedAmount,
          });
          totalBatchItemsCount++;
        }

        // Reconciliation Check: Sum of settlement_items signed_amount_paise == netAmountPaise
        const itemsSumRow = db
          .prepare(
            `SELECT COALESCE(SUM(signed_amount_paise), 0) as total
             FROM settlement_items
             WHERE weekly_settlement_id = ?`
          )
          .get(weeklySettlementId) as { total: number };

        if (itemsSumRow.total !== netAmountPaise) {
          throw new Error(
            `Reconciliation assertion failed for farmer ${farmer.member_code}: line items total (${itemsSumRow.total}) != net settlement amount (${netAmountPaise}).`
          );
        }

        totalBatchNet += netAmountPaise;
      }

      if (eligibleFarmerCount === 0) {
        throw new Error('Cannot finalize an empty settlement batch with no eligible financial activity.');
      }

      // Update period status to FINALIZED
      const nowIso = this.dateProvider.getNowIso();
      settlementRepository.finalizePeriod(db, period.id, session.userId, nowIso);

      // Audit log event
      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'SETTLEMENT_FINALIZED',
        entityName: 'settlement_periods',
        entityId: String(period.id),
        details: {
          settlementNumber: period.settlement_number,
          periodStart: period.period_start,
          periodEnd: period.period_end,
          farmerCount: eligibleFarmerCount,
          itemCount: totalBatchItemsCount,
          totalNetPaise: totalBatchNet,
        },
      });
    });

    finalizeTx();

    const updated = settlementRepository.getPeriodById(db, period.id)!;
    return this.mapPeriodToDto(updated);
  }

  listFarmerSettlements(
    db: Database.Database,
    filter: { periodId?: number; farmerId?: number; memberCode?: string } | undefined,
    webContentsId: number
  ): WeeklySettlementDto[] {
    sessionService.requireAuthenticated(webContentsId);

    let rows: WeeklySettlementRow[] = [];
    if (filter?.periodId) {
      rows = settlementRepository.getWeeklySettlementsByPeriod(db, filter.periodId);
    } else if (filter?.farmerId) {
      rows = settlementRepository.getWeeklySettlementsByFarmer(db, filter.farmerId);
    } else if (filter?.memberCode) {
      const farmer = farmerRepository.getByMemberCode(db, filter.memberCode);
      if (farmer) {
        rows = settlementRepository.getWeeklySettlementsByFarmer(db, farmer.id);
      }
    } else {
      const activeDraft = settlementRepository.getActiveDraftPeriod(db);
      if (activeDraft) {
        rows = settlementRepository.getWeeklySettlementsByPeriod(db, activeDraft.id);
      }
    }

    return rows.map((r) => {
      const allocatedPaise = paymentRepository.getAllocationsBySettlementId(db, r.id).reduce(
        (sum, a) => sum + a.allocated_paise,
        0
      );
      const outstandingAmountPaise = r.net_amount_paise - allocatedPaise;

      return {
        id: r.id,
        settlementPeriodId: r.settlement_period_id,
        farmerId: r.farmer_id,
        memberCodeSnapshot: r.member_code_snapshot,
        farmerNameMrSnapshot: r.farmer_name_mr_snapshot,
        farmerNameEnSnapshot: r.farmer_name_en_snapshot,
        openingBalancePaise: r.opening_balance_paise,
        milkQuantityMl: r.milk_quantity_ml,
        milkCollectionCount: r.milk_collection_count,
        milkAmountPaise: r.milk_amount_paise,
        creditAmountPaise: r.credit_amount_paise,
        deductionAmountPaise: r.deduction_amount_paise,
        advanceAmountPaise: r.advance_amount_paise,
        netAmountPaise: r.net_amount_paise,
        createdAt: r.created_at,
        allocatedPaymentPaise: allocatedPaise,
        outstandingAmountPaise,
      };
    });
  }

  getOutstanding(db: Database.Database, farmerId: number, webContentsId: number): FarmerOutstandingDto {
    sessionService.requireAuthenticated(webContentsId);

    const farmer = farmerRepository.getById(db, farmerId);
    if (!farmer) {
      throw new Error(`Farmer with ID ${farmerId} not found.`);
    }

    const totalFinalizedNetPaise = paymentRepository.getFarmerFinalizedSettlementsTotalNet(db, farmer.id);
    const totalActivePaidPaise = paymentRepository.getFarmerTotalActivePayments(db, farmer.id);

    const outstandingBalancePaise = Math.max(totalFinalizedNetPaise - totalActivePaidPaise, 0);

    return {
      farmerId: farmer.id,
      memberCode: farmer.member_code,
      farmerNameMr: farmer.name_mr,
      farmerNameEn: farmer.name_en,
      totalFinalizedNetPaise,
      totalActivePaidPaise,
      outstandingBalancePaise,
      canRecordPayment: outstandingBalancePaise > 0,
    };
  }

  private mapPeriodToDto(row: SettlementPeriodRow): SettlementPeriodDto {
    return {
      id: row.id,
      settlementNumber: row.settlement_number,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      status: row.status,
      createdByUserId: row.created_by_user_id,
      createdByName: row.created_by_name || 'System User',
      createdAt: row.created_at,
      finalizedByUserId: row.finalized_by_user_id,
      finalizedByName: row.finalized_by_name || null,
      finalizedAt: row.finalized_at,
      cancelledByUserId: row.cancelled_by_user_id,
      cancelledByName: row.cancelled_by_name || null,
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      updatedAt: row.updated_at,
      settlementsCount: row.settlements_count || 0,
      totalNetAmountPaise: row.total_net_paise || 0,
    };
  }
}

export const settlementService = new SettlementService();
