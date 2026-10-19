/**
 * The tenants list as a collecting tool: what a row still owes, the orders the list can take, and the
 * reminder that goes with an amount. Pure, so the list and the overview are thin layers over it.
 */
import type { RentReminderBasis } from '@/lib/whatsapp';

export type OwedRow = {
  current_month_status?: string | null;
  current_month_amount?: number | string | null;
  current_month_paid?: number | string | null;
  monthly_rent?: number | string | null;
};

export type SortableTenant = OwedRow & { name: string; shop_number?: string | null };

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * What the row still owes for the period it shows (one month, or several added together): the rent due
 * less what was paid, never below zero. A paid, excluded or unpriced row owes nothing: the badge on the row
 * says so, and the figure must not contradict it.
 */
export function tenantOwed(row: OwedRow): number {
  if (row.current_month_status !== 'unpaid' && row.current_month_status !== 'paid_partial') return 0;
  const due = num(row.current_month_amount) || num(row.monthly_rent);
  return Math.max(round3(due - num(row.current_month_paid)), 0);
}

export type TenantSortKey = 'name' | 'shop' | 'owed';
export type TenantSort = { key: TenantSortKey; dir: 'asc' | 'desc' };

/** Filters that are a list of people to chase: those open on the most owed first. */
const CHASE_FILTERS = new Set(['unpaid', 'paid_partial', 'partial_unpaid']);

export function defaultTenantSort(statusFilter: string): TenantSort {
  return CHASE_FILTERS.has(statusFilter) ? { key: 'owed', dir: 'desc' } : { key: 'name', dir: 'asc' };
}

/** A click on a column: the same column flips direction; a new one starts at its natural end (the most owed first). */
export function nextTenantSort(current: TenantSort, key: TenantSortKey): TenantSort {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: key === 'owed' ? 'desc' : 'asc' };
}

const collator = (a: string, b: string, numeric = false) => a.localeCompare(b, 'ar', numeric ? { numeric: true } : undefined);

/** A new array in the asked order. Ties fall back to the name, so the order never jumps between renders. */
export function sortTenants<T extends SortableTenant>(rows: readonly T[], sort: TenantSort): T[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    let primary = 0;
    if (sort.key === 'name') {
      primary = sign * collator(a.name, b.name);
    } else if (sort.key === 'owed') {
      primary = sign * (tenantOwed(a) - tenantOwed(b));
    } else {
      const sa = (a.shop_number ?? '').trim();
      const sb = (b.shop_number ?? '').trim();
      // a tenant without a shop number goes last in either direction: it is missing data, not a small number
      if (!sa || !sb) primary = sa === sb ? 0 : sa ? -1 : 1;
      else primary = sign * collator(sa, sb, true);
    }
    return primary || collator(a.name, b.name);
  });
}

/** One sentence for a screen reader (and a tooltip) saying how the list is ordered. */
export function describeTenantSort(sort: TenantSort): string {
  const asc = sort.dir === 'asc';
  if (sort.key === 'name') return `مرتبة بالاسم ${asc ? 'من الألف إلى الياء' : 'من الياء إلى الألف'}`;
  if (sort.key === 'shop') return `مرتبة برقم المحل ${asc ? 'الأصغر أولاً' : 'الأكبر أولاً'}`;
  return `مرتبة بالمتبقي ${asc ? 'الأقل أولاً' : 'الأكثر أولاً'}`;
}

/**
 * Whether every month of the period has come due (it is not after `thisMonth`, "YYYY-MM"). A reminder tells
 * the tenant the amount is owed today; a row that sums in a month still to come would ask for rent that is
 * not due yet, so the list offers no reminder for such a period. The current month counts as due.
 */
export function periodIsDue(monthKeys: readonly string[], thisMonth: string): boolean {
  return monthKeys.length > 0 && monthKeys.every((k) => k <= thisMonth);
}

/**
 * What the amount on a row is for, so the reminder can say it: one month's rent when the list shows a
 * month, otherwise the months of the period. `periodLabel` is the month ("أكتوبر 2026") or the range
 * ("يناير – أكتوبر 2026").
 */
export function reminderBasisFor(mode: string, periodLabel: string): RentReminderBasis {
  return mode === 'month' ? { kind: 'month', label: periodLabel } : { kind: 'period', label: periodLabel };
}
