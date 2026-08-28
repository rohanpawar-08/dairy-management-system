# Product Requirements Document (PRD v2.0)
## Dairy Management System — Offline Desktop Application
### (डेअरी व्यवस्थापन प्रणाली — संपूर्ण ऑफलाइन डेस्कटॉप ॲप्लिकेशन)

---

## 1. Executive Summary & Problem Statement

In rural and semi-urban Maharashtra, small and medium milk collection centres (दूध संकलन केंद्र) and village dairy cooperative societies collect milk twice daily from hundreds of local farmers (शेतकरी / सभासद). 

Currently, the majority of collection centres manage daily operations using physical paper registers, pocket diaries, basic spreadsheets, or fragmented WhatsApp notes. This causes critical operational bottlenecks:
- **Pricing calculation errors:** Applying manual pricing charts or mental math leads to substantial revenue leakage or unfair payouts to farmers.
- **Slow collection queues:** Long physical lines of farmers during peak morning (06:00–08:30) and evening (18:00–20:30) shifts because manual recording takes 45–90 seconds per farmer.
- **Delayed & dispute-prone weekly settlements:** Calculating milk totals, deducting cattle-feed or advance loans, and determining weekly cash/bank payouts takes hours of tedious manual arithmetic every week.
- **Catastrophic data loss:** Paper ledgers get lost, torn, or water-damaged during monsoon seasons, leading to permanent financial disputes.
- **Unreliable connectivity:** Rural Maharashtra frequently experiences erratic cellular networks and frequent power/broadband outages, rendering cloud-only web applications unusable.

### The Solution
The **Dairy Management System** is a **100% offline-first Windows desktop application** designed for single-computer deployment at milk collection centres in Maharashtra. It offers an intuitive, Marathi-first user interface with fast keyboard-driven data entry, automated rate calculations executing owner-approved pricing strategies, real-time shift summaries, automated weekly billing settlements, computed farmer ledgers, and reliable local backups.

---

## 2. Target Market & User Personas

### 2.1 Target Geography & Market
- **Geographic Focus:** Maharashtra, India (rural and semi-urban milk collection belts such as Kolhapur, Sangli, Pune, Ahmednagar, Satara, Solapur, Nashik, Jalgaon, etc.).
- **Primary Language:** Marathi (मराठी).
- **Secondary Language:** English.
- **Currency:** Indian Rupee (INR / ₹) formatted in the Indian numbering system (Lakhs / Crores) with precision down to integer paise.
- **Operating Environment:** Single desktop/laptop PC running Windows 10 or Windows 11 (64-bit), placed at the milk collection counter.

### 2.2 User Personas

| Persona | Role | Key Responsibilities | Technical Profile & Needs |
|---|---|---|---|
| **Dadaso (Dairy Owner / संचालक)** | Owner / Admin | Manages rate plans, configures deductions, reviews daily summaries, authorizes weekly settlements, executes farmer payouts, oversees backups. | Moderate tech literacy, speaks Marathi fluently, needs clean summary dashboards, financial transparency, and protection against accidental data modification. |
| **Sachin (Collection Operator / ऑपरेटर)** | Data Entry Operator | Operates the system during morning and evening shifts, records milk deliveries (Member Code, Quantity, FAT, SNF) under extreme time pressure. | Basic computer literacy, prefers pure keyboard shortcuts (Number pad + Enter), demands immediate response times (<15 seconds per entry), Marathi labels. |
| **Babanrao (Farmer / सभासद)** | Milk Producer (External Beneficiary) | Delivers cow/buffalo milk daily, expects instant clarity on quantity, FAT, SNF, and rate, and requires a transparent weekly A4 printed statement. | Non-technical, values clear printed statements in Devanagari (Marathi), clear balance breakdowns, and accurate payment receipts. |

---

## 3. Product Scope & Non-Negotiable Constraints

### 3.1 Non-Negotiable Constraints

