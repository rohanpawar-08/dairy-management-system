# Open Business Questions & Unresolved Inputs
## Dairy Management System — Offline Desktop Application
### (अनुत्तरित व्यवसाय प्रश्न व आवश्यक माहिती यादी)

---

## 📌 Overview

This document catalogs unresolved business parameters, domain data, and hardware specifications required from the dairy business owner and pilot stakeholders prior to finalizing production rates, validation thresholds, printed number formats, and pilot deployment.

> **Governance Notice:** Per [AGENTS.md](../AGENTS.md) and [DECISIONS.md](DECISIONS.md#adr-006-owner-approved-pricing-strategy--zero-rate-fabrication-policy), no developer or AI agent may invent, fabricate, or assume values for these parameters. Actual figures must be provided by the dairy owner or authorized stakeholder.

---

## 🟢 Confirmed & Resolved Architectural Decisions (Stage 5)

1. **Pricing Strategy Method:** Confirmed `FORMULA` strategy.
2. **Pricing Basis:** Confirmed `PER_PERCENT_POINT_PER_LITRE` basis.
3. **Rounding Mode:** Confirmed `ROUND_HALF_UP` on rate numerator and collection amount with exact integer paise arithmetic.
4. **Rate Management:** Owner-only versioned effective-date plans with draft $\rightarrow$ approve $\rightarrow$ clone $\rightarrow$ supersede lifecycle, SQLite overlap prevention triggers, and zero hard deletes.

> ⚠️ **Test Fixtures Notice:** The sample figures used in test fixtures (e.g. Cow FAT ₹8.50 / SNF ₹3.00, Buffalo FAT ₹9.00 / SNF ₹3.00) are automated test fixtures ONLY. They are not approved production rates. A clean production installation initializes with exactly zero rate plans.

---

## ❓ Open Business Questions Matrix (Unresolved Pilot Parameters)

| # | Domain / Feature Area | Unresolved Business Question | Impact on System | Recommended Provisional Default | Status |
|---|---|---|---|---|---|
| **1** | **Production Cow Rate Coefficients** | What are the actual, active production FAT and SNF rate coefficients (₹/point) for Cow Milk (गाय दूध दर) to be configured by the pilot Owner? | Rate engine cannot calculate live cow milk amounts until the dairy Owner enters and approves the official plan. | System boots with zero rate plans. Calculation is blocked until Owner configures and approves official plan. | 🔴 **Pending Owner Input** |
| **2** | **Production Buffalo Rate Coefficients** | What are the actual, active production FAT and SNF rate coefficients (₹/point) for Buffalo Milk (म्हैस दूध दर) to be configured by the pilot Owner? | Rate engine cannot calculate live buffalo milk amounts until the dairy Owner enters and approves the official plan. | System boots with zero rate plans. Calculation is blocked until Owner configures and approves official plan. | 🔴 **Pending Owner Input** |
| **3** | **Pilot Quality Minimums & Maximums** | What are the absolute hard minimum and maximum allowable bounds for Milk Quantity (L), FAT (%), and SNF (%) for Cow and Buffalo milk at the pilot centre? | Rejects operator typo errors during shift collection. | Configurable per rate plan in UI. | 🟡 **Needs Confirmation** |
| **4** | **Pilot Step Increments** | What are the allowed FAT and SNF step increments (e.g., 0.10% vs 0.05%) at the pilot centre? | Enforces exact step alignment without silent interpolation. | Configurable per rate plan (0.10% default). | 🟡 **Needs Confirmation** |
| **5** | **Verified Real Pilot Dairy Bills** | Provide 3 verified manual delivery calculations and 1 sample weekly farmer settlement bill from the pilot dairy. | Validates zero float drift against real dairy accounting records. | Test fixtures verified against formula specifications. | 🟡 **Needs Verification** |
| **6** | **Multiple Deliveries per Shift** | Does the dairy permit a farmer to make multiple deliveries of the *same* milk type in the *same* shift (e.g., bringing two separate cans at different times)? | Dictates whether duplicate deliveries are permanently restricted or handled via operator warning prompts. | High-visibility warning dialog with explicit operator confirmation and audit logging. | 🟡 **Needs Confirmation** |
| **7** | **Weekly Settlement Cycle** | Does the pilot dairy strictly follow **Monday to Sunday**, or a different cycle (e.g., 1st–10th / 11th–20th / 21st–End, or Wednesday–Tuesday)? | Determines the default date range generator for weekly settlement periods. | Configurable in Settings with Monday–Sunday as default. | 🟡 **Needs Confirmation** |
| **8** | **A4 Statement Layout** | Is there an existing sample paper bill or cooperative slip format currently distributed to farmers that the A4 PDF statement should emulate? | Ensures high acceptance and immediate familiarity among pilot farmers. | Standard A4 tabular format with daily rows, itemized deductions, and signature blocks. | 🟡 **Sample Requested** |
| **9** | **Printed Number Formats** | What are the dairy's preferred format conventions for printed collection receipts, payment vouchers, and weekly settlement statements (e.g., simple sequential integers vs date-prefixed alphanumeric codes like `COL-YYYYMMDD-XXXX`)? | Determines collision-safe numbering format in Stages 6 and 8. | Date-prefixed collision-safe codes (`COL-YYYYMMDD-XXXX`, `PAY-YYYYMMDD-XXXX`, `STMT-YYYYMMDD-XXXX`). | 🟡 **Needs Verification** |
| **10** | **Marathi Terminology Review** | Are the proposed Marathi domain terms (*सभासद, संकलन, दरपत्रक, हिशोब, कपात, उचल, पशुखाद्य, बाकी*) aligned with the colloquial dialect of the pilot region? | Eliminates confusion for non-English-speaking operators and farmers. | Standard Maharashtra cooperative dairy glossary implemented. | 🟡 **Review Scheduled** |
| **11** | **Target PC Specifications** | What are the exact hardware specifications of the Windows computer at the pilot collection counter (OS version, RAM, CPU, Display Resolution)? | Sets minimum system performance benchmarks and ensures UI fits standard display resolutions (e.g., 1366x768 vs 1920x1080). | Windows 10/11 64-bit, 4GB RAM minimum, Intel Core i3 / AMD equivalent, 1366x768 display baseline. | 🟡 **Needs Verification** |
| **12** | **Target Printer Model** | What specific printer model (Make/Model) is installed at the pilot centre for printing daily registers and weekly bills? | Validates driver compatibility and margin settings for A4 print spooling. | Standard Windows-compatible A4 laser/inkjet printer using system print dialogue. | 🟡 **Model Info Needed** |
| **13** | **Pilot Deduction Categories** | What specific deduction and adjustment categories must be active during the 30-day pilot (e.g., Cattle Feed, Doctor/Medicine, Advances, Transport, Society Shares)? | Determines which deduction types must be pre-populated in system settings. | `CATTLE_FEED`, `ADVANCE_LOAN`, `VETERINARY_EXPENSE`, `TRANSPORT_CHARGE`, `BONUS`, `MANUAL_ADJUSTMENT`. | 🟡 **Needs Confirmation** |
| **14** | **Portable Backup Encryption** | Should backup files exported to external USB drives be password-encrypted, given that machine-bound encryption keys could prevent restoration on a replacement PC after hardware failure? | Balances data privacy on lost USB drives against offline recovery portability. | Standard unencrypted SQLite backup files with integrity checksums until portable passphrase encryption is approved. | 🟡 **Needs Verification** |

---

## 📋 Input Collection Form for Dairy Owner

When onboarding the pilot dairy centre, provide the following checklist to the dairy owner:

1. **Rate Coefficients & Bounds:** Provide official active Cow FAT/SNF rates and Buffalo FAT/SNF rates, along with allowable quality bounds.
2. **Rounding Rule & Sample Calculation:** Provide 3 sample milk delivery calculations with manual rounding steps, and 1 sample weekly farmer settlement.
3. **Sample Bill & Numbering Preference:** Provide one copy of a previous week's handwritten or printed farmer bill, along with preferred receipt/statement number formats.
4. **Hardware Details:** Provide the Windows version, screen resolution, and printer model connected to the counter PC.
5. **Deduction List:** List all standard deductions applied to farmers' weekly milk bills.
