# System Design Document
## Dairy Management System — Offline Desktop Application

---

## 1. Architecture Overview

Single-machine, offline-first desktop application. No external server required for core functionality.

```
┌─────────────────────────────────────────────────────┐
│                    Electron Shell                     │
│  ┌───────────────────────────────────────────────┐  │
│  │           Angular Application (Renderer)        │  │
│  │  - Components (Farmer, Collection, Billing...)  │  │
│  │  - Services (business logic, calculations)      │  │
│  │  - Angular Material / PrimeNG (UI)               │  │
│  └───────────────────┬───────────────────────────┘  │
│                       │ IPC (Inter-Process Comm)      │
│  ┌───────────────────▼───────────────────────────┐  │
│  │           Electron Main Process (Node.js)        │  │
│  │  - Database access layer (better-sqlite3)        │  │
│  │  - File system (backup/restore, PDF export)       │  │
│  │  - App lifecycle, auto-update (future)             │  │
│  └───────────────────┬───────────────────────────┘  │
│                       │                                 │
│              ┌────────▼────────┐                       │
│              │  SQLite Database │                       │
│              │   (local file)   │                       │
│              └──────────────────┘                       │
└─────────────────────────────────────────────────────┘
```

**Why this shape:** Angular can't touch the filesystem/SQLite directly for security reasons in Electron's renderer process. All DB and file operations happen in the Main process; Angular talks to it via Electron IPC (`ipcRenderer.invoke` / `ipcMain.handle`). Treat IPC calls like a local "API" — this also means porting to a real cloud backend later (Phase 3) mainly means swapping the IPC layer for HTTP calls, without rewriting the Angular UI.

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| UI Framework | Angular (latest LTS) | Component-based, forms-heavy app fits its structure well |
| UI Components | Angular Material or PrimeNG | Tables, forms, dialogs out of the box |
| Desktop Shell | Electron | Packages Angular as installable .exe |
| Local Database | SQLite via `better-sqlite3` | Zero-config, file-based, fast for single-user local app |
| PDF Generation | `pdfmake` | For bills and printable reports |
| State Management | Angular services + RxJS (BehaviorSubject) | No need for NgRx at this scale — avoid over-engineering |
| Language | TypeScript | Both Angular and Electron main process |
| i18n | Angular's built-in i18n or a simple JSON translation service | Marathi/English toggle |
| Packaging | `electron-builder` | Generates Windows installer (.exe) |

## 3. Database Schema (SQLite)

```sql
-- Farmers / Members
CREATE TABLE farmers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    village TEXT,
    bank_account TEXT,
    upi_id TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Rate Chart: FAT/SNF -> price per liter
CREATE TABLE rate_chart (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fat_percent REAL NOT NULL,
    snf_percent REAL NOT NULL,
    rate_per_liter REAL NOT NULL,
    effective_from TEXT NOT NULL,
    effective_to TEXT
);

-- Daily Milk Collection
CREATE TABLE milk_collection (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    farmer_id INTEGER NOT NULL REFERENCES farmers(id),
    collection_date TEXT NOT NULL,
    shift TEXT NOT NULL CHECK(shift IN ('morning','evening')),
    fat_percent REAL NOT NULL,
    snf_percent REAL NOT NULL,
    quantity_liters REAL NOT NULL,
    rate_applied REAL NOT NULL,
    amount REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Bills (Phase 2)
CREATE TABLE bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    farmer_id INTEGER NOT NULL REFERENCES farmers(id),
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    total_liters REAL NOT NULL,
    total_amount REAL NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','partial')),
    created_at TEXT DEFAULT (datetime('now'))
);

-- Payments (Phase 2)
CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER REFERENCES bills(id),
    farmer_id INTEGER NOT NULL REFERENCES farmers(id),
    amount_paid REAL NOT NULL,
    payment_date TEXT NOT NULL,
    payment_mode TEXT,
    notes TEXT
);

-- Ledger view is computed, not stored:
-- balance = SUM(milk_collection.amount for farmer) - SUM(payments.amount_paid for farmer)
```

