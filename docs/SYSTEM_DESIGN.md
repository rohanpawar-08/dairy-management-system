# System Design Document (v2.0)
## Dairy Management System — Offline Desktop Application
### (डेअरी व्यवस्थापन प्रणाली — सिस्टिम डिझाइन दस्तऐवज)

---

## 1. High-Level Architecture & Process Boundaries

The Dairy Management System is engineered as a secure, offline-first desktop application utilizing a multi-process architecture consisting of an **Angular 22 Renderer Process**, a **Secure Electron Preload Bridge**, and an **Electron Main Process** managing a local **SQLite** database.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ELECTRON DESKTOP SHELL                          │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    RENDERER PROCESS (Angular 22)                 │  │
│  │  - Standalone Components & Signals                               │  │
│  │  - Angular Material 3 Custom SCSS UI                             │  │
│  │  - Bilingual i18n Translation Service (mr / en)                  │  │
│  │  - Input formatting & real-time UX validation                    │  │
│  │  - Window context: contextIsolation=true, nodeIntegration=false   │  │
│  └─────────────────────────────────┬────────────────────────────────┘  │
│                                    │ Strongly-Typed API Calls          │
│  ┌─────────────────────────────────▼────────────────────────────────┐  │
│  │                     PRELOAD BRIDGE (preload.ts)                  │  │
│  │  - contextBridge.exposeInMainWorld('dairyApi', {...})            │  │
│  │  - Channel allowlisting & request payload sanitization           │  │
│  │  - Strictly typed Promise wrappers over ipcRenderer.invoke       │  │
│  └─────────────────────────────────┬────────────────────────────────┘  │
│                                    │ IPC Envelope (invoke / handle)    │
│  ┌─────────────────────────────────▼────────────────────────────────┐  │
│  │                   ELECTRON MAIN PROCESS (Node.js)                │  │
│  │  - Window Lifecycle & Native OS integration                      │  │
│  │  - IPC Route Handlers (ipcMain.handle)                           │  │
│  │  - Authentication & Session Authority in Memory                  │  │
│  │  - Rate Calculation Engine (Owner-Approved Strategy)             │  │
│  │  - Database Repository Layer (better-sqlite3)                    │  │
│  │  - Incremental Migration Engine & Integrity Checker              │  │
│  │  - Asynchronous Backup & Safe Restore Manager (VACUUM INTO / API)│  │
│  │  - Base AuditService (Implemented in Stage 3)                    │  │
│  │  - PDF Generation & Printing Engine (pdfmake + Devanagari Font)  │  │
│  └─────────────────────────────────┬────────────────────────────────┘  │
│                                    │ Synchronous C-Bindings (WAL Mode) │
│  ┌─────────────────────────────────▼────────────────────────────────┐  │
│  │                     EMBEDDED SQLite DATABASE                     │  │
│  │  - Location: app.getPath('userData')/dairy_data.db               │  │
│  │  - 17 Relational Tables, Foreign Keys ON, WAL + synchronous=FULL │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Separation of Responsibilities

| Subsystem | Primary Responsibilities | Prohibited Actions |
|---|---|---|
| **Angular Renderer** | Presentation, UI components, keyboard focus management, live calculation previews, client validation, bilingual text rendering. | **NEVER** accesses filesystem, SQLite, `better-sqlite3`, or Node.js native modules. |
| **Preload Bridge** | Exposes a secure, immutable `window.dairyApi` object; isolates renderer from Electron internals; allowlists IPC channels. | **NEVER** exposes raw `ipcRenderer.send` or unrestricted event emitters. |
| **Electron Main** | Database access, SQL transactions, schema migrations, authoritative rate calculation, backup/restore, PDF rendering, OS printing, session authentication authority. | **NEVER** relies solely on frontend validation for business or financial rules. |
| **SQLite DB** | Relational ACID storage, foreign key referential integrity, partial indexes, crash recovery with `PRAGMA synchronous = FULL`. | N/A |

---

## 2. Security & Threat Model

