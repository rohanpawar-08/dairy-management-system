import Database from 'better-sqlite3';
import {
  AdjustmentCategory,
  AdjustmentDto,
  AdjustmentEntryType,
  AdjustmentFilter,
  CreateAdjustmentPayload,
  VoidAdjustmentPayload,
} from '../../shared/ipc-contracts';
import { formatPaiseAsRupees, parseRupeesToPaise } from '../../shared/money';
import { adjustmentRepository, AdjustmentRow } from '../db/adjustment.repository';
import { farmerRepository } from '../db/farmer.repository';
import { sessionService } from '../core/session.service';
import { auditService } from './audit.service';
import { adjustmentNumberService } from './adjustment-number.service';

export interface BusinessDateProvider {
  getTodayBusinessDate(): string;
  getNowIso(): string;
}

export const defaultDateProvider: BusinessDateProvider = {
  getTodayBusinessDate(): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  },
  getNowIso(): string {
    return new Date().toISOString();
  },
};

const CATEGORY_LABELS: Record<AdjustmentCategory, { mr: string; en: string }> = {
  CASH_ADVANCE: { mr: 'रक्कम उचल (कॅश अॅडव्हान्स)', en: 'Cash Advance' },
  CATTLE_FEED: { mr: 'पशुखाद्य (सरकी पेंड/पशुआहार)', en: 'Cattle Feed' },
  MEDICINE: { mr: 'वैद्यकीय / औषध कपात', en: 'Veterinary Medicine' },
  LOAN_RECOVERY: { mr: 'कर्ज / उचल वसुली', en: 'Loan Recovery' },
  EQUIPMENT: { mr: 'डेअरी साहित्य कपात', en: 'Dairy Equipment' },
  OTHER_DEDUCTION: { mr: 'इतर कपात', en: 'Other Deduction' },
  BONUS: { mr: 'बोनस / विशेष रक्कम', en: 'Bonus / Incentive' },
  PRICE_CORRECTION: { mr: 'दर फरक / दुरुस्ती जमा', en: 'Price Correction Credit' },
  OTHER_CREDIT: { mr: 'इतर जमा', en: 'Other Credit' },
};

export class AdjustmentService {
  constructor(private dateProvider: BusinessDateProvider = defaultDateProvider) {}

