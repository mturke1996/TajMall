/**
 * The owner's monthly report: what came in and went out, how rent collection went, who owes, where
 * the money sits, and — for the current month — how full the mall is and which leases need a decision.
 * Everything here is arithmetic on rows already read; the screen and the PDF print the same object.
 *
 * Money is counted on the cash basis the dashboard uses (posted and reconciled transactions in the
 * month). Tenant deposits and other balance-sheet movements are kept out of income and expense and
 * shown on their own line: a deposit received is owed back, it is not earned.
 */
import type { ContractExpiry } from '@/lib/contract-expiry';
import type { MallOccupancy } from '@/lib/mall-occupancy';
import { formatMonthKeyAr } from '@/lib/utils';

const COUNTED = new Set(['POSTED', 'RECONCILED']);
const EPS = 0.0005;
const TOP_CATEGORIES = 8;
const TOP_DEBTORS = 10;
export const OTHER_KEY = '__other';

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ── months ──────────────────────────────────────────────────────────────────

/** "2026-01" moved by whole months: "2025-12" for -1. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** First and last day of a month, as "YYYY-MM-DD". */
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  return { start: `${month}-01`, end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

export const isMonthKey = (v: string | null | undefined): v is string => /^\d{4}-(0[1-9]|1[0-2])$/.test(v ?? '');

// ── inputs ──────────────────────────────────────────────────────────────────

export type ReportTx = {
  id: string;
  kind: string;
  status: string;
  amount: number | string;
  tx_date: string;
  category?: { code?: string | null; name_ar?: string | null; type?: string | null } | null;
};

export type ReportRentRow = {
  id: string;
  name: string;
  shop_number: string | null;
  monthly_rent?: string | number | null;
  current_month_amount?: string | number | null;
  current_month_paid: string | number | null;
  current_month_status: string;
};

export type ReportAgingRow = {
  tenant_id: string;
  tenant_name: string;
  shop_number: string | null;
  phone?: string | null;
  total_outstanding: number | string;
  bucket_current?: number | string;
  bucket_30?: number | string;
  bucket_60?: number | string;
  bucket_90_plus?: number | string;
};

export type ReportLedgerRow = {
  event_date: string;
  signed_amount: number | string;
  balance_after: number | string;
  source_type: string;
};

export type ReportCashbox = {
  id: string;
  name_ar: string;
  kind: string;
  opening_balance: number | string;
  /** newest first, as the ledger function returns them */
  rows: ReportLedgerRow[];
};

export type MonthlyReportInput = {
  /** "YYYY-MM" */
  month: string;
  /** "YYYY-MM-DD", today */
  today: string;
  /** the month and the one before it; any other rows are ignored */
  transactions: ReportTx[];
  /** tenant_rent_summary_for_month for the month and the one before; null when it could not be read */
  rent: ReportRentRow[] | null;
  rentPrev: ReportRentRow[] | null;
  /** get_tenant_ar_aging as of the end of the month (or today); null when it could not be read */
  aging: ReportAgingRow[] | null;
  cashboxes: ReportCashbox[] | null;
  /** today's picture of the mall; only used when the report is for the current month */
  occupancy: MallOccupancy | null;
  expiry: ContractExpiry | null;
};

// ── outputs ─────────────────────────────────────────────────────────────────

export type Change = { amount: number; pct: number | null };

export type CategoryRow = {
  key: string;
  name: string;
  amount: number;
  /** share of the total, 0–100 */
  share: number;
  prev: number;
  change: Change;
};

export type RentMonth = {
  due: number;
  collected: number;
  remaining: number;
  /** collected ÷ due, 0–100 */
  rate: number;
  tenants: { paidFull: number; partial: number; unpaid: number; exempt: number; noRent: number };
};

export type CashboxMonth = {
  id: string;
  name: string;
  kind: string;
  opening: number;
  /** money in and out, transfers between boxes left out */
  inflow: number;
  outflow: number;
  /** transfers in minus transfers out */
  transfersNet: number;
  closing: number;
  /** opening + inflow − outflow + transfers = closing */
  reconciles: boolean;
};

export type MonthlyReport = {
  month: string;
  monthLabel: string;
  prevMonth: string;
  prevMonthLabel: string;
  start: string;
  end: string;
  /** the end of the month, or today when the month is not over */
  asOf: string;
  isCurrentMonth: boolean;
  issuedOn: string;
  cash: {
    revenue: number;
    expense: number;
    net: number;
    prev: { revenue: number; expense: number; net: number };
    change: { revenue: Change; expense: Change; net: Change };
    /** tenant deposits and other balance-sheet movements: received and paid back */
    depositsReceived: number;
    depositsPaid: number;
    /** drafts dated in the month: not in any figure */
    draftCount: number;
  };
  revenueRows: CategoryRow[];
  expenseRows: CategoryRow[];
  rent: (RentMonth & { prev: RentMonth | null; rateChange: number | null }) | null;
  arrears: {
    total: number;
    tenants: number;
    buckets: { current: number; d30: number; d60: number; d90: number };
    top: { tenantId: string; name: string; shop: string | null; phone: string | null; amount: number }[];
  } | null;
  cashboxes: { rows: CashboxMonth[]; totals: Omit<CashboxMonth, 'id' | 'name' | 'kind' | 'reconciles'> } | null;
  /** today's mall: only in the report for the current month */
  mall: {
    rate: number;
    rented: number;
    vacant: number;
    reserved: number;
    maintenance: number;
    rentRoll: number;
    longVacant: number;
    flagged: number;
    expiry: {
      expired: number;
      within30: number;
      within60: number;
      within90: number;
      total: number;
      rentAtRisk: number;
      next: { tenantName: string; unitNumber: string | null; endDate: string; daysLeft: number }[];
    };
  } | null;
};

// ── arithmetic ──────────────────────────────────────────────────────────────

export function change(current: number, previous: number): Change {
  return {
    amount: round3(current - previous),
    pct: Math.abs(previous) > EPS ? round1(((current - previous) / Math.abs(previous)) * 100) : null,
  };
}

const monthOf = (iso: string) => iso.slice(0, 7);

/** Operating money of one month: revenue, expense, and the deposits kept apart. */
function cashOf(transactions: ReportTx[], month: string) {
  let revenue = 0;
  let expense = 0;
  let depositsReceived = 0;
  let depositsPaid = 0;
  let draftCount = 0;
  const revenueByCat = new Map<string, { name: string; amount: number }>();
  const expenseByCat = new Map<string, { name: string; amount: number }>();

  for (const t of transactions) {
    if (monthOf(t.tx_date) !== month) continue;
    if (t.kind !== 'REVENUE' && t.kind !== 'EXPENSE') continue;
    if (t.status === 'DRAFT') {
      draftCount += 1;
      continue;
    }
    if (!COUNTED.has(t.status)) continue;
    const amount = num(t.amount);
    const type = t.category?.type ?? null;
    // a deposit, a loan or capital is not earned or spent
    const operating = type == null || type === 'REVENUE' || type === 'EXPENSE';
    if (!operating) {
      if (t.kind === 'REVENUE') depositsReceived += amount;
      else depositsPaid += amount;
      continue;
    }
    const key = t.category?.code ?? t.category?.name_ar ?? '—';
    const name = t.category?.name_ar ?? 'بدون بند';
    const bucket = t.kind === 'REVENUE' ? revenueByCat : expenseByCat;
    const row = bucket.get(key) ?? { name, amount: 0 };
    row.amount += amount;
    bucket.set(key, row);
    if (t.kind === 'REVENUE') revenue += amount;
    else expense += amount;
  }
  return {
    revenue: round3(revenue),
    expense: round3(expense),
    depositsReceived: round3(depositsReceived),
    depositsPaid: round3(depositsPaid),
    draftCount,
    revenueByCat,
    expenseByCat,
  };
}

/** The biggest categories, the rest folded into one row, each compared with the month before. */
function categoryRows(
  current: Map<string, { name: string; amount: number }>,
  previous: Map<string, { name: string; amount: number }>,
): CategoryRow[] {
  const total = [...current.values()].reduce((s, r) => s + r.amount, 0);
  const rows = [...current.entries()]
    .map(([key, r]) => ({ key, name: r.name, amount: round3(r.amount), prev: round3(previous.get(key)?.amount ?? 0) }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'ar'));
  const head = rows.slice(0, TOP_CATEGORIES);
  const tail = rows.slice(TOP_CATEGORIES);
  if (tail.length > 0) {
    head.push({
      key: OTHER_KEY,
      name: 'أخرى',
      amount: round3(tail.reduce((s, r) => s + r.amount, 0)),
      prev: round3(tail.reduce((s, r) => s + r.prev, 0)),
    });
  }
  return head.map((r) => ({
    ...r,
    share: total > EPS ? round1((r.amount / total) * 100) : 0,
    change: change(r.amount, r.prev),
  }));
}

function rentOf(rows: ReportRentRow[]): RentMonth {
  const out: RentMonth = { due: 0, collected: 0, remaining: 0, rate: 0, tenants: { paidFull: 0, partial: 0, unpaid: 0, exempt: 0, noRent: 0 } };
  for (const r of rows) {
    const status = r.current_month_status;
    if (status === 'exempt') {
      out.tenants.exempt += 1;
      continue;
    }
    if (status === 'no_rent_set') {
      out.tenants.noRent += 1;
      continue;
    }
    const amount = num(r.current_month_amount) || num(r.monthly_rent);
    // a month the database calls fully paid is paid in full, as the tenant's own calendar shows it, even when
    // the amount recorded on it is short of the rent (a charge marked paid after a price change); otherwise
    // the report would list money as remaining from tenants it counts as paid in full
    const paid = status === 'paid_full' ? Math.max(num(r.current_month_paid), amount) : num(r.current_month_paid);
    out.due += amount;
    out.collected += paid;
    out.remaining += Math.max(amount - paid, 0);
    if (status === 'paid_full') out.tenants.paidFull += 1;
    else if (status === 'paid_partial') out.tenants.partial += 1;
    else out.tenants.unpaid += 1;
  }
  return {
    ...out,
    due: round3(out.due),
    collected: round3(out.collected),
    remaining: round3(out.remaining),
    rate: out.due > EPS ? round1(Math.min((out.collected / out.due) * 100, 100)) : 0,
  };
}

function cashboxOf(box: ReportCashbox, start: string, end: string): CashboxMonth {
  const day = (r: ReportLedgerRow) => String(r.event_date).slice(0, 10);
  const base = num(box.opening_balance);
  // rows come newest first, so the first match is the latest movement up to that day
  const closing = num(box.rows.find((r) => day(r) <= end)?.balance_after ?? base);
  const opening = num(box.rows.find((r) => day(r) < start)?.balance_after ?? base);
  let inflow = 0;
  let outflow = 0;
  let transfers = 0;
  for (const r of box.rows) {
    const d = day(r);
    if (d < start || d > end) continue;
    const amount = num(r.signed_amount);
    if (r.source_type === 'cash_transfer') transfers += amount;
    else if (amount >= 0) inflow += amount;
    else outflow += -amount;
  }
  return {
    id: box.id,
    name: box.name_ar,
    kind: box.kind,
    opening: round3(opening),
    inflow: round3(inflow),
    outflow: round3(outflow),
    transfersNet: round3(transfers),
    closing: round3(closing),
    reconciles: Math.abs(opening + inflow - outflow + transfers - closing) < 0.01,
  };
}

export function buildMonthlyReport(input: MonthlyReportInput): MonthlyReport {
  const { month, today } = input;
  const prevMonth = shiftMonth(month, -1);
  const { start, end } = monthBounds(month);
  const isCurrentMonth = monthOf(today) === month;

  const now = cashOf(input.transactions, month);
  const before = cashOf(input.transactions, prevMonth);
  const net = round3(now.revenue - now.expense);
  const prevNet = round3(before.revenue - before.expense);

  const rent = input.rent ? rentOf(input.rent) : null;
  const rentPrev = input.rentPrev ? rentOf(input.rentPrev) : null;

  let arrears: MonthlyReport['arrears'] = null;
  if (input.aging) {
    // The aging function lists what is open now and files rent that has not fallen due as of its date under
    // "current". For a month that is over, the report is "until its last day": rent that fell due afterwards
    // did not exist then, so it is left out (what was paid after the month still cannot be added back).
    const monthOver = end < today;
    const rows = input.aging
      .map((r) => ({ r, owed: Math.max(num(r.total_outstanding) - (monthOver ? num(r.bucket_current) : 0), 0) }))
      .filter((x) => x.owed > EPS);
    const sum = (f: (x: { r: ReportAgingRow; owed: number }) => unknown) => round3(rows.reduce((s, x) => s + num(f(x)), 0));
    arrears = {
      total: sum((x) => x.owed),
      tenants: rows.length,
      buckets: {
        current: monthOver ? 0 : sum((x) => x.r.bucket_current),
        d30: sum((x) => x.r.bucket_30),
        d60: sum((x) => x.r.bucket_60),
        d90: sum((x) => x.r.bucket_90_plus),
      },
      top: rows
        .slice()
        .sort((a, b) => b.owed - a.owed || a.r.tenant_name.localeCompare(b.r.tenant_name, 'ar'))
        .slice(0, TOP_DEBTORS)
        .map(({ r, owed }) => ({ tenantId: r.tenant_id, name: r.tenant_name, shop: r.shop_number, phone: r.phone ?? null, amount: round3(owed) })),
    };
  }

  let cashboxes: MonthlyReport['cashboxes'] = null;
  if (input.cashboxes) {
    const rows = input.cashboxes.map((b) => cashboxOf(b, start, end));
    const sum = (f: (r: CashboxMonth) => number) => round3(rows.reduce((s, r) => s + f(r), 0));
    cashboxes = {
      rows,
      totals: { opening: sum((r) => r.opening), inflow: sum((r) => r.inflow), outflow: sum((r) => r.outflow), transfersNet: sum((r) => r.transfersNet), closing: sum((r) => r.closing) },
    };
  }

  const mall =
    isCurrentMonth && input.occupancy && input.expiry
      ? {
          rate: input.occupancy.totals.rate,
          rented: input.occupancy.totals.rented,
          vacant: input.occupancy.totals.vacant,
          reserved: input.occupancy.totals.reserved,
          maintenance: input.occupancy.totals.maintenance,
          rentRoll: input.occupancy.totals.rentRoll,
          longVacant: input.occupancy.longVacant.length,
          flagged: input.occupancy.flagged.length,
          expiry: {
            ...input.expiry.counts,
            total: input.expiry.total,
            rentAtRisk: input.expiry.monthlyRentAtRisk,
            next: input.expiry.items.slice(0, 6).map((i) => ({ tenantName: i.tenantName, unitNumber: i.unitNumber, endDate: i.endDate, daysLeft: i.daysLeft })),
          },
        }
      : null;

  return {
    month,
    monthLabel: formatMonthKeyAr(month),
    prevMonth,
    prevMonthLabel: formatMonthKeyAr(prevMonth),
    start,
    end,
    asOf: end > today ? today : end,
    isCurrentMonth,
    issuedOn: today,
    cash: {
      revenue: now.revenue,
      expense: now.expense,
      net,
      prev: { revenue: before.revenue, expense: before.expense, net: prevNet },
      change: { revenue: change(now.revenue, before.revenue), expense: change(now.expense, before.expense), net: change(net, prevNet) },
      depositsReceived: now.depositsReceived,
      depositsPaid: now.depositsPaid,
      draftCount: now.draftCount,
    },
    revenueRows: categoryRows(now.revenueByCat, before.revenueByCat),
    expenseRows: categoryRows(now.expenseByCat, before.expenseByCat),
    rent: rent ? { ...rent, prev: rentPrev, rateChange: rentPrev && rentPrev.due > EPS ? round1(rent.rate - rentPrev.rate) : null } : null,
    arrears,
    cashboxes,
    mall,
  };
}
