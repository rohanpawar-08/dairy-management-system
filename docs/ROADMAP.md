# Implementation Roadmap & Pilot Plan
## Dairy Management System — Offline Desktop Application
### (डेअरी व्यवस्थापन प्रणाली — टप्पा-निहाय विकास आराखडा)

---

## 🗺️ Execution Overview

This roadmap defines the stage-by-stage engineering plan from **Stage 0 (Governance)** through **Commercial Version 1.0** and the **30-Day Real Dairy Pilot**.

Each stage represents an **independently testable milestone**. Development proceeds strictly sequentially: all entry requirements, deliverables, and automated tests for a stage must pass before the next stage begins.

---

## 📅 Stage-by-Stage Implementation Plan

### Stage 0: Documentation & Project Governance *(CURRENT)*
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

### Stage 1: Project Scaffolding, Secure Shell & Native IPC Smoke Test
- **Objective:** Scaffold Angular 22 standalone application, Electron desktop shell, secure preload bridge, and perform native module compilation and IPC smoke testing with `better-sqlite3` across dev, build, and packaged paths.
- **Entry Requirements:** Stage 0 completed.
- **Deliverables:**
  - Angular 22 workspace with standalone component architecture and Angular Material 3.
  - Electron main process and preload bridge configuration (`contextIsolation: true`, `nodeIntegration: false`, sandboxed).
  - TypeScript interfaces for IPC bridge (`window.dairyApi`).
  - Native module rebuild of `better-sqlite3` against target Electron runtime.
  - Early packaged installer smoke test configuration.
- **Verification Commands (Post-Scaffolding):**
  - `npm run test:ipc-smoke` (Verifies bidirectional IPC ping-pong and in-memory native SQLite query).
  - `npm run build:smoke-pack` (Verifies packaged executable launches and loads native SQLite module).
- **Exit Criteria:** Clean Electron window launches; Angular renders; bidirectional IPC round-trip passes; `better-sqlite3` executes without ABI mismatch in dev and packaged runtimes.

---

### Stage 2: Database Layer, Incremental Migrations Engine & Basic Verified Backup
- **Objective:** Implement SQLite database connection lifecycle (WAL mode, `PRAGMA synchronous = FULL`, foreign keys enabled), transactional incremental migration runner, initial foundation migration, and basic verified async backup utility.
- **Entry Requirements:** Stage 1 verified.
- **Deliverables:**
  - `electron/db/connection.ts` (`PRAGMA foreign_keys = ON;`, `PRAGMA journal_mode = WAL;`, `PRAGMA synchronous = FULL;`).
  - `electron/db/migrator.ts` (Incremental migration runner with `schema_migrations` tracking).
  - Migration `001_foundation.sql` creating: `schema_migrations`, `dairy_profile`, `users`, `audit_logs`, `app_settings`, `backup_history`.
  - Basic async backup utility executing `better-sqlite3` backup / `VACUUM INTO`, running `PRAGMA integrity_check;`, and computing SHA-256 checksums.
  - Automated database integration test suite.
- **Verification Commands:**
  - `npm run test:db` (Executes Migration 001, tests foreign keys, verifies WAL configuration).
  - `npm run test:backup-basic` (Creates backup, verifies read-only integrity check and checksum generation).
- **Exit Criteria:** Foundation tables initialize cleanly; migration runner tracks version; basic backup passes integrity check; integration tests pass.

---

### Stage 3: Core Settings, Local Authentication & Base AuditService
- **Objective:** Implement First-Run setup wizard, local user authentication (`scrypt` salt-and-hash and memory session authority), base `AuditService`, and offline bilingual i18n translation service.
- **Entry Requirements:** Stage 2 verified.
- **Deliverables:**
  - First-Run setup wizard (`/setup`) for dairy profile initialization.
  - Local authentication service with `crypto.scrypt` password and `pin_hash` verification, `timingSafeEqual`, and main-process session checks.
  - Base `AuditService` in main process recording authentication events (login, logout, failed logins with local rate-limiting) to `audit_logs`.
  - Offline JSON translation service (`assets/i18n/mr.json`, `assets/i18n/en.json`) with Marathi default.
  - Singleton `dairy_profile` repository and IPC handlers.
- **Verification Commands:**
  - `npm run test:auth` (Verifies credential hashing, session states, and role access restrictions in main process).
  - `npm run test:audit-base` (Verifies audit trail creation for auth events).
- **Exit Criteria:** First-run wizard populates `dairy_profile`; Owner/Operator logins work; Marathi UI toggles instantly to English; session authority and audit logging active.

---

### Stage 4: Farmer / Member Management & Opening Balances
- **Objective:** Deliver complete member directory with fast search, masked bank/UPI metadata, opening ledger balances, and soft deactivation.
- **Entry Requirements:** Stage 3 verified.
- **Deliverables:**
  - Migration `002_farmers.sql` creating `farmers` table and indexes.
  - `FarmerRepository` (Parameterized SQL queries, unique `member_code` enforcement, soft delete `is_active = 0`).
  - Farmer list view with search by Code, Name (Marathi/English), and Mobile.
  - Farmer Add/Edit modal with opening balance entry (`positive = payable`, `negative = debt`).
  - Protection rule: opening balance is immutable after transactions exist; audit event logged on creation/updates.
