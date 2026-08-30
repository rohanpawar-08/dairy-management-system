# Architectural Decision Records (ADRs)
## Dairy Management System — Offline Desktop Application
### (स्थापत्य व तांत्रिक निर्णय नोंदवही)

---

## 📋 Index of Decisions

- **[ADR-001](#adr-001-100-offline-first-desktop-architecture-with-electron--sqlite)**: 100% Offline-First Desktop Architecture with Electron & SQLite
- **[ADR-002](#adr-002-angular-22-standalone-components--signals-architecture)**: Angular 22 Standalone Components & Signals Architecture
- **[ADR-003](#adr-003-strict-electron-process-isolation--security-model)**: Strict Electron Process Isolation & Security Model
- **[ADR-004](#adr-004-local-sqlite-database-management-via-better-sqlite3-and-synchronous-full)**: Local SQLite Database Management via `better-sqlite3` and `synchronous = FULL`
- **[ADR-005](#adr-005-integer-paise--scaled-integer-financial-precision-model)**: Integer Paise & Scaled Integer Financial Precision Model
- **[ADR-006](#adr-006-owner-approved-pricing-strategy--zero-rate-fabrication-policy)**: Owner-Approved Pricing Strategy & Zero Rate Fabrication Policy
- **[ADR-007](#adr-007-immutable-rate--amount-snapshots-on-milk-collections)**: Immutable Rate & Amount Snapshots on Milk Collections
- **[ADR-008](#adr-008-computed-farmer-ledger--weekly-settlement-accounting-model)**: Computed Farmer Ledger & Weekly Settlement Accounting Model
- **[ADR-009](#adr-009-two-tier-local-role-based-access-control-owner-vs-operator)**: Two-Tier Local Role-Based Access Control (Owner vs. Operator)
- **[ADR-010](#adr-010-soft-deactivation-and-non-destructive-financial-voids)**: Soft Deactivation and Non-Destructive Financial Voids
- **[ADR-011](#adr-011-shift-and-settlement-immutability-with-audit-overrides)**: Shift and Settlement Immutability with Audit Overrides
- **[ADR-012](#adr-012-duplicate-milk-delivery-warning--confirmation-policy)**: Duplicate Milk Delivery Warning & Confirmation Policy
- **[ADR-013](#adr-013-decoupled-business-date-in-asiakolkata-from-utc-timestamps)**: Decoupled Business Date in Asia/Kolkata from UTC Timestamps
- **[ADR-014](#adr-014-marathi-first-bilingual-localization-with-bundled-devanagari-fonts)**: Marathi-First Bilingual Localization with Bundled Devanagari Fonts
- **[ADR-015](#adr-015-asynchronous-hot-backups-checksums-and-pre-restore-safety-snapshots)**: Asynchronous Hot Backups, Checksums, and Pre-Restore Safety Snapshots
- **[ADR-016](#adr-016-exclusion-of-cloud-backends-spring-boot-and-remote-auth)**: Exclusion of Cloud Backends, Spring Boot, and Remote Auth
- **[ADR-017](#adr-017-node-built-in-cryptographic-credential-storage-and-memory-sessions)**: Node Built-in Cryptographic Credential Storage and Memory Sessions
- **[ADR-018](#adr-018-n-api-prebuilt-native-sqlite-bindings-for-windows-electron-runtime)**: N-API Prebuilt Native SQLite Bindings for Windows Electron Runtime

---

### ADR-001: 100% Offline-First Desktop Architecture with Electron & SQLite
- **Status:** Accepted
- **Context:** Target milk collection centres in rural and semi-urban Maharashtra frequently experience intermittent cellular reception, broadband downtime, and power instability.
- **Decision:** Build the core application as a self-contained, 100% offline Windows desktop application running Electron and local SQLite.
- **Rationale:** Guarantees that milk collection and farmer payouts are never blocked by network outages. Zero dependency on third-party cloud infrastructure ensures extreme reliability and zero ongoing hosting costs for small dairy owners.

---

### ADR-002: Angular 22 Standalone Components & Signals Architecture
- **Status:** Accepted
- **Context:** The frontend requires high-speed rendering, reactive form handling, and clean component boundaries without unnecessary architectural bloat.
- **Decision:** Use Angular 22 with standalone components, Angular Signals for fine-grained local state, and standard Angular services. Exclude `app.module.ts` legacy patterns and exclude NgRx store unless future complexity explicitly warrants it.
- **Rationale:** Modern Angular standalone components simplify dependency injection, improve tree-shaking, and reduce boilerplate. Angular Signals provide ultra-responsive UI updates for real-time calculation previews during high-speed data entry.

---

### ADR-003: Strict Electron Process Isolation & Security Model
- **Status:** Accepted
- **Context:** Electron applications must be protected against malicious script execution and architectural layer blurring.
- **Decision:** Enforce `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` in the renderer, materially reducing vulnerability surfaces. All communication with the main process must pass through an allowlisted, typed preload bridge using `ipcRenderer.invoke` and `ipcMain.handle`.
- **Rationale:** Prevents arbitrary Node.js API execution in the renderer and enforces a clean, API-like boundary between presentation (Angular) and data storage (SQLite in Main).

---

### ADR-004: Local SQLite Database Management via `better-sqlite3` and `synchronous = FULL`
- **Status:** Accepted
- **Context:** The application operates in rural areas subject to sudden power cuts and requires high-performance, ACID-compliant local data storage.
- **Decision:** Use SQLite operated through `better-sqlite3` in the Electron main process, configured with Write-Ahead Logging (`PRAGMA journal_mode = WAL;`), enforced foreign keys (`PRAGMA foreign_keys = ON;`), and `PRAGMA synchronous = FULL;` for production data safety.
- **Rationale:** `better-sqlite3` provides fast, synchronous query execution in Node.js. `synchronous = FULL` ensures that acknowledged transactions are flushed to disk to withstand unexpected power interruptions supported by the OS and hardware.

---

### ADR-005: Integer Paise & Scaled Integer Financial Precision Model
- **Status:** Accepted
- **Context:** JavaScript floating-point arithmetic (`0.1 + 0.2 !== 0.3`) causes compounding rounding errors across hundreds of daily milk transactions and ledger calculations.
- **Decision:** Represent and store all monetary values as integer paise (`1 INR = 100 paise`). Store milk quantities as integer millilitres (`1 L = 1000 mL`) and FAT/SNF values as integers scaled by 100 (`4.25% = 425`).
- **Rationale:** Eliminates binary floating-point drift while retaining an explicit business rounding step across all calculation, billing, and reporting workflows.

---

### ADR-006: Owner-Approved Pricing Strategy & Zero Rate Fabrication Policy
- **Status:** Accepted (Confirmed Strategy: `FORMULA` / `PER_PERCENT_POINT_PER_LITRE`)
- **Context:** The pricing structure for Cow and Buffalo milk is calculated based on exact fat and SNF percentages with per-point rates and bounds. Guessing or interpolating rates causes financial disputes and regulatory violations.
- **Decision:** The application executes strictly an owner-configured and approved pricing strategy (`FORMULA` with basis `PER_PERCENT_POINT_PER_LITRE`). The system never invents, guesses, averages, interpolates, or silently falls back to a nearest rate. Separate rate plans exist for `COW` and `BUFFALO`. Rate formula parameters enforce integer/BigInt calculation with `ROUND_HALF_UP` rounding. If a sample is out of configured FAT/SNF bounds or quality steps, or if no approved rate plan is active for the business date, the collection is rejected with an explicit bilingual error.
- **Rationale:** Preserves complete pricing integrity, eliminates floating-point errors, and prevents unauthorized assumptions in software calculations.

---

### ADR-007: Immutable Rate & Amount Snapshots on Milk Collections
- **Status:** Accepted
- **Context:** Rate charts change periodically (e.g., seasonal price revisions). Changing a rate chart must never alter historical earnings of previously recorded collections.
- **Decision:** Every saved `milk_collections` record must persist an immutable snapshot of `rate_plan_id`, `rate_applied_paise`, and `amount_paise` computed at the time of entry.
- **Rationale:** Guarantees historical auditability and ensures that past shift reports, weekly statements, and ledgers remain mathematically constant forever.

---

### ADR-008: Computed Farmer Ledger & Weekly Settlement Accounting Model
- **Status:** Accepted
- **Context:** Previous accounting drafts attempted to post milk credits during settlement generation, risking double-counting milk already present in daily collections.
- **Decision:** 
  1. The farmer ledger is a real-time computed financial projection:
     $$\text{Ledger Balance} = \text{Opening Balance} + \sum(\text{Active Collections}) + \sum(\text{Active Increases}) - \sum(\text{Active Decreases}) - \sum(\text{Active Payments})$$
  2. Weekly settlements group and freeze a billing statement snapshot (`amount_due_paise`) using immutable line items in `settlement_items`.
  3. Cancelling a settlement period marks its items `'RELEASED'`, allowing the source collections/adjustments to be safely included in a subsequent settlement without loss of historical audit evidence.
  4. Payments reduce settlement outstanding balances via `payment_allocations` (`status`: `ACTIVE`/`VOIDED`) without modifying frozen `amount_due_paise`. Cached settlement payment totals are derived from active allocations and verified by reconciliation tests.
- **Rationale:** Prevents double-counting, preserves independent ledger derivability even if settlements are cancelled, and ensures transparent statement snapshots.

---

### ADR-009: Two-Tier Local Role-Based Access Control (Owner vs. Operator)
- **Status:** Accepted
- **Context:** Dairy collection counters are often manned by operators who should record milk but not alter financial rate plans or delete historical records.
- **Decision:** Implement two local roles:
  1. **Owner:** Full system administrative and financial authority.
  2. **Operator:** Restricted to shift opening/closing, collection data entry, and shift register viewing.
- **Rationale:** Prevents unauthorized financial adjustments or accidental data deletion during collection shifts while keeping local authentication simple and fast.

---

### ADR-010: Soft Deactivation and Non-Destructive Financial Voids
- **Status:** Accepted
- **Context:** Hard-deleting records breaks relational integrity, audit trails, and historical accounting.
- **Decision:** Prohibit hard SQL deletes (`DELETE FROM ...`). Farmers are deactivated using `is_active = 0`. Financial transactions (collections, adjustments, payments, allocations) are reversed using `status = 'VOIDED'`, `voided_at`, `voided_by_user_id`, and `void_reason`.
- **Rationale:** Preserves historical audit integrity while preventing invalid records from corrupting active ledgers or reports.

---

### ADR-011: Shift and Settlement Immutability with Audit Overrides
- **Status:** Accepted
- **Context:** Completed shifts and finalized settlements must be protected against casual modification.
- **Decision:** Once a shift is closed (`status = 'LOCKED'`) or a settlement is finalized, records are locked against operator modification. Unlocking or voiding requires Owner authorization and an explicit audit justification logged in `audit_logs`.
- **Rationale:** Prevents post-shift record tampering while providing administrative recourse for genuine operational corrections.

---

### ADR-012: Duplicate Milk Delivery Warning & Confirmation Policy
- **Status:** Accepted Policy (Multiple Deliveries Unresolved)
- **Context:** Under high-speed collection pressure, duplicate entries may occur, though some dairies legitimately allow multiple deliveries per shift.
- **Decision:** When a collection entry matches an existing active delivery for that farmer, business date, shift type, and milk type, display a high-visibility warning dialog requiring explicit operator confirmation and logging the confirmation in `audit_logs`. Every delivery receives a unique, durable `receipt_number`.
- **Rationale:** Prevents accidental duplicates without permanently blocking legitimate multiple deliveries until the pilot dairy rule is confirmed.

---

### ADR-013: Decoupled Business Date (in Asia/Kolkata) from UTC Timestamps
- **Status:** Accepted
- **Context:** Evening milk collection occurs between 18:00 and 20:30 IST (12:30–15:00 UTC). Using raw UTC timestamps for daily aggregation causes date-rollover bugs.
- **Decision:** Store an explicit calendar string `business_date TEXT NOT NULL` (`YYYY-MM-DD`) representing local Indian Standard Time (IST) on all transactions, alongside standard UTC `created_at` timestamps for audit logs.
- **Rationale:** Designed to prevent timezone rollover discrepancies between local shift operations and system timestamps.

---

### ADR-014: Marathi-First Bilingual Localization with Bundled Devanagari Fonts
- **Status:** Accepted
- **Context:** Primary end-users in Maharashtra speak and read Marathi. Printed PDF statements must render Devanagari script cleanly without font-missing errors on offline machines.
- **Decision:** Design the UI with Marathi as the default language, accompanied by an instant English toggle. Bundle TrueType Devanagari fonts (e.g., `Noto Sans Devanagari`) directly within the application package for `pdfmake` rendering.
- **Rationale:** Ensures flawless local language rendering on any Windows machine without requiring internet access or pre-installed system fonts.

---

### ADR-015: Asynchronous Hot Backups, Checksums, and Pre-Restore Safety Snapshots
- **Status:** Accepted
- **Context:** Sudden power cuts or manual restore mistakes can cause catastrophic data loss in rural collection centres.
- **Decision:** Use SQLite's non-blocking backup API (`await db.backup(...)`) or `VACUUM INTO` for live backups. Verify integrity with `PRAGMA integrity_check;` and SHA-256 checksums recorded in `backup_history`. Before any database restore, automatically create an emergency safety snapshot of the active database.
- **Rationale:** Prevents file locking issues during active writes and ensures that a failed restore operation can be rolled back to the safety snapshot.

---

### ADR-016: Exclusion of Cloud Backends, Spring Boot, and Remote Auth
- **Status:** Accepted
- **Context:** Requirements were evaluated regarding whether a remote backend (Spring Boot, MySQL, Firebase) should be incorporated into Version 1.0.
- **Decision:** Explicitly exclude Spring Boot, MySQL, Firebase, and remote cloud authentication. The application is strictly a standalone desktop application.
- **Rationale:** Eliminates external failure modes, eliminates recurring cloud hosting costs, simplifies installation, and matches the real-world operational constraints of standalone rural dairy collection centres.

---

### ADR-017: Node Built-in Cryptographic Credential Storage and Memory Sessions
- **Status:** Accepted
- **Context:** Passwords and PINs must be secured without exposing plaintext credentials or requiring heavy native compilation dependencies during early scaffolding.
- **Decision:** Use Node.js built-in `crypto.scrypt` with a unique 32-byte salt for password and PIN hashing (`pin_hash`), verify credentials with `crypto.timingSafeEqual`, and maintain authenticated sessions in main-process memory.
- **Rationale:** Provides strong cryptographic security using built-in Node.js facilities without additional native dependency risks.

---

### ADR-018: N-API Prebuilt Native SQLite Bindings & Unpacked Smoke Packaging
- **Status:** Accepted
- **Context:** Target Windows client machines and deployment developer workstations in offline or semi-connected rural environments may lack full Visual Studio C++ desktop build toolchains. Additionally, early stage packaging only requires an unpacked executable to verify IPC and native SQLite module execution rather than a signed, branded production installer.
- **Decision:**
  1. Utilize N-API Node-API prebuilt binary distribution for `better-sqlite3` (`win32-x64.node`) unpacked directly alongside Electron main process bundles (`asarUnpack: ["**/*.node", "**/better-sqlite3/**"]`) and configure `npmRebuild: false` in `electron-builder.yml`.
  2. For the Stage 1 unpacked smoke test application, configure `win: { signAndEditExecutable: false }` in `electron-builder.yml` to prevent invoking external `winCodeSign` utilities on Windows.
  3. Prohibit any manual patching or fabrication of files inside `electron-builder`'s global cache (`%LOCALAPPDATA%\electron-builder\Cache`).
  4. Defer Windows icon embedding, resource editing, and production code-signing configuration to Stage 11.
- **Rationale:** Node-API is ABI-stable across Node and Electron versions supporting N-API 9/10, eliminating local C++ compilation failures, reducing packaging time, and ensuring 100% reproducible execution across development, CI, and packaged Windows binaries without global cache tampering.

---

### ADR-019: Main-Process Session Authority, Sliding-Window Rate Limiting, and Offline Bilingual i18n
- **Status:** Accepted
- **Context:** First-run dairy setup and authentication must function 100% offline without remote identity providers. The application must guarantee that credentials cannot be harvested from the renderer, passwords/PINs never leak into log files, failed logins are throttled to prevent brute-force attacks on unattended terminals, and Marathi/English translations operate with zero latency.
- **Decision:**
  1. **Scrypt Parameterization & Timing-Safe Equality:** Hashes use standard format `$scrypt$v=1$N=16384,r=8,p=1$<salt_hex>$<derived_key_hex>` with unique 32-byte salts, 64-byte keys, maxmem 32MB, and `crypto.timingSafeEqual` comparison.
  2. **Memory Session Authority:** Sessions are stored strictly in Electron main-process memory keyed on `webContents.id`. Angular route guards provide UX convenience, while main-process IPC handlers strictly enforce session and role authority (`requireAuthenticated`, `requireRole('OWNER')`).
  3. **Local In-Memory Rate Limiting:** Throttles authentication after 5 consecutive failures per `username:webContentsId` pair within a 5-minute sliding window, locking further attempts for 5 minutes. Reset immediately upon successful authentication. Injectable clock facilitates deterministic automated testing without real-time sleep.
  4. **Append-Only Audit Logging with Secret Redaction:** Security events (`SETUP_COMPLETED`, `AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILED`, `AUTH_RATE_LIMITED`, `AUTH_LOGOUT`) are written exclusively to `audit_logs` with stable `device_id`. All input detail dictionaries are recursively sanitized to redact passwords, PINs, hashes, tokens, and secrets. Successful login aborts session creation if audit recording fails.
  5. **Offline Bilingual i18n:** Bundles static `public/assets/i18n/mr.json` and `public/assets/i18n/en.json` directly with 100% key parity, Marathi default, and instant signal-driven language toggling.
- **Rationale:** Establishes a zero-trust boundary between the untrusted renderer and privileged main process, eliminates credential leakage, protects local terminals, and guarantees a seamless offline user experience.

---

### ADR-020: Shift Management, Transactional Monotonic Receipt Numbering, and Immutable Collection Snapshots
- **Status:** Accepted
- **Context:** High-speed daily milk collection requires strict session lifecycle enforcement (Morning/Evening shifts), collision-safe monotonic receipt numbering, duplicate delivery detection, and mathematical guarantee that historical collections are never retroactively recalculated when rate plans change.
- **Decision:**
  1. **Shift Lifecycle & Partial Unique Index:** Shifts operate with status `OPEN` and `LOCKED`. Exactly one shift may be `OPEN` across the entire database enforced by partial unique index `idx_shifts_single_open ON shifts(status) WHERE status = 'OPEN'`. Closing locks the shift; reopening requires Owner authorization and a mandatory audit reason logged to `audit_logs`.
  2. **Collision-Safe Monotonic Receipt Numbering:** Receipt numbers follow the pattern `MC-YYYYMMDD-M-000001` (Morning) and `MC-YYYYMMDD-E-000001` (Evening). Sequence counters are maintained in `app_settings` and incremented atomically inside the parent collection creation transaction. Transaction rollback rolls back counter increments. Voiding does not release or reuse allocated receipt numbers.
  3. **Authoritative Milk-Type & Pricing Enforcement:** Only `'COW'` and `'BUFFALO'` are accepted collection milk types (farmer default `'BOTH'` prompts explicit operator selection). Dairy centre `enabled_milk_types` is enforced authoritatively in the main process.
  4. **Strict Immutability & Database Triggers:** Every collection record snapshots `rate_plan_id`, `rate_applied_paise`, and `amount_paise`. SQLite trigger `trg_milk_collections_prevent_update` blocks direct modification of all 16 transaction fields. Voiding is non-destructive (`status = 'VOIDED'`), requires Owner authorization, and cannot be undone or re-voided. Hard deletion on `shifts` and `milk_collections` is blocked by database triggers.
  5. **Future Settlement Protection:** Collection voiding checks for active links to finalized settlement items (`settlement_items` / `weekly_settlements`) and rejects voiding with a clean bilingual domain error.
- **Rationale:** Ensures tamper-proof financial records, collision-free receipts, and uninterrupted daily collection workflow while eliminating floating-point errors and historical data corruption.

---

### ADR-021: Non-Milk Financial Adjustments, Daily Monotonic Reference Sequence, Owner-Only Mutations, and Dynamic Computed Farmer Ledger
- **Status:** Accepted
- **Context:** Dairy operations require recording non-milk financial entries (cash advances, cattle feed sales, veterinary medicine, bonuses, price adjustments) and maintaining a real-time farmer ledger statement without stored balance cache drift or un-audited operator modifications.
- **Decision:**
  1. **Dynamic Computed Farmer Ledger:** Zero mutable `current_balance` column or ledger cache exists. Current balances and date-range statements are computed dynamically on demand from active raw source transactions (`farmers.opening_balance_paise`, active `milk_collections`, and active `adjustments_and_deductions`).
  2. **Balance Sign Convention:**
     - Positive balance ($> 0$ paise): `PAYABLE_TO_FARMER` (Dairy owes money to farmer).
     - Negative balance ($< 0$ paise): `FARMER_DEBT_TO_DAIRY` (Farmer owes money to dairy).
     - Zero balance ($= 0$ paise): `NONE` (Settled / Neutral).
  3. **Integer Paise & Scaled Arithmetic:** Money is calculated and stored strictly as integer paise ($1\text{ INR} = 100\text{ paise}$). Floating-point currency math is prohibited across all main-process handlers and Angular services.
  4. **Categorized Adjustment Entry:** Enforces `entry_type IN ('ADVANCE', 'DEDUCTION', 'CREDIT')` with 9 explicit business categories (`CASH_ADVANCE`, `CATTLE_FEED`, `MEDICINE`, `LOAN_RECOVERY`, `EQUIPMENT`, `OTHER_DEDUCTION`, `BONUS`, `PRICE_CORRECTION`, `OTHER_CREDIT`).
  5. **Daily Monotonic Reference Sequence (`ADJ-YYYYMMDD-000001`):** Daily reference sequence counters are tracked in `app_settings` (`adj_counter_YYYYMMDD`) and incremented inside the parent atomic SQLite transaction. Transaction failure or rollback restores counter state without sequence gaps.
  6. **Owner-Only RBAC Authority:** Adjustment creation and soft voiding are restricted to the `OWNER` role. Main-process IPC handlers verify session authority (`requireRole('OWNER')`); attempts by `OPERATOR` sessions are strictly rejected.
  7. **Immutability & Non-Destructive Voiding:** Physical SQL `DELETE` queries are blocked by database trigger `trg_adj_prevent_delete`. Transaction fields are immutable once inserted (enforced by `trg_adj_prevent_update`). Reversals execute soft voiding (`status = 'VOIDED'`, `voided_by_user_id`, `voided_at`, `void_reason`).
- **Rationale:** Ensures complete auditability, eliminates floating-point drift and balance cache corruption, protects against unauthorized operator mutations, and enforces strict financial precision.
