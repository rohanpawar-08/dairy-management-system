-- Migration: 005_adjustments_and_ledger.sql
-- Description: Creates adjustments_and_deductions table with strict null-safe constraints, indexes, and immutability triggers for Stage 7

-- ============================================================================
-- 1. Adjustments, Deductions, and Advances Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS adjustments_and_deductions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference_number TEXT UNIQUE NOT NULL CHECK (length(trim(reference_number)) > 0),
    farmer_id INTEGER NOT NULL REFERENCES farmers(id),
    business_date TEXT NOT NULL CHECK (
        length(business_date) = 10
        AND business_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        AND date(business_date) IS NOT NULL
        AND date(business_date) = business_date
    ),
    entry_type TEXT NOT NULL CHECK (entry_type IN ('ADVANCE', 'DEDUCTION', 'CREDIT')),
    category TEXT NOT NULL CHECK (
        category IN (
            'CASH_ADVANCE',
            'CATTLE_FEED',
            'MEDICINE',
            'LOAN_RECOVERY',
            'EQUIPMENT',
            'OTHER_DEDUCTION',
            'BONUS',
            'PRICE_CORRECTION',
            'OTHER_CREDIT'
        )
    ),
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOIDED')),
    created_by_user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    voided_by_user_id INTEGER REFERENCES users(id),
    voided_at TEXT,
    void_reason TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (
        (entry_type = 'ADVANCE' AND category IN ('CASH_ADVANCE')) OR
        (entry_type = 'DEDUCTION' AND category IN ('CATTLE_FEED', 'MEDICINE', 'LOAN_RECOVERY', 'EQUIPMENT', 'OTHER_DEDUCTION')) OR
        (entry_type = 'CREDIT' AND category IN ('BONUS', 'PRICE_CORRECTION', 'OTHER_CREDIT'))
    ),
    CHECK (
        (
            status = 'ACTIVE'
            AND voided_by_user_id IS NULL
            AND voided_at IS NULL
            AND void_reason IS NULL
        )
        OR
        (
            status = 'VOIDED'
            AND voided_by_user_id IS NOT NULL
            AND voided_at IS NOT NULL
            AND length(trim(voided_at)) > 0
            AND datetime(voided_at) IS NOT NULL
            AND void_reason IS NOT NULL
            AND length(trim(void_reason)) > 0
        )
    )
);

-- ============================================================================
-- 2. Indexes for Fast Searching & Ledger Projection
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_adj_farmer_date ON adjustments_and_deductions(farmer_id, business_date);
CREATE INDEX IF NOT EXISTS idx_adj_status ON adjustments_and_deductions(status);
CREATE INDEX IF NOT EXISTS idx_adj_ref ON adjustments_and_deductions(reference_number);
CREATE INDEX IF NOT EXISTS idx_adj_entry_type ON adjustments_and_deductions(entry_type);
CREATE INDEX IF NOT EXISTS idx_adj_created_at ON adjustments_and_deductions(created_at);

-- ============================================================================
-- 3. Triggers for Data Integrity, Immutability & Hard-Delete Prevention
-- ============================================================================

-- Prevent hard DELETE on adjustments_and_deductions
CREATE TRIGGER IF NOT EXISTS trg_adj_prevent_delete
BEFORE DELETE ON adjustments_and_deductions
BEGIN
    SELECT RAISE(ABORT, 'Hard deletion of adjustment records is strictly prohibited.');
END;

-- Enforce voiding state machine: permit ONLY ACTIVE -> VOIDED transition, block all other updates
CREATE TRIGGER IF NOT EXISTS trg_adj_prevent_update
BEFORE UPDATE ON adjustments_and_deductions
FOR EACH ROW
BEGIN
    -- 1. Voided adjustments can NEVER be updated, modified, or reactivated
    SELECT CASE
        WHEN OLD.status = 'VOIDED'
        THEN RAISE(ABORT, 'Voided adjustments are immutable and cannot be modified.')
    END;

    -- 2. Prevent invalid status transitions (only ACTIVE -> VOIDED is permitted)
    SELECT CASE
        WHEN NOT (OLD.status = 'ACTIVE' AND NEW.status = 'VOIDED')
        THEN RAISE(ABORT, 'Adjustment updates are prohibited except for voiding an active adjustment.')
    END;

    -- 3. Prevent modification of immutable transaction snapshot fields
    SELECT CASE
        WHEN OLD.id != NEW.id
          OR OLD.reference_number != NEW.reference_number
          OR OLD.farmer_id != NEW.farmer_id
          OR OLD.business_date != NEW.business_date
          OR OLD.entry_type != NEW.entry_type
          OR OLD.category != NEW.category
          OR OLD.amount_paise != NEW.amount_paise
          OR OLD.reason != NEW.reason
          OR (OLD.notes IS NULL AND NEW.notes IS NOT NULL)
          OR (OLD.notes IS NOT NULL AND NEW.notes IS NULL)
          OR (OLD.notes != NEW.notes)
          OR OLD.created_by_user_id != NEW.created_by_user_id
          OR OLD.created_at != NEW.created_at
        THEN RAISE(ABORT, 'Adjustment transaction snapshot is immutable and cannot be modified.')
    END;

    -- 4. Require complete valid void metadata when transitioning from ACTIVE to VOIDED
    SELECT CASE
        WHEN NEW.voided_by_user_id IS NULL
          OR NEW.voided_at IS NULL
          OR length(trim(NEW.voided_at)) = 0
          OR datetime(NEW.voided_at) IS NULL
          OR NEW.void_reason IS NULL
          OR length(trim(NEW.void_reason)) = 0
        THEN RAISE(ABORT, 'Voiding an adjustment requires voided_by_user_id, a valid non-empty voided_at timestamp, and a non-empty void_reason.')
    END;
END;
