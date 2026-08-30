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
- **Description:** Core pricing engine allowing the dairy owner to define, clone, approve, supersede, and cancel versioned rate plans for Cow and Buffalo milk based on fat and SNF quality parameters.
- **Business Rules:**
  - **Confirmed Pricing Strategy:** Executes the confirmed `FORMULA` pricing strategy with `PER_PERCENT_POINT_PER_LITRE` pricing basis.
  - **Exact Calculation Formula:**
    $$\text{rateNumerator} = (\text{fat\_x100} \times \text{fatRatePaisePerPoint}) + (\text{snf\_x100} \times \text{snfRatePaisePerPoint})$$
    $$\text{ratePaisePerLitre} = \text{ROUND\_HALF\_UP}\left(\frac{\text{rateNumerator}}{100}\right)$$
    $$\text{amountPaise} = \text{ROUND\_HALF\_UP}\left(\frac{\text{quantityMl} \times \text{ratePaisePerLitre}}{1000}\right)$$
  - **Separate Plans by Milk Type:** Independent rate plans and formula parameters are maintained for `COW` and `BUFFALO` milk types.
  - **Quality Bounds & Step Alignment:** Validates `fat_x100` and `snf_x100` against configured minimum, maximum, and step size (`(fat_x100 - min) % step === 0`).
  - **Zero Rate Fabrication:** The system never guesses, averages, interpolates, or selects a nearest rate. Out-of-bounds or misaligned values immediately reject the calculation with an explicit bilingual error.
  - **No Hardcoded Production Coefficients:** A clean installation contains zero seed rate plans. The dairy Owner must create and approve active plans. Test coefficients (₹8.50/₹3.00 for Cow, ₹9.00/₹3.00 for Buffalo) are test fixtures only.
  - **Lifecycle & Immutability:**
    * Plans begin in `DRAFT` status and can be freely edited.
    * Once `APPROVED`, formula parameters and bounds become permanently immutable.
    * New rates are created via `CLONE` $\rightarrow$ new `DRAFT` $\rightarrow$ `SUPERSEDE`, which atomically closes the previous active plan at `newEffectiveFrom - 1 day`.
    * Soft cancellation (`CANCELLED`) requires a mandatory reason. Hard deletes are strictly prohibited.
  - **Effective Date Versioning:** Each rate plan has an `effective_from` date and optional `effective_to` date. Overlapping active/approved periods for the same milk type are prevented by database triggers.
- **Acceptance Criteria:**
  - *AC-6.1:* If a quality combination has no matching approved rate plan or is out of bounds/steps, the system displays a clear bilingual error (`"या फॅट/एसएनएफ साठी दर उपलब्ध नाही. कृपया दरपत्रक तपासा." / "Rate not found for this FAT/SNF. Please verify rate chart."`) and blocks the collection transaction.
  - *AC-6.2:* Modifying rates creates a new version; past collections retain their original rate and amount snapshots.
  - *AC-6.3:* Operators cannot create, edit, clone, approve, supersede, or cancel rate plans, but can resolve approved rates for active collection entries.

---

### Module 7: Morning / Evening Shift Management (सकाळ / संध्याकाळ शिफ्ट व्यवस्थापन)
- **Description:** Formal shift lifecycle management governing collection sessions.
- **Shifts & Timezone Rules:** Morning (सकाळ) and Evening (संध्याकाळ). Business dates are stored as explicit calendar strings (`business_date TEXT NOT NULL`, `YYYY-MM-DD`) derived in Indian Standard Time (Asia/Kolkata, UTC+05:30) to prevent timezone rollover discrepancies.
- **Single Open Shift Constraint:** At most one shift can be globally `OPEN` across the entire database at any point in time, strictly enforced by partial unique index `idx_shifts_single_open ON shifts(status) WHERE status = 'OPEN'`.
- **Lifecycle States:** `OPEN` (active collection) $\rightarrow$ `LOCKED` (closed session).
- **Capabilities & Permissions:**
  - Explicit Shift Opening: Operator or Owner selects date and shift type (`MORNING` / `EVENING`), confirming start.
  - Active Shift HUD: Real-time display of total litres collected, total amount (₹), and active delivery count in current session.
  - Shift Closing & Lock: When collection concludes, operator closes shift (`status = 'LOCKED'`). Collections become locked against direct operator modification.
  - Shift Reopening: Restricted to Owner role with a mandatory audit reason recorded in `audit_logs`.
