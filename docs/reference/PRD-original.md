# Product Requirements Document (PRD)
## Dairy Management System — Offline Desktop Application

**Version:** 1.0
**Owner:** Rohan Rajendra Pawar
**Target Stack:** Angular + Electron + SQLite

---

## 1. Problem Statement

Small dairy/milk collection centers in rural and semi-urban Maharashtra currently manage farmer records, daily milk collection, FAT/SNF-based rate calculation, billing, and payments manually on paper or in WhatsApp/Excel. This causes:
- Calculation errors in FAT/SNF-based pricing
- Lost or damaged records
- No historical reporting for the business owner
- Slow, error-prone bill generation and payment tracking

## 2. Goal

Build a **fully offline-first desktop application** that digitizes the entire daily workflow of a small dairy/milk collection center, sellable as a one-time-license product to individual dairy owners/cooperatives.

## 3. Target Users

- **Primary buyer/user:** Dairy/milk collection center owner (non-technical, Marathi-speaking, low tech literacy)
- **Secondary user:** Data entry operator at the collection center

## 4. Non-Negotiable Constraints

| Constraint | Reason |
|---|---|
| Must work 100% offline | Target areas have unreliable/no internet |
| All data stored locally | No dependency on external servers for core function |
| Marathi (or bilingual Marathi/English) UI | Primary users are not comfortable in English |
| Simple, large-button UI | Low tech literacy of end users |
| Local backup/restore | Data loss is the #1 fear of this user segment |

## 5. Feature Modules (from competitor reference)

### MVP (Phase 1) — must ship first
1. **Farmer/Member Management**
   - Add/edit/deactivate farmer, unique member ID, name, contact, bank/UPI (optional)
2. **Milk Collection Entry**
   - Morning & evening shift entry per farmer: date, shift, FAT%, SNF%, quantity (liters)
   - Auto-calculate amount using rate chart
3. **Rate Chart Management**
   - Owner-configurable FAT/SNF → price table (this is the core business logic)
4. **Basic Ledger**
   - Per-farmer running balance (total milk given, total amount owed/paid)
5. **Daily/Basic Report**
   - Today's total collection, total amount, per-farmer breakdown

### Phase 2 — after MVP validated with real dairy
6. **Billing**
   - Auto-generate periodic bills (weekly/monthly) per farmer, PDF export/print
7. **Payment Tracking**
   - Record payments against bills, pending vs completed status
8. **Backup & Restore**
   - Manual + scheduled local backup to file (and optionally external drive/USB)
9. **Dashboard**
   - Summary cards: today's collection (L), today's revenue, pending payments, total active members

### Phase 3 — differentiation / upsell later
10. Multi-user login with roles (owner vs operator)
11. Data export to Excel
12. Multi-center support (for cooperatives with branches)
13. Cloud sync/backup as a paid add-on (optional, opt-in only)

## 6. User Stories (MVP)

- As a dairy owner, I want to add a new farmer with their details so I can start recording their milk collection.
- As an operator, I want to enter FAT%, SNF%, and quantity for a farmer during morning/evening collection so the amount is calculated automatically without manual math.
- As a dairy owner, I want to define/edit my own FAT/SNF rate chart so the software matches my actual pricing policy.
- As a dairy owner, I want to see each farmer's running balance so I know how much I owe them.
- As a dairy owner, I want a daily summary so I know today's total milk collected and total payable amount.
- As a dairy owner, I want the app to work without internet so I'm never blocked from recording collection.

## 7. Success Metrics

- MVP successfully used for 30 consecutive days by 1 pilot dairy without data loss
- FAT/SNF calculation output matches the pilot dairy's manual calculation with 100% accuracy
- Data entry for one farmer's collection takes under 15 seconds
- Zero data loss across app restarts/crashes (backup/restore tested)

## 8. Out of Scope (for now)

- Mobile app version
- Cloud-hosted multi-tenant SaaS
- Payment gateway integration (UPI auto-collection)
- SMS/WhatsApp notifications to farmers

## 9. Monetization

- One-time license fee per installation (₹15,000–₹40,000 depending on features/support)
- Optional yearly AMC (Annual Maintenance Contract) for updates/support
- Phase 3 features (cloud sync, multi-center) sold as paid add-ons later
