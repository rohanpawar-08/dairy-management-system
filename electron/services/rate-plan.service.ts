import Database from 'better-sqlite3';
import {
  RatePlanDto,
  RatePlanFilter,
  RatePlanMilkType,
  CreateRatePlanDraftPayload,
  UpdateRatePlanDraftPayload,
  CloneRatePlanPayload,
  ApproveRatePlanPayload,
  SupersedeRatePlanPayload,
  CancelRatePlanPayload,
  CalculateRatePreviewPayload,
  CalculateRatePreviewResult,
  ResolveApprovedRatePayload,
  ResolveApprovedRateResult,
  RateFormulaParametersDto,
} from '../../shared/ipc-contracts';
import { formatPaiseAsRupees } from '../../shared/money';
import { ratePlanRepository, RatePlanRow } from '../db/rate-plan.repository';
import { sessionService } from '../core/session.service';
import { auditService } from './audit.service';
import { calculationEngine } from './calculation.engine';

export const RATE_PLAN_VALIDATION = {
  DATE_REGEX: /^\d{4}-\d{2}-\d{2}$/,
  MAX_NAME_LEN: 100,
  MAX_NOTES_LEN: 500,
  MAX_REASON_LEN: 500,
} as const;

export interface ValidationResult {
  valid: boolean;
  error?: string;
  errorMr?: string;
}

/**
 * Validate rate plan and formula parameter inputs.
 */
export function validateRatePlanInput(
  payload: CreateRatePlanDraftPayload | UpdateRatePlanDraftPayload
): ValidationResult {
  // Plan Name
  if (!payload.planName || typeof payload.planName !== 'string') {
    return {
      valid: false,
      error: 'Plan name is required.',
      errorMr: 'दरपत्रकाचे नाव आवश्यक आहे.',
    };
  }

  const cleanName = payload.planName.trim();
  if (cleanName.length < 1 || cleanName.length > RATE_PLAN_VALIDATION.MAX_NAME_LEN) {
    return {
      valid: false,
      error: `Plan name must be between 1 and ${RATE_PLAN_VALIDATION.MAX_NAME_LEN} characters.`,
      errorMr: `दरपत्रकाचे नाव १ ते ${RATE_PLAN_VALIDATION.MAX_NAME_LEN} अक्षरांचे असावे.`,
    };
  }

  // Milk Type
  if (!['COW', 'BUFFALO'].includes(payload.milkType)) {
    return {
      valid: false,
      error: "Milk type must be 'COW' or 'BUFFALO'.",
      errorMr: "दूध प्रकार 'गाय' किंवा 'म्हैस' असणे आवश्यक आहे.",
    };
  }

  // Effective From Date
  if (
    !payload.effectiveFrom ||
    !RATE_PLAN_VALIDATION.DATE_REGEX.test(payload.effectiveFrom)
  ) {
    return {
      valid: false,
      error: 'Effective from date must be a valid date in YYYY-MM-DD format.',
      errorMr: 'लागू होण्याची तारीख YYYY-MM-DD स्वरूपात वैध असावी.',
    };
  }

  // Effective To Date (optional)
  if (payload.effectiveTo) {
    if (!RATE_PLAN_VALIDATION.DATE_REGEX.test(payload.effectiveTo)) {
      return {
        valid: false,
        error: 'Effective to date must be a valid date in YYYY-MM-DD format.',
        errorMr: 'समाप्ती तारीख YYYY-MM-DD स्वरूपात वैध असावी.',
      };
    }
    if (payload.effectiveTo < payload.effectiveFrom) {
      return {
        valid: false,
        error: 'Effective to date cannot be earlier than effective from date.',
        errorMr: 'समाप्ती तारीख प्रारंभ तारखेपेक्षा आधीची असू शकत नाही.',
      };
    }
  }

  // Parameters
  const p = payload.parameters;
  if (!p || typeof p !== 'object') {
    return {
      valid: false,
      error: 'Rate formula parameters are required.',
      errorMr: 'दर सूत्र घटक आवश्यक आहेत.',
    };
  }

  if (
    !Number.isSafeInteger(p.fatRatePaisePerPoint) ||
    p.fatRatePaisePerPoint < 0 ||
    !Number.isSafeInteger(p.snfRatePaisePerPoint) ||
    p.snfRatePaisePerPoint < 0
  ) {
    return {
      valid: false,
      error: 'FAT and SNF rate coefficients must be non-negative safe integers.',
      errorMr: 'फॅट व एसएनएफ दर घटक वैध रक्कम (पैसे) असावेत.',
    };
  }

  if (p.fatRatePaisePerPoint === 0 && p.snfRatePaisePerPoint === 0) {
    return {
      valid: false,
      error: 'At least one FAT or SNF rate coefficient must be greater than zero.',
      errorMr: 'फॅट किंवा एसएनएफ यापैकी किमान एका घटकाचा दर शून्यापेक्षा जास्त असावा.',
    };
  }

  if (
    !Number.isSafeInteger(p.minimumFatX100) ||
    p.minimumFatX100 <= 0 ||
    !Number.isSafeInteger(p.maximumFatX100) ||
    p.maximumFatX100 < p.minimumFatX100 ||
    !Number.isSafeInteger(p.fatStepX100) ||
    p.fatStepX100 <= 0
  ) {
    return {
      valid: false,
      error: 'Invalid FAT bounds or step increment.',
      errorMr: 'फॅट मर्यादा किंवा स्टेप वाढ अयोग्य आहे.',
    };
  }

  if (
    !Number.isSafeInteger(p.minimumSnfX100) ||
    p.minimumSnfX100 <= 0 ||
    !Number.isSafeInteger(p.maximumSnfX100) ||
    p.maximumSnfX100 < p.minimumSnfX100 ||
    !Number.isSafeInteger(p.snfStepX100) ||
    p.snfStepX100 <= 0
  ) {
    return {
      valid: false,
      error: 'Invalid SNF bounds or step increment.',
      errorMr: 'एसएनएफ मर्यादा किंवा स्टेप वाढ अयोग्य आहे.',
    };
  }

  return { valid: true };
}