- **Acceptance Criteria:**
  - *AC-7.1:* Collections cannot be saved unless a shift is explicitly `OPEN` for that business date and shift type. Attempting to open a second shift while one is `OPEN` is blocked.
  - *AC-7.2:* Once a shift is locked, editing or voiding its collections is blocked for Operators and requires Owner authorization with an audit reason.

---

### Module 8: Fast Milk Collection Entry (जलद दूध संकलन नोंदणी)
- **Description:** High-speed data entry screen optimized for the physical reality of rural collection lines. Manual entry focus in Stage 6; automated hardware integration (weighing scale & milk analyzer RS232/USB serial integration) is explicitly deferred to future hardware integration stages.
- **Milk Type Restrictions & Farmer Defaults:**
  - Dairy centre `enabled_milk_types` (`COW`, `BUFFALO`, or `BOTH`) is authoritatively enforced in the main process.
  - Farmers registered as `COW` or `BUFFALO` auto-select their default milk type. Farmers registered as `BOTH` require explicit operator selection per delivery.
- **Workflow & Keyboard Navigation:**
  1. Focus starts on **Member Code** field.
  2. Types Member Code $\rightarrow$ Hits `Enter`.
  3. System displays Farmer Name, default milk type, and running balance. Focus shifts to **Milk Type** (if dual) or **Quantity**.
  4. Types **Quantity** (Litres) $\rightarrow$ Hits `Enter`.
  5. Types **FAT%** $\rightarrow$ Hits `Enter`.
  6. Types **SNF%** $\rightarrow$ Hits `Enter`.
  7. System immediately computes Rate/L (₹) and Total Amount (₹), displaying them in large high-contrast preview badges.
  8. Operator hits `Enter` or `Space` on **Save (नोंद करा)**.
  9. Record is persisted in SQLite inside an atomic transaction; a unique collision-safe receipt number is generated; focus resets to Member Code instantly.
- **Monotonic Receipt Numbering & Rollback:**
  - Standard receipt format: `MC-YYYYMMDD-M-XXXXXX` (Morning) and `MC-YYYYMMDD-E-XXXXXX` (Evening).
  - Sequence counters maintained in `app_settings` and incremented atomically inside the parent collection creation transaction.
  - Transaction failure rolls back counter increments without sequence gap consumption. Custom receipt prefix configuration remains an unresolved pilot parameter.
- **Duplicate Delivery Handling:**
  - Multiple deliveries of the same milk type in the same shift are permitted only after explicit operator confirmation.
  - If a collection already exists for that Farmer + Business Date + Shift + Milk Type, system displays a high-visibility warning dialog requiring explicit operator confirmation with a mandatory reason (`SECOND_CAN`, `RETEST`, `CORRECTION`, `OTHER`), logged in `audit_logs`.
- **Immutable Snapshots & Non-Destructive Voiding:**
  - Every collection persists immutable rate snapshots (`rate_plan_id`, `rate_applied_paise`, `amount_paise`). Rate plan updates never alter historical collection records. Direct updates to 16 transaction fields are blocked by database trigger `trg_milk_collections_prevent_update`.
  - Non-destructive soft voiding (`status = 'VOIDED'`) requires Owner role and a mandatory reason. Soft voided entries are excluded from active shift totals and shift registers.
  - Collections linked to an active finalized settlement (`settlement_items`) cannot be voided until the linked settlement is released.
- **Acceptance Criteria:**
  - *AC-8.1:* End-to-end entry for an experienced operator takes $< 15$ seconds without touching the mouse (physical entry speed benchmark validated as pilot manual acceptance item).
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
  - **`weekly_settlements`:** One settlement statement per farmer (`statement_number`, `opening_balance_snapshot_paise`, `amount_due_paise`).
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
  - Full payment is calculated dynamically. Payment records reduce the dynamically computed outstanding balance.
  - Voiding a payment via `voidPayment` marks the payment and its allocations `VOIDED` in a single transaction and recalculates settlement cached totals.
- **Acceptance Criteria:**
  - *AC-11.1:* Payment allocation cannot exceed the payment's unallocated amount or the settlement's positive outstanding amount.
  - *AC-11.2:* Voiding a payment automatically restores the settlement's outstanding balance without data deletion.

---