| Constraint | Architectural & Operational Requirement |
|---|---|
| **100% Offline Core** | Zero dependency on internet connectivity. All application logic, database storage, calculations, and reporting operate fully offline. |
| **Local SQLite Storage** | All business data resides in an embedded local SQLite database managed by the Electron main process with WAL mode and `PRAGMA synchronous = FULL`. |
| **Integer Paise Currency** | Money is stored and computed in integer paise (`1 INR = 100 paise`) to prevent floating-point rounding errors. |
| **Owner-Approved Pricing Strategy** | The pricing engine executes only an owner-approved strategy (exact matrix, bands, or formula). No fabricated, guessed, or interpolated rates. If a combination is unconfigured, collection is blocked with a clear bilingual error. |
| **Immutable Snapshots** | Every saved collection records the exact `rate_plan_id`, `rate_applied_paise`, and calculated `amount_paise`. Rate plan edits never alter past collections. |
| **Computed Ledger Model** | The ledger is a pure computed projection from source transactions. Settlements freeze billing snapshots without double-counting milk on the ledger. |
| **Shift & Settlement Lock** | Closed shifts (`status = 'LOCKED'`) and finalized weekly settlements cannot be modified without Owner authentication and an explicit audit reason. |
| **Non-Destructive Financial Lifecycle** | Soft deactivation for farmers (`is_active = 0`) and non-destructive voiding (`status = 'VOIDED'`) for financial records. Physical hard deletes are strictly forbidden. |
| **Keyboard-First Collection** | Complete entry of a standard milk collection record must take less than 15 seconds using keyboard shortcuts. |

---

## 4. Detailed Functional Modules (18 MVP Modules)

### Module 1: First-Run Dairy Setup (प्रणाली प्रारंभ व डेअरी माहिती)
- **Description:** Guided onboarding wizard presented when the application is launched for the first time without an initialized database.
- **Capabilities:**
  - Enter Dairy Centre Name (e.g., *श्री गणेश दूध संकलन केंद्र*).
  - Enter Registration Number / Co-operative Society Code.
  - Enter Centre Address, Taluka, District, Pincode, and Contact Phone Numbers.
  - Set Default Language (Marathi default, English optional).
  - Set Default Milk Types enabled (Cow, Buffalo, or Both).
  - Set Default Weekly Settlement Start Day (Monday default).
  - Initialize Owner master account, password, and optional quick PIN.
- **Acceptance Criteria:**
  - *AC-1.1:* System boots to the First-Run Wizard when `dairy_profile` table is uninitialized.
  - *AC-1.2:* Wizard enforces valid inputs (non-empty name, valid 10-digit Indian phone number, secure owner password).
  - *AC-1.3:* Upon submission, settings are written in a single SQLite transaction and redirect immediately to the login/dashboard screen.

---

### Module 2: Local Owner & Operator Access (स्थानिक वापरकर्ता व्यवस्थापन)
- **Description:** Role-based local authentication enabling separation of duties between the dairy owner and shift operators.
- **Roles:**
  - **Owner (मालक / ॲडमिन):** Full access to rate plans, financial adjustments, settlement finalization, payment disbursement, system settings, database restore, and audit logs.
  - **Operator (ऑपरेटर):** Restricted access limited to shift opening, milk collection entry, shift closing, and printing shift registers. Cannot edit past rates, reopen locked shifts, or modify past settlements without Owner authorization.
- **Security Design:**
  - Local credentials (passwords and PINs) hashed using Node.js built-in `crypto.scrypt` with unique random salts and timing-safe comparison. PINs are never stored in plaintext (`pin_hash`).
  - Sessions maintained in Electron main-process memory; every privileged IPC invocation verifies the authenticated session.
  - Sensitive action authorization modal prompts for Owner credentials when an operator attempts a restricted action.
- **Acceptance Criteria:**
  - *AC-2.1:* Operator is prevented by the Electron main process from executing rate plan updates, settlement finalizations, database restores, and audit clears.
  - *AC-2.2:* Reopening a locked shift by an Operator prompts for Owner authentication and logs the override in `audit_logs`.

---

### Module 3: Dashboard (डॅशबोर्ड)
- **Description:** Central visual command center displaying real-time business health and current shift status.
- **Capabilities:**
  - **Today's Summary Cards:** Total Milk Collected (Cow Litres + Buffalo Litres = Total Litres), Total Earnings Amount (₹), Active Farmers who delivered today.
  - **Active Shift Indicator:** Displays current open shift (Morning / Evening / None open), shift start time, and live collection count.
  - **Pending Payouts Card:** Total pending unpaid weekly settlement balance across all farmers.
  - **Quick Action Buttons:** Start Shift Collection (संकलन सुरू करा), Farmer Directory (सभासद), Weekly Billing (साप्ताहिक बिलिंग), Backup Now (डेटा बॅकअप).
