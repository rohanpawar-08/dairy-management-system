import Database from 'better-sqlite3';
import {
  CreateMilkCollectionPayload,
  DuplicateCollectionCheckResult,
  MilkCollectionDto,
  RatePlanMilkType,
  VoidCollectionPayload,
} from '../../shared/ipc-contracts';
import {
  calculateCollectionAmountPaise,
  formatMlAsLitres,
  formatPaiseAsRupees,
  formatX100AsPercent,
  parseLitresToMl,
  parsePercentToX100,
} from '../../shared/money';
import { sessionService } from '../core/session.service';
import { farmerRepository } from '../db/farmer.repository';
import {
  MilkCollectionRow,
  milkCollectionRepository,
} from '../db/milk-collection.repository';
import { shiftRepository } from '../db/shift.repository';
import { businessDateProvider } from '../utils/business-date';
import { auditService } from './audit.service';
import { ratePlanService } from './rate-plan.service';
import { receiptNumberService } from './receipt-number.service';

export class MilkCollectionService {
  private mapToDto(row: MilkCollectionRow): MilkCollectionDto {
    return {
      id: row.id,
      receiptNumber: row.receipt_number,
      shiftId: row.shift_id,
      farmerId: row.farmer_id,
      farmerMemberCode: row.farmer_member_code,
      farmerNameMr: row.farmer_name_mr,
      farmerNameEn: row.farmer_name_en,
      businessDate: row.business_date,
      shiftType: row.shift_type,
      milkType: row.milk_type,
      quantityMl: row.quantity_ml,
      quantityLitresFormatted: formatMlAsLitres(row.quantity_ml),
      fatX100: row.fat_x100,
      fatFormatted: `${formatX100AsPercent(row.fat_x100)}%`,
      snfX100: row.snf_x100,
      snfFormatted: `${formatX100AsPercent(row.snf_x100)}%`,
      ratePlanId: row.rate_plan_id,
      ratePlanName: row.rate_plan_name,
      rateAppliedPaise: row.rate_applied_paise,
      rateRupeesFormatted: `₹${formatPaiseAsRupees(row.rate_applied_paise)}/L`,
      amountPaise: row.amount_paise,
      amountRupeesFormatted: `₹${formatPaiseAsRupees(row.amount_paise)}`,
      duplicateConfirmed: row.duplicate_confirmed === 1,
      duplicateReason: row.duplicate_reason,
      status: row.status,
      voidedAt: row.voided_at,
      voidedByUserId: row.voided_by_user_id,
      voidedByName: row.voided_by_name,
      voidReason: row.void_reason,
      createdByUserId: row.created_by_user_id,
      createdByName: row.created_by_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  createCollection(
    db: Database.Database,
    payload: CreateMilkCollectionPayload,
    webContentsId: number
  ): MilkCollectionDto {
    const session = sessionService.requireAuthenticated(webContentsId);

    // 1. Verify shift exists and is OPEN
    const shift = shiftRepository.getById(db, payload.shiftId);
    if (!shift) {
      throw new Error(`Shift #${payload.shiftId} not found.`);
    }
    if (shift.status !== 'OPEN') {
      throw new Error(
        `Cannot record collection: Shift #${shift.id} (${shift.business_date} ${shift.shift_type}) is ${shift.status}.`
      );
    }

    // 2. Resolve active farmer
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
    if (farmer.is_active !== 1) {
      throw new Error(
        `Farmer ${farmer.member_code} (${farmer.name_mr}) is deactivated. Collections are not allowed.`
      );
    }

    // 3. Validate milk type
    if (payload.milkType !== 'COW' && payload.milkType !== 'BUFFALO') {
      throw new Error("Milk type must be strictly 'COW' or 'BUFFALO'. 'BOTH' is not a valid collection milk type.");
    }

    // 3b. Validate against dairy enabled milk types
    const enabledSetting = db
      .prepare("SELECT value FROM app_settings WHERE key = 'enabled_milk_types'")
      .get() as { value?: string } | undefined;
    const enabledMilkTypes = (enabledSetting?.value as 'COW' | 'BUFFALO' | 'BOTH') || 'BOTH';

    if (enabledMilkTypes === 'COW' && payload.milkType !== 'COW') {
      throw new Error(
        "This dairy centre is configured for COW milk only. BUFFALO collection is rejected. (हे संकलन केंद्र फक्त गाय दूध स्वीकारते.)"
      );
    }
    if (enabledMilkTypes === 'BUFFALO' && payload.milkType !== 'BUFFALO') {
      throw new Error(
        "This dairy centre is configured for BUFFALO milk only. COW collection is rejected. (हे संकलन केंद्र फक्त म्हैस दूध स्वीकारते.)"
      );
    }

    // 4. Exact quantity, FAT and SNF conversion
    const quantityMl = parseLitresToMl(payload.quantityLitres);
    const fatX100 = parsePercentToX100(payload.fatPercent);
    const snfX100 = parsePercentToX100(payload.snfPercent);

    if (quantityMl <= 0) {
      throw new Error('Milk quantity must be greater than zero.');
    }
    if (fatX100 <= 0 || snfX100 <= 0) {
      throw new Error('FAT and SNF percentages must be greater than zero.');
    }

    // 5. Authoritative rate resolution
    const rateResolution = ratePlanService.resolveApprovedRate(
      db,
      {
        milkType: payload.milkType,
        businessDate: shift.business_date,
        fatX100,
        snfX100,
        quantityMl,
      },
      webContentsId
    );

    // 6. Duplicate detection
    const existingDuplicates = milkCollectionRepository.getActiveDuplicates(
      db,
      shift.id,
      farmer.id,
      payload.milkType
    );

    if (existingDuplicates.length > 0) {
      if (!payload.duplicateConfirmed) {
        throw new Error(
          `DUPLICATE_COLLECTION: An active collection already exists for farmer ${farmer.member_code} in this shift. Explicit confirmation is required.`
        );
      }
      if (!payload.duplicateReason || !payload.duplicateReason.trim()) {
        throw new Error('A duplicate reason is mandatory when recording multiple deliveries.');
      }
    }

    const nowIso = businessDateProvider.getNowIso();

    // 7. Atomic transaction for receipt number allocation, collection insert, and audit logging
    const createTx = db.transaction((): MilkCollectionDto => {
      const receiptNumber = receiptNumberService.getNextReceiptNumber(
        db,
        shift.business_date,
        shift.shift_type
      );

      const collectionId = milkCollectionRepository.insertCollection(db, {
        receiptNumber,
        shiftId: shift.id,
        farmerId: farmer.id,
        businessDate: shift.business_date,
        shiftType: shift.shift_type,
        milkType: payload.milkType,
        quantityMl,
        fatX100,
        snfX100,
        ratePlanId: rateResolution.ratePlanId,
        rateAppliedPaise: rateResolution.ratePaisePerLitre,
        amountPaise:
          rateResolution.amountPaise ??
          calculateCollectionAmountPaise(quantityMl, rateResolution.ratePaisePerLitre),
        duplicateConfirmed: !!payload.duplicateConfirmed,
        duplicateReason: payload.duplicateReason || null,
        createdByUserId: session.userId,
        nowIso,
      });

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'MILK_COLLECTION_CREATED',
        entityName: 'milk_collections',
        entityId: String(collectionId),
        details: {
          collectionId,
          receiptNumber,
          shiftId: shift.id,
          farmerId: farmer.id,
          memberCode: farmer.member_code,
          milkType: payload.milkType,
          quantityMl,
          fatX100,
          snfX100,
          rateAppliedPaise: rateResolution.ratePaisePerLitre,
          amountPaise: rateResolution.amountPaise,
        },
        createdAt: nowIso,
      });

      if (payload.duplicateConfirmed) {
        auditService.logEvent(db, {
          userId: session.userId,
          actionType: 'COLLECTION_DUPLICATE_CONFIRMED',
          entityName: 'milk_collections',
          entityId: String(collectionId),
          details: {
            collectionId,
            receiptNumber,
            duplicateReason: payload.duplicateReason,
          },
          createdAt: nowIso,
        });
      }

      const row = milkCollectionRepository.getById(db, collectionId);
      if (!row) {
        throw new Error('Failed to retrieve newly created milk collection record.');
      }
      return this.mapToDto(row);
    });

    return createTx();
  }

