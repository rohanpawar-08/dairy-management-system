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
| **Stage 2: Database Layer & Migrations** | **Next** | Schema migrations, connection management, WAL mode, and foundation tables. |
| **Current Implementation State** | **Stage 1 Verified** | All unit tests, IPC smoke tests, and packaged builds passing with exit code 0. |

---

## 💻 Stage 1 Development & Build Commands

```bash
# Install pinned dependencies
npm install

# Start Angular renderer and Electron in development mode
npm run dev

# Run all unit tests (Angular + Backend) non-interactively
npm test

# Build Angular production bundle and Electron main/preload
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