- **Acceptance Criteria:**
  - *AC-3.1:* Dashboard metrics auto-refresh upon every collection save, void, and shift transition.
  - *AC-3.2:* Litres and currency totals are formatted in Marathi Devanagari or English depending on selected language preference.

---

### Module 4: Farmer / Member Management (सभासद / शेतकरी व्यवस्थापन)
- **Description:** Directory of milk-producing farmers registered with the collection centre.
- **Fields:**
  - `member_code` (Unique identifier, e.g., `101`, `102`).
  - `name_mr` (Farmer full name in Marathi), `name_en` (optional English transliteration).
  - `phone` (10-digit mobile number, optional).
  - `village` (गाव / वस्ती).
  - `bank_account_number`, `bank_ifsc`, `bank_name` (Optional, masked in regular UI views).
  - `upi_id` (Optional, masked in regular UI views).
  - `default_milk_type` (`COW`, `BUFFALO`, or `BOTH`).
  - `opening_balance_paise` (Positive for dairy payable to farmer; negative for farmer debt to dairy).
  - `is_active` (Active = 1, Deactivated = 0).
- **Capabilities:**
  - Fast search by Member Code, Name substring, or Phone.
  - Filter by Active / Inactive status and Milk Type.
  - Soft deactivation (prohibits new collections while preserving past records and ledger history).
  - Direct editing of `opening_balance_paise` is blocked once financial transactions exist; corrections must be recorded as authorized adjustments.
- **Acceptance Criteria:**
  - *AC-4.1:* Member Code must be unique. Duplicate codes are rejected with a clear bilingual error.
  - *AC-4.2:* Attempting to hard-delete a farmer with existing transactions is strictly prevented; the system only permits soft deactivation.

---

### Module 5: Cow and Buffalo Milk Types (गाय व म्हैस दूध प्रकार)
- **Description:** Dedicated business rules and visual segregation for Cow Milk (गाय दूध) and Buffalo Milk (म्हैस दूध).
- **Capabilities:**
  - Independent rate plans and independent shift tally counters for each milk type.
  - Segregated shift reporting for Cow Litres, Cow Amount, Buffalo Litres, and Buffalo Amount.
- **Acceptance Criteria:**
  - *AC-5.1:* Milk collection entry enforces selection of Milk Type (`COW` or `BUFFALO`).
  - *AC-5.2:* Reports provide segregated totals and weighted averages for Cow and Buffalo milk.

---

### Module 6: Rate-Plan Management (दरपत्रक व्यवस्थापन)
- **Description:** Core pricing engine allowing the dairy owner to define rate plans mapping quality parameters to price per litre (₹/L).
- **Business Rules:**
  - **Owner-Approved Strategy:** Executes the confirmed pricing strategy (exact matrix grid, step bands, or base formula once confirmed by the pilot dairy).
  - **Zero Fabrication:** The system never guesses, averages, interpolates, or selects a nearest rate. If an input combination cannot produce an approved rate, the collection is blocked.
  - **Effective Date Versioning:** Each rate plan has an `effective_from` date and optional `effective_to` date with constraint `effective_to IS NULL OR effective_to >= effective_from`. Editing rates creates a new version; past collections retain their original rate snapshot.
  - **Provisional Rounding Rule:** Collection amount calculation uses `ROUND_HALF_UP` to the nearest paise as provisional default pending pilot dairy confirmation:
    $$\text{Amount (Paise)} = \mathrm{round}\left(\frac{\text{Quantity (mL)} \times \text{Rate (Paise/L)}}{1000}\right)$$
- **Acceptance Criteria:**
  - *AC-6.1:* If a quality combination has no matching approved rate, the system displays: `"या फॅट/एसएनएफ साठी दर उपलब्ध नाही. कृपया दरपत्रक तपासा." / "Rate not found for this FAT/SNF. Please verify rate chart."` and disables the save button.
  - *AC-6.2:* Modifying a rate plan takes effect only for collections created on or after its `effective_from` date.

---

