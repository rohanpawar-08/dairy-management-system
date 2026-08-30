# Implementation Roadmap & Pilot Plan
## Dairy Management System — Offline Desktop Application
### (डेअरी व्यवस्थापन प्रणाली — टप्पा-निहाय विकास आराखडा)

---

## 🗺️ Execution Overview

This roadmap defines the stage-by-stage engineering plan from **Stage 0 (Governance)** through **Commercial Version 1.0** and the **30-Day Real Dairy Pilot**.

Each stage represents an **independently testable milestone**. Development proceeds strictly sequentially: all entry requirements, deliverables, and automated tests for a stage must pass before the next stage begins.

---

## 📅 Stage-by-Stage Implementation Plan

### Stage 0: Documentation & Project Governance *(COMPLETED)*
- **Objective:** Establish comprehensive product requirements, system design, 17-table schema, precision rules, and governance policies before writing code.
- **Entry Requirements:** Access to project workspace and original reference materials.
- **Deliverables:**
  - [README.md](../README.md)
  - [AGENTS.md](../AGENTS.md)
  - [PRD.md](PRD.md)
  - [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md)
  - [ROADMAP.md](ROADMAP.md)
  - [DECISIONS.md](DECISIONS.md)
  - [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)
- **Exit Criteria:** All 7 governance documents complete, mutually consistent, validated, and approved.

---

### Stage 1: Project Scaffolding, Secure Shell & Native IPC Smoke Test *(COMPLETED)*
- **Objective:** Scaffold Angular 22 standalone application, Electron desktop shell, secure preload bridge, and perform native module compilation and IPC smoke testing with `better-sqlite3` across dev, build, and packaged paths.
- **Entry Requirements:** Stage 0 completed.
- **Deliverables:**
  - [x] Angular 22 workspace with standalone component architecture and Angular Material 3.
  - [x] Electron main process and preload bridge configuration (`contextIsolation: true`, `nodeIntegration: false`, sandboxed).
  - [x] TypeScript interfaces for IPC bridge (`window.dairyApi`).
  - [x] Native prebuilt integration of `better-sqlite3` against target Electron runtime.
  - [x] Automated IPC smoke test (`npm run test:ipc-smoke`) and early packaged installer smoke test (`npm run build:smoke-pack`).
- **Verification Commands (Post-Scaffolding):**
  - `npm run test` (All 10 unit tests pass across Angular and backend).
  - `npm run test:ipc-smoke` (Verifies bidirectional IPC ping-pong and in-memory native SQLite query in Electron runtime).
  - `npm run build:smoke-pack` (Verifies packaged executable launches and executes native SQLite module).
- **Exit Criteria:** Clean Electron window launches; Angular renders; bidirectional IPC round-trip passes; `better-sqlite3` executes without ABI mismatch in dev and packaged runtimes (All criteria PASSED).

---

### Stage 2: Database Layer, Incremental Migrations Engine & Basic Verified Backup *(COMPLETED)*
- **Objective:** Implement SQLite database connection lifecycle (WAL mode, `PRAGMA synchronous = FULL`, foreign keys enabled), transactional incremental migration runner, initial foundation migration, and basic verified async backup utility.
- **Entry Requirements:** Stage 1 verified.
- **Deliverables:**
  - [x] `electron/db/connection.ts` (`PRAGMA foreign_keys = ON;`, `PRAGMA journal_mode = WAL;`, `PRAGMA synchronous = FULL;`, pragma verification).
  - [x] `electron/db/migrator.ts` (Incremental migration runner with `schema_migrations` tracking and atomic transactions).
  - [x] Migration `001_foundation.sql` creating: `schema_migrations`, `dairy_profile`, `users`, `audit_logs`, `app_settings`, `backup_history`, `idx_audit_created`.
  - [x] Basic async backup utility executing `better-sqlite3` `db.backup()`, running `PRAGMA integrity_check;`, `PRAGMA foreign_key_check;`, streaming SHA-256 checksums, and `backup_history` logging.
  - [x] Automated database and backup integration test suites (`test:db`, `test:backup-basic`).
- **Verification Commands:**
  - `npm run test:db` (All 9 tests pass: executes Migration 001, verifies WAL/FULL/FK pragmas, checks constraints, test DB isolation).
  - `npm run test:backup-basic` (All 2 tests pass: creates live async backup, verifies read-only integrity, foreign keys, schema version, SHA-256, cleanup).
  - `npm run test` (All 15 unit and integration tests pass).
  - `npm run test:ipc-smoke` (Verifies IPC roundtrip and migration smoke execution in Electron runtime).
  - `npm run build:smoke-pack` (Verifies packaged executable locates migrations and runs smoke test).