- **Verification Commands:**
  - `npm run test:farmers` (Tests uniqueness of member codes, soft deactivation, and balance persistence).
- **Exit Criteria:** Farmers can be created, searched, edited, and soft-deactivated; hard deletes are blocked; opening balance lock verified; unit and UI tests pass.

---

### Stage 5: Rate Plan Engine & Confirmed Pricing Strategy
- **Objective:** Build the core pricing engine supporting Cow and Buffalo milk executing the owner-approved pricing strategy with strict validation and zero rate fabrication.
- **Entry Requirements (MANDATORY GATE):**
  1. Actual Cow Rate Chart received from pilot dairy.
  2. Actual Buffalo Rate Chart received from pilot dairy.
  3. Confirmed pricing method (Exact Matrix, Step Bands, or Formula).
  4. Confirmed FAT/SNF precision rules.
  5. Confirmed rounding method (provisional `ROUND_HALF_UP` verified against real calculations).
  6. Verified manual calculation examples for test assertions.
- **Deliverables:**
  - Migration `003_rate_plans.sql` creating `rate_plans` and `rate_chart_entries` matching confirmed strategy with non-overlapping period constraints.
  - `CalculationEngine` executing confirmed strategy with strict rejection of unconfigured rates.
  - Integer paise rate arithmetic with zero floating-point accumulation.
  - Rate Plan management UI (versioning, effective dates, grid entry, and CSV import).
  - Audit logging for rate plan creation and activations.
- **Verification Commands:**
  - `npm run test:calculation` (Validates exact calculations against pilot test cases, out-of-bound rejections, and integer rounding).
- **Exit Criteria:** Calculation engine computes amounts matching real dairy examples with 100% precision; unconfigured rates reject transactions with bilingual error; zero float drift.

---

### Stage 6: Morning/Evening Shift Management & Fast Milk Collection Entry
- **Objective:** Implement formal shift sessions and the high-speed (<15s) keyboard-driven milk collection entry screen with duplicate delivery warnings, collision-safe receipt numbering, and immutable snapshots.
- **Entry Requirements:** Stage 5 verified.
- **Deliverables:**
  - Migration `004_shifts_and_collections.sql` creating `shifts` and `milk_collections` tables.
  - Shift management UI (Open Shift, Active HUD, Close Shift with `LOCKED` state, Owner-authorized reopen).
  - Transactional, collision-safe receipt numbering service for milk collections.
  - Fast Milk Collection Screen:
    * Auto-focus tab indexing: Member Code $\rightarrow$ Quantity $\rightarrow$ FAT $\rightarrow$ SNF $\rightarrow$ Save.
    * Live calculation badge preview (Rate and Total ₹).
    * Duplicate delivery warning dialog with explicit operator confirmation and audit logging.
    * Immutable snapshot recording (`rate_plan_id`, `rate_applied_paise`, `amount_paise`).
  - Non-destructive `voidCollection` operation with mandatory audit reason (locked against voiding if linked to active finalized settlement).
- **Verification Commands:**
  - `npm run test:collection` (Tests rapid entry sequencing, duplicate warnings, immutable snapshots, and non-destructive voiding).
- **Exit Criteria:** Collection entry executed in $< 15$ seconds via keyboard; duplicate warning alerts operator; records store exact rate snapshots; voiding updates status non-destructively.

---

### Stage 7: Adjustments, Deductions & Computed Farmer Ledger
- **Objective:** Implement non-milk adjustments (`INCREASE_PAYABLE` / `DECREASE_PAYABLE`) and the real-time computed farmer ledger.
- **Entry Requirements:** Stage 6 verified.
- **Deliverables:**
  - Migration `005_adjustments.sql` creating `adjustments_and_deductions` table.
  - `AdjustmentsRepository` supporting `CATTLE_FEED`, `ADVANCE_LOAN`, `VETERINARY_EXPENSE`, `TRANSPORT_CHARGE`, `BONUS`, `MANUAL_ADJUSTMENT`.
  - Non-destructive `voidAdjustment` operation with audit logging.
  - `LedgerProjectionService` computing running balances directly from source transactions:
    $$\text{Balance} = \text{Opening Balance} + \sum(\text{Active Collections}) + \sum(\text{Active Increases}) - \sum(\text{Active Decreases}) - \sum(\text{Active Payments})$$
  - Farmer Ledger UI with chronological transaction statement.
- **Verification Commands:**
  - `npm run test:ledger` (Verifies computed ledger math and checks that voided items are excluded).
- **Exit Criteria:** Adjustments record with explicit business effects; ledger balances match mathematical sum of source records down to the exact paise.

---

### Stage 8: Weekly Settlement Batches & Payment Allocations
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
