-- ============================================================================
-- Migration 002: Farmers / Members Directory
-- Dairy Management System (डेअरी व्यवस्थापन प्रणाली)
-- ============================================================================

-- 4. Farmers Table
CREATE TABLE IF NOT EXISTS farmers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_code TEXT UNIQUE NOT NULL COLLATE NOCASE,
    name_mr TEXT NOT NULL,
    name_en TEXT,
    phone TEXT,
    village TEXT,
    bank_account_number TEXT,
    bank_ifsc TEXT,
    bank_name TEXT,
    upi_id TEXT,
    default_milk_type TEXT NOT NULL DEFAULT 'COW' CHECK (default_milk_type IN ('COW', 'BUFFALO', 'BOTH')),
    opening_balance_paise INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Search and Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_farmers_member_code ON farmers(member_code);
CREATE INDEX IF NOT EXISTS idx_farmers_is_active ON farmers(is_active);
CREATE INDEX IF NOT EXISTS idx_farmers_default_milk_type ON farmers(default_milk_type);
CREATE INDEX IF NOT EXISTS idx_farmers_phone ON farmers(phone);
CREATE INDEX IF NOT EXISTS idx_farmers_name_mr ON farmers(name_mr);
CREATE INDEX IF NOT EXISTS idx_farmers_name_en ON farmers(name_en);
