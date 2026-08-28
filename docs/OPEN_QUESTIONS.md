# Open Business Questions & Unresolved Inputs
## Dairy Management System — Offline Desktop Application
### (अनुत्तरित व्यवसाय प्रश्न व आवश्यक माहिती यादी)

---

## 📌 Overview

This document catalogs unresolved business parameters, domain data, and hardware specifications required from the dairy business owner and pilot stakeholders prior to finalizing rate plans, rounding rules, validation thresholds, printed number formats, and pilot deployment.

> **Governance Notice:** Per [AGENTS.md](../AGENTS.md) and [DECISIONS.md](DECISIONS.md#adr-006-owner-approved-pricing-strategy--zero-rate-fabrication-policy), no developer or AI agent may invent, fabricate, or assume values for these parameters. Actual figures must be provided by the dairy owner or authorized stakeholder.

---

## ❓ Open Business Questions Matrix

| # | Domain / Feature Area | Unresolved Business Question | Impact on System | Recommended Provisional Default | Status |
|---|---|---|---|---|---|
| **1** | **Cow Milk Pricing** | What is the actual, active FAT/SNF rate chart for Cow Milk (गाय दूध दरपत्रक) used by the pilot collection centre? | Rate engine cannot calculate live cow milk amounts without the official table. | Block calculation with explicit missing rate error until owner enters official rate chart. | 🔴 **Pending Owner Input** |
| **2** | **Buffalo Milk Pricing** | What is the actual, active FAT/SNF rate chart for Buffalo Milk (म्हैस दूध दरपत्रक) used by the pilot collection centre? | Rate engine cannot calculate live buffalo milk amounts without the official table. | Block calculation with explicit missing rate error until owner enters official rate chart. | 🔴 **Pending Owner Input** |
| **3** | **Pricing Strategy Method** | Does the dairy use an **exact discrete matrix** (e.g., in steps of 0.1% FAT and 0.1% SNF), **step bands** (e.g., FAT 3.5–3.7%), or a **mathematical formula** (e.g., Fat Rate + SNF Rate)? | Dictates the data entry layout and storage structure of `rate_chart_entries` in Stage 5. | Strategy selection marked **UNRESOLVED**. | 🟡 **Needs Verification** |
| **4** | **Rounding Method & Aggregation** | 1. Does the dairy round each collection to the nearest paise using `ROUND_HALF_UP`, truncate fractional paise, or use another manual rule?<br>2. Are weekly totals calculated by summing already-rounded collection amounts or by rounding after aggregation? | Dictates exact integer paise arithmetic in calculation and settlement engines. Stage 5 calculation engine remains blocked until confirmed. | `ROUND_HALF_UP` per collection entry (provisional default only, not accepted rule). | 🟡 **Needs Verification** |
| **5** | **Quality & Quantity Bounds** | What are the absolute hard minimum and maximum allowable bounds for Milk Quantity (L), FAT (%), and SNF (%) for Cow and Buffalo milk? | Prevents operator typo errors (e.g., entering FAT=45 instead of 4.5) without hardcoding unverified bounds. | **Proposed Examples (Awaiting Confirmation):**<br>• Cow FAT: $2.5\% - 6.0\%$<br>• Cow SNF: $7.5\% - 9.5\%$<br>• Buffalo FAT: $5.0\% - 12.0\%$<br>• Buffalo SNF: $8.0\% - 10.5\%$<br>• Qty: $0.1\text{ L} - 100.0\text{ L}$ | 🟡 **Needs Confirmation** |
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

1. **Rate Charts & Pricing Method:** Provide printout or photo of the active Cow Rate Chart and Buffalo Rate Chart, along with explanation of whether exact grid, bands, or formulas are used.
2. **Rounding Rule & Sample Calculation:** Provide 3 sample milk delivery calculations with manual rounding steps, and 1 sample weekly farmer settlement.
3. **Sample Bill & Numbering Preference:** Provide one copy of a previous week's handwritten or printed farmer bill, along with preferred receipt/statement number formats.
4. **Hardware Details:** Provide the Windows version, screen resolution, and printer model connected to the counter PC.
5. **Deduction List:** List all standard deductions applied to farmers' weekly milk bills.
