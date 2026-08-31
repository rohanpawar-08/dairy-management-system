# Dairy Management System (डेअरी व्यवस्थापन प्रणाली)

> **Offline-First Windows Desktop Application for Milk Collection Centres in Maharashtra, India**

---

## 📌 Project Overview

The **Dairy Management System** is a standalone, fully offline Windows desktop application engineered specifically for small and medium milk collection centres (दूध संकलन केंद्र) and village dairy cooperatives across Maharashtra, India.

The system digitizes and automates daily morning and evening milk collection, dynamic FAT/SNF rate calculation, computed farmer ledgers, adjustments/deductions, weekly billing settlements, payment allocations, and printable A4 statements—eliminating calculation errors, manual register bookkeeping, and data loss.

---

## 🚦 Current Project Status

| Milestone | Status | Notes |
|---|---|---|
| **Stage 0: Documentation & Project Governance** | **Completed** | PRD, System Design, Roadmap, Decisions, and Open Questions defined and reviewed. |
| **Stage 1: Project Scaffolding & Shell** | **Completed** | Angular 22 standalone app, TypeScript Electron shell, typed IPC preload bridge, and better-sqlite3 native smoke tests verified. |
| **Stage 2: Database Layer & Migrations** | **Completed** | SQLite connection lifecycle (WAL, FULL synchronous, foreign keys), incremental migrations engine, Migration 001 foundation schema, and verified async backup service. |
| **Stage 3: Auth, Session & Security** | **Completed** | First-run setup wizard, Scrypt salt+hash auth, PIN login, memory session authority, sliding-window rate limiting, and append-only audit logging. |
| **Stage 4: Farmer Directory & Opening Balances** | **Completed** | Farmer registration, search, masked bank/UPI metadata, integer paise opening balances, soft deactivation, and balance locking. |
| **Stage 5: Owner-Controlled Rate Plans & Calculation Engine** | **Completed** | Cow/Buffalo formula pricing engine (`PER_PERCENT_POINT_PER_LITRE`), draft/approval lifecycle, duplicate overlap prevention, preview calculation, and Owner RBAC. |
| **Stage 6: Morning/Evening Shift Management & Fast Collection Entry** | **Completed** | Shift lifecycle (`OPEN`/`LOCKED`), single open partial index, fast keyboard collection entry (<15s), duplicate delivery confirmations, monotonic receipt sequence, and immutable rate snapshots. |
| **Stage 7: Adjustments, Deductions, Advances & Computed Farmer Ledger** | **Completed** | Non-milk adjustments (`ADVANCE`, `DEDUCTION`, `CREDIT`), `ADJ-YYYYMMDD-000001` daily sequence, Owner RBAC, non-destructive voiding, and real-time computed farmer ledger running balance projection. |
| **Stage 8: Weekly Settlement Batches & Payment Allocations** | **Completed** | Weekly settlement periods (`SET-YYYYMMDD-000001`), dynamic draft preview, atomic finalization snapshots (`weekly_settlements`, `settlement_items`), FIFO payment allocation (`PAY-YYYYMMDD-000001`), non-destructive payment voiding, and zero hard deletes. |
| **Current Implementation State** | **Stage 8 Verified** | All unit and integration tests passing (`npm test`, `test:settlements`, `test:ledger`, `test:collection`, `test:rates`, `test:farmers`, `test:auth`, `test:audit-base`, `test:db`, `test:backup-basic`, `test:ipc-smoke`, `build:smoke-pack`). |

---

## 🗄️ Local Database & Storage

* **Production Database File:** `app.getPath('userData')/dairy_data.db`
* **Configuration:** SQLite with Write-Ahead Logging (`WAL`), `synchronous = FULL`, and enforced foreign keys (`PRAGMA foreign_keys = ON`).
* ⚠️ **Data Integrity Warning:** Never edit, delete, or modify SQLite database files (`dairy_data.db`, `dairy_data.db-wal`, `dairy_data.db-shm`) directly using external database tools while the application is running or in production. All schema alterations must strictly occur through versioned migration scripts in the incremental migration engine.