### Module 7: Morning / Evening Shift Management (सकाळ / संध्याकाळ शिफ्ट व्यवस्थापन)
- **Description:** Formal shift lifecycle tracking collection sessions.
- **Shifts:** Morning (सकाळ) and Evening (संध्याकाळ).
- **Lifecycle States:** `OPEN` (active collection) $\rightarrow$ `LOCKED` (closed session).
- **Capabilities:**
  - Explicit Shift Opening: Operator selects date and shift, confirming start.
  - Active Shift HUD: Displays total litres collected, total amount, and farmer count in current session.
  - Shift Closing & Lock: When collection concludes, operator closes the shift (`status = 'LOCKED'`). Collections become locked against direct operator modification.
  - Shift Reopening: Requires Owner credentials and an audit justification.
- **Acceptance Criteria:**
  - *AC-7.1:* Collections cannot be saved unless a shift is explicitly `OPEN` for that business date and shift type.
  - *AC-7.2:* Once a shift is locked, editing or voiding its collections is blocked for Operators without Owner authorization.

---

### Module 8: Fast Milk Collection Entry (जलद दूध संकलन नोंदणी)
- **Description:** High-speed data entry screen optimized for the physical reality of rural collection lines.
- **Workflow & Keyboard Navigation:**
  1. Focus starts on **Member Code** field.
  2. Types Member Code $\rightarrow$ Hits `Enter`.
  3. System displays Farmer Name, default milk type, and running balance. Focus shifts to **Milk Type** (if dual) or **Quantity**.
  4. Types **Quantity** (Litres) $\rightarrow$ Hits `Enter`.
  5. Types **FAT%** $\rightarrow$ Hits `Enter`.
  6. Types **SNF%** $\rightarrow$ Hits `Enter`.
  7. System immediately computes Rate/L (₹) and Total Amount (₹), displaying them in large high-contrast badges.
  8. Operator hits `Enter` or `Space` on **Save (नोंद करा)**.
  9. Record is persisted in SQLite; a unique durable `receipt_number` is generated; focus resets to Member Code instantly.
- **Duplicate Delivery Handling:**
  - If a collection already exists for that Farmer + Business Date + Shift + Milk Type, system displays a high-visibility warning dialog requiring explicit operator confirmation. The confirmation is logged in `audit_logs`.
- **Non-Destructive Voiding & Settlement Protection:**
  - To cancel a mistaken collection, an Owner executes `voidCollection` with a mandatory reason, updating `status = 'VOIDED'`, `voided_at`, and `voided_by_user_id`.
  - Collections linked to an active finalized settlement cannot be voided until the affected settlement is released through the Owner-authorized cancellation workflow.
- **Acceptance Criteria:**
  - *AC-8.1:* End-to-end entry for an experienced operator takes $< 15$ seconds without touching the mouse.
  - *AC-8.2:* Stored collection contains: `receipt_number`, `farmer_id`, `shift_id`, `business_date`, `shift_type`, `milk_type`, `quantity_ml`, `fat_x100`, `snf_x100`, `rate_plan_id`, `rate_applied_paise`, `amount_paise`, `status` (`ACTIVE`/`VOIDED`), `created_at`.

---

### Module 9: Daily & Shift Reports (दैनिक व शिफ्ट अहवाल)
- **Description:** Shift registers, daily tally sheets, and exportable summaries.
- **Capabilities:**
  - **Shift Collection Register:** Tabular report of all active deliveries in a shift sorted by Member Code or Time, showing Litres, FAT, SNF, Rate, Amount.
  - **Daily Comparative Summary:** Morning vs. Evening comparison, Cow vs. Buffalo comparison, Average FAT/SNF for the day.
  - **Export / Print:** Direct print to connected A4 printer or export to PDF/CSV.
- **Acceptance Criteria:**
  - *AC-9.1:* Shift report total litres and total rupees match the sum of active individual collection rows down to the exact paise (excluding voided records).
  - *AC-9.2:* Shift report displays weighted average FAT and weighted average SNF correctly calculated based on quantity.

---