- **Exit Criteria:** Foundation tables initialize cleanly; migration runner tracks version; basic backup passes integrity check; integration tests pass (All criteria PASSED).

---

### Stage 3: Core Settings, Local Authentication & Base AuditService *(COMPLETED)*
- **Objective:** Implement First-Run setup wizard, local user authentication (`scrypt` salt-and-hash and memory session authority), base `AuditService`, and offline bilingual i18n translation service.
- **Entry Requirements:** Stage 2 verified.
- **Deliverables:**
  - [x] First-Run setup wizard (`/setup`) for dairy profile initialization and atomic setup transaction.
  - [x] Local authentication service with `crypto.scrypt` password and `pin_hash` verification, `timingSafeEqual`, and main-process session authority bound to `webContents.id`.
  - [x] Base `AuditService` in main process recording authentication events (setup, login, logout, failed logins, and rate-limiting) to `audit_logs` with secret redaction.
  - [x] Offline bilingual translation service (`public/assets/i18n/mr.json`, `public/assets/i18n/en.json`) with Marathi default and 100% key parity.
  - [x] Singleton `dairy_profile` repository and IPC handlers (`setup:get-status`, `setup:complete`, `auth:login`, `auth:logout`, `auth:get-session`, `profile:get`).
- **Verification Commands:**
  - `npm run test:auth` (All 16 tests pass: verifies credential hashing, salts, policies, timing-safe equality, setup atomic transactions, role access, and rate limiting).
  - `npm run test:audit-base` (All 7 tests pass: verifies append-only audit trail creation, secret redaction, and session abort on audit write failure).
  - `npm run test` (All 62 tests pass across 15 test files: 22 Angular specs + 40 backend integration/unit specs).
  - `npm run build:smoke-pack` (Verifies packaged executable launches, runs migration checks, and verifies setup/auth logic).
- **Exit Criteria:** First-run wizard populates `dairy_profile`; Owner/Operator logins work; Marathi UI toggles instantly to English; session authority and audit logging active (All criteria PASSED).

---