**Key design decision:** The FAT/SNF rate lookup should NOT require an exact match in `rate_chart`. Build the calculation service to find the nearest/matching band (most dairies use ranges, e.g. FAT 3.5–3.6% = one rate). Confirm the exact matching logic with a real dairy's rate chart before finalizing — this is the single most important piece of business logic in the app.

## 4. Suggested Folder Structure

```
dairy-management/
├── electron/
│   ├── main.ts              # Electron entry point
│   ├── preload.ts           # Secure bridge between renderer & main
│   ├── db/
│   │   ├── database.ts      # SQLite connection setup
│   │   ├── migrations/      # Schema versioning
│   │   └── repositories/    # farmer.repo.ts, collection.repo.ts, etc.
│   └── ipc/
│       └── handlers.ts      # ipcMain.handle() endpoints
├── src/                      # Angular app
│   ├── app/
│   │   ├── core/
│   │   │   ├── services/     # electron-bridge.service.ts, calculation.service.ts
│   │   │   └── models/       # farmer.model.ts, collection.model.ts
│   │   ├── features/
│   │   │   ├── farmers/
│   │   │   ├── collection/
│   │   │   ├── rate-chart/
│   │   │   ├── ledger/
│   │   │   ├── billing/
│   │   │   ├── payments/
│   │   │   ├── reports/
│   │   │   └── dashboard/
│   │   ├── shared/            # reusable UI components
│   │   └── app.module.ts
│   └── assets/i18n/           # mr.json, en.json
├── package.json
└── electron-builder.yml
```

## 5. Core Service Interfaces (for the AI agent to scaffold)

```typescript
// calculation.service.ts
interface RateChartEntry {
  fatPercent: number;
  snfPercent: number;
  ratePerLiter: number;
}

interface CalculateAmountInput {
  fatPercent: number;
  snfPercent: number;
  quantityLiters: number;
  rateChart: RateChartEntry[];
}

// Returns matched rate + computed amount
function calculateMilkAmount(input: CalculateAmountInput): {
  rateApplied: number;
  amount: number;
};

// farmer.repository.ts (main process)
interface FarmerRepository {
  create(farmer: NewFarmer): Farmer;
  findById(id: number): Farmer | null;
  findActive(): Farmer[];
  update(id: number, changes: Partial<Farmer>): void;
  deactivate(id: number): void;
}

// ledger.service.ts
interface LedgerEntry {
  farmerId: number;
  totalCollectedAmount: number;
  totalPaidAmount: number;
  balance: number;
}
function getFarmerLedger(farmerId: number): LedgerEntry;
```

## 6. Security & Data Integrity

- SQLite file stored in Electron's `app.getPath('userData')` — not in a user-editable location by default
- All writes wrapped in transactions (especially bill generation + payment recording)
- Input validation both in Angular (UX) and in the main-process repository layer (integrity — never trust the renderer)
- Backup = copy the SQLite file to a timestamped file in a user-chosen folder (manual button + optional daily auto-backup on app close)
- Restore = validate the backup file's schema version before replacing the active DB

## 7. Build Order for the AI Agent

Feed this system design + the PRD to Antigravity in this sequence so each step is independently testable:

1. Scaffold Electron + Angular project shell, verify IPC round-trip works ("ping" test)
2. Set up SQLite schema + migrations, implement `farmers` CRUD end-to-end (UI → IPC → DB)
3. Implement `rate_chart` CRUD
4. Implement `calculation.service.ts` with unit tests against real sample rate data
5. Implement `milk_collection` entry screen wired to calculation service
6. Implement ledger computation + display
7. Implement dashboard summary
8. (Phase 2) Billing, payments, backup/restore, PDF export

## 8. Open Decisions to Confirm Before Coding

- Exact FAT/SNF rate matching logic (band-based vs interpolation) — get this from a real dairy owner
- Whether shift-wise (morning/evening) totals need separate reporting or can be combined
- Whether one farmer can belong to multiple rate chart categories (e.g. cow vs buffalo milk — common in real dairies, not shown in the reference poster but worth asking about)