### Module 10: Weekly Settlement Batches (साप्ताहिक बिलिंग व हिशोब)
- **Description:** Weekly accounting engine grouping milk deliveries and adjustments into finalized settlement statements.
- **Settlement Architecture:**
  - **`settlement_periods`:** Weekly batch master (`period_start_date`, `period_end_date`, `status`: `DRAFT`, `FINALIZED`, `CANCELLED`). Enforces `period_start_date <= period_end_date` and a unique partial index ensuring only one active (non-cancelled) period exists per date range. The same period row transitions from `DRAFT` to `FINALIZED`.
  - **`weekly_settlements`:** One settlement statement per farmer (`statement_number`, `opening_balance_snapshot_paise`, `amount_due_paise`, `payments_allocated_paise`, `outstanding_amount_paise`).
  - **`settlement_items`:** Immutable snapshot line items linking source collections and adjustments. When a settlement is cancelled, items transition `allocation_status` to `'RELEASED'` to preserve historical evidence while allowing source records to be included in a fresh settlement draft.
- **Financial Invariants (Frozen at Finalization):**
  $$\text{Amount Due (Frozen)} = \text{Opening Balance Snapshot} + \text{Gross Milk Earnings} + \text{Increasing Adjustments} - \text{Decreasing Deductions}$$
  $$\text{Payments Allocated (Cached)} = \sum(\text{Active Allocated Payments})$$
  $$\text{Outstanding Amount (Cached)} = \text{Amount Due (Frozen)} - \text{Payments Allocated}$$
- **Cancellation & Protection Rules:**
  - A finalized settlement with active payment allocations cannot be cancelled until its allocations are voided or reassigned via Owner authorization.
  - Cancelling an entire period (`cancelSettlementPeriod`) or individual farmer settlement (`cancelFarmerSettlement`) releases linked settlement items in an atomic database transaction.
- **Acceptance Criteria:**
  - *AC-10.1:* Settlement generation groups active collections and adjustments in the date range without creating duplicate milk-credit ledger entries.
  - *AC-10.2:* Finalizing a settlement freezes `amount_due_paise` and locks linked collections against retroactive edits.

---

### Module 11: Full & Partial Payment Allocations (पेमेंट नोंदणी व वाटप)
- **Description:** Recording financial disbursements made by the dairy owner to farmers.
- **Capabilities:**
  - Record payment voucher (`receipt_number`, `amount_paid_paise`, `payment_date`, `payment_mode`, `reference_number`, `notes`, `status`: `ACTIVE`/`VOIDED`).
  - Payment Modes: `CASH`, `BANK_TRANSFER`, `UPI`, `CHEQUE`, `OTHER`.
  - Payment Allocation: Non-destructive allocation across finalized settlements via `payment_allocations` (`status`: `ACTIVE`/`VOIDED`).
  - Full payment sets that settlement's positive `outstanding_amount_paise` to zero and transitions its status to `PAID` (without altering the farmer's overall ledger projection).
  - Voiding a payment via `voidPayment` marks the payment and its allocations `VOIDED` in a single transaction and recalculates settlement cached totals.
- **Acceptance Criteria:**
  - *AC-11.1:* Payment allocation cannot exceed the payment's unallocated amount or the settlement's positive outstanding amount.
  - *AC-11.2:* Voiding a payment automatically restores the settlement's outstanding balance without data deletion.

---

### Module 12: Computed Farmer Ledger (सभासद खाते व लेजर)
- **Description:** Real-time financial projection computed directly from source transactions.
- **Computation Rule:**
  $$\text{Current Ledger Balance} = \text{Opening Balance} + \sum(\text{Active Milk Collections}) + \sum(\text{Active Increasing Adjustments}) - \sum(\text{Active Decreasing Deductions}) - \sum(\text{Active Payments})$$
- **Capabilities:**
  - Real-time ledger calculation independent of settlement generation or cancellation.
  - Chronological transaction statement display with running balance column.
  - Filterable by date range and printable as an A4 ledger statement.
- **Acceptance Criteria:**
  - *AC-12.1:* Ledger running balance strictly reconciles with the mathematical sum of all historical source transactions.
  - *AC-12.2:* Cancelling a settlement period does not corrupt the source ledger projection.

---

