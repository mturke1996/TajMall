/**
 * What one contact's counted transactions add up to: totals in and out, the last payment, how much a
 * month usually holds, a twelve-month series and the split by account.
 *
 * Money is counted by direction, never by the contact's kind, because the kinds do not tell: a landlord filed
 * under customers is paid, not paying. REVENUE is money in (received from the contact), EXPENSE is money out
 * (paid to the contact). `primaryDirection` says which one a profile should lead with.
 *
 * Only counted transactions (POSTED and RECONCILED) are read. Rows of any other kind (transfers, opening
 * balances, adjustments) are left out of every figure.
 */
import { isCountedTransaction } from '@/lib/contacts/contact-transactions';
import { extractContactBusinessRole } from '@/lib/contacts/contact-roles';
import type { ContactRow } from '@/lib/db/types';
import { todayISODate } from '@/lib/utils';

export type Direction = 'in' | 'out';

export type PartyTx = {
  id: string;
  kind?: string | null;
  status?: string | null;
  amount: string | number | null;
  tx_date: string;
  category?: { id?: string | null; code?: string | null; name_ar?: string | null } | null;
};

export type DatedAmount = { id: string; date: string; amount: number };

export type MonthPoint = { monthKey: string; amount: number; count: number };

export type AccountShare = {
  /** category id, else its code, else a shared key for rows with no category */
  key: string;
  code: string | null;
  name: string;
  total: number;
  count: number;
  /** 0-100, of the direction's total */
  share: number;
  /** the slice that groups the accounts beyond the top ones */
  rest?: boolean;
};

export type DirectionStats = {
  direction: Direction;
  total: number;
  count: number;
  first: DatedAmount | null;
  last: DatedAmount | null;
  /** distinct calendar months with at least one row */
  activeMonths: number;
  /** total divided by the active months; 0 with no rows */
  averagePerActiveMonth: number;
  /** the twelve months ending with `asOf`'s month, oldest first, zeros included */
  series: MonthPoint[];
  /** every account, biggest first */
  accounts: AccountShare[];
};

export type PartyStats = {
  in: DirectionStats;
  out: DirectionStats;
  /** rows that counted, both directions */
  count: number;
  firstDate: string | null;
  lastDate: string | null;
  /** money in minus money out */
  net: number;
};

export const UNCATEGORIZED_NAME = 'بدون بند';

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const amountOf = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthIndex = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;
const keyOfIndex = (i: number) => `${String(Math.floor(i / 12)).padStart(4, '0')}-${String((i % 12) + 1).padStart(2, '0')}`;

export function directionOfKind(kind: string | null | undefined): Direction | null {
  if (kind === 'REVENUE') return 'in';
  if (kind === 'EXPENSE') return 'out';
  return null;
}

function emptyDirection(direction: Direction, months: string[]): DirectionStats {
  return {
    direction,
    total: 0,
    count: 0,
    first: null,
    last: null,
    activeMonths: 0,
    averagePerActiveMonth: 0,
    series: months.map((monthKey) => ({ monthKey, amount: 0, count: 0 })),
    accounts: [],
  };
}