### 2.1 Process Isolation & Renderer Sandboxing
- **`contextIsolation: true`:** Guarantees that preload scripts and Electron internal logic execute in a separate context from Angular scripts.
- **`nodeIntegration: false`:** Completely prevents Node.js APIs (`fs`, `child_process`, `require`) from being executed within the Angular renderer.
- **`sandbox: true`:** Enables Chromium OS-level sandboxing on the renderer process, materially reducing vulnerability surfaces.
- **Content Security Policy (CSP):** Strict CSP headers restricting scripts and styles to locally bundled assets (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:;`).

### 2.2 Local Authentication & Credential Storage
- **Password & PIN Hashing:** Passwords and PINs are securely derived using Node.js built-in `crypto.scrypt` with a unique cryptographically random salt (32 bytes), storing the resulting hash parameters in `password_hash` and `pin_hash`. Plaintext PINs are never stored.
- **Timing-Safe Comparison:** Verification uses `crypto.timingSafeEqual` to prevent timing side-channel analysis.
- **Session Management:** Authenticated user sessions are held exclusively in Electron main-process memory. Every privileged IPC channel checks session validity and role permissions (`OWNER` vs `OPERATOR`) independently of frontend Angular route guards.
- **Rate-Limiting:** Repeated failed local authentication attempts are throttled in main-process memory to mitigate automated PIN brute-forcing.
- **Local Data Protection Realities:** The application enforces local software role separation, but does not claim disk encryption against OS administrators with direct physical hardware access. Masked bank and UPI details prevent shoulder-surfing at the collection counter.

---

## 3. Financial & Precision Strategy

Floating-point representations (IEEE 754) produce compounding precision errors. In a dairy collection centre recording hundreds of milk entries daily, fractional rounding drifts will corrupt farmer balances.

### 3.1 Precision Rules

| Metric | Business Unit | Internal Stored Representation | Multiplier / Unit | Example |
|---|---|---|---|---|
| **Currency (Money)** | Indian Rupee (₹) | Integer Paise | $1\text{ INR} = 100\text{ paise}$ | ₹45.50 $\rightarrow$ `4550` |
| **Milk Quantity** | Litre (L) | Integer Millilitres (mL) | $1\text{ L} = 1000\text{ mL}$ | $12.4\text{ L} \rightarrow 12400\text{ mL}$ |
| **FAT Percentage** | Percent (%) | Scaled Integer ($\times 100$) | $1\% = 100\text{ units}$ | $4.2\% \rightarrow 420$ |
| **SNF Percentage** | Percent (%) | Scaled Integer ($\times 100$) | $1\% = 100\text{ units}$ | $8.5\% \rightarrow 850$ |
| **Rate per Litre** | ₹ per Litre | Scaled Paise per Litre | Integer Paise | ₹38.50/L $\rightarrow$ `3850` |

### 3.2 Calculation Formula & Rounding (Confirmed Strategy: FORMULA)
For a milk delivery of $Q_{\text{mL}}$ millilitres with quality parameters $\text{FAT}_{\text{x100}}$ and $\text{SNF}_{\text{x100}}$ under an approved formula plan:
$$\text{rateNumerator} = (\text{FAT}_{\text{x100}} \times \text{fatRatePaisePerPoint}) + (\text{SNF}_{\text{x100}} \times \text{snfRatePaisePerPoint})$$
$$R_{\text{paise}} = \text{ROUND\_HALF\_UP}\left(\frac{\text{rateNumerator}}{100}\right)$$
$$\text{Amount (Paise)} = \text{ROUND\_HALF\_UP}\left(\frac{Q_{\text{mL}} \times R_{\text{paise}}}{1000}\right)$$

*Rounding Rule:* The calculation engine eliminates binary floating-point drift using exact integer / BigInt arithmetic with `ROUND_HALF_UP` on both the rate per litre and final collection amount. All rates and amounts are stored as integer paise.

### 3.3 Explicit Financial Terminology
- `INCREASE_PAYABLE`: Increases the net balance owed by the dairy to the farmer (e.g., active milk deliveries, bonuses, positive incentives).
- `DECREASE_PAYABLE`: Decreases the net balance owed to the farmer (e.g., cattle feed, loan recovery, transport charges, veterinary fees).
- **Farmer Opening Balance Sign:** Positive integer paise indicates dairy payable to farmer; negative integer paise indicates farmer debt/advance to dairy.

---

## 4. Date, Time & Timezone Strategy

- **Business Date:** Stored as an explicit calendar string `YYYY-MM-DD` (e.g., `'2026-08-28'`) in Indian Standard Time (**Asia/Kolkata**, UTC+05:30). All shift grouping, daily tallying, and weekly billing operate strictly on `business_date`.
- **System Audit Timestamp:** Stored as UTC ISO 8601 string `YYYY-MM-DDTHH:mm:ss.sssZ` in `created_at` / `updated_at`.
- Decoupling `business_date` from UTC system clock timestamps is designed to prevent timezone rollover discrepancies during evening collection shifts.

---

## 5. Complete Proposed SQLite Database Schema (17 Tables)

```sql
-- ============================================================================
-- 1. Schema Migration Tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- 2. Dairy Centre Profile & Configuration
-- ============================================================================
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

-- ============================================================================
-- 3. Local Users & Role-Based Access
-- ============================================================================
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

-- ============================================================================
-- 4. Farmers / Members Directory
-- ============================================================================
CREATE TABLE IF NOT EXISTS farmers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_code TEXT UNIQUE NOT NULL,
    name_mr TEXT NOT NULL,
    name_en TEXT,
    phone TEXT,
    village TEXT,
    bank_account_number TEXT,    -- Masked in UI views
    bank_ifsc TEXT,
    bank_name TEXT,
    upi_id TEXT,                 -- Masked in UI views
    default_milk_type TEXT NOT NULL DEFAULT 'COW' CHECK (default_milk_type IN ('COW', 'BUFFALO', 'BOTH')),
    opening_balance_paise INTEGER NOT NULL DEFAULT 0, -- (+) payable to farmer, (-) advance debt
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_farmers_member_code ON farmers(member_code);
CREATE INDEX IF NOT EXISTS idx_farmers_is_active ON farmers(is_active);

-- ============================================================================
-- 5. Rate Plans & Lifecycle Versioning
-- ============================================================================
CREATE TABLE IF NOT EXISTS rate_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_name TEXT NOT NULL,
    milk_type TEXT NOT NULL CHECK (milk_type IN ('COW', 'BUFFALO')),
    strategy_type TEXT NOT NULL DEFAULT 'FORMULA' CHECK (strategy_type = 'FORMULA'),
    pricing_basis TEXT NOT NULL DEFAULT 'PER_PERCENT_POINT_PER_LITRE' CHECK (pricing_basis = 'PER_PERCENT_POINT_PER_LITRE'),
    effective_from TEXT NOT NULL, -- Business date YYYY-MM-DD
    effective_to TEXT,           -- Business date YYYY-MM-DD (NULL = currently active)
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'CANCELLED')),
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
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_rate_plans_milk_type ON rate_plans(milk_type);
CREATE INDEX IF NOT EXISTS idx_rate_plans_status ON rate_plans(status);
CREATE INDEX IF NOT EXISTS idx_rate_plans_effective_dates ON rate_plans(effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_rate_plans_created_by ON rate_plans(created_by_user_id);

-- ============================================================================
-- 6. Rate Formula Parameters (Exact formula parameters per rate plan)
-- ============================================================================
CREATE TABLE IF NOT EXISTS rate_formula_parameters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rate_plan_id INTEGER UNIQUE NOT NULL REFERENCES rate_plans(id),
    fat_rate_paise_per_point INTEGER NOT NULL CHECK (fat_rate_paise_per_point > 0),
    snf_rate_paise_per_point INTEGER NOT NULL CHECK (snf_rate_paise_per_point > 0),
    minimum_fat_x100 INTEGER NOT NULL CHECK (minimum_fat_x100 > 0),
    maximum_fat_x100 INTEGER NOT NULL CHECK (maximum_fat_x100 >= minimum_fat_x100),
    fat_step_x100 INTEGER NOT NULL DEFAULT 10 CHECK (fat_step_x100 > 0),
    minimum_snf_x100 INTEGER NOT NULL CHECK (minimum_snf_x100 > 0),
    maximum_snf_x100 INTEGER NOT NULL CHECK (maximum_snf_x100 >= minimum_snf_x100),
    snf_step_x100 INTEGER NOT NULL DEFAULT 10 CHECK (snf_step_x100 > 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rate_params_plan_id ON rate_formula_parameters(rate_plan_id);

-- ============================================================================
-- 7. Shift Management Sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_date TEXT NOT NULL, -- YYYY-MM-DD
    shift_type TEXT NOT NULL CHECK (shift_type IN ('MORNING', 'EVENING')),
    opened_by_user_id INTEGER NOT NULL REFERENCES users(id),
    closed_by_user_id INTEGER REFERENCES users(id),
    opened_at TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'LOCKED')),
    notes TEXT,
    UNIQUE(business_date, shift_type)
);

