import Database from 'better-sqlite3';
import {
  FarmerFilter,
  FarmerListDto,
  FarmerDetailDto,
  CreateFarmerPayload,
  UpdateFarmerPayload,
  DeactivateFarmerPayload,
  FarmerMilkType,
} from '../../shared/ipc-contracts';
import { maskBankAccount, maskUpiId } from '../../shared/masking';
import { farmerRepository, FarmerRow } from '../db/farmer.repository';
import { sessionService } from '../core/session.service';
import { auditService } from './audit.service';

/**
 * Validation error details for Main Process boundary checks.
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  errorMr?: string;
}

export const FARMER_VALIDATION = {
  MEMBER_CODE_REGEX: /^[A-Za-z0-9_-]{1,20}$/,
  PHONE_REGEX: /^[6-9]\d{9}$/,
  BANK_ACCOUNT_REGEX: /^\d{9,18}$/,
  IFSC_REGEX: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  UPI_REGEX: /^[\w.-]+@[\w.-]+$/,
  MAX_NAME_LEN: 100,
  MAX_VILLAGE_LEN: 100,
  MAX_BANK_NAME_LEN: 100,
  MAX_UPI_LEN: 50,
} as const;

/**
 * Normalizes member code by trimming whitespace and converting to uppercase.
 * Preserves leading zeroes and numeric strings without converting to Number (e.g. '001' -> '001', 'abc-001' -> 'ABC-001').
 */
export function normalizeMemberCode(memberCode: string): string {
  return memberCode.trim().toUpperCase();
}

/**
 * Authoritative Main-Process Validation for Farmer Payloads.
 */
