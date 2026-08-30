import Database from 'better-sqlite3';
import {
  BalanceDirection,
  GetFarmerLedgerPayload,
  LedgerItemDto,
  LedgerSourceType,
  LedgerSummaryDto,
} from '../../shared/ipc-contracts';
import { formatPaiseAsRupees } from '../../shared/money';
import { farmerRepository } from '../db/farmer.repository';
import { ledgerRepository } from '../db/ledger.repository';
import { sessionService } from '../core/session.service';
import { AdjustmentCategory } from '../../shared/ipc-contracts';

const CATEGORY_LABELS_MR: Record<AdjustmentCategory, string> = {
  CASH_ADVANCE: 'रक्कम उचल (कॅश अॅडव्हान्स)',
  CATTLE_FEED: 'पशुखाद्य (सरकी पेंड/पशुआहार)',
  MEDICINE: 'वैद्यकीय / औषध कपात',
  LOAN_RECOVERY: 'कर्ज / उचल वसुली',
  EQUIPMENT: 'डेअरी साहित्य कपात',
  OTHER_DEDUCTION: 'इतर कपात',
  BONUS: 'बोनस / विशेष रक्कम',
  PRICE_CORRECTION: 'दर फरक / दुरुस्ती जमा',
  OTHER_CREDIT: 'इतर जमा',
};

interface RawLedgerItem {
  id: string;
  sourceType: LedgerSourceType;
  sourceId: number;
  referenceNumber: string;
  businessDate: string;
  description: string;
  creditPaise: number;
  debitPaise: number;
  signedAmountPaise: number;
  status: 'ACTIVE' | 'VOIDED';
  createdAt: string;
}