---

## 💻 Development, Build & Test Commands

```bash
# Install pinned dependencies
npm install

# Start Angular renderer and Electron in development mode
npm run dev

# Run full test suite (Angular component + backend unit + settlements + ledger + collections + rate plans + farmers + auth/audit + database + backup integration)
npm test

# Run Stage 8 Weekly Settlement Batches and Payment Allocation tests
npm run test:settlements

# Run Stage 7 Adjustments, Deductions, Advances, and Farmer Ledger tests
npm run test:ledger

# Run Stage 6 Milk Collection and Shift management tests
npm run test:collection

# Run Stage 5 Rate Plan engine, formula calculation, and pricing integration tests
npm run test:rates

# Run Stage 4 Farmer management, exact money arithmetic, PII masking & migration integration tests
npm run test:farmers

# Run authentication and credential security unit & integration tests
npm run test:auth

# Run append-only audit service integration tests
npm run test:audit-base

# Run isolated database layer and migration integration tests
npm run test:db

# Run verified asynchronous backup service integration tests
npm run test:backup-basic

# Build Angular production bundle and Electron main/preload (with migration assets)
npm run build

# Run automated IPC & SQLite native smoke test in Electron runtime
npm run test:ipc-smoke

# Produce packaged unpacked build and verify in real packaged runtime
npm run build:smoke-pack
```

---

## 🛠️ Confirmed Technology Stack

| Layer | Technology | Details / Rationale |
|---|---|---|
| **UI Framework** | **Angular 22** | Standalone components, Signals, typed reactive forms, SCSS design system. |
| **UI Component Library** | **Angular Material** | Customized Material 3 theme tailored for high-contrast, large-touch/keyboard data entry. |
| **Desktop Shell** | **Electron** | Isolated renderer (`contextIsolation: true`, `nodeIntegration: false`, sandboxed). |
| **Local Database** | **SQLite via `better-sqlite3`** | Embedded, zero-config, ACID-compliant local database with WAL mode, foreign keys, and `PRAGMA synchronous = FULL`. |
| **IPC Bridge** | **Typed Preload Bridge** | Secure, allowlisted, context-bridged IPC handlers between Angular and Electron Main. |
| **Cryptography & Security** | **Node.js Built-in `crypto`** | `scrypt` salt-and-hash derivation for passwords/PINs with timing-safe comparison; memory-held main process sessions. |
| **PDF & Printing Engine** | **`pdfmake` with Devanagari Fonts** | Bundled Devanagari font (e.g., Noto Sans Devanagari / Mukta) for offline Marathi statements. |
| **Packaging & Installer** | **`electron-builder`** | Windows NSIS installer (.exe) and portable executable for 64-bit Windows 10/11. |
| **Internationalization (i18n)** | **Offline JSON Dictionaries** | Marathi (`mr`) as primary language with English (`en`) instant toggle. |

---

## 📦 Required MVP Modules (18 Modules)