export function validateFarmerInput(
  payload: CreateFarmerPayload | UpdateFarmerPayload
): ValidationResult {
  // Member Code
  if (!payload.memberCode || typeof payload.memberCode !== 'string') {
    return {
      valid: false,
      error: 'Member code is required.',
      errorMr: 'सदस्य कोड आवश्यक आहे.',
    };
  }

  if (payload.memberCode.includes(' ')) {
    return {
      valid: false,
      error: 'Member code must not contain spaces.',
      errorMr: 'सदस्य कोडमध्ये स्पेस (रिक्त जागा) वापरता येणार नाही.',
    };
  }

  const cleanMemberCode = payload.memberCode.trim();
  if (cleanMemberCode.length < 1 || cleanMemberCode.length > 20) {
    return {
      valid: false,
      error: 'Member code must be between 1 and 20 characters.',
      errorMr: 'सदस्य कोड १ ते २० अक्षरांचा असावा.',
    };
  }

  if (!FARMER_VALIDATION.MEMBER_CODE_REGEX.test(cleanMemberCode)) {
    return {
      valid: false,
      error: 'Member code may only contain letters, numbers, hyphens, and underscores.',
      errorMr: 'सदस्य कोडमध्ये फक्त अक्षरे, अंक, हायफन किंवा अंडरस्कोअर वापरता येतील.',
    };
  }

  // Name (Marathi)
  if (!payload.nameMr || typeof payload.nameMr !== 'string') {
    return {
      valid: false,
      error: 'Marathi farmer name is required.',
      errorMr: 'शेतकऱ्याचे नाव (मराठी) आवश्यक आहे.',
    };
  }

  const cleanNameMr = payload.nameMr.trim();
  if (cleanNameMr.length < 1 || cleanNameMr.length > FARMER_VALIDATION.MAX_NAME_LEN) {
    return {
      valid: false,
      error: `Marathi name must be between 1 and ${FARMER_VALIDATION.MAX_NAME_LEN} characters.`,
      errorMr: `शेतकऱ्याचे नाव १ ते ${FARMER_VALIDATION.MAX_NAME_LEN} अक्षरांचा असावा.`,
    };
  }

  // Name (English - optional)
  if (payload.nameEn && typeof payload.nameEn === 'string') {
    const cleanNameEn = payload.nameEn.trim();
    if (cleanNameEn.length > FARMER_VALIDATION.MAX_NAME_LEN) {
      return {
        valid: false,
        error: `English name must not exceed ${FARMER_VALIDATION.MAX_NAME_LEN} characters.`,
        errorMr: `इंग्रजी नाव ${FARMER_VALIDATION.MAX_NAME_LEN} अक्षरांपेक्षा जास्त नसावे.`,
      };
    }
  }

  // Mobile Phone (optional)
  if (payload.phone && typeof payload.phone === 'string') {
    const cleanPhone = payload.phone.trim();
    if (cleanPhone.length > 0 && !FARMER_VALIDATION.PHONE_REGEX.test(cleanPhone)) {
      return {
        valid: false,
        error: 'Phone number must be a valid 10-digit Indian mobile number.',
        errorMr: 'कृपया वैध १०-अंकी भारतीय मोबाईल क्रमांक टाका.',
      };
    }
  }

  // Village (optional)
  if (payload.village && typeof payload.village === 'string') {
    const cleanVillage = payload.village.trim();
    if (cleanVillage.length > FARMER_VALIDATION.MAX_VILLAGE_LEN) {
      return {
        valid: false,
        error: `Village name must not exceed ${FARMER_VALIDATION.MAX_VILLAGE_LEN} characters.`,
        errorMr: `गावाचे नाव ${FARMER_VALIDATION.MAX_VILLAGE_LEN} अक्षरांपेक्षा जास्त नसावे.`,
      };
    }
  }

  // Bank Account Number (optional)
  if (payload.bankAccountNumber && typeof payload.bankAccountNumber === 'string') {
    const cleanAccount = payload.bankAccountNumber.trim();
    if (cleanAccount.length > 0 && !FARMER_VALIDATION.BANK_ACCOUNT_REGEX.test(cleanAccount)) {
      return {
        valid: false,
        error: 'Bank account number must be 9 to 18 digits.',
        errorMr: 'बँक खाते क्रमांक ९ ते १८ अंकी असावा.',
      };
    }
  }

  // Bank IFSC (optional)
  if (payload.bankIfsc && typeof payload.bankIfsc === 'string') {
    const cleanIfsc = payload.bankIfsc.trim().toUpperCase();
    if (cleanIfsc.length > 0 && !FARMER_VALIDATION.IFSC_REGEX.test(cleanIfsc)) {
      return {
        valid: false,
        error: 'Bank IFSC code must follow the standard 11-character format (e.g. SBIN0001234).',
        errorMr: 'बँक IFSC कोड ११ अक्षरी मानक स्वरूपात असावा (उदा. SBIN0001234).',
      };
    }
  }

  // Bank Name (optional)
  if (payload.bankName && typeof payload.bankName === 'string') {
    const cleanBankName = payload.bankName.trim();
    if (cleanBankName.length > FARMER_VALIDATION.MAX_BANK_NAME_LEN) {
      return {
        valid: false,
        error: `Bank name must not exceed ${FARMER_VALIDATION.MAX_BANK_NAME_LEN} characters.`,
        errorMr: `बँकेचे नाव ${FARMER_VALIDATION.MAX_BANK_NAME_LEN} अक्षरांपेक्षा जास्त नसावे.`,
      };
    }
  }

  // UPI ID (optional)
  if (payload.upiId && typeof payload.upiId === 'string') {
    const cleanUpi = payload.upiId.trim();
    if (
      cleanUpi.length > 0 &&
      (cleanUpi.length > FARMER_VALIDATION.MAX_UPI_LEN ||
        !FARMER_VALIDATION.UPI_REGEX.test(cleanUpi))
    ) {
      return {
        valid: false,
        error: 'UPI ID must be a valid VPA handle (e.g. user@bank).',
        errorMr: 'कृपया वैध UPI आयडी टाका (उदा. user@bank).',
      };
    }
  }

  // Milk Type
  if (!['COW', 'BUFFALO', 'BOTH'].includes(payload.defaultMilkType)) {
    return {
      valid: false,
      error: "Default milk type must be 'COW', 'BUFFALO', or 'BOTH'.",
      errorMr: "दूध प्रकार 'गाय', 'म्हैस' किंवा 'दोन्ही' असणे आवश्यक आहे.",
    };
  }

  // Opening Balance Paise
  if (
    typeof payload.openingBalancePaise !== 'number' ||
    !Number.isSafeInteger(payload.openingBalancePaise)
  ) {
    return {
      valid: false,
      error: 'Opening balance must be a safe integer representing paise.',
      errorMr: 'सुरुवातीची शिल्लक वैध रक्कम (पैसे) असावी.',
    };
  }

  return { valid: true };
}

