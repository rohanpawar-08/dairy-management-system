import Database from 'better-sqlite3';
import { reportRepository } from '../db/report.repository';
import { shiftRepository } from '../db/shift.repository';
import { farmerRepository } from '../db/farmer.repository';
import { ratePlanRepository } from '../db/rate-plan.repository';
import { ledgerService } from './ledger.service';
import { 
  DashboardSummaryDto, 
  ReportPreviewRequest,
  ReportPreviewResult,
  PaymentMethod,
  PaymentStatus,
  PdfExportRequest,
  PdfExportResult
} from '../../shared/ipc-contracts';
import { reportTemplateService } from './report-template.service';
import { pdfExportService } from './pdf-export.service';
import { businessDateProvider } from '../utils/business-date';
function getIndiaDateString() { return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }); }
import { formatPaiseAsRupees } from '../../shared/money';
function formatRupees(paise: number) { return '₹' + formatPaiseAsRupees(paise); }
function getWeeklySettlementDates(baseDateStr: string, startDayOfWeek: string): { start: string; end: string } {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const startIdx = days.indexOf(startDayOfWeek.toUpperCase());
  const d = new Date(baseDateStr);
  let diff = d.getDay() - startIdx;
  if (diff < 0) diff += 7;
  const start = new Date(d);
  start.setDate(start.getDate() - diff);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  // manual format to avoid tz shifting
  const formatIso = (dt: Date) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const dStr = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${dStr}`;
  };
  return { start: formatIso(start), end: formatIso(end) };
}

function formatLitres(ml: number): string {
  return (ml / 1000).toFixed(1);
}

function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('Invalid denominator');
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return quotient + (remainder * 2n >= denominator ? 1n : 0n);
}

function calculateWeightedAvg(sumProduct: number, totalQuantityMl: number): string {
  if (totalQuantityMl === 0) return '0.00';
  // Use Math.trunc to ensure exact integer parsing from SQLite without floating point rounding
  const avgBigInt = divideRoundHalfUp(BigInt(Math.trunc(sumProduct)), BigInt(Math.trunc(totalQuantityMl)));
  if (avgBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Weighted average exceeds safe integer bounds');
  }
  const avg = Number(avgBigInt);
  return (avg / 100).toFixed(2);
}

export const reportService = {
  getDashboardSummary(db: Database.Database): DashboardSummaryDto {
    const bizDate = businessDateProvider.getToday();
    
    const row = db.prepare('SELECT settlement_start_day FROM dairy_profile WHERE id = 1').get() as { settlement_start_day?: string } | undefined;
    const startDay = row?.settlement_start_day || 'MONDAY';
    
    // Find current week bounds
    const dates = getWeeklySettlementDates(bizDate, startDay);
    
    const currentShift = shiftRepository.getCurrentOpenShift(db);
    
    const baseData = reportRepository.getDashboardSummaryBaseData(db, bizDate, dates.start, dates.end);
    
    const readinessWarnings: string[] = [];
    const cowPlans = ratePlanRepository.listPlans(db, { milkType: 'COW', status: 'APPROVED' });
    const buffaloPlans = ratePlanRepository.listPlans(db, { milkType: 'BUFFALO', status: 'APPROVED' });
    
    const hasCow = cowPlans.some(p => p.effective_from <= bizDate && (!p.effective_to || p.effective_to >= bizDate));
    const hasBuffalo = buffaloPlans.some(p => p.effective_from <= bizDate && (!p.effective_to || p.effective_to >= bizDate));
    
    if (!hasCow) readinessWarnings.push('COMMON.MILK_COW');
    if (!hasBuffalo) readinessWarnings.push('COMMON.MILK_BUFFALO');

    // format recent payments
    const recentPayments = baseData.recentPayments.map((p: any) => ({
      id: p.id,
      paymentNumber: p.payment_number,
      farmerId: p.farmer_id,
      farmerMemberCode: p.farmer_member_code,
      farmerNameMr: p.farmer_name_mr,
      farmerNameEn: p.farmer_name_en,
      businessDate: p.business_date,
      amountPaise: p.amount_paise,
      paymentMethod: p.payment_method,
      externalReference: p.external_reference,
      notes: p.notes,
      status: p.status,
      createdByUserId: p.created_by_user_id,
      createdByName: p.created_by_name,
      createdAt: p.created_at,
      voidedByUserId: p.voided_by_user_id,
      voidedByName: p.voided_by_name,
      voidedAt: p.voided_at,
      voidReason: p.void_reason,
      updatedAt: p.updated_at
    }));

    // Build current shift summary if exists
    let shiftSummary = null;
    if (currentShift) {
      shiftSummary = {
        shiftId: currentShift.id,
        businessDate: currentShift.business_date,
        shiftType: currentShift.shift_type,
        status: currentShift.status,
        totalActiveCollections: 0,
        uniqueFarmersCount: 0,
        cowQuantityMl: 0,
        cowAmountPaise: 0,
        buffaloQuantityMl: 0,
        buffaloAmountPaise: 0,
        totalQuantityMl: 0,
        totalAmountPaise: 0,
        totalVoidedCollections: 0,
        cowLitresFormatted: '0.0',
        cowAmountFormatted: '0.00',
        buffaloLitresFormatted: '0.0',
        buffaloAmountFormatted: '0.00',
        totalLitresFormatted: '0.0',
        totalAmountFormatted: '0.00'
      };
    }

    return {
      indiaBusinessDate: bizDate,
      currentShift: shiftSummary,
      todayLitresFormatted: formatLitres(baseData.today.todayLitres),
      todayAmountFormatted: formatRupees(baseData.today.todayAmount),
      todayCollectionCount: baseData.today.todayCount,
      cowLitresFormatted: formatLitres(baseData.today.cowLitres),
      buffaloLitresFormatted: formatLitres(baseData.today.buffaloLitres),
      todayActiveFarmers: baseData.today.todayActiveFarmers,
      currentWeekLitresFormatted: formatLitres(baseData.week.weekLitres),
      currentWeekAmountFormatted: formatRupees(baseData.week.weekAmount),
      latestFinalizedSettlementNumber: baseData.latestSettlement,
      totalFarmerPayableFormatted: formatRupees(baseData.totalFarmerPayable),
      totalFarmerDebtFormatted: formatRupees(baseData.totalFarmerDebt),
      unpaidFarmerCount: baseData.unpaidFarmerCount,
      recentPayments,
      readinessWarnings
    };
  },

  previewReport(db: Database.Database, payload: ReportPreviewRequest): ReportPreviewResult {
    if (payload.reportType === 'DAILY_COLLECTION_SUMMARY') {
      if (!payload.fromDate || !payload.toDate) throw new Error("fromDate and toDate required");
      if (payload.fromDate > payload.toDate) throw new Error("fromDate cannot be after toDate");
      const raw = reportRepository.getDailyCollectionSummary(db, payload.fromDate, payload.toDate);
      
      return {
        fromDate: payload.fromDate,
        toDate: payload.toDate,
        generatedAt: getIndiaDateString(),
        totalCollections: raw.totalCollections,
        uniqueFarmers: raw.uniqueFarmers,
        totalLitresFormatted: formatLitres(raw.totalQuantityMl),
        totalAmountFormatted: formatRupees(raw.totalAmountPaise),
        
        cowLitresFormatted: formatLitres(raw.cowQuantityMl),
        cowAmountFormatted: formatRupees(raw.cowAmountPaise),
        cowFatAvg: calculateWeightedAvg(raw.cowFatSum, raw.cowQuantityMl),
        cowSnfAvg: calculateWeightedAvg(raw.cowSnfSum, raw.cowQuantityMl),
        
        buffaloLitresFormatted: formatLitres(raw.buffaloQuantityMl),
        buffaloAmountFormatted: formatRupees(raw.buffaloAmountPaise),
        buffaloFatAvg: calculateWeightedAvg(raw.buffaloFatSum, raw.buffaloQuantityMl),
        buffaloSnfAvg: calculateWeightedAvg(raw.buffaloSnfSum, raw.buffaloQuantityMl),
        
        morningLitresFormatted: formatLitres(raw.morningQuantityMl),
        morningAmountFormatted: formatRupees(raw.morningAmountPaise),
        eveningLitresFormatted: formatLitres(raw.eveningQuantityMl),
        eveningAmountFormatted: formatRupees(raw.eveningAmountPaise)
      };
    }
    
    if (payload.reportType === 'SHIFT_COLLECTION_REPORT') {
      if (!payload.shiftId) throw new Error("shiftId required");
      const raw = reportRepository.getShiftCollectionReport(db, payload.shiftId);
      if (!raw) throw new Error("Shift not found");
      
      return {
        generatedAt: getIndiaDateString(),
        shift: raw.shift,
        stats: {
          totalCollections: raw.stats.totalCollections,
          activeCollections: raw.stats.activeCollections,
          voidedCollections: raw.stats.voidedCollections,
          cowLitresFormatted: formatLitres(raw.stats.cowQuantityMl),
          cowAmountFormatted: formatRupees(raw.stats.cowAmountPaise),
          buffaloLitresFormatted: formatLitres(raw.stats.buffaloQuantityMl),
          buffaloAmountFormatted: formatRupees(raw.stats.buffaloAmountPaise),
          totalLitresFormatted: formatLitres(raw.stats.cowQuantityMl + raw.stats.buffaloQuantityMl),
          totalAmountFormatted: formatRupees(raw.stats.cowAmountPaise + raw.stats.buffaloAmountPaise)
        },
        collections: raw.collections.map((c: any) => ({
          ...c,
          quantity_litres_formatted: formatLitres(c.quantity_ml),
          fat_formatted: (c.fat_x100 / 100).toFixed(2),
          snf_formatted: (c.snf_x100 / 100).toFixed(2),
          rate_rupees_formatted: formatRupees(c.rate_applied_paise),
          amount_rupees_formatted: formatRupees(c.amount_paise)
        }))
      };
    }

    if (payload.reportType === 'FARMER_LEDGER_STATEMENT') {
      if (!payload.farmerId) throw new Error("farmerId required");
      const ledger = ledgerService.getFarmerLedger(db, {
        farmerId: payload.farmerId,
        fromDate: payload.fromDate,
        toDate: payload.toDate,
        includeVoided: false
      });
      return {
        generatedAt: getIndiaDateString(),
        ledger
      };
    }

    if (payload.reportType === 'SETTLEMENT_BATCH_REPORT') {
      if (!payload.settlementPeriodId) throw new Error("settlementPeriodId required");
      const raw = reportRepository.getSettlementBatchReport(db, payload.settlementPeriodId);
      if (!raw) throw new Error("Settlement period not found or not finalized");

      return {
        generatedAt: getIndiaDateString(),
        period: raw.period,
        items: raw.items.map((i: any) => ({
          ...i,
          milk_litres_formatted: formatLitres(i.milk_quantity_ml),
          milk_amount_formatted: formatRupees(i.milk_amount_paise),
          credit_amount_formatted: formatRupees(i.credit_amount_paise),
          deduction_amount_formatted: formatRupees(i.deduction_amount_paise),
          advance_amount_formatted: formatRupees(i.advance_amount_paise),
          net_amount_formatted: formatRupees(i.net_amount_paise),
          allocated_formatted: formatRupees(i.allocated_paise),
          outstanding_formatted: formatRupees(i.outstanding_paise)
        }))
      };
    }

    if (payload.reportType === 'PAYMENT_REGISTER') {
      const raw = reportRepository.getPaymentRegister(db, {
        fromDate: payload.fromDate,
        toDate: payload.toDate,
        farmerId: payload.farmerId,
        method: payload.paymentMethod,
        status: payload.status as PaymentStatus
      });
      
      let totalAmountPaise = 0;
      const payments = raw.map(p => {
        if (p.status === 'RECORDED') {
          totalAmountPaise += p.amount_paise;
        }
        return {
          ...p,
          amount_formatted: formatRupees(p.amount_paise)
        };
      });

      return {
        generatedAt: getIndiaDateString(),
        filters: {
          fromDate: payload.fromDate,
          toDate: payload.toDate,
          farmerId: payload.farmerId,
          method: payload.paymentMethod,
          status: payload.status
        },
        totalAmountFormatted: formatRupees(totalAmountPaise),
        payments
      };
    }

    if (payload.reportType === 'OUTSTANDING_FARMER_REPORT') {
      const raw = reportRepository.getOutstandingFarmerReport(db);
      
      let totalPayable = 0;
      let totalDebt = 0;
      
      const items = raw.map(i => {
        if (i.outstanding > 0) totalPayable += i.outstanding;
        else if (i.outstanding < 0) totalDebt += Math.abs(i.outstanding);
        
        return {
          ...i,
          total_net_formatted: formatRupees(i.total_net),
          total_paid_formatted: formatRupees(i.total_paid),
          outstanding_formatted: formatRupees(i.outstanding)
        };
      });

      return {
        generatedAt: getIndiaDateString(),
        totalPayableFormatted: formatRupees(totalPayable),
        totalDebtFormatted: formatRupees(totalDebt),
        items
      };
    }

    throw new Error(`Unsupported report type: \${payload.reportType}`);
  },

  async exportPdf(db: Database.Database, payload: PdfExportRequest): Promise<PdfExportResult> {
    const data = this.previewReport(db, payload);
    const profile = db.prepare('SELECT dairy_name_en, dairy_name_mr FROM dairy_profile WHERE id = 1').get();
    const html = reportTemplateService.generateHtml(payload.reportType, data, profile);
    return await pdfExportService.exportHtmlToPdf(html, payload.suggestedFilename);
  }
};