export class RatePlanService {
  private mapToDto(row: RatePlanRow): RatePlanDto {
    const todayStr = new Date().toISOString().split('T')[0];
    let lifecycleState: RatePlanDto['lifecycleState'] = 'DRAFT';

    if (row.status === 'DRAFT') {
      lifecycleState = 'DRAFT';
    } else if (row.status === 'CANCELLED') {
      lifecycleState = 'CANCELLED';
    } else if (row.status === 'APPROVED') {
      if (row.effective_from > todayStr) {
        lifecycleState = 'UPCOMING';
      } else if (row.effective_to && row.effective_to < todayStr) {
        lifecycleState = 'EXPIRED';
      } else {
        lifecycleState = 'CURRENT';
      }
    }

    return {
      id: row.id,
      planName: row.plan_name,
      milkType: row.milk_type,
      strategyType: 'FORMULA',
      pricingBasis: 'PER_PERCENT_POINT_PER_LITRE',
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      status: row.status,
      roundingMode: 'ROUND_HALF_UP',
      notes: row.notes,
      parameters: {
        fatRatePaisePerPoint: row.fat_rate_paise_per_point,
        snfRatePaisePerPoint: row.snf_rate_paise_per_point,
        minimumFatX100: row.minimum_fat_x100,
        maximumFatX100: row.maximum_fat_x100,
        fatStepX100: row.fat_step_x100,
        minimumSnfX100: row.minimum_snf_x100,
        maximumSnfX100: row.maximum_snf_x100,
        snfStepX100: row.snf_step_x100,
      },
      createdByUserId: row.created_by_user_id,
      createdByName: row.created_by_name,
      approvedByUserId: row.approved_by_user_id,
      approvedByName: row.approved_by_name,
      approvedAt: row.approved_at,
      cancelledByUserId: row.cancelled_by_user_id,
      cancelledByName: row.cancelled_by_name,
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lifecycleState,
    };
  }

  /**
   * List rate plans (OWNER ONLY).
   */
  listPlans(
    db: Database.Database,
    filter: RatePlanFilter = {},
    webContentsId: number
  ): RatePlanDto[] {
    sessionService.requireRole(webContentsId, 'OWNER');
    const rows = ratePlanRepository.listPlans(db, filter);
    return rows.map((r) => this.mapToDto(r));
  }