CREATE INDEX IF NOT EXISTS idx_shifts_date_type ON shifts(business_date, shift_type);

-- ============================================================================
-- 8. Milk Collection Records (Immutable Transaction Snapshot)
-- ============================================================================
CREATE TABLE IF NOT EXISTS milk_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_number TEXT UNIQUE NOT NULL,
    shift_id INTEGER NOT NULL REFERENCES shifts(id),
    farmer_id INTEGER NOT NULL REFERENCES farmers(id),
    business_date TEXT NOT NULL,
    shift_type TEXT NOT NULL CHECK (shift_type IN ('MORNING', 'EVENING')),
    milk_type TEXT NOT NULL CHECK (milk_type IN ('COW', 'BUFFALO')),
    quantity_ml INTEGER NOT NULL CHECK (quantity_ml > 0),
    fat_x100 INTEGER NOT NULL CHECK (fat_x100 > 0),
    snf_x100 INTEGER NOT NULL CHECK (snf_x100 > 0),
    rate_plan_id INTEGER NOT NULL REFERENCES rate_plans(id),
    rate_applied_paise INTEGER NOT NULL CHECK (rate_applied_paise > 0),
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOIDED')),
    voided_at TEXT,
    voided_by_user_id INTEGER REFERENCES users(id),
    void_reason TEXT,
    created_by_user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_collections_farmer_date ON milk_collections(farmer_id, business_date);