/**
 * Stage 4: Authoritative Farmer Business Service
 *
 * Implements RBAC enforcement, atomic audit logging, PII masking, and opening balance locks.
 */
export class FarmerService {
  /**
   * Map database row to FarmerListDto with masked sensitive PII.
   */
  mapToListDto(row: FarmerRow): FarmerListDto {
    return {
      id: row.id,
      memberCode: row.member_code,
      nameMr: row.name_mr,
      nameEn: row.name_en || null,
      phone: row.phone || null,
      village: row.village || null,
      maskedBankAccount: maskBankAccount(row.bank_account_number),
      bankIfsc: row.bank_ifsc ? row.bank_ifsc.toUpperCase() : null,
      bankName: row.bank_name || null,
      maskedUpiId: maskUpiId(row.upi_id),
      defaultMilkType: row.default_milk_type,
      openingBalancePaise: row.opening_balance_paise,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map database row to FarmerDetailDto with full unmasked financial info for Owner.
   */
  mapToDetailDto(row: FarmerRow, hasFinancialActivity: boolean): FarmerDetailDto {
    return {
      id: row.id,
      memberCode: row.member_code,
      nameMr: row.name_mr,
      nameEn: row.name_en || null,
      phone: row.phone || null,
      village: row.village || null,
      bankAccountNumber: row.bank_account_number || null,
      bankIfsc: row.bank_ifsc ? row.bank_ifsc.toUpperCase() : null,
      bankName: row.bank_name || null,
      upiId: row.upi_id || null,
      defaultMilkType: row.default_milk_type,
      openingBalancePaise: row.opening_balance_paise,
      hasFinancialActivity,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Search and list farmers (Owner and Operator authorized). Returns masked list.
   */
  listFarmers(
    db: Database.Database,
    filter: FarmerFilter = {},
    webContentsId: number
  ): FarmerListDto[] {
    sessionService.requireAuthenticated(webContentsId);
    const rows = farmerRepository.listFarmers(db, filter);
    return rows.map((r) => this.mapToListDto(r));
  }

  /**
   * Get single farmer by ID (Owner and Operator authorized). Returns masked list DTO.
   */
  getFarmerById(
    db: Database.Database,
    id: number,
    webContentsId: number
  ): FarmerListDto | null {
    sessionService.requireAuthenticated(webContentsId);
    const row = farmerRepository.getById(db, id);
    if (!row) {
      return null;
    }
    return this.mapToListDto(row);
  }

  /**
   * Get single farmer by member code (Owner and Operator authorized).
   */
  getFarmerByMemberCode(
    db: Database.Database,
    memberCode: string,
    activeOnly = false,
    webContentsId: number
  ): FarmerListDto | null {
    sessionService.requireAuthenticated(webContentsId);
    const cleanMemberCode = normalizeMemberCode(memberCode);
    const row = farmerRepository.getByMemberCode(db, cleanMemberCode, activeOnly);
    if (!row) {
      return null;
    }
    return this.mapToListDto(row);
  }

  /**
   * Get full unmasked farmer details for editing (OWNER ONLY).
   */
  getFarmerEditDetail(
    db: Database.Database,
    id: number,
    webContentsId: number
  ): FarmerDetailDto {
    sessionService.requireRole(webContentsId, 'OWNER');
    const row = farmerRepository.getById(db, id);
    if (!row) {
      throw new Error(`Farmer with ID ${id} not found.`);
    }
    const hasFinancialActivity = farmerRepository.hasFinancialActivity(db, id);
    return this.mapToDetailDto(row, hasFinancialActivity);
  }

  /**
   * Create a new farmer record (OWNER ONLY).
   */
  createFarmer(
    db: Database.Database,
    payload: CreateFarmerPayload,
    webContentsId: number
  ): FarmerListDto {
    const session = sessionService.requireRole(webContentsId, 'OWNER');

    const validation = validateFarmerInput(payload);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid farmer data.');
    }

    const cleanMemberCode = normalizeMemberCode(payload.memberCode);

    // Check unique member code
    const existing = farmerRepository.getByMemberCode(db, cleanMemberCode);
    if (existing) {
      throw new Error(
        `Member code '${cleanMemberCode}' is already registered to farmer '${existing.name_mr}'.`
      );
    }

    const nowIso = new Date().toISOString();

    const createTx = db.transaction((): FarmerListDto => {
      const farmerId = farmerRepository.insertFarmer(db, {
        memberCode: cleanMemberCode,
        nameMr: payload.nameMr.trim(),
        nameEn: payload.nameEn?.trim() || null,
        phone: payload.phone?.trim() || null,
        village: payload.village?.trim() || null,
        bankAccountNumber: payload.bankAccountNumber?.trim() || null,
        bankIfsc: payload.bankIfsc?.trim().toUpperCase() || null,
        bankName: payload.bankName?.trim() || null,
        upiId: payload.upiId?.trim() || null,
        defaultMilkType: payload.defaultMilkType,
        openingBalancePaise: payload.openingBalancePaise,
        nowIso,
      });

      // Audit event: NEVER log raw bank account or UPI secrets
      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'FARMER_CREATED',
        entityName: 'farmers',
        entityId: String(farmerId),
        details: {
          farmerId,
          memberCode: cleanMemberCode,
          nameMr: payload.nameMr.trim(),
          nameEn: payload.nameEn?.trim() || null,
          phone: payload.phone?.trim() || null,
          village: payload.village?.trim() || null,
          defaultMilkType: payload.defaultMilkType,
          openingBalancePaise: payload.openingBalancePaise,
          hasBankDetails: Boolean(payload.bankAccountNumber?.trim()),
          hasUpiDetails: Boolean(payload.upiId?.trim()),
        },
        createdAt: nowIso,
      });

      const row = farmerRepository.getById(db, farmerId);
      if (!row) {
        throw new Error('Failed to retrieve newly created farmer.');
      }

      return this.mapToListDto(row);
    });

    return createTx();
  }

  /**
   * Update farmer details (OWNER ONLY).
   *
   * Enforces the Opening Balance Lock Rule:
   * If a farmer has existing non-voided financial transactions, openingBalancePaise
   * is strictly immutable and attempts to modify it are rejected.
   */
  updateFarmer(
    db: Database.Database,
    id: number,
    payload: UpdateFarmerPayload,
    webContentsId: number
  ): FarmerListDto {
    const session = sessionService.requireRole(webContentsId, 'OWNER');

    const validation = validateFarmerInput(payload);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid farmer data.');
    }

    const cleanMemberCode = normalizeMemberCode(payload.memberCode);
    const nowIso = new Date().toISOString();

    const updateTx = db.transaction((): FarmerListDto => {
      const existing = farmerRepository.getById(db, id);
      if (!existing) {
        throw new Error(`Farmer with ID ${id} not found.`);
      }

      // Check unique member code if changed
      if (existing.member_code.toUpperCase() !== cleanMemberCode) {
        const duplicate = farmerRepository.getByMemberCode(db, cleanMemberCode);
        if (duplicate && duplicate.id !== id) {
          throw new Error(
            `Member code '${cleanMemberCode}' is already registered to farmer '${duplicate.name_mr}'.`
          );
        }
      }

      // Enforce opening balance locking rule inside transaction
      const balanceChanged =
        existing.opening_balance_paise !== payload.openingBalancePaise;
      if (balanceChanged) {
        const hasFinancialActivity = farmerRepository.hasFinancialActivity(db, id);
        if (hasFinancialActivity) {
          throw new Error(
            'Cannot modify opening balance: Farmer has existing financial transactions.'
          );
        }
      }

      // Determine updated field names for audit log
      const updatedFields: string[] = [];
      if (existing.member_code !== cleanMemberCode) updatedFields.push('memberCode');
      if (existing.name_mr !== payload.nameMr.trim()) updatedFields.push('nameMr');
      if ((existing.name_en || null) !== (payload.nameEn?.trim() || null))
        updatedFields.push('nameEn');
      if ((existing.phone || null) !== (payload.phone?.trim() || null))
        updatedFields.push('phone');
      if ((existing.village || null) !== (payload.village?.trim() || null))
        updatedFields.push('village');
      if (
        (existing.bank_account_number || null) !==
        (payload.bankAccountNumber?.trim() || null)
      )
        updatedFields.push('bankAccountNumber');
      if (
        (existing.bank_ifsc || null) !==
        (payload.bankIfsc?.trim().toUpperCase() || null)
      )
        updatedFields.push('bankIfsc');
      if ((existing.bank_name || null) !== (payload.bankName?.trim() || null))
        updatedFields.push('bankName');
      if ((existing.upi_id || null) !== (payload.upiId?.trim() || null))
        updatedFields.push('upiId');
      if (existing.default_milk_type !== payload.defaultMilkType)
        updatedFields.push('defaultMilkType');
      if (balanceChanged) updatedFields.push('openingBalancePaise');

      farmerRepository.updateFarmer(db, {
        id,
        memberCode: cleanMemberCode,
        nameMr: payload.nameMr.trim(),
        nameEn: payload.nameEn?.trim() || null,
        phone: payload.phone?.trim() || null,
        village: payload.village?.trim() || null,
        bankAccountNumber: payload.bankAccountNumber?.trim() || null,
        bankIfsc: payload.bankIfsc?.trim().toUpperCase() || null,
        bankName: payload.bankName?.trim() || null,
        upiId: payload.upiId?.trim() || null,
        defaultMilkType: payload.defaultMilkType,
        openingBalancePaise: payload.openingBalancePaise,
        nowIso,
      });

      // Audit event
      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'FARMER_UPDATED',
        entityName: 'farmers',
        entityId: String(id),
        details: {
          farmerId: id,
          memberCode: cleanMemberCode,
          updatedFields,
        },
        createdAt: nowIso,
      });

      const updated = farmerRepository.getById(db, id);
      if (!updated) {
        throw new Error('Failed to retrieve updated farmer.');
      }

      return this.mapToListDto(updated);
    });

    return updateTx();
  }

  /**
   * Soft-deactivate a farmer (OWNER ONLY).
   */
  deactivateFarmer(
    db: Database.Database,
    id: number,
    payload: DeactivateFarmerPayload = {},
    webContentsId: number
  ): FarmerListDto {
    const session = sessionService.requireRole(webContentsId, 'OWNER');
    const nowIso = new Date().toISOString();

    const deactivateTx = db.transaction((): FarmerListDto => {
      const existing = farmerRepository.getById(db, id);
      if (!existing) {
        throw new Error(`Farmer with ID ${id} not found.`);
      }

      farmerRepository.deactivateFarmer(db, id, nowIso);

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'FARMER_DEACTIVATED',
        entityName: 'farmers',
        entityId: String(id),
        details: {
          farmerId: id,
          memberCode: existing.member_code,
          reason: payload.reason?.trim() || 'Owner deactivation',
        },
        createdAt: nowIso,
      });

      const updated = farmerRepository.getById(db, id);
      if (!updated) {
        throw new Error('Failed to retrieve deactivated farmer.');
      }

      return this.mapToListDto(updated);
    });

    return deactivateTx();
  }

  /**
   * Reactivate a soft-deactivated farmer (OWNER ONLY).
   */
  reactivateFarmer(
    db: Database.Database,
    id: number,
    webContentsId: number
  ): FarmerListDto {
    const session = sessionService.requireRole(webContentsId, 'OWNER');
    const nowIso = new Date().toISOString();

    const reactivateTx = db.transaction((): FarmerListDto => {
      const existing = farmerRepository.getById(db, id);
      if (!existing) {
        throw new Error(`Farmer with ID ${id} not found.`);
      }

      farmerRepository.reactivateFarmer(db, id, nowIso);

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'FARMER_REACTIVATED',
        entityName: 'farmers',
        entityId: String(id),
        details: {
          farmerId: id,
          memberCode: existing.member_code,
        },
        createdAt: nowIso,
      });

      const updated = farmerRepository.getById(db, id);
      if (!updated) {
        throw new Error('Failed to retrieve reactivated farmer.');
      }

      return this.mapToListDto(updated);
    });

    return reactivateTx();
  }
}

export const farmerService = new FarmerService();
