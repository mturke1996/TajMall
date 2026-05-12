# Fluxen — Architecture Notes

## 1. From 239 Excel sheets to 1 normalised schema

The legacy workbook had this repeating monthly pattern:

| Excel sheet group | Per-month variants | Maps to (DB) |
|------------------|--------------------|--------------|
| `Rca1..12`       | Cash revenue/expense ledger for month N | `Transaction(kind=REVENUE\|EXPENSE, method=CASH)` |
| `Rch1..12`       | Cheque inflow for month N (per bank) | `Transaction(method=CHEQUE)` |
| `RWch1..12`, `RIch1..12` | Cheques against Wahda / Libyan-Islamic banks | `Transaction.cashbox_id` |
| `Rc1..12`        | Combined ledger with running balance | computed view |
| `FRca, FRch...`  | Final monthly summaries | aggregate queries |
| `PP1..12`        | Monthly journal entries (مدين/دائن) | `JournalEntry + JournalLine` |
| `PPA1..12`       | Payment vouchers (إذن صرف) | `Voucher + VoucherLine` |
| `PPj, PPjD…`     | Journal/voucher print templates | PDF generators |
| `YPFR, YFR, YJFR, YFRPr, YFRjPr` | Yearly trial balance, P&L, reports | `/reports/*` pages |

By denormalising into `Transaction`, `JournalEntry`, `Voucher` tables, the system reduces 239 sheets to ~5 core query patterns.

## 2. Domain model

```
Organization
 ├── Branch (1..n)
 │    └── Cashbox (1..n)
 │         └── Transaction (1..n)
 │              ├── Category (FK)
 │              ├── Customer/Vendor (optional FK)
 │              └── Attachment (0..n)
 ├── User (1..n)
 │    └── Role (m..n via UserRole)
 │         └── Permission (m..n via RolePermission)
 ├── AccountCategory (1..n, hierarchical)
 ├── JournalEntry (1..n)
 │    └── JournalLine (1..n)  — balanced (Σdebit = Σcredit)
 ├── Voucher (1..n)
 │    ├── VoucherLine (1..n)
 │    └── Attachment (0..n)
 └── AuditLog, Notification, Setting
```

## 3. UI architecture

- **App Router** with route groups: `(auth)` for login/signup, `(app)` for authed shell.
- **Server Components by default**. Client Components only when needed (forms, charts with Recharts, framer-motion, command palette).
- **Streaming-ready**: `loading.tsx` boundaries planned per route segment.
- **Editorial design tokens** centralised in `tailwind.config.ts` and `globals.css`.
- **Component library** built locally (not pulled from `npx shadcn`) so it stays light and on-brand.

## 4. Data access

- **Prisma** for type-safe queries.
- **TanStack Query** for client-side caching and optimistic updates.
- **Server Actions** for mutations where appropriate (forms, status changes).

## 5. Auth & RBAC

- **Supabase Auth** issues the session (`auth.users`); we mirror to `users` table linked by `authUserId`.
- **Middleware** at `src/middleware.ts` enforces session presence.
- **RBAC** evaluated per route — permission keys are flat strings (`revenue.create`, `journal.post`...) for fast lookups.
- **Row Level Security** policies (defined in Supabase) scope all reads/writes to the requesting user's `organization_id`.

## 6. Performance

- Tabular numerals + monospaced reference numbers prevent layout shift.
- Recharts disabled animations for empty data; animations on entry only.
- Static page shells (`metadata`, `<head>`) cached via Next 14's defaults.
- Database query patterns:
  - `transactions` indexed on `(organization_id, tx_date)` and `(cashbox_id)`.
  - `journal_entries` indexed on `(organization_id, entry_date)`.
  - Avoid N+1 with explicit `include`.

## 7. Reporting

Each report is a single SQL aggregation:

- **Trial Balance**: `SUM(debit), SUM(credit) GROUP BY category_id` over the period.
- **Profit & Loss**: `SUM(amount) WHERE kind=REVENUE` vs `WHERE kind=EXPENSE`, grouped by category.
- **Cash Flow**: monthly aggregation grouped by `cashbox_kind`.

Reports are exportable to PDF via `@react-pdf/renderer` using the bundled Arabic-aware reshaping module (port of the legacy implementation).

## 8. Multi-tenancy

- Every domain table includes `organization_id`.
- Supabase RLS policies enforce `auth.uid()` → `users.organization_id` scoping.
- Onboarding creates a fresh `Organization` + default `Role`s + a `Branch` flagged `isHQ`.

## 9. Keep-alive

`/api/keepalive` runs once every 6 hours on Vercel Cron:
- Authenticates the caller (Vercel UA or `KEEPALIVE_SECRET`).
- Performs `SELECT 1` against Postgres.
- Returns 200 with latency.

This stays under Supabase's free-tier inactivity cutoff without burning compute.
