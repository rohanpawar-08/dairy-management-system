-- ============================================================================
-- Migration 001: Foundation Tables
-- Dairy Management System (डेअरी व्यवस्थापन प्रणाली)
-- ============================================================================

-- 1. Schema Migration Tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Dairy Centre Profile & Configuration
CREATE TABLE IF NOT EXISTS dairy_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton record
    centre_name TEXT NOT NULL,
    registration_code TEXT,
    owner_name TEXT NOT NULL,
    phone_primary TEXT NOT NULL,
    phone_secondary TEXT,
    address_line TEXT,
    taluka TEXT,
    district TEXT,
    pincode TEXT,
    receipt_header_mr TEXT,
    receipt_footer_mr TEXT,
    default_language TEXT NOT NULL DEFAULT 'mr' CHECK (default_language IN ('mr', 'en')),
    settlement_start_day TEXT NOT NULL DEFAULT 'MONDAY' CHECK (settlement_start_day IN ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Local Users & Role-Based Access
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, -- scrypt salt+hash
    pin_hash TEXT,               -- scrypt salt+hash for 4-6 digit quick PIN
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('OWNER', 'OPERATOR')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 15. Append-Only Audit Trail
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT,
    user_id INTEGER REFERENCES users(id),
    action_type TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    entity_id TEXT,
    details_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- 16. Application Settings Key-Value Store
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 17. Backup History & Verification Log
CREATE TABLE IF NOT EXISTS backup_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    checksum_sha256 TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('MANUAL', 'AUTOMATIC_SHIFT_CLOSE', 'AUTOMATIC_SCHEDULED', 'APP_SHUTDOWN_BEST_EFFORT', 'PRE_RESTORE_SAFETY', 'PRE_MIGRATION')),
    verification_status TEXT NOT NULL CHECK (verification_status IN ('VERIFIED', 'FAILED')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
