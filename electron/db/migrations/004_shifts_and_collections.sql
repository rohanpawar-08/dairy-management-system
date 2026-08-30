-- Migration: 004_shifts_and_collections.sql
-- Description: Creates shifts and milk_collections tables with constraints, indexes, and immutability triggers for Stage 6

-- ============================================================================
-- 1. Shifts (Morning / Evening Session Lifecycle)
-- ============================================================================
CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_date TEXT NOT NULL, -- Business date YYYY-MM-DD
    shift_type TEXT NOT NULL CHECK (shift_type IN ('MORNING', 'EVENING')),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'LOCKED')),
    opened_by_user_id INTEGER NOT NULL REFERENCES users(id),
    opened_at TEXT NOT NULL,
    closed_by_user_id INTEGER REFERENCES users(id),
    closed_at TEXT,
    reopened_by_user_id INTEGER REFERENCES users(id),
    reopened_at TEXT,
    reopen_reason TEXT,
    reopen_count INTEGER NOT NULL DEFAULT 0 CHECK (reopen_count >= 0),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(business_date, shift_type),
    CHECK (status != 'OPEN' OR (closed_by_user_id IS NULL AND closed_at IS NULL)),
    CHECK (status != 'LOCKED' OR (closed_by_user_id IS NOT NULL AND closed_at IS NOT NULL)),
    CHECK (reopen_count = 0 OR (reopened_by_user_id IS NOT NULL AND reopened_at IS NOT NULL AND reopen_reason IS NOT NULL AND length(trim(reopen_reason)) > 0))
);

-- Partial unique index ensuring only ONE shift can be OPEN globally across the entire application
CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_single_open ON shifts(status) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_shifts_date_type ON shifts(business_date, shift_type);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);

-- ============================================================================
-- 2. Milk Collections (Immutable Collection Transactions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS milk_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_number TEXT UNIQUE NOT NULL,
    shift_id INTEGER NOT NULL REFERENCES shifts(id),
    farmer_id INTEGER NOT NULL REFERENCES farmers(id),
    business_date TEXT NOT NULL, -- Business date YYYY-MM-DD
    shift_type TEXT NOT NULL CHECK (shift_type IN ('MORNING', 'EVENING')),
    milk_type TEXT NOT NULL CHECK (milk_type IN ('COW', 'BUFFALO')),
    quantity_ml INTEGER NOT NULL CHECK (quantity_ml > 0),
    fat_x100 INTEGER NOT NULL CHECK (fat_x100 > 0),
    snf_x100 INTEGER NOT NULL CHECK (snf_x100 > 0),
    rate_plan_id INTEGER NOT NULL REFERENCES rate_plans(id),
    rate_applied_paise INTEGER NOT NULL CHECK (rate_applied_paise > 0),
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    duplicate_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_confirmed IN (0, 1)),
    duplicate_reason TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOIDED')),
    voided_at TEXT,
    voided_by_user_id INTEGER REFERENCES users(id),
    void_reason TEXT,
    created_by_user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (status != 'ACTIVE' OR (voided_at IS NULL AND voided_by_user_id IS NULL AND void_reason IS NULL)),
    CHECK (status != 'VOIDED' OR (voided_at IS NOT NULL AND voided_by_user_id IS NOT NULL AND void_reason IS NOT NULL AND length(trim(void_reason)) > 0)),
    CHECK (duplicate_confirmed = 0 OR (duplicate_reason IS NOT NULL AND length(trim(duplicate_reason)) > 0))
);

CREATE INDEX IF NOT EXISTS idx_milk_collections_farmer_date ON milk_collections(farmer_id, business_date);
CREATE INDEX IF NOT EXISTS idx_milk_collections_shift ON milk_collections(shift_id);
CREATE INDEX IF NOT EXISTS idx_milk_collections_status ON milk_collections(status);
CREATE INDEX IF NOT EXISTS idx_milk_collections_date_shift ON milk_collections(business_date, shift_type);
CREATE INDEX IF NOT EXISTS idx_milk_collections_duplicate_lookup ON milk_collections(farmer_id, shift_id, milk_type, status);
CREATE INDEX IF NOT EXISTS idx_milk_collections_receipt ON milk_collections(receipt_number);

-- ============================================================================
-- 3. Triggers for Data Integrity, Immutability & Hard-Delete Prevention
-- ============================================================================

-- Prevent hard DELETE on shifts
CREATE TRIGGER IF NOT EXISTS trg_shifts_prevent_delete
BEFORE DELETE ON shifts
BEGIN
    SELECT RAISE(ABORT, 'Hard deletion of shift records is strictly prohibited.');
END;

-- Prevent hard DELETE on milk_collections
CREATE TRIGGER IF NOT EXISTS trg_milk_collections_prevent_delete
BEFORE DELETE ON milk_collections
BEGIN
    SELECT RAISE(ABORT, 'Hard deletion of milk collection records is strictly prohibited.');
END;

-- Prevent modification of immutable collection snapshot fields and enforce voiding state machine
CREATE TRIGGER IF NOT EXISTS trg_milk_collections_prevent_update
BEFORE UPDATE ON milk_collections
FOR EACH ROW
BEGIN
    -- 1. Voided collections can NEVER be updated or reactivated
    SELECT CASE
        WHEN OLD.status = 'VOIDED'
        THEN RAISE(ABORT, 'Voided milk collections cannot be updated or reactivated.')
    END;

    -- 2. Prevent invalid status transitions (only ACTIVE -> VOIDED or ACTIVE -> ACTIVE is permitted)
    SELECT CASE
        WHEN NEW.status NOT IN ('ACTIVE', 'VOIDED')
          OR (OLD.status = 'ACTIVE' AND NEW.status != 'ACTIVE' AND NEW.status != 'VOIDED')
        THEN RAISE(ABORT, 'Invalid status transition for milk collection.')
    END;

    -- 3. Prevent modification of all immutable transaction snapshot fields
    SELECT CASE
        WHEN OLD.receipt_number != NEW.receipt_number
          OR OLD.shift_id != NEW.shift_id
          OR OLD.farmer_id != NEW.farmer_id
          OR OLD.business_date != NEW.business_date
          OR OLD.shift_type != NEW.shift_type
          OR OLD.milk_type != NEW.milk_type
          OR OLD.quantity_ml != NEW.quantity_ml
          OR OLD.fat_x100 != NEW.fat_x100
          OR OLD.snf_x100 != NEW.snf_x100
          OR OLD.rate_plan_id != NEW.rate_plan_id
          OR OLD.rate_applied_paise != NEW.rate_applied_paise
          OR OLD.amount_paise != NEW.amount_paise
          OR OLD.duplicate_confirmed != NEW.duplicate_confirmed
          OR (OLD.duplicate_reason IS NOT NULL AND NEW.duplicate_reason IS NULL)
          OR (OLD.duplicate_reason IS NULL AND NEW.duplicate_reason IS NOT NULL)
          OR (OLD.duplicate_reason != NEW.duplicate_reason)
          OR OLD.created_by_user_id != NEW.created_by_user_id
          OR OLD.created_at != NEW.created_at
        THEN RAISE(ABORT, 'Milk collection transaction snapshot is immutable and cannot be modified.')
    END;
END;