### Module 13: Adjustments & Deductions (कपात व समायोजन)
- **Description:** Non-milk financial charges and credits applied to farmer accounts.
- **Categories:**
  - `CATTLE_FEED` (पशुखाद्य खरेदी): Feed supply deduction (`DECREASE_PAYABLE`).
  - `ADVANCE_LOAN` (उचल / ॲडव्हान्स): Cash advance given to farmer (`DECREASE_PAYABLE` when recovered).
  - `VETERINARY_EXPENSE` (डॉक्टर / औषधोपचार): Medical charges (`DECREASE_PAYABLE`).
  - `TRANSPORT_CHARGE` (वाहतूक खर्च): Milk transport deduction (`DECREASE_PAYABLE`).
  - `BONUS` (बोनस / अनुदान): Subsidy or festive incentive (`INCREASE_PAYABLE`).
  - `MANUAL_ADJUSTMENT` (इतर समायोजन): Custom credit/debit with mandatory reason.
- **Lifecycle:**
  - Active adjustments are included in ledger projections and settlement periods.
  - Mistaken adjustments can be voided via `voidAdjustment` (non-destructive).
- **Acceptance Criteria:**
  - *AC-13.1:* Every adjustment explicitly records `business_effect` (`INCREASE_PAYABLE` or `DECREASE_PAYABLE`).
  - *AC-13.2:* Voiding an adjustment updates `status = 'VOIDED'` and instantly recalculates the computed ledger.

---

### Module 14: Backup and Restore (बॅकअप आणि पुनर्संचयित)
- **Description:** Local data protection mechanism safeguarding against hardware faults and system crashes.
- **Capabilities:**
  - **Manual Backup:** Non-blocking async snapshot via SQLite backup API (`better-sqlite3` backup / `VACUUM INTO`).
  - **Automated Backup:** Best-effort silent backup upon shift closure or scheduled interval.
  - **Post-Backup Verification:** Reads backup destination, runs `PRAGMA integrity_check`, verifies schema version, and computes SHA-256 checksum recorded in `backup_history`.
  - **Safe Restore Protocol:**
    1. Quarantine active database with emergency safety backup.
    2. Validate candidate backup file integrity and schema version compatibility.
    3. Close active SQLite connection and replace active database file.
    4. Reopen database and verify integrity; automatically rollback to safety snapshot if reopening fails.
- **Acceptance Criteria:**
  - *AC-14.1:* Restoring an invalid or incompatible file is rejected before modifying the active database.
  - *AC-14.2:* Backups execute asynchronously without locking the user interface during active operations.

---

### Module 15: Settings & Preferences (सेटिंग्ज व प्राधान्ये)
- **Description:** Central configuration panel for operational parameters.
- **Capabilities:**
  - Update Dairy Profile details (Name, Contact, Registration number, Receipt header/footer text).
  - Settlement cycle configuration (Default start day: Monday).
  - Backup target directory paths (Primary local path, secondary USB path).
  - Language selection toggle (Marathi / English).
  - Printer configuration (Paper size: A4, Margins, Printer selection).
- **Acceptance Criteria:**
  - *AC-15.1:* Financial configuration changes take effect prospectively with versioning and never retroactively alter past finalized settlements or collections.

---

### Module 16: Audit Trail (ऑडिट लॉग)
- **Description:** Application-controlled append-only record of sensitive operations implemented starting in Stage 3.
- **Tracked Events:**
  - User logins, logouts, and failed authentication attempts.
  - Rate plan creations, updates, and activations.
  - Shift reopenings after closure.
  - Duplicate delivery override confirmations.
  - Non-destructive voids of collections, adjustments, and payments.
  - Settlement period and farmer settlement cancellations.
  - Database backup and restore executions.
- **Fields:** `timestamp`, `device_id`, `user_id`, `action_type`, `entity_name`, `entity_id`, `details_json`.
- **Acceptance Criteria:**
  - *AC-16.1:* Audit log entries cannot be modified or deleted through the user interface.

---

### Module 17: Marathi / English Language Support (द्विभाषिक भाषा समर्थन)
- **Description:** Native bilingual user experience with Marathi (मराठी) as the default language.
- **Capabilities:**
  - Complete Devanagari localization of all UI labels, form fields, validation messages, reports, and buttons.
  - One-click language toggle (मराठी $\leftrightarrow$ English) available in the header without reloading the application.
  - Standardized dairy terminology (e.g., *सभासद, दूध संकलन, दरपत्रक, हिशोब, कपात, बाकी, अहवाल*).
- **Acceptance Criteria:**
  - *AC-17.1:* 100% of user-facing strings are loaded from offline JSON translation files with zero hard-coded English strings in Marathi mode.