  checkDuplicate(
    db: Database.Database,
    payload: { shiftId: number; farmerId: number; milkType: RatePlanMilkType },
    webContentsId?: number
  ): DuplicateCollectionCheckResult {
    if (webContentsId !== undefined) {
      sessionService.requireAuthenticated(webContentsId);
    }
    const farmer = farmerRepository.getById(db, payload.farmerId);
    if (!farmer) {
      throw new Error(`Farmer #${payload.farmerId} not found.`);
    }

    const duplicates = milkCollectionRepository.getActiveDuplicates(
      db,
      payload.shiftId,
      payload.farmerId,
      payload.milkType
    );

    return {
      isDuplicate: duplicates.length > 0,
      existingCollections: duplicates.map((d) => ({
        id: d.id,
        receiptNumber: d.receipt_number,
        milkType: d.milk_type,
        quantityMl: d.quantity_ml,
        quantityLitresFormatted: formatMlAsLitres(d.quantity_ml),
        fatX100: d.fat_x100,
        snfX100: d.snf_x100,
        amountPaise: d.amount_paise,
        createdAt: d.created_at,
      })),
    };
  }

  listCollectionsByShift(
    db: Database.Database,
    shiftId: number,
    webContentsId?: number
  ): MilkCollectionDto[] {
    if (webContentsId !== undefined) {
      sessionService.requireAuthenticated(webContentsId);
    }
    const rows = milkCollectionRepository.listByShift(db, shiftId);
    return rows.map((r) => this.mapToDto(r));
  }