  /**
   * Get single rate plan by ID (OWNER ONLY).
   */
  getPlanById(
    db: Database.Database,
    id: number,
    webContentsId: number
  ): RatePlanDto {
    sessionService.requireRole(webContentsId, 'OWNER');
    const row = ratePlanRepository.getById(db, id);
    if (!row) {
      throw new Error(`Rate plan with ID ${id} not found.`);
    }
    return this.mapToDto(row);
  }

  /**
   * Create a new draft rate plan (OWNER ONLY).
   */
  createDraft(
    db: Database.Database,
    payload: CreateRatePlanDraftPayload,
    webContentsId: number
  ): RatePlanDto {
    const session = sessionService.requireRole(webContentsId, 'OWNER');

    const validation = validateRatePlanInput(payload);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid rate plan data.');
    }

    const nowIso = new Date().toISOString();

    const createTx = db.transaction((): RatePlanDto => {
      const planId = ratePlanRepository.insertPlan(db, {
        planName: payload.planName.trim(),
        milkType: payload.milkType,
        effectiveFrom: payload.effectiveFrom,
        effectiveTo: payload.effectiveTo || null,
        status: 'DRAFT',
        notes: payload.notes?.trim() || null,
        createdByUserId: session.userId,
        nowIso,
        parameters: payload.parameters,
      });

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'RATE_PLAN_CREATED',
        entityName: 'rate_plans',
        entityId: String(planId),
        details: {
          planId,
          planName: payload.planName.trim(),
          milkType: payload.milkType,
          effectiveFrom: payload.effectiveFrom,
          effectiveTo: payload.effectiveTo || null,
          fatRatePaise: payload.parameters.fatRatePaisePerPoint,
          snfRatePaise: payload.parameters.snfRatePaisePerPoint,
        },
        createdAt: nowIso,
      });

