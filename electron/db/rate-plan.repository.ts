import Database from 'better-sqlite3';
import {
  RatePlanMilkType,
  RatePlanStatus,
  RatePlanFilter,
  RateFormulaParametersDto,
} from '../../shared/ipc-contracts';

export interface RatePlanRow {
  id: number;
  plan_name: string;
  milk_type: RatePlanMilkType;
  strategy_type: string;
  pricing_basis: string;
  effective_from: string;
  effective_to: string | null;
  status: RatePlanStatus;
  rounding_mode: string;
  notes: string | null;
  created_by_user_id: number;
  created_by_name?: string;
  approved_by_user_id: number | null;
  approved_by_name?: string | null;
  approved_at: string | null;
  cancelled_by_user_id: number | null;
  cancelled_by_name?: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  // Formula parameter fields joined
  fat_rate_paise_per_point: number;
  snf_rate_paise_per_point: number;
  minimum_fat_x100: number;
  maximum_fat_x100: number;
  fat_step_x100: number;
  minimum_snf_x100: number;
  maximum_snf_x100: number;
  snf_step_x100: number;
}

export interface InsertRatePlanParams {
  planName: string;
  milkType: RatePlanMilkType;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: RatePlanStatus;
  notes?: string | null;
  createdByUserId: number;
  nowIso: string;
  parameters: RateFormulaParametersDto;
}

export interface UpdateRatePlanDraftParams {
  planName: string;
  milkType: RatePlanMilkType;
  effectiveFrom: string;
  effectiveTo?: string | null;
  notes?: string | null;
  nowIso: string;
  parameters: RateFormulaParametersDto;
}

/**
 * Returns the day preceding the given YYYY-MM-DD business date.
 */