### Stage 4: Farmer / Member Management & Opening Balances *(COMPLETED)*
- **Objective:** Deliver complete member directory with fast search, masked bank/UPI metadata, opening ledger balances, and soft deactivation.
- **Entry Requirements:** Stage 3 verified.
- **Deliverables:**
  - [x] Migration `002_farmers.sql` creating `farmers` table with unique case-insensitive `member_code COLLATE NOCASE`, indexes, and soft-deactivation flags (`is_active`).
  - [x] Auto-generated and verified `PRE_MIGRATION` backup execution prior to running Migration 002 on initialized databases.
  - [x] `FarmerRepository` with parameterized SQL queries, literal wildcard escaping (`%`, `_`, `\`), dynamic financial activity detection, and soft delete (`is_active = 0`).
  - [x] `FarmerService` with authoritative main-process validation, Owner RBAC enforcement, PII masking (`maskBankAccount`, `maskUpiId`), and atomic audit logging (`FARMER_CREATED`, `FARMER_UPDATED`, `FARMER_DEACTIVATED`, `FARMER_REACTIVATED`).
  - [x] Exact integer paise conversion utilities (`parseRupeesToPaise`, `formatPaiseAsRupees`) with zero floating-point accumulation.
  - [x] Farmer directory UI (`/farmers`) with fast search, active/inactive/milk-type filters, Add/Edit dialog, soft-deactivate confirmation, and Marathi/English bilingual parity.
  - [x] Opening balance lock rule: editing opening balance is strictly prohibited inside the update transaction once financial transactions exist.
- **Verification Commands:**
  - `npm run test:farmers` (All 26 unit and integration tests pass across money parsing, PII masking, Migration 002, PRE_MIGRATION backups, repository, service, and RBAC).
  - `npm run test` (All 115 tests pass across 24 test suites: 41 Angular specs + 74 backend integration/unit specs).
  - `npm run test:ipc-smoke` (Verifies bidirectional IPC, SQLite migrations, Stage 3 auth, and Stage 4 farmer lifecycle in isolated runtime).
  - `npm run build:smoke-pack` (Verifies packaged executable launches and executes full Stage 1–4 verification sequence).
- **Exit Criteria:** Farmers can be created, searched, edited, and soft-deactivated; hard deletes are blocked; opening balance lock verified; all automated and packaged smoke tests pass (All criteria PASSED).

---

### Stage 5: Owner-Controlled Cow/Buffalo FAT-SNF Formula Rate Plans *(COMPLETED)*
- **Objective:** Build the core pricing engine supporting Cow and Buffalo milk executing confirmed `FORMULA` strategy (`PER_PERCENT_POINT_PER_LITRE`) with strict quality bounds and zero rate fabrication.
- **Entry Requirements (MANDATORY GATE):** Completed. Confirmed `FORMULA` strategy with `ROUND_HALF_UP` integer rounding, zero seed plans, and separate Cow / Buffalo plans.
- **Deliverables:**
  - [x] Migration `003_rate_plans.sql` creating `rate_plans` and `rate_formula_parameters` tables with SQLite triggers preventing date overlaps for approved plans.
  - [x] `CalculationEngine` executing confirmed formula (`ratePaisePerLitre = ROUND_HALF_UP((fat_x100 * fatRate + snf_x100 * snfRate) / 100)` and `amountPaise = ROUND_HALF_UP(qtyMl * rate / 1000)`) with strict FAT/SNF bounds and step alignment.
  - [x] Integer/BigInt paise arithmetic in `shared/money.ts` (`parsePercentToX100`, `formatX100AsPercent`, `parseLitresToMl`, `formatMlAsLitres`, `calculateRatePaisePerLitre`, `calculateCollectionAmountPaise`).
  - [x] `RatePlanRepository` and `RatePlanService` with Owner RBAC enforcement, atomic audit logging (`RATE_PLAN_CREATED`, `RATE_PLAN_UPDATED`, `RATE_PLAN_CLONED`, `RATE_PLAN_APPROVED`, `RATE_PLAN_SUPERSEDED`, `RATE_PLAN_CANCELLED`), and public `resolveApprovedRate` for collection entry.
  - [x] Owner-only Rate Plans Angular UI (`/rate-plans`) with summary cards, live calculation preview badge, draft creation/edit/clone dialogs, approval/supersede workflow, cancellation, and bilingual Marathi/English parity.
  - [x] Dedicated test runner `npm run test:rates` covering calculation engine, repository, service, RBAC, Angular state, and guards.
- **Verification Commands:**
  - `npm run test:rates` (All 33 unit and integration tests pass across Angular and backend).
  - `npm run test` (All 155 tests pass across 29 test suites: 49 Angular specs + 106 backend integration/unit specs).
  - `npm run test:ipc-smoke` (Verifies bidirectional IPC, SQLite migrations 001-003, Stage 3 auth, Stage 4 farmers, and Stage 5 rate plan calculations).
  - `npm run build:smoke-pack` (Verifies packaged executable launches and executes complete Stage 1–5 verification sequence).
- **Exit Criteria:** Zero seed rate plans on install; calculation engine computes exact paise matching pilot cases (Cow ₹59.50/L and Buffalo ₹90.00/L); unconfigured rates reject transactions with bilingual domain error; zero float drift (All criteria PASSED).

---

### Stage 6: Morning/Evening Shift Management & Fast Milk Collection Entry *(COMPLETED)*
- **Objective:** Implement formal shift sessions and the high-speed (<15s) keyboard-driven milk collection entry screen with duplicate delivery warnings, collision-safe receipt numbering, and immutable snapshots.
- **Entry Requirements:** Stage 5 verified.
- **Deliverables:**
  - [x] Migration `004_shifts_and_collections.sql` creating `shifts` and `milk_collections` tables with partial unique index for single OPEN shift and deletion-prevention triggers.
  - [x] Auto-generated and verified `PRE_MIGRATION` backup execution prior to running Migration 004 on initialized databases.
  - [x] Shift management UI and backend services (Open Shift, Active HUD, Close Shift with `LOCKED` state, Owner-authorized reopen with mandatory reason).
  - [x] Transactional, collision-safe monotonic receipt numbering service for milk collections (`MC-YYYYMMDD-M-000001` / `MC-YYYYMMDD-E-000001`).
  - [x] Fast Milk Collection Screen (`/collection`):
    * Auto-focus keyboard workflow: Member Code $\rightarrow$ Quantity $\rightarrow$ FAT $\rightarrow$ SNF $\rightarrow$ Save $\rightarrow$ Auto-refocus.
    * Live calculation badge preview (Rate and Total ₹) updating reactively.
    * Duplicate delivery warning dialog with explicit operator confirmation and audit logging (`SECOND_CAN`, `RETEST`, `CORRECTION`, `OTHER`).
    * Immutable snapshot recording (`rate_plan_id`, `rate_applied_paise`, `amount_paise`).
  - [x] Non-destructive `voidCollection` operation with mandatory audit reason restricted to Owner role.
  - [x] Dedicated test runner `npm run test:collection` covering shift lifecycle, receipt sequence, duplicate detection, immutable snapshots, and voiding.
- **Verification Commands:**
  - `npm run test:collection` (All 32 unit and integration tests pass: 11 Angular specs + 21 backend integration/unit specs).
  - `npm run test` (All 208 tests pass across 44 test suites: 72 Angular specs + 136 backend integration/unit specs).
  - `npm run test:ipc-smoke` (Verifies bidirectional IPC, SQLite migrations 001-004, Stage 3 auth, Stage 4 farmers, Stage 5 rates, and Stage 6 shift & collection lifecycle in isolated runtime).
  - `npm run build:smoke-pack` (Verifies packaged executable launches and executes complete Stage 1–6 verification sequence).
- **Exit Criteria:** Collection entry executed in $< 15$ seconds via keyboard; duplicate warning alerts operator; records store exact rate snapshots; voiding updates status non-destructively (All criteria PASSED).

---

### Stage 7: Adjustments, Deductions, Advances & Computed Farmer Ledger *(COMPLETED)*
- **Objective:** Implement non-milk financial adjustments (`ADVANCE`, `DEDUCTION`, `CREDIT`), daily reference sequence `ADJ-YYYYMMDD-000001`, and the real-time computed farmer ledger projection.
- **Entry Requirements:** Stage 6 verified.
- **Deliverables:**
  - [x] Migration `005_adjustments_and_ledger.sql` creating `adjustments_and_deductions` table with 5 indexes and 2 integrity triggers (`trg_adj_prevent_delete`, `trg_adj_prevent_update`).
  - [x] Reference numbering service (`AdjustmentNumberService`) generating atomic `ADJ-YYYYMMDD-000001` sequence (rollback does not consume counter).
  - [x] Backend repositories (`AdjustmentRepository`, `LedgerRepository`) and services (`AdjustmentService`, `LedgerService`) supporting Owner RBAC, integer paise arithmetic, and non-destructive voiding.
  - [x] Audit trail integration recording `FARMER_ADJUSTMENT_CREATED` and `FARMER_ADJUSTMENT_VOIDED` events.
  - [x] Farmer Ledger UI (`/ledger`) with real-time KPI summary cards, transaction history table, date range filters, and Owner adjustment entry / voiding dialogs.
  - [x] Dedicated test runner `npm run test:ledger` covering integer balance calculations, brought-forward balances, inactive farmer ledger access, RBAC enforcement, and trigger immutability.
- **Verification Commands:**
  - `npm run test:ledger` (All 22 unit and integration tests pass: 6 Angular specs + 16 backend Vitest specs).
  - `npm run test` (All 254 tests pass across 50 test files: 97 Angular specs + 157 backend integration/unit specs).
  - `npm run test:ipc-smoke` (Verifies Stage 1–7 IPC channels, SQLite migration 005, and ledger calculation in isolated Electron runtime).
  - `npm run build:smoke-pack` (Verifies packaged executable launches and executes complete Stage 1–7 verification sequence).
- **Exit Criteria:** Adjustments record with explicit financial categories; computed ledger balances match exact mathematical sum of source records down to integer paise (All criteria PASSED).

---

### Stage 8: Weekly Settlement Batches & Payment Allocations *(NEXT ACTIVE STAGE)*
- **Objective:** Automate weekly settlement period generation, frozen amount due calculation, non-destructive payment allocations, and collision-safe voucher/statement numbering.
- **Entry Requirements:** Stage 7 verified.
- **Deliverables:**
  - Migration `006_settlements_and_payments.sql` creating: `settlement_periods`, `weekly_settlements`, `settlement_items`, `payments`, `payment_allocations`.
  - Transactional numbering strategy for payment vouchers and settlement statements (`statement_number`).
  - `SettlementService` managing period lifecycle:
    * Single row transition `DRAFT` $\rightarrow$ `FINALIZED`;
    * Immutable snapshot line items in `settlement_items`;
    * `cancelSettlementPeriod` & `cancelFarmerSettlement` transitioning item status to `'RELEASED'` to allow fresh inclusion without loss of history.
  - `PaymentService` recording payments and creating `payment_allocations` across finalized settlements (`status`: `ACTIVE`/`VOIDED`).
  - Invariant reconciliation tests:
    * Rebuilding cached `payments_allocated_paise` and `outstanding_amount_paise` from active allocations and detecting/repairing drift;
    * Confirming a cancelled period can be regenerated without losing historical snapshot items;
    * Preventing double-counting of milk;
    * Preventing allocation exceeding payment amount or positive settlement outstanding balance;
    * Preventing voiding of finalized collections until linked settlement is released.
- **Verification Commands:**
  - `npm run test:settlements` (Tests batch generation, item snapshotting, payment allocations, cached-total reconciliation, and release on cancellation).
- **Exit Criteria:** Settlements freeze amount due; payment allocations reduce outstanding balances correctly; non-destructive cancellations verified; all integrity and reconciliation tests pass.

---

### Stage 9: Reports, Dashboard & A4 PDF Printing
- **Objective:** Deliver shift registers, daily summaries, dashboard KPIs, and A4 printable statements with bundled Devanagari fonts.
- **Entry Requirements:** Stage 8 verified.
- **Deliverables:**
  - Shift Collection Register and Daily Comparative Report.
  - Executive Dashboard summary cards (Litres, Earnings, Pending Balances, Active Farmers).
  - `PdfPrinterService` using `pdfmake` with bundled `NotoSansDevanagari` TrueType fonts.
  - A4 Weekly Farmer Statement template displaying daily deliveries, itemized deductions, frozen amount due, payments, and outstanding balances.
- **Verification Commands:**
  - `npm run test:pdf` (Generates sample PDF and validates Devanagari glyph rendering and layout coordinates).
- **Exit Criteria:** Shift reports aggregate accurately; A4 PDFs render crisp Marathi text without font clipping; prints cleanly on standard Windows printers.

---

### Stage 10: Full Backup & Restore Management UI
- **Objective:** Implement full backup/restore UI, USB drive detection, retention management, pre-restore safety snapshots, and disaster recovery verification extending the existing `BackupService`.
- **Entry Requirements:** Stage 9 verified.
- **Deliverables:**
  - Full Backup & Restore UI with manual backup triggering, USB drive selection, and history log.
  - Automated pre-restore safety snapshot and candidate database verification before restore.
  - Atomic file replacement and rollback on reconnection failure.
- **Verification Commands:**
  - `npm run test:backup-restore` (Tests full backup creation, corrupted backup rejection, and rollback safety).
- **Exit Criteria:** Hot backups execute cleanly; corrupted backup files are safely rejected without damaging active data; restore rollback drill verified.

---

### Stage 11: End-to-End System Hardening, Audit Verification & Packaging
- **Objective:** Finalize audit coverage verification across all modules, execute comprehensive E2E test suites, and produce production Windows installer.
- **Entry Requirements:** Stage 10 verified.
- **Deliverables:**
  - Audit trail coverage hardening and audit log verification suite.
  - End-to-end integration test suite covering full dairy lifecycle.
  - `electron-builder` configuration for Windows NSIS installer (`.exe`) and portable binary.
  - Installer smoke tests on clean Windows 10 and 11 offline environments.
- **Verification Commands:**
  - `npm run test:e2e` (Executes automated end-to-end collection, settlement, and backup workflows).
  - `npm run dist:win` (Generates production `.exe` installer).
- **Exit Criteria:** Full test suite passes (0 failures); installer installs and launches cleanly on Windows 10/11 offline; audit trail captures all sensitive events.

---

### Stage 12: 30-Day Real Dairy Pilot Deployment & Production Rollout
- **Objective:** Deploy in a live pilot environment at a partner milk collection centre in Maharashtra.
- **Entry Requirements:** Stage 11 verified and packaged installer signed off.
- **Deliverables:**
  - Live deployment on pilot counter PC.
  - Week 1–2 parallel run with daily ledger reconciliation (target: 0 paise discrepancy).
  - Operator speed benchmark testing (<15 seconds per farmer).
  - Final written sign-off from dairy owner and operator for Version 1.0 commercial release.

---

## 🧪 30-Day Pilot Milestones

1. **Days 1–3 (Setup & Baseline):** Install application on pilot Windows PC, configure confirmed Cow/Buffalo rate plans, register active farmers with opening balances, train staff.
2. **Days 4–10 (Week 1 Parallel Run):** Record in both paper register and software; reconcile daily shift totals and Week 1 Settlement (target: 0 paise discrepancy).
3. **Days 11–17 (Week 2 Parallel Run & Deductions):** Record cattle-feed deductions, advances, and payments; print A4 Weekly Statements for all pilot farmers; gather feedback.
4. **Days 18–24 (Live Primary Operation):** Software becomes primary recording tool; benchmark 50 consecutive entries (<15s target).
5. **Days 25–30 (Resilience Testing & Final Review):** Perform USB restore drill, review audit trail, secure written sign-off.