function buildDirection(direction: Direction, rows: readonly { tx: PartyTx; amount: number; date: string }[], months: string[]): DirectionStats {
  const stats = emptyDirection(direction, months);
  if (rows.length === 0) return stats;

  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const toDated = (r: (typeof sorted)[number]): DatedAmount => ({ id: r.tx.id, date: r.date, amount: r.amount });
  const byMonth = new Map(stats.series.map((p) => [p.monthKey, p]));
  const active = new Set<string>();
  const accounts = new Map<string, AccountShare>();

  for (const r of sorted) {
    stats.total += r.amount;
    const month = r.date.slice(0, 7);
    active.add(month);
    const point = byMonth.get(month);
    if (point) {
      point.amount = round3(point.amount + r.amount);
      point.count += 1;
    }
    const cat = r.tx.category;
    const key = cat?.id || cat?.code || '∅';
    const name = cat?.name_ar?.trim() || UNCATEGORIZED_NAME;
    const acc = accounts.get(key) ?? { key, code: cat?.code ?? null, name, total: 0, count: 0, share: 0 };
    acc.total += r.amount;
    acc.count += 1;
    accounts.set(key, acc);
  }

  stats.total = round3(stats.total);
  stats.count = sorted.length;
  stats.first = toDated(sorted[0]);
  stats.last = toDated(sorted[sorted.length - 1]);
  stats.activeMonths = active.size;
  stats.averagePerActiveMonth = round3(stats.total / active.size);
  stats.accounts = [...accounts.values()]
    .map((a) => ({ ...a, total: round3(a.total), share: stats.total > 0 ? (a.total / stats.total) * 100 : 0 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ar'));
  return stats;
}

/** The twelve month keys ending with the month of `asOf` ("YYYY-MM-DD"), oldest first. */
export function last12MonthKeys(asOf: string = todayISODate()): string[] {
  const end = MONTH_KEY.test(asOf.slice(0, 7)) ? asOf.slice(0, 7) : todayISODate().slice(0, 7);
  return Array.from({ length: 12 }, (_, i) => keyOfIndex(monthIndex(end) - 11 + i));
}

/** Everything about one contact's money. Pass any list of their transactions; the uncounted ones are skipped. */
export function buildPartyStats(transactions: readonly PartyTx[], options: { asOf?: string } = {}): PartyStats {
  const months = last12MonthKeys(options.asOf);
  const rows: Record<Direction, { tx: PartyTx; amount: number; date: string }[]> = { in: [], out: [] };

  for (const tx of transactions) {
    if (!isCountedTransaction(tx)) continue;
    const direction = directionOfKind(tx.kind);
    const date = String(tx.tx_date ?? '').slice(0, 10);
    const amount = amountOf(tx.amount);
    if (!direction || !/^\d{4}-\d{2}-\d{2}$/.test(date) || amount <= 0) continue;
    rows[direction].push({ tx, amount, date });
  }

  const inStats = buildDirection('in', rows.in, months);
  const outStats = buildDirection('out', rows.out, months);
  const dates = [inStats.first?.date, outStats.first?.date, inStats.last?.date, outStats.last?.date].filter((d): d is string => !!d).sort();

  return {
    in: inStats,
    out: outStats,
    count: inStats.count + outStats.count,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    net: round3(inStats.total - outStats.total),
  };
}

/** The stats of one side. */
export function sideOf(stats: Pick<PartyStats, 'in' | 'out'>, direction: Direction): DirectionStats {
  return direction === 'in' ? stats.in : stats.out;
}

/**
 * The side a profile leads with: landlords, vendors and employees are paid (out); customers and tenants pay (in).
 * With the stats at hand the data has the last word when the role finds nothing on its side: a customer file
 * that only ever received money (a landlord or a utility filed under customers) leads with out.
 */
export function primaryDirection(
  contact: Partial<Pick<ContactRow, 'kind' | 'notes' | 'job_title' | 'department' | 'monthly_rent'>> | null | undefined,
  stats?: Pick<PartyStats, 'in' | 'out'>,
): Direction {
  const role = extractContactBusinessRole(contact);
  const preferred: Direction =
    role === 'TENANT' || role === 'CUSTOMER' ? 'in' : role === 'OTHER' && stats ? (stats.in.total > stats.out.total ? 'in' : 'out') : 'out';
  if (!stats) return preferred;
  const other: Direction = preferred === 'in' ? 'out' : 'in';
  return sideOf(stats, preferred).count === 0 && sideOf(stats, other).count > 0 ? other : preferred;
}

/**
 * The accounts as slices: the biggest `top`, then everything else as one slice (`rest: true`) when it holds
 * money. Shares always add up to the whole direction.
 */
export function groupAccounts(accounts: readonly AccountShare[], options: { top?: number; restName?: string } = {}): AccountShare[] {
  const top = Math.max(1, options.top ?? 5);
  if (accounts.length <= top) return [...accounts];
  const head = accounts.slice(0, top);
  const tail = accounts.slice(top);
  const total = round3(tail.reduce((s, a) => s + a.total, 0));
  return [
    ...head,
    {
      key: '__rest',
      code: null,
      name: options.restName ?? 'بنود أخرى',
      total,
      count: tail.reduce((s, a) => s + a.count, 0),
      share: tail.reduce((s, a) => s + a.share, 0),
      rest: true,
    },
  ];
}