export class LedgerService {
  getFarmerLedger(
    db: Database.Database,
    payload: GetFarmerLedgerPayload,
    webContentsId?: number
  ): LedgerSummaryDto {
    if (webContentsId !== undefined) {
      sessionService.requireAuthenticated(webContentsId);
    }

    // 1. Resolve farmer
    let farmer = null;
    if (payload.farmerId) {
      farmer = farmerRepository.getById(db, payload.farmerId);
    } else if (payload.memberCode) {
      farmer = farmerRepository.getByMemberCode(db, payload.memberCode);
    } else {
      throw new Error('Either farmerId or memberCode is required to view ledger.');
    }

    if (!farmer) {
      throw new Error('Farmer not found for ledger query.');
    }

    // Note: Ledger viewing is allowed for inactive farmers as per requirements!

    const rawData = ledgerRepository.getFarmerRawSourceData(db, farmer.id);

    // 2. Build complete raw item list
    const allItems: RawLedgerItem[] = [];

    // A. Opening balance synthetic item
    const obDate = farmer.created_at ? farmer.created_at.substring(0, 10) : '2000-01-01';
    const obPaise = farmer.opening_balance_paise;
    allItems.push({
      id: `OB-${farmer.id}`,
      sourceType: 'OPENING_BALANCE',
      sourceId: farmer.id,
      referenceNumber: `OB-${farmer.member_code}`,
      businessDate: obDate,
      description: 'आरंभीची शिल्लक (Opening Balance)',
      creditPaise: obPaise > 0 ? obPaise : 0,
      debitPaise: obPaise < 0 ? Math.abs(obPaise) : 0,
      signedAmountPaise: obPaise,
      status: 'ACTIVE',
      createdAt: farmer.created_at || `${obDate}T00:00:00.000Z`,
    });

    // B. Milk Collections
    for (const m of rawData.collections) {
      const isActive = m.status === 'ACTIVE';
      const creditPaise = isActive ? m.amount_paise : 0;
      const litresFormatted = (m.quantity_ml / 1000).toFixed(1);
      const fatFormatted = (m.fat_x100 / 100).toFixed(1);
      const snfFormatted = (m.snf_x100 / 100).toFixed(1);
      const milkTypeLabel = m.milk_type === 'COW' ? 'गाय' : 'म्हैस';

      allItems.push({
        id: `MC-${m.id}`,
        sourceType: 'MILK_COLLECTION',
        sourceId: m.id,
        referenceNumber: m.receipt_number,
        businessDate: m.business_date,
        description: `दूध संकलन: ${milkTypeLabel} (${litresFormatted}L, FAT ${fatFormatted}%, SNF ${snfFormatted}%)`,
        creditPaise,
        debitPaise: 0,
        signedAmountPaise: creditPaise,
        status: m.status as 'ACTIVE' | 'VOIDED',
        createdAt: m.created_at,
      });
    }

    // C. Adjustments, Deductions, Advances
    for (const a of rawData.adjustments) {
      const isActive = a.status === 'ACTIVE';
      const catLabel = CATEGORY_LABELS_MR[a.category] || a.category;
      const desc = `${catLabel}: ${a.reason}`;

      let creditPaise = 0;
      let debitPaise = 0;
      let signedAmountPaise = 0;

      if (a.entry_type === 'CREDIT') {
        creditPaise = isActive ? a.amount_paise : 0;
        signedAmountPaise = creditPaise;
      } else if (a.entry_type === 'DEDUCTION' || a.entry_type === 'ADVANCE') {
        debitPaise = isActive ? a.amount_paise : 0;
        signedAmountPaise = -debitPaise;
      }

      const sourceTypeMap: Record<string, LedgerSourceType> = {
        CREDIT: 'CREDIT',
        DEDUCTION: 'DEDUCTION',
        ADVANCE: 'ADVANCE',
      };

      allItems.push({
        id: `ADJ-${a.id}`,
        sourceType: sourceTypeMap[a.entry_type] || 'CREDIT',
        sourceId: a.id,
        referenceNumber: a.reference_number,
        businessDate: a.business_date,
        description: desc,
        creditPaise,
        debitPaise,
        signedAmountPaise,
        status: a.status as 'ACTIVE' | 'VOIDED',
        createdAt: a.created_at,
      });
    }

    // 3. Sort items deterministically
    const typePriority: Record<LedgerSourceType, number> = {
      OPENING_BALANCE: 0,
      MILK_COLLECTION: 1,
      CREDIT: 2,
      DEDUCTION: 3,
      ADVANCE: 4,
    };

    allItems.sort((a, b) => {
      if (a.businessDate !== b.businessDate) {
        return a.businessDate.localeCompare(b.businessDate);
      }
      const pA = typePriority[a.sourceType] ?? 9;
      const pB = typePriority[b.sourceType] ?? 9;
      if (pA !== pB) {
        return pA - pB;
      }
      return a.createdAt.localeCompare(b.createdAt);
    });

    // 4. Calculate Summary Totals & Filter Items
    const fromDate = payload.fromDate?.trim() || null;
    const toDate = payload.toDate?.trim() || null;
    const includeVoided = payload.includeVoided ?? false;

    let broughtForwardBalancePaise = 0;
    let milkCreditsPaise = 0;
    let adjustmentCreditsPaise = 0;
    let deductionsPaise = 0;
    let advancesPaise = 0;

    const displayItems: LedgerItemDto[] = [];
    let currentRunningBalance = 0;

    for (const item of allItems) {
      const isBeforeFrom = fromDate && item.businessDate < fromDate;
      const isAfterTo = toDate && item.businessDate > toDate;

      if (isBeforeFrom) {
        // Accumulate into brought forward balance (only active transactions contribute signed amount)
        broughtForwardBalancePaise += item.signedAmountPaise;
      } else {
        if (!fromDate && displayItems.length === 0) {
          // If no fromDate, running balance starts from 0 before first item
          currentRunningBalance = 0;
        } else if (fromDate && displayItems.length === 0) {
          currentRunningBalance = broughtForwardBalancePaise;
        }

        if (item.sourceType !== 'OPENING_BALANCE' && item.status === 'ACTIVE') {
          if (item.sourceType === 'MILK_COLLECTION') {
            milkCreditsPaise += item.creditPaise;
          } else if (item.sourceType === 'CREDIT') {
            adjustmentCreditsPaise += item.creditPaise;
          } else if (item.sourceType === 'DEDUCTION') {
            deductionsPaise += item.debitPaise;
          } else if (item.sourceType === 'ADVANCE') {
            advancesPaise += item.debitPaise;
          }
        }

        // Evaluate whether to include item in display
        const shouldShow = (!isAfterTo) && (includeVoided || item.status === 'ACTIVE');

        if (shouldShow) {
          currentRunningBalance += item.signedAmountPaise;

          displayItems.push({
            id: item.id,
            sourceType: item.sourceType,
            sourceId: item.sourceId,
            referenceNumber: item.referenceNumber,
            businessDate: item.businessDate,
            description: item.description,
            creditPaise: item.creditPaise,
            debitPaise: item.debitPaise,
            signedAmountPaise: item.signedAmountPaise,
            runningBalancePaise: currentRunningBalance,
            status: item.status,
            createdAt: item.createdAt,
            isVoided: item.status === 'VOIDED',
          });
        }
      }
    }

    // Calculate total net balance across all active transactions for this farmer
    let totalAllActivePaise = obPaise;
    for (const item of allItems) {
      if (item.sourceType !== 'OPENING_BALANCE' && item.status === 'ACTIVE') {
        totalAllActivePaise += item.signedAmountPaise;
      }
    }

    const netMovementPaise = milkCreditsPaise + adjustmentCreditsPaise - deductionsPaise - advancesPaise;

    let balanceDirection: BalanceDirection = 'NONE';
    if (totalAllActivePaise > 0) {
      balanceDirection = 'PAYABLE_TO_FARMER';
    } else if (totalAllActivePaise < 0) {
      balanceDirection = 'FARMER_DEBT_TO_DAIRY';
    }

    const asOfDate = payload.asOfDate || new Date().toISOString().substring(0, 10);

    return {
      farmerId: farmer.id,
      memberCode: farmer.member_code,
      farmerNameMr: farmer.name_mr,
      farmerNameEn: farmer.name_en || null,
      isActive: farmer.is_active === 1,
      openingBalancePaise: obPaise,
      openingBalanceFormatted: formatPaiseAsRupees(obPaise),
      milkCreditsPaise,
      milkCreditsFormatted: formatPaiseAsRupees(milkCreditsPaise),
      adjustmentCreditsPaise,
      adjustmentCreditsFormatted: formatPaiseAsRupees(adjustmentCreditsPaise),
      deductionsPaise,
      deductionsFormatted: formatPaiseAsRupees(deductionsPaise),
      advancesPaise,
      advancesFormatted: formatPaiseAsRupees(advancesPaise),
      netMovementPaise,
      netMovementFormatted: formatPaiseAsRupees(netMovementPaise),
      currentBalancePaise: totalAllActivePaise,
      currentBalanceFormatted: formatPaiseAsRupees(totalAllActivePaise),
      balanceDirection,
      broughtForwardBalancePaise,
      broughtForwardBalanceFormatted: formatPaiseAsRupees(broughtForwardBalancePaise),
      fromDate,
      toDate,
      asOfDate,
      items: displayItems,
    };
  }
}

export const ledgerService = new LedgerService();
