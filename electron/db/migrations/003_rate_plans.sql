-- Migration: 003_rate_plans.sql
-- Description: Creates rate_plans and rate_formula_parameters for Stage 5 Owner-controlled pricing strategy

-- ============================================================================
-- 1. Rate Plans (Versioning & Approval Metadata)
-- ============================================================================
CREATE TABLE IF NOT EXISTS rate_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_name TEXT NOT NULL,
    milk_type TEXT NOT NULL CHECK (milk_type IN ('COW', 'BUFFALO')),
    strategy_type TEXT NOT NULL CHECK (strategy_type = 'FORMULA'),
    pricing_basis TEXT NOT NULL CHECK (pricing_basis = 'PER_PERCENT_POINT_PER_LITRE'),
    effective_from TEXT NOT NULL, -- Business date YYYY-MM-DD
    effective_to TEXT,           -- Business date YYYY-MM-DD (NULL = currently active/open-ended)
    status TEXT NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'CANCELLED')),
    rounding_mode TEXT NOT NULL DEFAULT 'ROUND_HALF_UP' CHECK (rounding_mode = 'ROUND_HALF_UP'),
    notes TEXT,
    created_by_user_id INTEGER NOT NULL REFERENCES users(id),
    approved_by_user_id INTEGER REFERENCES users(id),
    approved_at TEXT,
    cancelled_by_user_id INTEGER REFERENCES users(id),
    cancelled_at TEXT,
    cancellation_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK (status != 'DRAFT' OR (approved_by_user_id IS NULL AND approved_at IS NULL AND cancelled_by_user_id IS NULL AND cancelled_at IS NULL)),
    CHECK (status != 'APPROVED' OR (approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL AND cancelled_by_user_id IS NULL AND cancelled_at IS NULL)),
    CHECK (status != 'CANCELLED' OR (cancelled_by_user_id IS NOT NULL AND cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_rate_plans_lookup ON rate_plans(milk_type, status, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_rate_plans_status ON rate_plans(status);
CREATE INDEX IF NOT EXISTS idx_rate_plans_effective_dates ON rate_plans(effective_from, effective_to);

-- ============================================================================
-- 2. Rate Formula Parameters (Exact Formula Coefficients, Quality Bounds & Steps)
-- ============================================================================
CREATE TABLE IF NOT EXISTS rate_formula_parameters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rate_plan_id INTEGER UNIQUE NOT NULL REFERENCES rate_plans(id),
    fat_rate_paise_per_point INTEGER NOT NULL CHECK (fat_rate_paise_per_point >= 0),
    snf_rate_paise_per_point INTEGER NOT NULL CHECK (snf_rate_paise_per_point >= 0),
    minimum_fat_x100 INTEGER NOT NULL CHECK (minimum_fat_x100 > 0),
    maximum_fat_x100 INTEGER NOT NULL CHECK (maximum_fat_x100 >= minimum_fat_x100),
    fat_step_x100 INTEGER NOT NULL CHECK (fat_step_x100 > 0),
    minimum_snf_x100 INTEGER NOT NULL CHECK (minimum_snf_x100 > 0),
    maximum_snf_x100 INTEGER NOT NULL CHECK (maximum_snf_x100 >= minimum_snf_x100),
    snf_step_x100 INTEGER NOT NULL CHECK (snf_step_x100 > 0),
    CHECK (fat_rate_paise_per_point > 0 OR snf_rate_paise_per_point > 0)
);

CREATE INDEX IF NOT EXISTS idx_rate_formula_params_plan ON rate_formula_parameters(rate_plan_id);

-- ============================================================================
-- 3. Triggers for Overlap Prevention on APPROVED Plans
-- ============================================================================
CREATE TRIGGER IF NOT EXISTS trg_rate_plans_no_overlap_insert
BEFORE INSERT ON rate_plans
FOR EACH ROW
WHEN NEW.status = 'APPROVED'
BEGIN
    SELECT
        CASE
            WHEN EXISTS (
                SELECT 1 FROM rate_plans
                WHERE milk_type = NEW.milk_type
                  AND status = 'APPROVED'
                  AND id != NEW.id
                  AND (NEW.effective_to IS NULL OR effective_from <= NEW.effective_to)
                  AND (effective_to IS NULL OR effective_to >= NEW.effective_from)
            )
            THEN RAISE(ABORT, 'Cannot approve rate plan: An active/approved plan already exists for this milk type and date range.')
        END;
END;

CREATE TRIGGER IF NOT EXISTS trg_rate_plans_no_overlap_update
BEFORE UPDATE OF status, effective_from, effective_to ON rate_plans
FOR EACH ROW
WHEN NEW.status = 'APPROVED'
BEGIN
    SELECT
        CASE
            WHEN EXISTS (
                SELECT 1 FROM rate_plans
                WHERE milk_type = NEW.milk_type
                  AND status = 'APPROVED'
                  AND id != NEW.id
                  AND (NEW.effective_to IS NULL OR effective_from <= NEW.effective_to)
                  AND (effective_to IS NULL OR effective_to >= NEW.effective_from)
            )
            THEN RAISE(ABORT, 'Cannot approve rate plan: An active/approved plan already exists for this milk type and date range.')
        END;
END;