1. **First-Run Dairy Setup (प्रणाली प्रारंभ व डेअरी माहिती):** Initial setup wizard for dairy name, registration details, owner credentials, and default operational parameters.
2. **Local Owner/Operator Access (स्थानिक वापरकर्ता व्यवस्थापन):** Role-based local authentication (Owner vs. Operator) with credential verification in main process memory.
3. **Dashboard (डॅशबोर्ड):** Daily KPIs, shift collection summaries, pending balances, and quick actions.
4. **Farmer / Member Management (सभासद / शेतकरी व्यवस्थापन):** Unique member codes, bilingual profiles, masked bank/UPI details, opening balances, and soft deactivation.
5. **Cow and Buffalo Milk Types (गाय व म्हैस दूध प्रकार):** Independent handling, separate quality standards, and distinct rate plans.
6. **Rate-Plan Management (दरपत्रक व्यवस्थापन):** Versioned rate plans executing owner-approved pricing strategies (matrix/band/formula) with strict validation and zero rate fabrication.
7. **Morning / Evening Shift Management (सकाळ / संध्याकाळ शिफ्ट व्यवस्थापन):** Explicit shift opening, real-time counters, shift lock on closure (`LOCKED`), and shift register reports.
8. **Fast Milk Collection Entry (जलद दूध संकलन नोंदणी):** Keyboard-first workflow (<15 seconds per farmer), real-time calculation preview, duplicate delivery detection with warnings, unique receipt numbers, and immutable snapshots.
9. **Daily & Shift Reports (दैनिक व शिफ्ट अहवाल):** Shift collection registers, date-range summaries, and farmer delivery slips.
10. **Weekly Settlement Batches (साप्ताहिक बिलिंग व हिशोब):** Weekly settlement periods, frozen amount due snapshots, immutable settlement items with release lifecycle, and status lifecycle (`DRAFT`, `FINALIZED`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`).
11. **Full & Partial Payment Allocations (पेमेंट नोंदणी व वाटप):** Payment vouchers across multiple modes (Cash, Bank Transfer, UPI, Cheque) allocated non-destructively across farmer settlements.
12. **Computed Farmer Ledger (सभासद खाते व लेजर):** Chronological financial projection computed directly from opening balances, active milk collections, adjustments, and non-voided payments.
13. **Adjustments & Deductions (कपात व समायोजन):** Cattle feed, veterinary expenses, advance deductions, bonuses, and manual adjustments categorized by explicit business effects (`INCREASE_PAYABLE` / `DECREASE_PAYABLE`).
14. **Backup & Restore (बॅकअप आणि पुनर्संचयित):** Safe non-blocking backups, automated backups on shift close/pre-restore, and schema-validated integrity restoration.
15. **Settings & Preferences (सेटिंग्ज व प्राधान्ये):** Dairy profile configuration, settlement cycle rules, backup paths, and printer setup.
16. **Audit Trail (ऑडिट लॉग):** Application-controlled append-only log capturing device identifier, user ID, and sensitive administrative events starting from Stage 3.
17. **Marathi / English Language Support (द्विभाषिक भाषा समर्थन):** Marathi-first interface with seamless runtime switching to English.
18. **PDF Statement & A4 Printing (A4 स्टेटमेंट व प्रिंटिंग):** Formatted weekly farmer settlement statements, ledger sheets, and collection summaries printable on standard A4 printers.

---

## 📚 Project Governance & Documentation

All architectural decisions, technical specifications, governance policies, and business questions are documented in the following files:

* 📄 **[AGENTS.md](AGENTS.md)** — Permanent architectural rules, security constraints, and execution guidelines for all AI agents.
* 📄 **[PRD.md](docs/PRD.md)** — Complete Product Requirements Document (PRD v2.0) with detailed user stories, business rules, financial models, and acceptance criteria.
* 📄 **[SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md)** — Comprehensive System Architecture Document including 17-table DDL schema, precision rules, IPC contracts, non-destructive lifecycle fields, and security boundaries.
* 📄 **[ROADMAP.md](docs/ROADMAP.md)** — Stage-by-stage implementation plan (Stage 0 through commercial v1.0) and 30-day pilot validation protocol.
* 📄 **[DECISIONS.md](docs/DECISIONS.md)** — Architectural Decision Records (ADRs) documenting confirmed technical choices and rationales.
* 📄 **[OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md)** — Catalog of pending dairy business parameters, rate matrices, rounding rules, printed number formats, and physical hardware requirements.

---

## ⚠️ Important Implementation Notice

> **Do not write application code, create package manifests, or install npm modules during Stage 0.**
> Scaffolding and implementation will proceed strictly stage-by-stage starting from Stage 1 as outlined in [ROADMAP.md](docs/ROADMAP.md).

## Stage 9: Reports & Dashboard
- Daily/Shift Collection Summaries
- Farmer Ledger Statements
- Settlement Batch Reports
- Outstanding Farmer Reports
- Offline Secure A4 PDF Generation
- Exact Integer Aggregation (ROUND_HALF_UP)