### Module 12: Computed Farmer Ledger (सभाсад खाते व लेजर)
- **Description:** Real-time financial projection computed dynamically directly from active source transactions without storing mutable projection tables or cached balances.
- **Balance Sign Convention & Financial Invariants:**
  - **Positive Balance ($> 0$ paise):** Dairy owes money to farmer (`PAYABLE_TO_FARMER` / `CREDIT`).
  - **Negative Balance ($< 0$ paise):** Farmer owes money to dairy (`FARMER_DEBT_TO_DAIRY` / `DEBT`).
  - **Zero Balance ($= 0$ paise):** Neutral / Settled (`NONE`).
- **Computation Formula:**
  $$\text{Current Ledger Balance (Paise)} = \text{Opening Balance} + \sum(\text{Active Milk Collections}) + \sum(\text{Active CREDITS}) - \sum(\text{Active DEDUCTIONS}) - \sum(\text{Active ADVANCES})$$
- **Role-Based Access Control:**
  - **Owner (मालक / ॲडमिन):** Full authorization to view ledgers, view adjustments, create non-milk adjustments, and perform soft voiding with mandatory justification.
  - **Operator (ऑपरेटर):** Read-only access to search farmers, view historical statements, and view adjustment records. Creation or voiding of adjustments by an Operator is **strictly rejected by the main process**.
- **Scope Demarcation:**
  - Weekly billing settlement batches (`settlement_periods`, `weekly_settlements`) and cash/bank disbursements (`payments`, `payment_allocations`) are downstream features explicitly reserved for Stage 8. Stage 7 ledger projections operate continuously on active raw transactions regardless of settlement status.
- **Acceptance Criteria:**
  - *AC-12.1:* Ledger running balance strictly reconciles with the exact integer paise sum of opening balance + active milk credits + active credits - active deductions - active advances across any date range.
  - *AC-12.2:* Viewing ledger under Operator role succeeds, but any attempt by an Operator to create or void an adjustment is rejected by the main process with a bilingual permission error.

---

### Module 13: Adjustments, Deductions & Advances (कपात, उचल व जमा समायोजन)
- **Description:** Non-milk financial entries recorded against farmer accounts with atomic daily reference numbers.
- **Entry Types & Categories:**
  - **`ADVANCE` (रोख उचल):** Cash advance given to farmer (Reduces payable balance). Category: `CASH_ADVANCE`.
  - **`DEDUCTION` (इतर कपात):** Goods or services supplied by dairy (Reduces payable balance). Categories: `CATTLE_FEED` (पशुखाद्य), `MEDICINE` (औषधोपचार), `LOAN_RECOVERY` (कर्ज वसुली), `EQUIPMENT` (साहित्य खरेदी), `OTHER_DEDUCTION` (इतर कपात).
  - **`CREDIT` (जमा रक्कम):** Incentives or manual additions (Increases payable balance). Categories: `BONUS` (बोनस / अनुदान), `PRICE_CORRECTION` (दर दुरुस्ती), `OTHER_CREDIT` (इतर जमा).
- **Reference Sequence & Monotonic Safety:**
  - Reference numbers follow pattern `ADJ-YYYYMMDD-000001` tracked in `app_settings`. Daily counter increments inside the parent atomic SQLite transaction; failure or rollback restores the counter without sequence gaps.
- **Non-Destructive Voiding & Immutability:**
  - Physical SQL `DELETE` queries are prohibited by database trigger `trg_adj_prevent_delete`.
  - Transaction fields (`reference_number`, `farmer_id`, `business_date`, `entry_type`, `category`, `amount_paise`, `reason`, `notes`, `created_by_user_id`, `created_at`) are immutable once saved, enforced by trigger `trg_adj_prevent_update`.
  - Reversal requires Owner role and executes soft voiding (`status = 'VOIDED'`, `voided_by_user_id`, `voided_at`, `void_reason`). Voided adjustments are instantly excluded from running balance projections.
- **Acceptance Criteria:**
  - *AC-13.1:* Adjustments enforce entry types `ADVANCE`, `DEDUCTION`, `CREDIT` with valid category constraints, positive integer paise amounts (`amount_paise > 0`), mandatory reason, and atomic `ADJ-YYYYMMDD-000001` reference sequence.
  - *AC-13.2:* Voiding an adjustment marks `status = 'VOIDED'`, logs `FARMER_ADJUSTMENT_VOIDED` to `audit_logs`, and immediately updates the computed ledger running balance without deleting database records.

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