  createAdjustment(
    db: Database.Database,
    payload: CreateAdjustmentPayload,
    webContentsId: number
  ): AdjustmentDto {
    // 1. Enforce Owner role
    const session = sessionService.requireRole(webContentsId, 'OWNER');

    // 2. Resolve farmer
    let farmer = null;
    if (payload.farmerId) {
      farmer = farmerRepository.getById(db, payload.farmerId);
    } else if (payload.memberCode) {
      farmer = farmerRepository.getByMemberCode(db, payload.memberCode);
    } else {
      throw new Error('Either farmerId or memberCode is required.');
    }

    if (!farmer) {
      throw new Error('Farmer not found.');
    }

    // Rule: New adjustments may be created ONLY for active farmers
    if (farmer.is_active !== 1) {
      throw new Error(
        `Cannot create adjustment for inactive farmer ${farmer.member_code} (${farmer.name_mr}).`
      );
    }

    // 3. Validate Entry Type & Category
    const entryType = payload.entryType;
    if (!['ADVANCE', 'DEDUCTION', 'CREDIT'].includes(entryType)) {
      throw new Error(`Invalid entry type '${entryType}'. Must be ADVANCE, DEDUCTION, or CREDIT.`);
    }

    const category = payload.category;
    this.validateCategoryForEntryType(entryType, category);

    // 4. Parse & Validate Money Amount
    let amountPaise = 0;
    if (typeof payload.amountRupees === 'number') {
      if (payload.amountRupees <= 0 || !Number.isFinite(payload.amountRupees)) {
        throw new Error('Adjustment amount must be a positive number.');
      }
      amountPaise = Math.round(payload.amountRupees * 100);
    } else if (typeof payload.amountRupees === 'string') {
      amountPaise = parseRupeesToPaise(payload.amountRupees);
    } else {
      throw new Error('Valid amount in rupees is required.');
    }

    if (amountPaise <= 0) {
      throw new Error('Adjustment amount must be strictly greater than zero.');
    }

    // 5. Validate Reason
    const trimmedReason = payload.reason?.trim();
    if (!trimmedReason || trimmedReason.length === 0) {
      throw new Error('A mandatory reason is required for every adjustment.');
    }

    if ((category === 'OTHER_DEDUCTION' || category === 'OTHER_CREDIT') && trimmedReason.length < 3) {
      throw new Error('A descriptive reason (at least 3 characters) is required for custom category entries.');
    }

    // 6. Validate Business Date
    let businessDate = payload.businessDate?.trim();
    if (!businessDate) {
      businessDate = this.dateProvider.getTodayBusinessDate();
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
      throw new Error('Business date must be in YYYY-MM-DD format.');
    }

    const nowIso = this.dateProvider.getNowIso();

    // 7. Atomic Transaction: Generate Reference Number -> Insert -> Audit Log
    const createTx = db.transaction((): AdjustmentDto => {
      const referenceNumber = adjustmentNumberService.generateReferenceNumber(db, businessDate);

      const id = adjustmentRepository.insert(db, {
        referenceNumber,
        farmerId: farmer.id,
        businessDate,
        entryType,
        category,
        amountPaise,
        reason: trimmedReason,
        notes: payload.notes?.trim() || null,
        createdByUserId: session.userId,
        nowIso,
      });

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'FARMER_ADJUSTMENT_CREATED',
        entityName: 'adjustments_and_deductions',
        entityId: String(id),
        details: {
          id,
          referenceNumber,
          farmerId: farmer.id,
          memberCode: farmer.member_code,
          entryType,
          category,
          amountPaise,
          businessDate,
        },
        createdAt: nowIso,
      });

      const row = adjustmentRepository.getById(db, id);
      if (!row) {
        throw new Error('Failed to retrieve newly created adjustment.');
      }
      return this.mapToDto(row);
    });

    return createTx();
  }

  voidAdjustment(
    db: Database.Database,
    payload: VoidAdjustmentPayload,
    webContentsId: number
  ): AdjustmentDto {
    // 1. Enforce Owner role
    const session = sessionService.requireRole(webContentsId, 'OWNER');

    const trimmedReason = payload.reason?.trim();
    if (!trimmedReason || trimmedReason.length === 0) {
      throw new Error('A mandatory void reason is required.');
    }

    const existing = adjustmentRepository.getById(db, payload.adjustmentId);
    if (!existing) {
      throw new Error(`Adjustment #${payload.adjustmentId} not found.`);
    }

    if (existing.status === 'VOIDED') {
      throw new Error(`Adjustment #${payload.adjustmentId} is already voided.`);
    }

    const nowIso = this.dateProvider.getNowIso();

    const voidTx = db.transaction((): AdjustmentDto => {
      adjustmentRepository.voidAdjustment(
        db,
        payload.adjustmentId,
        session.userId,
        trimmedReason,
        nowIso
      );

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'FARMER_ADJUSTMENT_VOIDED',
        entityName: 'adjustments_and_deductions',
        entityId: String(payload.adjustmentId),
        details: {
          id: payload.adjustmentId,
          referenceNumber: existing.reference_number,
          farmerId: existing.farmer_id,
          entryType: existing.entry_type,
          category: existing.category,
          amountPaise: existing.amount_paise,
          businessDate: existing.business_date,
          voidReason: trimmedReason,
        },
        createdAt: nowIso,
      });

      const updated = adjustmentRepository.getById(db, payload.adjustmentId);
      if (!updated) {
        throw new Error('Failed to retrieve voided adjustment.');
      }
      return this.mapToDto(updated);
    });

    return voidTx();
  }

  getAdjustmentById(db: Database.Database, id: number, webContentsId?: number): AdjustmentDto {
    if (webContentsId !== undefined) {
      sessionService.requireAuthenticated(webContentsId);
    }
    const row = adjustmentRepository.getById(db, id);
    if (!row) {
      throw new Error(`Adjustment #${id} not found.`);
    }
    return this.mapToDto(row);
  }

  listAdjustments(
    db: Database.Database,
    filter?: AdjustmentFilter,
    webContentsId?: number
  ): AdjustmentDto[] {
    if (webContentsId !== undefined) {
      sessionService.requireAuthenticated(webContentsId);
    }
    const rows = adjustmentRepository.listAll(db, filter);
    return rows.map((r) => this.mapToDto(r));
  }

  private validateCategoryForEntryType(entryType: AdjustmentEntryType, category: AdjustmentCategory): void {
    const validMap: Record<AdjustmentEntryType, AdjustmentCategory[]> = {
      ADVANCE: ['CASH_ADVANCE'],
      DEDUCTION: ['CATTLE_FEED', 'MEDICINE', 'LOAN_RECOVERY', 'EQUIPMENT', 'OTHER_DEDUCTION'],
      CREDIT: ['BONUS', 'PRICE_CORRECTION', 'OTHER_CREDIT'],
    };

    const allowed = validMap[entryType];
    if (!allowed || !allowed.includes(category)) {
      throw new Error(
        `Category '${category}' is not valid for entry type '${entryType}'. Allowed categories: ${allowed.join(', ')}.`
      );
    }
  }

  mapToDto(row: AdjustmentRow): AdjustmentDto {
    const labels = CATEGORY_LABELS[row.category] || { mr: row.category, en: row.category };

    return {
      id: row.id,
      referenceNumber: row.reference_number,
      farmerId: row.farmer_id,
      farmerMemberCode: row.farmer_member_code || '',
      farmerNameMr: row.farmer_name_mr || '',
      farmerNameEn: row.farmer_name_en || null,
      businessDate: row.business_date,
      entryType: row.entry_type,
      category: row.category,
      categoryLabelMr: labels.mr,
      categoryLabelEn: labels.en,
      amountPaise: row.amount_paise,
      amountRupeesFormatted: formatPaiseAsRupees(row.amount_paise),
      reason: row.reason,
      notes: row.notes,
      status: row.status,
      createdByUserId: row.created_by_user_id,
      createdByName: row.created_by_name || 'System',
      createdAt: row.created_at,
      voidedByUserId: row.voided_by_user_id,
      voidedByName: row.voided_by_name || null,
      voidedAt: row.voided_at,
      voidReason: row.void_reason,
      updatedAt: row.updated_at,
    };
  }
}

export const adjustmentService = new AdjustmentService();