      const row = ratePlanRepository.getById(db, planId);
      if (!row) {
        throw new Error('Failed to retrieve newly created rate plan.');
      }
      return this.mapToDto(row);
    });

    return createTx();
  }

  /**
   * Update an existing draft rate plan (OWNER ONLY).
   */
  updateDraft(
    db: Database.Database,
    id: number,
    payload: UpdateRatePlanDraftPayload,
    webContentsId: number
  ): RatePlanDto {
    const session = sessionService.requireRole(webContentsId, 'OWNER');

    const validation = validateRatePlanInput(payload);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid rate plan data.');
    }

    const nowIso = new Date().toISOString();

    const updateTx = db.transaction((): RatePlanDto => {
      const existing = ratePlanRepository.getById(db, id);
      if (!existing) {
        throw new Error(`Rate plan #${id} not found.`);
      }
      if (existing.status !== 'DRAFT') {
        throw new Error(
          `Cannot edit rate plan #${id}: Only DRAFT plans can be modified. Approved plans are immutable.`
        );
      }

      ratePlanRepository.updateDraftPlan(db, id, {
        planName: payload.planName.trim(),
        milkType: payload.milkType,
        effectiveFrom: payload.effectiveFrom,
        effectiveTo: payload.effectiveTo || null,
        notes: payload.notes?.trim() || null,
        nowIso,
        parameters: payload.parameters,
      });

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'RATE_PLAN_UPDATED',
        entityName: 'rate_plans',
        entityId: String(id),
        details: {
          planId: id,
          planName: payload.planName.trim(),
          milkType: payload.milkType,
          effectiveFrom: payload.effectiveFrom,
          effectiveTo: payload.effectiveTo || null,
        },
        createdAt: nowIso,
      });

      const row = ratePlanRepository.getById(db, id);
      if (!row) {
        throw new Error('Failed to retrieve updated rate plan.');
      }
      return this.mapToDto(row);
    });

    return updateTx();
  }

  /**
   * Clone an existing rate plan into a new DRAFT plan (OWNER ONLY).
   */
  clonePlan(
    db: Database.Database,
    payload: CloneRatePlanPayload,
    webContentsId: number
  ): RatePlanDto {
    const session = sessionService.requireRole(webContentsId, 'OWNER');

    if (!payload.newPlanName || typeof payload.newPlanName !== 'string') {
      throw new Error('New plan name is required for cloning.');
    }
    if (
      !payload.newEffectiveFrom ||
      !RATE_PLAN_VALIDATION.DATE_REGEX.test(payload.newEffectiveFrom)
    ) {
      throw new Error('Valid new effective from date (YYYY-MM-DD) is required.');
    }

    const source = ratePlanRepository.getById(db, payload.sourcePlanId);
    if (!source) {
      throw new Error(`Source rate plan #${payload.sourcePlanId} not found.`);
    }

    const mergedParams: RateFormulaParametersDto = {
      fatRatePaisePerPoint:
        payload.parameters?.fatRatePaisePerPoint ?? source.fat_rate_paise_per_point,
      snfRatePaisePerPoint:
        payload.parameters?.snfRatePaisePerPoint ?? source.snf_rate_paise_per_point,
      minimumFatX100: payload.parameters?.minimumFatX100 ?? source.minimum_fat_x100,
      maximumFatX100: payload.parameters?.maximumFatX100 ?? source.maximum_fat_x100,
      fatStepX100: payload.parameters?.fatStepX100 ?? source.fat_step_x100,
      minimumSnfX100: payload.parameters?.minimumSnfX100 ?? source.minimum_snf_x100,
      maximumSnfX100: payload.parameters?.maximumSnfX100 ?? source.maximum_snf_x100,
      snfStepX100: payload.parameters?.snfStepX100 ?? source.snf_step_x100,
    };

    const draftPayload: CreateRatePlanDraftPayload = {
      planName: payload.newPlanName.trim(),
      milkType: source.milk_type,
      effectiveFrom: payload.newEffectiveFrom,
      effectiveTo: payload.newEffectiveTo || null,
      notes: payload.notes?.trim() ?? source.notes,
      parameters: mergedParams,
    };

    const validation = validateRatePlanInput(draftPayload);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid cloned plan data.');
    }

    const nowIso = new Date().toISOString();

    const cloneTx = db.transaction((): RatePlanDto => {
      const newPlanId = ratePlanRepository.insertPlan(db, {
        planName: draftPayload.planName,
        milkType: draftPayload.milkType,
        effectiveFrom: draftPayload.effectiveFrom,
        effectiveTo: draftPayload.effectiveTo,
        status: 'DRAFT',
        notes: draftPayload.notes,
        createdByUserId: session.userId,
        nowIso,
        parameters: mergedParams,
      });

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'RATE_PLAN_CLONED',
        entityName: 'rate_plans',
        entityId: String(newPlanId),
        details: {
          sourcePlanId: payload.sourcePlanId,
          newPlanId,
          planName: draftPayload.planName,
          milkType: draftPayload.milkType,
          effectiveFrom: draftPayload.effectiveFrom,
        },
        createdAt: nowIso,
      });

      const row = ratePlanRepository.getById(db, newPlanId);
      if (!row) {
        throw new Error('Failed to retrieve cloned rate plan.');
      }
      return this.mapToDto(row);
    });

    return cloneTx();
  }

  /**
   * Approve a draft rate plan (OWNER ONLY).
   */
  approvePlan(
    db: Database.Database,
    payload: ApproveRatePlanPayload,
    webContentsId: number
  ): RatePlanDto {
    const session = sessionService.requireRole(webContentsId, 'OWNER');

    const plan = ratePlanRepository.getById(db, payload.planId);
    if (!plan) {
      throw new Error(`Rate plan #${payload.planId} not found.`);
    }
    if (plan.status !== 'DRAFT') {
      throw new Error(`Only DRAFT rate plans can be approved (current status: ${plan.status}).`);
    }

    const nowIso = new Date().toISOString();

    const approveTx = db.transaction((): RatePlanDto => {
      ratePlanRepository.approvePlan(db, payload.planId, session.userId, nowIso, nowIso);

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'RATE_PLAN_APPROVED',
        entityName: 'rate_plans',
        entityId: String(payload.planId),
        details: {
          planId: payload.planId,
          planName: plan.plan_name,
          milkType: plan.milk_type,
          effectiveFrom: plan.effective_from,
          effectiveTo: plan.effective_to,
        },
        createdAt: nowIso,
      });

      const row = ratePlanRepository.getById(db, payload.planId);
      if (!row) {
        throw new Error('Failed to retrieve approved rate plan.');
      }
      return this.mapToDto(row);
    });

    return approveTx();
  }

  /**
   * Supersede an existing approved plan with a new plan (OWNER ONLY).
   */
  supersedePlan(
    db: Database.Database,
    payload: SupersedeRatePlanPayload,
    webContentsId: number
  ): { oldPlan: RatePlanDto; newPlan: RatePlanDto } {
    const session = sessionService.requireRole(webContentsId, 'OWNER');

    if (
      !payload.newEffectiveFrom ||
      !RATE_PLAN_VALIDATION.DATE_REGEX.test(payload.newEffectiveFrom)
    ) {
      throw new Error('Valid new effective from date (YYYY-MM-DD) is required.');
    }

    const oldPlan = ratePlanRepository.getById(db, payload.oldPlanId);
    if (!oldPlan) {
      throw new Error(`Previous rate plan #${payload.oldPlanId} not found.`);
    }

    const newPlan = ratePlanRepository.getById(db, payload.newPlanId);
    if (!newPlan) {
      throw new Error(`New rate plan #${payload.newPlanId} not found.`);
    }

    const nowIso = new Date().toISOString();

    const supersedeTx = db.transaction((): { oldPlan: RatePlanDto; newPlan: RatePlanDto } => {
      ratePlanRepository.supersedePlan(
        db,
        payload.oldPlanId,
        payload.newPlanId,
        payload.newEffectiveFrom,
        session.userId,
        nowIso,
        nowIso
      );

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'RATE_PLAN_SUPERSEDED',
        entityName: 'rate_plans',
        entityId: String(payload.newPlanId),
        details: {
          oldPlanId: payload.oldPlanId,
          newPlanId: payload.newPlanId,
          newEffectiveFrom: payload.newEffectiveFrom,
          milkType: newPlan.milk_type,
        },
        createdAt: nowIso,
      });

      const updatedOld = ratePlanRepository.getById(db, payload.oldPlanId);
      const updatedNew = ratePlanRepository.getById(db, payload.newPlanId);

      if (!updatedOld || !updatedNew) {
        throw new Error('Failed to retrieve updated plans after supersede operation.');
      }

      return {
        oldPlan: this.mapToDto(updatedOld),
        newPlan: this.mapToDto(updatedNew),
      };
    });

    return supersedeTx();
  }

  /**
   * Cancel an eligible rate plan (OWNER ONLY).
   */
  cancelPlan(
    db: Database.Database,
    payload: CancelRatePlanPayload,
    webContentsId: number
  ): RatePlanDto {
    const session = sessionService.requireRole(webContentsId, 'OWNER');

    if (!payload.reason || typeof payload.reason !== 'string' || !payload.reason.trim()) {
      throw new Error('A cancellation reason is required.');
    }

    const plan = ratePlanRepository.getById(db, payload.planId);
    if (!plan) {
      throw new Error(`Rate plan #${payload.planId} not found.`);
    }

    if (plan.status === 'CANCELLED') {
      throw new Error(`Rate plan #${payload.planId} is already cancelled.`);
    }

    // Check if any milk collections reference this plan
    const hasCollections = ratePlanRepository.hasCollectionsReferencingPlan(
      db,
      payload.planId
    );
    if (hasCollections) {
      throw new Error(
        `Cannot cancel rate plan #${payload.planId}: Plan is already linked to historical milk collections.`
      );
    }

    const nowIso = new Date().toISOString();

    const cancelTx = db.transaction((): RatePlanDto => {
      ratePlanRepository.cancelPlan(
        db,
        payload.planId,
        session.userId,
        nowIso,
        payload.reason.trim(),
        nowIso
      );

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'RATE_PLAN_CANCELLED',
        entityName: 'rate_plans',
        entityId: String(payload.planId),
        details: {
          planId: payload.planId,
          planName: plan.plan_name,
          milkType: plan.milk_type,
          reason: payload.reason.trim(),
        },
        createdAt: nowIso,
      });

      const row = ratePlanRepository.getById(db, payload.planId);
      if (!row) {
        throw new Error('Failed to retrieve cancelled rate plan.');
      }
      return this.mapToDto(row);
    });

    return cancelTx();
  }

  /**
   * Preview rate and amount calculation for given parameters (OWNER ONLY).
   */
  calculatePreview(
    db: Database.Database,
    payload: CalculateRatePreviewPayload,
    webContentsId: number
  ): CalculateRatePreviewResult {
    sessionService.requireRole(webContentsId, 'OWNER');

    let params = payload.parameters;
    if (!params && payload.planId) {
      const plan = ratePlanRepository.getById(db, payload.planId);
      if (!plan) {
        return {
          valid: false,
          ratePaisePerLitre: 0,
          rateRupeesFormatted: '₹0.00',
          error: `Rate plan #${payload.planId} not found.`,
          errorMr: `दरपत्रक क्र. #${payload.planId} आढळले नाही.`,
        };
      }
      params = {
        fatRatePaisePerPoint: plan.fat_rate_paise_per_point,
        snfRatePaisePerPoint: plan.snf_rate_paise_per_point,
        minimumFatX100: plan.minimum_fat_x100,
        maximumFatX100: plan.maximum_fat_x100,
        fatStepX100: plan.fat_step_x100,
        minimumSnfX100: plan.minimum_snf_x100,
        maximumSnfX100: plan.maximum_snf_x100,
        snfStepX100: plan.snf_step_x100,
      };
    }

    if (!params) {
      return {
        valid: false,
        ratePaisePerLitre: 0,
        rateRupeesFormatted: '₹0.00',
        error: 'Formula parameters are required for calculation preview.',
        errorMr: 'गणना पूर्वदर्शनासाठी दर सूत्र आवश्यक आहे.',
      };
    }

    return calculationEngine.calculatePreview(
      payload.fatX100,
      payload.snfX100,
      params,
      payload.quantityMl
    );
  }

  /**
   * Authoritative business rate resolution for collection entry (Owner & Operator authorized).
   * Exposes only public rate resolution data without draft plans or mutation access.
   */
  resolveApprovedRate(
    db: Database.Database,
    payload: ResolveApprovedRatePayload,
    webContentsId: number
  ): ResolveApprovedRateResult {
    sessionService.requireAuthenticated(webContentsId);

    if (!['COW', 'BUFFALO'].includes(payload.milkType)) {
      throw new Error(`Invalid milk type for rate resolution: '${payload.milkType}'`);
    }

    if (
      !payload.businessDate ||
      !RATE_PLAN_VALIDATION.DATE_REGEX.test(payload.businessDate)
    ) {
      throw new Error(`Invalid business date format: '${payload.businessDate}'`);
    }

    const plan = ratePlanRepository.findApprovedPlanForDate(
      db,
      payload.milkType,
      payload.businessDate
    );

    if (!plan) {
      const milkTypeMr = payload.milkType === 'COW' ? 'गाय' : 'म्हैस';
      throw new Error(
        `Rate unavailable: No approved rate plan exists for ${payload.milkType} milk on date ${payload.businessDate}. (${milkTypeMr} दुधासाठी दिनांक ${payload.businessDate} रोजी कोणताही मंजूर दर उपलब्ध नाही.)`
      );
    }

    const params: RateFormulaParametersDto = {
      fatRatePaisePerPoint: plan.fat_rate_paise_per_point,
      snfRatePaisePerPoint: plan.snf_rate_paise_per_point,
      minimumFatX100: plan.minimum_fat_x100,
      maximumFatX100: plan.maximum_fat_x100,
      fatStepX100: plan.fat_step_x100,
      minimumSnfX100: plan.minimum_snf_x100,
      maximumSnfX100: plan.maximum_snf_x100,
      snfStepX100: plan.snf_step_x100,
    };

    const { ratePaisePerLitre, amountPaise } = calculationEngine.calculate(
      payload.fatX100,
      payload.snfX100,
      params,
      payload.quantityMl
    );

    return {
      ratePlanId: plan.id,
      planName: plan.plan_name,
      milkType: plan.milk_type,
      effectiveFrom: plan.effective_from,
      effectiveTo: plan.effective_to,
      ratePaisePerLitre,
      amountPaise,
      rateRupeesFormatted: `₹${formatPaiseAsRupees(ratePaisePerLitre)}/L`,
      amountRupeesFormatted:
        amountPaise !== undefined ? `₹${formatPaiseAsRupees(amountPaise)}` : undefined,
    };
  }
}

export const ratePlanService = new RatePlanService();