---

### Module 18: PDF Statement & A4 Printing (A4 स्टेटमेंट व प्रिंटिंग)
- **Description:** High-quality printable output engine generating weekly farmer settlement slips, shift collection registers, and ledger statements.
- **Capabilities:**
  - Formatted for standard A4 paper (laser or inkjet printers).
  - Bundled offline Devanagari typography (e.g., Noto Sans Devanagari) ensuring crisp Marathi text rendering without glyph distortion.
  - A4 Weekly Farmer Statement Layout:
    * Header: Dairy Name, Reg. No., Farmer Code & Name, Week Date Range, Statement Number.
    * Table: Daily Breakdown (Date, Shift, Milk Type, Qty, FAT, SNF, Rate, Amount).
    * Summary Box: Total Litres, Gross Milk Amount, Itemized Deductions, Net Payable Amount, Prior Balance, Payments, Final Outstanding Amount.
    * Footer: Dairy Signature / Stamp space, Farmer Signature space.
  - Batch printing support (prints weekly statements for all active farmers in a single click).
- **Acceptance Criteria:**
  - *AC-18.1:* Generated PDFs render Devanagari script properly with correct vowel signs (मात्रा) and conjunct consonants (जोडाक्षरे).
  - *AC-18.2:* Printed totals match settlement summary figures exactly down to the paise.

---

## 5. Non-Functional Requirements (NFRs) & Pilot Benchmarks

| Category | Specification & Benchmark Target |
|---|---|
| **Data Entry Speed** | - Complete entry of a standard milk collection record takes $< 15$ seconds for an experienced operator. |
| **Performance Benchmarks** | - Rate calculation execution, daily shift report aggregation ($< 500$ records), and cold launch will be benchmarked on the actual pilot PC to verify sub-second responsiveness. |
| **Reliability & Durability** | - SQLite configured with WAL mode and `PRAGMA synchronous = FULL`. Acknowledged transactions survive ordinary application crashes and power cuts when supported by the OS and disk hardware.<br>- Automated verified backup before any schema migration or database restore.<br>- Foreign key constraints strictly enforced across all 17 tables. |
| **Offline Independence** | - 100% of application features function without an active internet connection.<br>- Zero external cloud API calls or telemetry beacons. |
| **Security & Architecture** | - Electron renderer sandboxed (`contextIsolation: true`, `nodeIntegration: false`), materially reducing security risks.<br>- Strongly-typed allowlisted IPC bridge; main process is the security authority for all data mutations.<br>- Parameterized SQL queries preventing SQL injection vulnerabilities. |
| **Usability & Ergonomics** | - High-contrast visual design optimized for varied lighting conditions in village collection centres.<br>- Large typography (minimum 16px body, 24px+ calculation badges).<br>- 100% keyboard accessibility for data entry workflows. |

---

## 6. Out-of-Scope Features (Version 1.0)

- Direct RS-232 / USB hardware integration with ultrasonic milk analysers and digital weighing scales (Manual entry in V1; hardware protocol layer planned for V2).
- Thermal POS 58mm/80mm receipt printing (A4 laser/inkjet printing prioritized in V1).
- Multi-centre cloud synchronization and remote web dashboard.
- Mobile companion apps for farmers (Android / iOS).
- Automated SMS / WhatsApp message gateways.
- Automated online UPI payment gateway integration.

---

## 7. Pilot Success Metrics

The commercial Version 1.0 release will be validated through a **30-Day Real Dairy Pilot Deployment** at a live milk collection centre in Maharashtra meeting the following benchmark criteria:

1. **30 Consecutive Days of Continuous Operation:** Zero downtime, zero application crashes, and zero unhandled errors during live morning and evening collection shifts.
2. **100% Financial Accuracy:** Automated rate calculations, weekly settlement totals, and farmer ledger balances match manual register calculations with 100.00% precision down to the exact paise across all 30 days.
3. **Speed Benchmark:** Operator completes single farmer collection entry in under 15 seconds average time.
4. **Data Durability:** Zero data corruption or loss across unexpected system reboots, simulated power cuts, and backup/restore cycles.
5. **Stakeholder Approval:** Dairy owner and shift operator sign-off on Marathi terminology, A4 statement clarity, and ease of daily operation.