  getCollectionByReceipt(
    db: Database.Database,
    receiptNumber: string,
    webContentsId?: number
  ): MilkCollectionDto {
    if (webContentsId !== undefined) {
      sessionService.requireAuthenticated(webContentsId);
    }
    const row = milkCollectionRepository.getByReceipt(db, receiptNumber);
    if (!row) {
      throw new Error(`Collection receipt '${receiptNumber}' not found.`);
    }
    return this.mapToDto(row);
  }

  voidCollection(
    db: Database.Database,
    payload: VoidCollectionPayload,
    webContentsId: number
  ): MilkCollectionDto {
    // Only OWNER can void collections!
    const session = sessionService.requireRole(webContentsId, 'OWNER');

    if (!payload.reason || typeof payload.reason !== 'string' || !payload.reason.trim()) {
      throw new Error('A mandatory cancellation reason is required to void a collection.');
    }

    const collection = milkCollectionRepository.getById(db, payload.collectionId);
    if (!collection) {
      throw new Error(`Collection record #${payload.collectionId} not found.`);
    }

    if (collection.status !== 'ACTIVE') {
      throw new Error(
        `Cannot void collection #${payload.collectionId}: Record is already ${collection.status}.`
      );
    }

    // Future settlement allocation check
    const hasSettlementTables = db
      .prepare(
        "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name IN ('settlement_items', 'weekly_settlements')"
      )
      .get() as { count: number };

    if (hasSettlementTables.count === 2) {
      const linkedSettlement = db
        .prepare(`
          SELECT ws.id as settlement_id, ws.status as settlement_status
          FROM settlement_items si
          JOIN weekly_settlements ws ON si.settlement_id = ws.id
          WHERE si.source_type = 'MILK_COLLECTION' 
            AND si.source_id = ?
            AND si.status = 'ACTIVE'
            AND ws.status != 'CANCELLED'
          LIMIT 1
        `)
        .get(payload.collectionId) as { settlement_id: number; settlement_status: string } | undefined;

      if (linkedSettlement) {
        throw new Error(
          `Cannot void collection #${payload.collectionId}: Record is linked to active weekly settlement #${linkedSettlement.settlement_id} (${linkedSettlement.settlement_status}). Please release or cancel the settlement first. (ही संकलन नोंद साप्ताहिक बिल #${linkedSettlement.settlement_id} शी जोडलेली असल्याने रद्द करता येत नाही.)`
        );
      }
    }

    const nowIso = businessDateProvider.getNowIso();

    const voidTx = db.transaction((): MilkCollectionDto => {
      milkCollectionRepository.voidCollection(
        db,
        payload.collectionId,
        session.userId,
        payload.reason.trim(),
        nowIso
      );

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'MILK_COLLECTION_VOIDED',
        entityName: 'milk_collections',
        entityId: String(payload.collectionId),
        details: {
          collectionId: payload.collectionId,
          receiptNumber: collection.receipt_number,
          farmerId: collection.farmer_id,
          memberCode: collection.farmer_member_code,
          amountPaise: collection.amount_paise,
          voidReason: payload.reason.trim(),
        },
        createdAt: nowIso,
      });

      const row = milkCollectionRepository.getById(db, payload.collectionId);
      if (!row) {
        throw new Error('Failed to retrieve voided milk collection record.');
      }
      return this.mapToDto(row);
    });

    return voidTx();
  }
}

export const milkCollectionService = new MilkCollectionService();
