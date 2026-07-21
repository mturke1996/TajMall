# Vendors & Customers Sitewide Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make VENDOR and CUSTOMER first-class across Fluxen entry points, money flows, vouchers, phone/WhatsApp, service categories, and party reports.

**Architecture:** Keep unified `contacts` table. Fix routing/nav, strengthen transaction dialog defaults/filters, add optional `disbursement_vouchers.contact_id`, reuse `whatsapp.ts` for all parties, aggregate transactions client-side for vendor-spend / customer-revenue reports, and never require tenant_charges for walk-in service revenue.

**Tech Stack:** Next.js 14, Supabase/Postgres, React Query, TypeScript, existing mall routes + report-period helpers.

**Spec:** `docs/superpowers/specs/2026-07-21-vendors-customers-sitewide-linking-design.md`

**Note:** Do not commit unless the user asks. Verify with `npx tsc --noEmit` and a small verify script for pure helpers.

---

### Task 1: Entry points — customers redirect, legacy map, nav

**Files:**
- Modify: `src/app/(app)/customers/page.tsx` (replace stub with vendors-style redirect)
- Modify: `src/lib/mall/routes.ts` — add `'/customers': 'CUSTOMER'` to `LEGACY_PEOPLE_SEGMENT`
- Modify: `src/components/layout/nav-items.ts` — add «العملاء» item after الموردين

- [x] **Step 1:** Replace customers page with client redirect to `peopleSegmentHref('CUSTOMER', { add: 'CUSTOMER' })` mirroring vendors page.
- [x] **Step 2:** Update `LEGACY_PEOPLE_SEGMENT` and nav item (`href: '/mall?tab=people&segment=CUSTOMER'`, icon `Store` or `Coins`, permission `revenue.view`).
- [x] **Step 3:** Smoke: open `/customers` in running dev server → lands on people CUSTOMER segment.

### Task 2: Pure helpers — party contact kinds + service category codes

**Files:**
- Create: `src/lib/party-contacts.ts`
- Create: `scripts/verify-party-contacts.mjs`

Helpers:
- `CUSTOMER_SERVICE_REVENUE_CODES` = REV-PRK, REV-SVC, REV-ADV, REV-KSK, REV-EVT, REV-LIC, REV-PEN
- `VENDOR_SERVICE_EXPENSE_CODES` = EXP-MNT, EXP-CLN, EXP-SEC, EXP-EQP, EXP-MAT
- `suggestedContactKindForTx(kind, categoryCode)` → VENDOR | CUSTOMER | TENANT | ALL
- `contactKindLabelAr(kind)`
- `aggregatePartyTotals(rows)` for reports

- [x] **Step 1:** Implement helpers.
- [x] **Step 2:** Verify script asserts suggestions and aggregation.
- [x] **Step 3:** Run `node scripts/verify-party-contacts.mjs` — expect exit 0.

### Task 3: Transaction dialog — filters, defaults, toasts, service hints

**Files:**
- Modify: `src/components/transactions/new-transaction-dialog.tsx`

- [ ] Add VENDOR + CUSTOMER filter chips with Arabic labels.
- [ ] On open / kind change / category change: set `contactKind` via `suggestedContactKindForTx` (rent→TENANT, service revenue→CUSTOMER, vendor expense→VENDOR; else keep ALL for revenue or VENDOR for expense).
- [ ] Quick-create toast: «تم إضافة المورد» / «تم إضافة العميل» / etc. matching kind.
- [ ] Optional helper text when service category selected without requiring contact.

### Task 4: Phone + WhatsApp on contact detail & directory

**Files:**
- Modify: `src/lib/whatsapp.ts` — add `buildTelLink`, `buildContactWhatsAppMessage`
- Create: `src/components/contacts/contact-phone-actions.tsx`
- Modify: `src/components/contacts/other-contact-detail-body.tsx` — use actions
- Modify: `src/components/contacts/contacts-directory.tsx` — compact actions on phone cell (desktop)

### Task 5: Vouchers — migration + types + create UI

**Files:**
- Create: `supabase/migrations/060_voucher_contact_id.sql`
- Create: `scripts/apply-migration-060.mjs` (pattern of 059)
- Modify: `src/lib/db/types.ts` — `contact_id` on row + save input
- Modify: `src/lib/db/queries.ts` — persist `contact_id`
- Modify: `src/app/(app)/vouchers/new/page.tsx` — vendor picker fills payee
- Modify: `src/lib/voucher-draft.ts` — optional contactId in draft

Migration SQL:
```sql
ALTER TABLE public.disbursement_vouchers
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_disbursement_vouchers_contact
  ON public.disbursement_vouchers (contact_id)
  WHERE contact_id IS NOT NULL;
```

Apply with `node scripts/apply-migration-060.mjs`.

### Task 6: Reports — vendor spend + customer revenue

**Files:**
- Create: `src/lib/db/party-report-queries.ts` — fetch txs in period with contact
- Create: `src/app/(app)/reports/vendor-spend/page.tsx`
- Create: `src/app/(app)/reports/customer-revenue/page.tsx`
- Modify: `src/app/(app)/reports/page.tsx` — cards
- Modify: `src/components/layout/nav-items.ts` + `src/lib/accounting-nav.ts`

Use `parseReportPeriod` / `reportPeriodDateRange`. Aggregate by contact for EXPENSE+VENDOR and REVENUE+CUSTOMER.

### Task 7: Contact detail summary polish

**Files:**
- Modify: `src/components/contacts/other-contact-detail-body.tsx`
- Add net balance tile (revenue − expense) for non-tenants; links to `/transactions` with query if supported, else keep tabs.

### Task 8: Verification

- [x] `node scripts/verify-party-contacts.mjs`
- [x] `npm run typecheck`
- [x] Manual smoke checklist from spec acceptance criteria
- [x] Confirm migration 060 applied (column exists)

---

## Spec coverage checklist

| Spec item | Task |
|---|---|
| /customers redirect + legacy + nav | 1 |
| Tx filters/defaults/toasts | 3 |
| Voucher contact_id | 5 |
| Phone/WhatsApp | 4 |
| Service revenue without lease | 2+3 |
| Vendor expense suggestion | 2+3 |
| Vendor/customer reports | 6 |
| Contact detail summary | 7 |
| Verification | 8 |