export function getPreviousDayIso(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid date format for previous day calculation: '${dateStr}'`);
  }
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  date.setUTCDate(date.getUTCDate() - 1);
  const prevY = date.getUTCFullYear();
  const prevM = String(date.getUTCMonth() + 1).padStart(2, '0');
  const prevD = String(date.getUTCDate()).padStart(2, '0');
  return `${prevY}-${prevM}-${prevD}`;
}

export class RatePlanRepository {
  /**
   * List all rate plans with formula parameters and user names.
   */
  listPlans(db: Database.Database, filter: RatePlanFilter = {}): RatePlanRow[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.milkType) {
      conditions.push('p.milk_type = ?');
      params.push(filter.milkType);
    }

    if (filter.status && filter.status !== 'ALL') {
      conditions.push('p.status = ?');
      params.push(filter.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        p.*,
        u_create.full_name as created_by_name,
        u_appr.full_name as approved_by_name,
        u_canc.full_name as cancelled_by_name,
        fp.fat_rate_paise_per_point,
        fp.snf_rate_paise_per_point,
        fp.minimum_fat_x100,
        fp.maximum_fat_x100,
        fp.fat_step_x100,
        fp.minimum_snf_x100,
        fp.maximum_snf_x100,
        fp.snf_step_x100
      FROM rate_plans p
      JOIN rate_formula_parameters fp ON p.id = fp.rate_plan_id
      LEFT JOIN users u_create ON p.created_by_user_id = u_create.id
      LEFT JOIN users u_appr ON p.approved_by_user_id = u_appr.id
      LEFT JOIN users u_canc ON p.cancelled_by_user_id = u_canc.id
      ${whereClause}
      ORDER BY p.effective_from DESC, p.id DESC
    `;

    return db.prepare(sql).all(...params) as RatePlanRow[];
  }

  /**
   * Get single rate plan by ID with formula parameters.
   */
  getById(db: Database.Database, id: number): RatePlanRow | null {
    const sql = `
      SELECT 
        p.*,
        u_create.full_name as created_by_name,
        u_appr.full_name as approved_by_name,
        u_canc.full_name as cancelled_by_name,
        fp.fat_rate_paise_per_point,
        fp.snf_rate_paise_per_point,
        fp.minimum_fat_x100,
        fp.maximum_fat_x100,
        fp.fat_step_x100,
        fp.minimum_snf_x100,
        fp.maximum_snf_x100,
        fp.snf_step_x100
      FROM rate_plans p
      JOIN rate_formula_parameters fp ON p.id = fp.rate_plan_id
      LEFT JOIN users u_create ON p.created_by_user_id = u_create.id
      LEFT JOIN users u_appr ON p.approved_by_user_id = u_appr.id
      LEFT JOIN users u_canc ON p.cancelled_by_user_id = u_canc.id
      WHERE p.id = ?
    `;

    const row = db.prepare(sql).get(id) as RatePlanRow | undefined;
    return row ?? null;
  }

  /**
   * Find approved rate plan covering the specified business date.
   *
   * @throws Error if configuration integrity is violated (multiple approved plans covering the same date).
   */
  findApprovedPlanForDate(
    db: Database.Database,
    milkType: RatePlanMilkType,
    businessDate: string
  ): RatePlanRow | null {
    const sql = `
      SELECT 
        p.*,
        u_create.full_name as created_by_name,
        u_appr.full_name as approved_by_name,
        u_canc.full_name as cancelled_by_name,
        fp.fat_rate_paise_per_point,
        fp.snf_rate_paise_per_point,
        fp.minimum_fat_x100,
        fp.maximum_fat_x100,
        fp.fat_step_x100,
        fp.minimum_snf_x100,
        fp.maximum_snf_x100,
        fp.snf_step_x100
      FROM rate_plans p
      JOIN rate_formula_parameters fp ON p.id = fp.rate_plan_id
      LEFT JOIN users u_create ON p.created_by_user_id = u_create.id
      LEFT JOIN users u_appr ON p.approved_by_user_id = u_appr.id
      LEFT JOIN users u_canc ON p.cancelled_by_user_id = u_canc.id
      WHERE p.milk_type = ?
        AND p.status = 'APPROVED'
        AND p.effective_from <= ?
        AND (p.effective_to IS NULL OR p.effective_to >= ?)
      ORDER BY p.effective_from DESC, p.id DESC
    `;

    const rows = db.prepare(sql).all(milkType, businessDate, businessDate) as RatePlanRow[];
    if (rows.length === 0) {
      return null;
    }
    if (rows.length > 1) {
      throw new Error(
        `Configuration integrity error: Multiple (${rows.length}) approved rate plans exist for ${milkType} on date ${businessDate}.`
      );
    }
    return rows[0];
  }

  /**
   * Insert a new rate plan and formula parameters.
   */
  insertPlan(db: Database.Database, params: InsertRatePlanParams): number {
    const insertPlanStmt = db.prepare(`
      INSERT INTO rate_plans (
        plan_name, milk_type, strategy_type, pricing_basis,
        effective_from, effective_to, status, rounding_mode,
        notes, created_by_user_id, created_at, updated_at
      ) VALUES (
        ?, ?, 'FORMULA', 'PER_PERCENT_POINT_PER_LITRE',
        ?, ?, ?, 'ROUND_HALF_UP',
        ?, ?, ?, ?
      )
    `);

    const result = insertPlanStmt.run(
      params.planName,
      params.milkType,
      params.effectiveFrom,
      params.effectiveTo || null,
      params.status,
      params.notes || null,
      params.createdByUserId,
      params.nowIso,
      params.nowIso
    );

    const planId = Number(result.lastInsertRowid);

    const insertParamsStmt = db.prepare(`
      INSERT INTO rate_formula_parameters (
        rate_plan_id, fat_rate_paise_per_point, snf_rate_paise_per_point,
        minimum_fat_x100, maximum_fat_x100, fat_step_x100,
        minimum_snf_x100, maximum_snf_x100, snf_step_x100
      ) VALUES (
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?
      )
    `);

    insertParamsStmt.run(
      planId,
      params.parameters.fatRatePaisePerPoint,
      params.parameters.snfRatePaisePerPoint,
      params.parameters.minimumFatX100,
      params.parameters.maximumFatX100,
      params.parameters.fatStepX100,
      params.parameters.minimumSnfX100,
      params.parameters.maximumSnfX100,
      params.parameters.snfStepX100
    );

    return planId;
  }

  /**
   * Update draft rate plan and parameters.
   */
  updateDraftPlan(
    db: Database.Database,
    id: number,
    params: UpdateRatePlanDraftParams
  ): void {
    const updatePlanStmt = db.prepare(`
      UPDATE rate_plans
      SET plan_name = ?,
          milk_type = ?,
          effective_from = ?,
          effective_to = ?,
          notes = ?,
          updated_at = ?
      WHERE id = ? AND status = 'DRAFT'
    `);

    const res = updatePlanStmt.run(
      params.planName,
      params.milkType,
      params.effectiveFrom,
      params.effectiveTo || null,
      params.notes || null,
      params.nowIso,
      id
    );

    if (res.changes === 0) {
      throw new Error(`Draft rate plan #${id} not found or not in DRAFT status.`);
    }

    const updateParamsStmt = db.prepare(`
      UPDATE rate_formula_parameters
      SET fat_rate_paise_per_point = ?,
          snf_rate_paise_per_point = ?,
          minimum_fat_x100 = ?,
          maximum_fat_x100 = ?,
          fat_step_x100 = ?,
          minimum_snf_x100 = ?,
          maximum_snf_x100 = ?,
          snf_step_x100 = ?
      WHERE rate_plan_id = ?
    `);

    updateParamsStmt.run(
      params.parameters.fatRatePaisePerPoint,
      params.parameters.snfRatePaisePerPoint,
      params.parameters.minimumFatX100,
      params.parameters.maximumFatX100,
      params.parameters.fatStepX100,
      params.parameters.minimumSnfX100,
      params.parameters.maximumSnfX100,
      params.parameters.snfStepX100,
      id
    );
  }

  /**
   * Approve a draft rate plan.
   */
  approvePlan(
    db: Database.Database,
    id: number,
    approvedByUserId: number,
    approvedAt: string,
    nowIso: string
  ): void {
    const sql = `
      UPDATE rate_plans
      SET status = 'APPROVED',
          approved_by_user_id = ?,
          approved_at = ?,
          updated_at = ?
      WHERE id = ? AND status = 'DRAFT'
    `;

    const res = db.prepare(sql).run(approvedByUserId, approvedAt, nowIso, id);
    if (res.changes === 0) {
      throw new Error(`Rate plan #${id} could not be approved: Not found or not in DRAFT status.`);
    }
  }

  /**
   * Atomically supersede an existing approved rate plan with a new plan starting on newEffectiveFrom.
   * Sets previous plan's effective_to to the day before newEffectiveFrom.
   */
  supersedePlan(
    db: Database.Database,
    oldPlanId: number,
    newPlanId: number,
    newEffectiveFrom: string,
    approvedByUserId: number,
    approvedAt: string,
    nowIso: string
  ): void {
    const prevDay = getPreviousDayIso(newEffectiveFrom);

    const oldPlan = this.getById(db, oldPlanId);
    if (!oldPlan || oldPlan.status !== 'APPROVED') {
      throw new Error(`Cannot supersede: Previous plan #${oldPlanId} is not in APPROVED status.`);
    }

    if (oldPlan.effective_from > prevDay) {
      throw new Error(
        `Cannot supersede: New effective date (${newEffectiveFrom}) must be strictly after previous plan start date (${oldPlan.effective_from}).`
      );
    }

    // 1. Close prior plan at previous day
    db.prepare(`
      UPDATE rate_plans
      SET effective_to = ?,
          updated_at = ?
      WHERE id = ?
    `).run(prevDay, nowIso, oldPlanId);

    // 2. Approve new plan starting on newEffectiveFrom
    const updateNewStmt = db.prepare(`
      UPDATE rate_plans
      SET status = 'APPROVED',
          effective_from = ?,
          approved_by_user_id = ?,
          approved_at = ?,
          updated_at = ?
      WHERE id = ? AND status = 'DRAFT'
    `);

    const res = updateNewStmt.run(newEffectiveFrom, approvedByUserId, approvedAt, nowIso, newPlanId);
    if (res.changes === 0) {
      throw new Error(`New plan #${newPlanId} could not be approved during supersede operation.`);
    }
  }

  /**
   * Cancel an eligible rate plan.
   */
  cancelPlan(
    db: Database.Database,
    id: number,
    cancelledByUserId: number,
    cancelledAt: string,
    reason: string,
    nowIso: string
  ): void {
    const sql = `
      UPDATE rate_plans
      SET status = 'CANCELLED',
          cancelled_by_user_id = ?,
          cancelled_at = ?,
          cancellation_reason = ?,
          updated_at = ?
      WHERE id = ? AND status IN ('DRAFT', 'APPROVED')
    `;

    const res = db.prepare(sql).run(cancelledByUserId, cancelledAt, reason, nowIso, id);
    if (res.changes === 0) {
      throw new Error(`Rate plan #${id} could not be cancelled: Not found or already cancelled.`);
    }
  }

  /**
   * Check if any milk collection references this rate plan.
   */
  hasCollectionsReferencingPlan(db: Database.Database, planId: number): boolean {
    const tableCheck = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='milk_collections'")
      .get();
    if (!tableCheck) {
      return false;
    }

    const row = db
      .prepare('SELECT 1 FROM milk_collections WHERE rate_plan_id = ? LIMIT 1')
      .get(planId);
    return Boolean(row);
  }
}

export const ratePlanRepository = new RatePlanRepository();