CREATE INDEX IF NOT EXISTS idx_collections_shift_id ON milk_collections(shift_id);
CREATE INDEX IF NOT EXISTS idx_collections_status ON milk_collections(status);

-- ============================================================================
-- 9. Adjustments & Deductions
-- ============================================================================
CREATE TABLE IF NOT EXISTS adjustments_and_deductions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    farmer_id INTEGER NOT NULL REFERENCES farmers(id),
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('CATTLE_FEED', 'ADVANCE_LOAN', 'VETERINARY_EXPENSE', 'TRANSPORT_CHARGE', 'BONUS', 'MANUAL_ADJUSTMENT')),
    business_effect TEXT NOT NULL CHECK (business_effect IN ('INCREASE_PAYABLE', 'DECREASE_PAYABLE')),
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    business_date TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOIDED')),
    voided_at TEXT,
    voided_by_user_id INTEGER REFERENCES users(id),
    void_reason TEXT,
    created_by_user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_adjustments_farmer_date ON adjustments_and_deductions(farmer_id, business_date);
CREATE INDEX IF NOT EXISTS idx_adjustments_status ON adjustments_and_deductions(status);

-- ============================================================================
-- 10. Settlement Periods (Weekly Batch Master)
-- ============================================================================
CREATE TABLE IF NOT EXISTS settlement_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_start_date TEXT NOT NULL, -- YYYY-MM-DD
    period_end_date TEXT NOT NULL,   -- YYYY-MM-DD
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINALIZED', 'CANCELLED')),
    finalized_by_user_id INTEGER REFERENCES users(id),
    finalized_at TEXT,
    cancellation_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (period_start_date <= period_end_date)
);

