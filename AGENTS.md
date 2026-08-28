# AI Agent Instructions & Governance Rules

> **Project:** Dairy Management System (डेअरी व्यवस्थापन प्रणाली)  
> **Scope:** Offline-First Windows Desktop Application (Maharashtra, India)  
> **Target Stack:** Angular 22 + Electron + SQLite (`better-sqlite3`) + TypeScript

---

## 🏛️ Permanent Architectural Rules for AI Agents

All AI coding agents, subagents, and contributors operating in this repository **must strictly adhere** to the non-negotiable rules below. Failure to comply with these rules will result in rejection of the contribution.

---

### Rule 1: Mandatory Context Review Before Editing
Before making any architectural, schema, or code modifications, the agent **MUST** view and understand the following core governance documents:
1. [docs/PRD.md](docs/PRD.md) — Product scope, business rules, and acceptance criteria.
2. [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) — System architecture, 17-table database schema, IPC contracts, and security boundaries.
3. [docs/DECISIONS.md](docs/DECISIONS.md) — Confirmed architectural decisions and rationales.
4. [docs/ROADMAP.md](docs/ROADMAP.md) — Current execution stage and delivery boundaries.
5. [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) — Pending business inputs and unconfirmed parameters.

---

### Rule 2: Execute One Development Stage at a Time
- Work strictly within the scope of the active stage defined in [docs/ROADMAP.md](docs/ROADMAP.md).
- **Do not jump ahead** or implement downstream stage modules out of sequence.
- Complete all entry requirements, deliverables, automated tests, and exit verification before advancing to the next stage.

---

### Rule 3: Exact Paths and Transparent Change Summaries
- Always specify exact repository-relative file paths when modifying or referencing code.
- Provide a clear, human-readable summary of every change, highlighting the rationale, side effects, and touched components.
- Do not execute silent or hidden file mutations.

---

### Rule 4: Zero Invented Rates & Owner-Approved Pricing Strategy
- **NEVER** fabricate, estimate, hallucinate, or hard-code sample dairy milk prices or FAT/SNF rate tables in business logic.
- **NEVER** silently guess, interpolate, or round to a "nearest matching rate" if an exact rate lookup rule is not configured.
- The pricing engine executes strictly an owner-configured and approved pricing strategy (exact matrix, bands, or formula once confirmed).
- If a rate lookup fails or is out of the configured rate grid/bounds, the calculation engine **must reject the transaction** with an explicit bilingual validation error (Marathi and English).

---

### Rule 5: Strict Preservation of Financial & Precision Rules
- **Money representation:** All monetary values must be calculated and stored as **integer paise** (`1 INR = 100 paise`). Floating-point arithmetic on currency totals is strictly forbidden in both Angular and Electron main processes.
- **Quantity & Quality precision:** Scaled integers or safe fixed-precision arithmetic must be enforced for milk quantity (millilitres), FAT percentage ($\times 100$), and SNF percentage ($\times 100$).
- **Explicit Business Effects:** Financial adjustments must explicitly specify `INCREASE_PAYABLE` (increases dairy debt to farmer) or `DECREASE_PAYABLE` (reduces dairy debt to farmer).
- **Computed Ledger Model:** The farmer ledger is a computed projection from source transactions (opening balance + active milk collections + active adjustments - non-voided payments). Weekly settlement generation groups and freezes a billing snapshot without double-counting milk on the ledger.
- **Settlement Formula:** The settlement amount due formula must strictly follow:
  $$\text{Amount Due} = \text{Opening Balance Snapshot} + \text{Week's Milk Earnings} + \text{Payable-Increasing Adjustments} - \text{Payable-Decreasing Deductions}$$
  $$\text{Outstanding Amount} = \text{Amount Due (Frozen)} - \text{Valid Allocated Payments}$$
- Rounding rules (provisional `ROUND_HALF_UP` per collection) must not be treated as final until verified against real pilot dairy records. No agent may alter financial formulas or rounding rules without explicit user sign-off recorded in [docs/DECISIONS.md](docs/DECISIONS.md).

---

### Rule 6: Secure Electron Desktop Architecture
- **Renderer Isolation:** The Angular renderer process must run in a sandboxed environment with `contextIsolation: true` and `nodeIntegration: false`, materially reducing vulnerability surfaces.
- **Zero Direct System Access:** Angular components and services **must never** attempt to import `better-sqlite3`, `fs`, `path`, `child_process`, or any Node.js native module directly.
- **Allowlisted Typed IPC:** All inter-process communication must flow exclusively through the preload script using strongly-typed, allowlisted IPC channels (`ipcRenderer.invoke` and `ipcMain.handle`).
- **Main Process Security Authority:** Every privileged IPC handler in the main process must validate the authenticated session and role. Angular route guards are UX helpers only.
- **Secure Credentials:** Passwords and PINs must be securely hashed using Node.js built-in `crypto.scrypt` with unique random salts and timing-safe equality checks. Never store PINs or passwords in plaintext.

---

### Rule 7: Strict 100% Offline Operation
- All core functions (collection, rate lookup, billing, ledger, reports, backups, auth, printing) must work **100% offline** without requiring an internet connection.
- Do not add remote network dependencies, external analytics beacons, cloud database connectors (Firebase, Supabase, AWS), or online auth providers.
- Local fonts (Devanagari typography for PDF generation) and assets must be bundled locally inside the installer.

---

### Rule 8: Comprehensive Automated Testing Required
- Every implementation task must be accompanied by corresponding automated tests:
  * **Unit tests:** Calculation engine, integer math, ledger projections, and Angular services.
  * **Database & Repository tests:** Incremental SQLite schema migrations, CRUD operations, atomic transactions, foreign key enforcement, and non-destructive voids.
  * **IPC Contract tests:** Preload bridge validation and main-process handler response envelopes.
  * **Integration / E2E tests:** Collection entry workflow, shift closing, settlement generation, and payment allocation.
- No code will be considered complete without passing automated test verification.

---

### Rule 9: Safe Data Handling & Non-Destructive Corrections
- **No Hard Deletes:** Farmers, milk collections, adjustments, payments, or settlements with historical significance must **never be hard-deleted** (`DELETE FROM ...`). Use soft deactivation (`is_active = 0`) for farmers and non-destructive reversal records (`status = 'VOIDED'`) for financial transactions.
- **Immutable Snapshots:** Milk collection records must store an immutable snapshot of the applied `rate_plan_id`, `rate_applied_paise`, and `amount_paise` at the time of entry. Editing a rate plan later must never alter historic collections.
- **Shift & Settlement Protection:** Closed shifts are locked (`status = 'LOCKED'`) and finalized settlements are locked against retroactive collection recalculation. Voiding or reopening requires Owner authorization, a mandatory reason, and an atomic audit event.

---

### Rule 10: Check Existing Work & Never Execute Destructive Git Commands
- Always inspect the existing filesystem and codebase before creating new files to prevent duplicate implementations or clobbering existing work.
- **Prohibited Git commands:** `git reset --hard`, `git clean -fdx`, `git push --force`, or any command that discards uncommitted work or deletes working directory contents without explicit user request.
- Do not make git commits unless specifically directed by the user.

---

### Rule 11: Maintain Documentation Integrity & Update on Changes
- If a business requirement or technical approach evolves during implementation, the agent must update [docs/PRD.md](docs/PRD.md), [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md), [docs/ROADMAP.md](docs/ROADMAP.md), or [docs/DECISIONS.md](docs/DECISIONS.md) accordingly.
- Never let documentation drift from the actual codebase.
