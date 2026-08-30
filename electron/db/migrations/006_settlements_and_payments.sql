-- Migration: 006_settlements_and_payments.sql
-- Description: Creates settlement_periods, weekly_settlements, settlement_items, payments, and payment_allocations tables for Stage 8

-- ============================================================================
-- 1. Settlement Periods (Weekly Billing Master Batches)
-- ============================================================================
CREATE TABLE IF NOT EXISTS settlement_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    settlement_number TEXT UNIQUE NOT NULL CHECK (length(trim(settlement_number)) > 0),
    period_start TEXT NOT NULL CHECK (
        length(period_start) = 10
        AND period_start GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        AND date(period_start) IS NOT NULL
        AND date(period_start) = period_start
    ),
    period_end TEXT NOT NULL CHECK (
        length(period_end) = 10
        AND period_end GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        AND date(period_end) IS NOT NULL
        AND date(period_end) = period_end
        AND date(period_end) = date(period_start, '+6 days')
    ),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINALIZED', 'CANCELLED')),
    created_by_user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    finalized_by_user_id INTEGER REFERENCES users(id),
    finalized_at TEXT,
    cancelled_by_user_id INTEGER REFERENCES users(id),
    cancelled_at TEXT,
    cancellation_reason TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (
        (
            status = 'DRAFT'
            AND finalized_by_user_id IS NULL
            AND finalized_at IS NULL
            AND cancelled_by_user_id IS NULL
            AND cancelled_at IS NULL
            AND cancellation_reason IS NULL
        ) OR (
            status = 'FINALIZED'
            AND finalized_by_user_id IS NOT NULL
            AND finalized_at IS NOT NULL
            AND length(trim(finalized_at)) > 0
            AND date(finalized_at) IS NOT NULL
            AND cancelled_by_user_id IS NULL
            AND cancelled_at IS NULL
            AND cancellation_reason IS NULL
        ) OR (
            status = 'CANCELLED'
            AND cancelled_by_user_id IS NOT NULL
            AND cancelled_at IS NOT NULL
            AND length(trim(cancelled_at)) > 0
            AND date(cancelled_at) IS NOT NULL
            AND cancellation_reason IS NOT NULL
            AND length(trim(cancellation_reason)) > 0
            AND finalized_by_user_id IS NULL
            AND finalized_at IS NULL
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_settlement_periods_dates ON settlement_periods(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_settlement_periods_status ON settlement_periods(status);

-- Single DRAFT period constraint globally
CREATE UNIQUE INDEX IF NOT EXISTS idx_settlement_periods_single_draft ON settlement_periods(status) WHERE status = 'DRAFT';

-- Prevent active period date range overlap
CREATE TRIGGER IF NOT EXISTS trg_settlement_periods_prevent_overlap
BEFORE INSERT ON settlement_periods
FOR EACH ROW
WHEN NEW.status IN ('DRAFT', 'FINALIZED')
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1 FROM settlement_periods
            WHERE status IN ('DRAFT', 'FINALIZED')
              AND NOT (period_end < NEW.period_start OR period_start > NEW.period_end)
        )
        THEN RAISE(ABORT, 'Settlement period date range overlaps with an existing active period.')
    END;
END;

-- Prevent hard DELETE on settlement_periods
CREATE TRIGGER IF NOT EXISTS trg_settlement_periods_prevent_delete
BEFORE DELETE ON settlement_periods
BEGIN
    SELECT RAISE(ABORT, 'Hard deletion of settlement periods is strictly prohibited.');
END;

-- Enforce settlement_periods state machine & immutability
CREATE TRIGGER IF NOT EXISTS trg_settlement_periods_prevent_update
BEFORE UPDATE ON settlement_periods
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN OLD.status IN ('FINALIZED', 'CANCELLED')
        THEN RAISE(ABORT, 'Finalized or cancelled settlement periods are immutable and cannot be updated.')
    END;

    SELECT CASE
        WHEN OLD.status = 'DRAFT' AND NEW.status NOT IN ('FINALIZED', 'CANCELLED')
        THEN RAISE(ABORT, 'Invalid status transition for settlement period. Only DRAFT -> FINALIZED or DRAFT -> CANCELLED are permitted.')
    END;

    SELECT CASE
        WHEN OLD.id != NEW.id
          OR OLD.settlement_number != NEW.settlement_number
          OR OLD.period_start != NEW.period_start
          OR OLD.period_end != NEW.period_end
          OR OLD.created_by_user_id != NEW.created_by_user_id
          OR OLD.created_at != NEW.created_at
        THEN RAISE(ABORT, 'Immutable settlement period fields cannot be modified.')
    END;

    SELECT CASE
        WHEN NEW.status = 'FINALIZED' AND (
            NEW.finalized_by_user_id IS NULL
            OR NEW.finalized_at IS NULL
            OR length(trim(NEW.finalized_at)) = 0
            OR date(NEW.finalized_at) IS NULL
            OR NEW.cancelled_by_user_id IS NOT NULL
            OR NEW.cancelled_at IS NOT NULL
            OR NEW.cancellation_reason IS NOT NULL
        )
        THEN RAISE(ABORT, 'Finalizing a settlement period requires finalized_by_user_id and a valid finalized_at timestamp with no cancellation fields.')
    END;

    SELECT CASE
        WHEN NEW.status = 'CANCELLED' AND (
            NEW.cancelled_by_user_id IS NULL
            OR NEW.cancelled_at IS NULL
            OR length(trim(NEW.cancelled_at)) = 0
            OR date(NEW.cancelled_at) IS NULL
            OR NEW.cancellation_reason IS NULL
            OR length(trim(NEW.cancellation_reason)) = 0
            OR NEW.finalized_by_user_id IS NOT NULL
            OR NEW.finalized_at IS NOT NULL
        )
        THEN RAISE(ABORT, 'Cancelling a settlement period requires cancelled_by_user_id, a valid cancelled_at timestamp, and a non-empty cancellation_reason.')
    END;
END;

-- ============================================================================
-- 2. Weekly Farmer Settlements (Frozen Statements)
-- ============================================================================
CREATE TABLE IF NOT EXISTS weekly_settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    settlement_period_id INTEGER NOT NULL REFERENCES settlement_periods(id),
    farmer_id INTEGER NOT NULL REFERENCES farmers(id),
    member_code_snapshot TEXT NOT NULL CHECK (length(trim(member_code_snapshot)) > 0),
    farmer_name_mr_snapshot TEXT NOT NULL CHECK (length(trim(farmer_name_mr_snapshot)) > 0),
    farmer_name_en_snapshot TEXT,
    opening_balance_paise INTEGER NOT NULL,
    milk_quantity_ml INTEGER NOT NULL DEFAULT 0 CHECK (milk_quantity_ml >= 0),
    milk_collection_count INTEGER NOT NULL DEFAULT 0 CHECK (milk_collection_count >= 0),
    milk_amount_paise INTEGER NOT NULL DEFAULT 0 CHECK (milk_amount_paise >= 0),
    credit_amount_paise INTEGER NOT NULL DEFAULT 0 CHECK (credit_amount_paise >= 0),
    deduction_amount_paise INTEGER NOT NULL DEFAULT 0 CHECK (deduction_amount_paise >= 0),
    advance_amount_paise INTEGER NOT NULL DEFAULT 0 CHECK (advance_amount_paise >= 0),
    net_amount_paise INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(settlement_period_id, farmer_id),
    CHECK (net_amount_paise = opening_balance_paise + milk_amount_paise + credit_amount_paise - deduction_amount_paise - advance_amount_paise)
);

CREATE INDEX IF NOT EXISTS idx_weekly_settlements_period ON weekly_settlements(settlement_period_id);
CREATE INDEX IF NOT EXISTS idx_weekly_settlements_farmer ON weekly_settlements(farmer_id);

-- Prevent hard DELETE on weekly_settlements
CREATE TRIGGER IF NOT EXISTS trg_weekly_settlements_prevent_delete
BEFORE DELETE ON weekly_settlements
BEGIN
    SELECT RAISE(ABORT, 'Hard deletion of weekly settlements is strictly prohibited.');
END;

-- Prevent UPDATE on weekly_settlements
CREATE TRIGGER IF NOT EXISTS trg_weekly_settlements_prevent_update
BEFORE UPDATE ON weekly_settlements
BEGIN
    SELECT RAISE(ABORT, 'Weekly settlement snapshots are immutable and cannot be updated.');
END;

-- ============================================================================
-- 3. Settlement Items (Line-Item Links to Source Transactions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS settlement_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    weekly_settlement_id INTEGER NOT NULL REFERENCES weekly_settlements(id),
    source_type TEXT NOT NULL CHECK (source_type IN ('OPENING_BALANCE', 'MILK_COLLECTION', 'ADJUSTMENT')),
    source_id INTEGER NOT NULL CHECK (source_id > 0),
    business_date TEXT,
    reference_number TEXT NOT NULL CHECK (length(trim(reference_number)) > 0),
    signed_amount_paise INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_settlement_items_weekly_settlement ON settlement_items(weekly_settlement_id);

-- Unique source index: A source may belong to only one finalized settlement item
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_items_opening_balance ON settlement_items(source_id) WHERE source_type = 'OPENING_BALANCE';
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_items_milk_collection ON settlement_items(source_id) WHERE source_type = 'MILK_COLLECTION';
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_items_adjustment ON settlement_items(source_id) WHERE source_type = 'ADJUSTMENT';

-- Prevent hard DELETE on settlement_items
CREATE TRIGGER IF NOT EXISTS trg_settlement_items_prevent_delete
BEFORE DELETE ON settlement_items
BEGIN
    SELECT RAISE(ABORT, 'Hard deletion of settlement items is strictly prohibited.');
END;

-- Prevent UPDATE on settlement_items
CREATE TRIGGER IF NOT EXISTS trg_settlement_items_prevent_update
BEFORE UPDATE ON settlement_items
BEGIN
    SELECT RAISE(ABORT, 'Settlement items are immutable and cannot be updated.');
END;

-- ============================================================================
-- 4. Payments (Disbursement Vouchers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_number TEXT UNIQUE NOT NULL CHECK (length(trim(payment_number)) > 0),
    farmer_id INTEGER NOT NULL REFERENCES farmers(id),
    business_date TEXT NOT NULL CHECK (
        length(business_date) = 10
        AND business_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        AND date(business_date) IS NOT NULL
        AND date(business_date) = business_date
    ),
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER')),
    external_reference TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'RECORDED' CHECK (status IN ('RECORDED', 'VOIDED')),
    created_by_user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    voided_by_user_id INTEGER REFERENCES users(id),
    voided_at TEXT,
    void_reason TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (
        payment_method = 'CASH' OR (external_reference IS NOT NULL AND length(trim(external_reference)) > 0)
    ),
    CHECK (
        (
            status = 'RECORDED'
            AND voided_by_user_id IS NULL
            AND voided_at IS NULL
            AND void_reason IS NULL
        ) OR (
            status = 'VOIDED'
            AND voided_by_user_id IS NOT NULL
            AND voided_at IS NOT NULL
            AND length(trim(voided_at)) > 0
            AND date(voided_at) IS NOT NULL
            AND void_reason IS NOT NULL
            AND length(trim(void_reason)) > 0
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_payments_farmer_date ON payments(farmer_id, business_date);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_number ON payments(payment_number);

-- Prevent hard DELETE on payments
CREATE TRIGGER IF NOT EXISTS trg_payments_prevent_delete
BEFORE DELETE ON payments
BEGIN
    SELECT RAISE(ABORT, 'Hard deletion of payment records is strictly prohibited.');
END;

-- Enforce voiding state machine & immutability on payments
CREATE TRIGGER IF NOT EXISTS trg_payments_prevent_update
BEFORE UPDATE ON payments
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN OLD.status = 'VOIDED'
        THEN RAISE(ABORT, 'Voided payments are immutable and cannot be modified.')
    END;

    SELECT CASE
        WHEN NOT (OLD.status = 'RECORDED' AND NEW.status = 'VOIDED')
        THEN RAISE(ABORT, 'Payment updates are prohibited except for voiding a recorded payment.')
    END;

    SELECT CASE
        WHEN OLD.id != NEW.id
          OR OLD.payment_number != NEW.payment_number
          OR OLD.farmer_id != NEW.farmer_id
          OR OLD.business_date != NEW.business_date
          OR OLD.amount_paise != NEW.amount_paise
          OR OLD.payment_method != NEW.payment_method
          OR OLD.external_reference IS NOT NEW.external_reference
          OR OLD.notes IS NOT NEW.notes
          OR OLD.created_by_user_id != NEW.created_by_user_id
          OR OLD.created_at != NEW.created_at
        THEN RAISE(ABORT, 'Payment transaction fields are immutable and cannot be modified.')
    END;

    SELECT CASE
        WHEN NEW.voided_by_user_id IS NULL
          OR NEW.voided_at IS NULL
          OR length(trim(NEW.voided_at)) = 0
          OR date(NEW.voided_at) IS NULL
          OR NEW.void_reason IS NULL
          OR length(trim(NEW.void_reason)) = 0
        THEN RAISE(ABORT, 'Voiding a payment requires voided_by_user_id, a valid voided_at timestamp, and a non-empty void_reason.')
    END;
END;

-- ============================================================================
-- 5. Payment Allocations (Cross-Settlement Non-Destructive Allocation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id INTEGER NOT NULL REFERENCES payments(id),
    weekly_settlement_id INTEGER NOT NULL REFERENCES weekly_settlements(id),
    allocated_paise INTEGER NOT NULL CHECK (allocated_paise > 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(payment_id, weekly_settlement_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_settlement ON payment_allocations(weekly_settlement_id);

-- Validate payment allocation invariants on insertion
CREATE TRIGGER IF NOT EXISTS trg_payment_allocations_validate_insert
BEFORE INSERT ON payment_allocations
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN (
            SELECT sp.status
            FROM weekly_settlements ws
            JOIN settlement_periods sp ON ws.settlement_period_id = sp.id
            WHERE ws.id = NEW.weekly_settlement_id
        ) != 'FINALIZED'
        THEN RAISE(ABORT, 'Payment allocation target settlement period must be FINALIZED.')
    END;

    SELECT CASE
        WHEN (SELECT farmer_id FROM payments WHERE id = NEW.payment_id) !=
             (SELECT farmer_id FROM weekly_settlements WHERE id = NEW.weekly_settlement_id)
        THEN RAISE(ABORT, 'Payment and target settlement must belong to the same farmer.')
    END;

    SELECT CASE
        WHEN (SELECT net_amount_paise FROM weekly_settlements WHERE id = NEW.weekly_settlement_id) <= 0
        THEN RAISE(ABORT, 'Payment allocation target settlement net amount must be strictly positive.')
    END;

    SELECT CASE
        WHEN (
            COALESCE((
                SELECT SUM(pa.allocated_paise)
                FROM payment_allocations pa
                JOIN payments p ON pa.payment_id = p.id
                WHERE pa.weekly_settlement_id = NEW.weekly_settlement_id AND p.status = 'RECORDED'
            ), 0) + NEW.allocated_paise
        ) > (SELECT net_amount_paise FROM weekly_settlements WHERE id = NEW.weekly_settlement_id)
        THEN RAISE(ABORT, 'Payment allocation exceeds target settlement positive remaining capacity.')
    END;
END;

-- Prevent hard DELETE on payment_allocations
CREATE TRIGGER IF NOT EXISTS trg_payment_allocations_prevent_delete
BEFORE DELETE ON payment_allocations
BEGIN
    SELECT RAISE(ABORT, 'Hard deletion of payment allocations is strictly prohibited.');
END;

-- Prevent UPDATE on payment_allocations
CREATE TRIGGER IF NOT EXISTS trg_payment_allocations_prevent_update
BEFORE UPDATE ON payment_allocations
BEGIN
    SELECT RAISE(ABORT, 'Payment allocations are immutable and cannot be updated.');
END;