CREATE INDEX IF NOT EXISTS idx_settlement_periods_dates ON settlement_periods(period_start_date, period_end_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_settlement_period_dates
ON settlement_periods(period_start_date, period_end_date)
WHERE status <> 'CANCELLED';

-- ============================================================================
-- 11. Weekly Farmer Settlements
-- ============================================================================
CREATE TABLE IF NOT EXISTS weekly_settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    settlement_period_id INTEGER NOT NULL REFERENCES settlement_periods(id),
    farmer_id INTEGER NOT NULL REFERENCES farmers(id),
    statement_number TEXT UNIQUE NOT NULL,
    opening_balance_snapshot_paise INTEGER NOT NULL DEFAULT 0,
    gross_milk_earnings_paise INTEGER NOT NULL DEFAULT 0,
    payable_increasing_adjustments_paise INTEGER NOT NULL DEFAULT 0,
    payable_decreasing_deductions_paise INTEGER NOT NULL DEFAULT 0,
    amount_due_paise INTEGER NOT NULL DEFAULT 0, -- Frozen at finalization
    payments_allocated_paise INTEGER NOT NULL DEFAULT 0, -- Cached sum of active allocations
    outstanding_amount_paise INTEGER NOT NULL DEFAULT 0, -- Cached (amount_due - payments_allocated)
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINALIZED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')),
    cancellation_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(settlement_period_id, farmer_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_settlements_farmer ON weekly_settlements(farmer_id);
CREATE INDEX IF NOT EXISTS idx_weekly_settlements_status ON weekly_settlements(status);

-- ============================================================================
-- 12. Settlement Items (Immutable Line-Item Snapshot with Release Lifecycle)
-- ============================================================================
CREATE TABLE IF NOT EXISTS settlement_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    settlement_id INTEGER NOT NULL REFERENCES weekly_settlements(id),
    source_type TEXT NOT NULL CHECK (source_type IN ('MILK_COLLECTION', 'ADJUSTMENT')),
    source_record_id INTEGER NOT NULL,
    business_date TEXT NOT NULL,
    description TEXT NOT NULL,
    quantity_ml INTEGER,
    fat_x100 INTEGER,
    snf_x100 INTEGER,
    rate_applied_paise INTEGER,
    signed_effect_paise INTEGER NOT NULL,
    allocation_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (allocation_status IN ('ACTIVE', 'RELEASED')),
    released_at TEXT,
    release_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_settlement_items_settlement ON settlement_items(settlement_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_settlement_source
ON settlement_items(source_type, source_record_id)
WHERE allocation_status = 'ACTIVE';

-- ============================================================================
-- 13. Payments (Disbursement Vouchers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_number TEXT UNIQUE NOT NULL,
    farmer_id INTEGER NOT NULL REFERENCES farmers(id),
    amount_paid_paise INTEGER NOT NULL CHECK (amount_paid_paise > 0),
    payment_date TEXT NOT NULL, -- YYYY-MM-DD
    payment_mode TEXT NOT NULL CHECK (payment_mode IN ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER')),
    reference_number TEXT,      -- UTR / Cheque # / UPI Ref
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOIDED')),
    voided_at TEXT,
    voided_by_user_id INTEGER REFERENCES users(id),
    void_reason TEXT,
    created_by_user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_farmer_date ON payments(farmer_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- ============================================================================
-- 14. Payment Allocations (Cross-Settlement Non-Destructive Linkage)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id INTEGER NOT NULL REFERENCES payments(id),
    settlement_id INTEGER NOT NULL REFERENCES weekly_settlements(id),
    allocated_amount_paise INTEGER NOT NULL CHECK (allocated_amount_paise > 0),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOIDED')),
    voided_at TEXT,
    voided_by_user_id INTEGER REFERENCES users(id),
    void_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_settlement ON payment_allocations(settlement_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_payment_allocation
ON payment_allocations(payment_id, settlement_id)
WHERE status = 'ACTIVE';

-- ============================================================================
-- 15. Append-Only Audit Trail
-- ============================================================================
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

-- ============================================================================
-- 16. Application Settings Key-Value Store
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- 17. Backup History & Verification Log
-- ============================================================================
CREATE TABLE IF NOT EXISTS backup_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    checksum_sha256 TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('MANUAL', 'AUTOMATIC_SHIFT_CLOSE', 'AUTOMATIC_SCHEDULED', 'APP_SHUTDOWN_BEST_EFFORT', 'PRE_RESTORE_SAFETY', 'PRE_MIGRATION')),
    verification_status TEXT NOT NULL CHECK (verification_status IN ('VERIFIED', 'FAILED')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 6. IPC Contract Architecture

All IPC operations follow a unified typed response envelope:

```typescript
export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    messageMr: string;
    messageEn: string;
    details?: unknown;
  };
}
```

### 6.1 Typed IPC Channel Interface

```typescript
export interface DairyApiBridge {
  // Auth & Profile
  auth: {
    login: (credentials: LoginRequest) => Promise<IpcResponse<UserSession>>;
    logout: () => Promise<IpcResponse<void>>;
    getDairyProfile: () => Promise<IpcResponse<DairyProfile>>;
    saveDairyProfile: (profile: SaveProfileRequest) => Promise<IpcResponse<DairyProfile>>;
  };

  // Farmers Directory
  farmers: {
    list: (filter?: FarmerFilter) => Promise<IpcResponse<FarmerDto[]>>;
    getById: (id: number) => Promise<IpcResponse<FarmerDto>>;
    getByCode: (code: string) => Promise<IpcResponse<FarmerDto>>;
    save: (farmer: SaveFarmerRequest) => Promise<IpcResponse<FarmerDto>>;
    deactivate: (id: number) => Promise<IpcResponse<void>>;
    getComputedLedger: (farmerId: number, dateRange?: DateRange) => Promise<IpcResponse<ComputedLedgerDto>>;
  };

  // Rate Plans & Lookup Engine
  ratePlans: {
    list: (milkType?: MilkType) => Promise<IpcResponse<RatePlanSummaryDto[]>>;
    getById: (id: number) => Promise<IpcResponse<RatePlanDetailDto>>;
    save: (plan: SaveRatePlanRequest) => Promise<IpcResponse<RatePlanDetailDto>>;
    lookupRate: (input: RateLookupInput) => Promise<IpcResponse<RateLookupResult>>;
  };

  // Shifts & Milk Collections
  shifts: {
    getCurrentShift: () => Promise<IpcResponse<ShiftDto | null>>;
    openShift: (req: OpenShiftRequest) => Promise<IpcResponse<ShiftDto>>;
    closeShift: (shiftId: number) => Promise<IpcResponse<ShiftSummaryDto>>;
    reopenShift: (req: ReopenShiftRequest) => Promise<IpcResponse<ShiftDto>>;
  };

  collections: {
    record: (entry: MilkCollectionEntryRequest) => Promise<IpcResponse<MilkCollectionDto>>;
    listForShift: (shiftId: number) => Promise<IpcResponse<MilkCollectionDto[]>>;
    voidCollection: (req: VoidCollectionRequest) => Promise<IpcResponse<void>>;
  };

  // Adjustments & Deductions
  adjustments: {
    record: (req: RecordAdjustmentRequest) => Promise<IpcResponse<AdjustmentDto>>;
    listForFarmer: (farmerId: number, dateRange?: DateRange) => Promise<IpcResponse<AdjustmentDto[]>>;
    voidAdjustment: (req: VoidAdjustmentRequest) => Promise<IpcResponse<void>>;
  };

  // Weekly Settlements & Payment Allocations
  settlements: {
    generateDrafts: (period: DateRange) => Promise<IpcResponse<SettlementPeriodSummaryDto>>;
    finalizeSettlementPeriod: (periodId: number) => Promise<IpcResponse<void>>;
    getFarmerSettlement: (settlementId: number) => Promise<IpcResponse<SettlementDetailDto>>;
    cancelFarmerSettlement: (settlementId: number, reason: string) => Promise<IpcResponse<void>>;
    cancelSettlementPeriod: (periodId: number, reason: string) => Promise<IpcResponse<void>>;
  };

  payments: {
    recordPayment: (payment: RecordPaymentRequest) => Promise<IpcResponse<PaymentDto>>;
    voidPayment: (req: VoidPaymentRequest) => Promise<IpcResponse<void>>;
    listForFarmer: (farmerId: number) => Promise<IpcResponse<PaymentDto[]>>;
  };

  // Reports & Printing
  reports: {
    getShiftReport: (shiftId: number) => Promise<IpcResponse<ShiftReportData>>;
    getDailyReport: (businessDate: string) => Promise<IpcResponse<DailyReportData>>;
    printWeeklyStatement: (settlementId: number) => Promise<IpcResponse<void>>;
    batchPrintWeeklyStatements: (periodId: number) => Promise<IpcResponse<void>>;
  };

  // Backup & Restore
  backup: {
    createBackup: (targetDirectory?: string) => Promise<IpcResponse<BackupResult>>;
    restoreBackup: (backupFilePath: string) => Promise<IpcResponse<RestoreResult>>;
    runIntegrityCheck: () => Promise<IpcResponse<IntegrityCheckResult>>;
  };
}
```

---

## 7. Backup & Safe Restore Architecture

### 7.1 Hot Backup Execution
Backups are executed asynchronously using SQLite's online backup API or `VACUUM INTO` command to ensure non-blocking writes:

```typescript
export async function performAtomicBackup(
  db: Database.Database,
  destinationPath: string
): Promise<BackupMetadata> {
  // 1. Asynchronously stream clean snapshot to destination file
  await db.backup(destinationPath);

  // 2. Open destination read-only for post-backup verification
  const verifyDb = new Database(destinationPath, { readonly: true });
  const check = verifyDb.pragma('integrity_check') as [{ integrity_check: string }];
  if (check[0]?.integrity_check !== 'ok') {
    verifyDb.close();
    throw new Error('Backup integrity verification failed');
  }
  verifyDb.close();

  // 3. Compute SHA-256 checksum and record in backup_history
  const checksum = await computeFileSha256(destinationPath);
  return { destinationPath, checksum };
}
```

### 7.2 Safe Restore Protocol
1. **Safety Quarantine:** Create an emergency safety backup of the active database (`dairy_data_pre_restore_YYYYMMDD_HHMMSS.db`).
2. **Candidate Verification:** Open candidate file in a temporary read-only connection; run `PRAGMA integrity_check;`; verify `schema_migrations` version compatibility.
3. **Connection Teardown:** Close active SQLite database connections and handle WAL/SHM companion files cleanly.
4. **Atomic Replacement:** Replace the active database file using temporary staging and atomic rename where supported.
5. **Reconnection & Health Check:** Reopen database and verify table integrity. Automatically rollback to the safety backup if initialization fails under standard operating conditions.

---

## 8. Build-Tool & Native Module Strategy

- **Renderer Build:** Built using standard Angular CLI (`ng build`).
- **Main / Preload Build:** Build tooling pinned during the Stage 1 compatibility spike.
- **Native Module Compilation:** `better-sqlite3` compiled against the target Electron ABI version via native module rebuild scripts.
- **Smoke Test Requirement:** Development, production build, and packaged installer binaries must all pass the SQLite IPC smoke test before exiting Stage 1.

---

## 9. Proposed Project Directory Structure

```
dairy-management-system/
├── AGENTS.md                          # Permanent AI coding agent governance
├── README.md                          # Project overview & roadmap tracker
├── electron-builder.yml               # Windows NSIS packaging configuration
├── docs/
│   ├── PRD.md                         # Product requirements document v2.0
│   ├── SYSTEM_DESIGN.md               # System architecture & DB schema v2.0
│   ├── ROADMAP.md                     # Stage-by-stage implementation plan
│   ├── DECISIONS.md                   # Architectural Decision Records (ADRs)
│   ├── OPEN_QUESTIONS.md              # Catalog of unresolved business items
│   └── reference/                     # Read-only original reference specs
├── electron/                          # Electron Main & Preload source
│   ├── main.ts                        # Main process entry point
│   ├── preload.ts                     # Secure typed IPC bridge
│   ├── core/
│   │   ├── config.ts                  # App configuration & paths
│   │   ├── security.ts                # Session authority, scrypt & timingSafeEqual
│   │   └── csp.ts                     # Content Security Policy definition
│   ├── db/
│   │   ├── connection.ts              # better-sqlite3 connection manager (WAL + synchronous=FULL)
│   │   ├── migrator.ts                # Incremental migration engine
│   │   ├── migrations/                # Versioned SQL migrations (001_foundation.sql, etc.)
│   │   └── repositories/              # farmer.repo.ts, collection.repo.ts, settlement.repo.ts, etc.
│   ├── services/
│   │   ├── calculation.service.ts     # Pricing engine (Owner-Approved Strategy)
│   │   ├── settlement.service.ts      # Weekly settlement generator & payment allocator
│   │   ├── ledger.service.ts          # Computed ledger projector
│   │   ├── backup.service.ts          # Awaited backup & safe restore manager
│   │   ├── pdf-printer.service.ts     # A4 PDF generator with bundled Devanagari fonts
│   │   └── audit.service.ts           # Append-only audit logger (Stage 3)
│   └── ipc/
│       ├── handlers.ts                # ipcMain.handle registrations
│       └── validation.ts              # Payload validation & session check layer
├── src/                               # Angular 22 Frontend Application
│   ├── index.html                     # Root HTML with CSP
│   ├── main.ts                        # Standalone bootstrap
│   ├── styles.scss                    # Global theme & typography tokens
│   ├── app/
│   │   ├── app.config.ts              # Providers & routes
│   │   ├── app.component.ts           # Root layout shell
│   │   ├── core/
│   │   │   ├── services/              # electron-bridge.service.ts, i18n.service.ts
│   │   │   └── guards/                # auth.guard.ts, setup.guard.ts (UX helpers only)
│   │   ├── features/
│   │   │   ├── setup/                 # First-run dairy setup wizard
│   │   │   ├── auth/                  # Local login & quick PIN modal
│   │   │   ├── dashboard/             # Main KPI dashboard
│   │   │   ├── farmers/               # Farmer directory & opening balances
│   │   │   ├── rate-plans/            # Rate chart configuration & strategy view
│   │   │   ├── collection/            # Fast milk collection screen
│   │   │   ├── shift/                 # Shift open/close HUD
│   │   │   ├── settlements/           # Weekly settlement batches & statements
│   │   │   ├── payments/              # Payment disbursement vouchers & allocations
│   │   │   ├── ledger/                # Computed farmer ledger statement
│   │   │   ├── adjustments/           # Deductions & bonuses entry
│   │   │   ├── reports/               # Shift registers & daily reports
│   │   │   ├── backup/                # Backup & restore UI
│   │   │   └── settings/              # Settings & printer preferences
│   │   └── shared/
│   │       ├── components/            # Summary cards, confirmation dialogs, void modals
│   │       ├── pipes/                 # Rupee currency pipe, Marathi date pipe
│   │       └── directives/            # Auto-focus, numeric-only keyboard nav
│   └── assets/
│       ├── fonts/                     # Bundled NotoSansDevanagari .ttf files
│       └── i18n/
│           ├── mr.json                # Marathi translation dictionary
│           └── en.json                # English translation dictionary
└── tests/                             # Test suites
    ├── unit/                          # Calculation, precision & ledger projection tests
    ├── db/                            # SQLite repository, migration & void tests
    ├── ipc/                           # Preload & IPC contract tests
    └── e2e/                           # UI workflow tests
```
