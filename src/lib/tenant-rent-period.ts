import {
  currentMonthKey,
  currentYear,
  monthKey,
  monthNameAr,
  yearMonthsAll,
} from '@/lib/rent-months';
import type { TenantRentSummary } from '@/lib/db/queries';
import type { TenantRentStatusKey } from '@/components/tenants/tenant-status-config';

export type TenantRentPeriodMode = 'month' | 'quarter' | 'half' | 'year';

export type TenantRentPeriodSelection =
  | { mode: 'month'; monthKey: string }
  | { mode: 'quarter'; year: number; quarter: 1 | 2 | 3 | 4 }
  | { mode: 'half'; year: number; half: 1 | 2 }
  | { mode: 'year'; year: number };

export const PERIOD_MODE_OPTIONS: {
  mode: TenantRentPeriodMode;
  label: string;
  shortLabel: string;
}[] = [
  { mode: 'month', label: 'شهر', shortLabel: 'شهر' },
  { mode: 'quarter', label: 'ربع سنة', shortLabel: 'ربع' },
  { mode: 'half', label: 'نصف سنة', shortLabel: 'نصف' },
  { mode: 'year', label: 'سنة كاملة', shortLabel: 'سنة' },
];

const QUARTER_AR = ['الربع الأول', 'الربع الثاني', 'الربع الثالث', 'الربع الرابع'] as const;
const HALF_AR = ['النصف الأول', 'النصف الثاني'] as const;

export function defaultTenantRentPeriodSelection(): TenantRentPeriodSelection {
  return { mode: 'month', monthKey: currentMonthKey() };
}

export function periodYear(selection: TenantRentPeriodSelection): number {
  switch (selection.mode) {
    case 'month':
      return Number(selection.monthKey.slice(0, 4));
    case 'quarter':
    case 'half':
    case 'year':
      return selection.year;
  }
}

export function getPeriodMonthKeys(selection: TenantRentPeriodSelection): string[] {
  switch (selection.mode) {
    case 'month':
      return [selection.monthKey];
    case 'year':
      return yearMonthsAll(selection.year);
    case 'quarter': {
      const start = (selection.quarter - 1) * 3 + 1;
      return Array.from({ length: 3 }, (_, i) => monthKey(selection.year, start + i));
    }
    case 'half': {
      const start = selection.half === 1 ? 1 : 7;
      return Array.from({ length: 6 }, (_, i) => monthKey(selection.year, start + i));
    }
  }
}

export function formatPeriodShortLabelAr(selection: TenantRentPeriodSelection): string {
  switch (selection.mode) {
    case 'month':
      return monthNameAr(selection.monthKey);
    case 'year':
      return String(selection.year);
    case 'quarter':
      return QUARTER_AR[selection.quarter - 1];
    case 'half':
      return HALF_AR[selection.half - 1];
  }
}

export function formatPeriodLabelAr(selection: TenantRentPeriodSelection): string {
  const year = periodYear(selection);
  switch (selection.mode) {
    case 'month':
      return `${monthNameAr(selection.monthKey)} ${year}`;
    case 'year':
      return `سنة ${selection.year}`;
    case 'quarter':
      return `${QUARTER_AR[selection.quarter - 1]} ${year}`;
    case 'half':
      return `${HALF_AR[selection.half - 1]} ${year}`;
  }
}

export function formatPeriodRangeHintAr(selection: TenantRentPeriodSelection): string {
  const keys = getPeriodMonthKeys(selection);
  if (keys.length <= 1) return formatPeriodLabelAr(selection);
  const first = monthNameAr(keys[0]);
  const last = monthNameAr(keys[keys.length - 1]);
  return `${first} – ${last} ${periodYear(selection)}`;
}

export function availableYears(anchor = currentYear()): number[] {
  return [anchor - 1, anchor, anchor + 1];
}

function computeAggregatedStatus(
  monthlyRent: number,
  totalExpected: number,
  totalPaid: number,
): TenantRentStatusKey {
  if (!monthlyRent || monthlyRent <= 0) return 'no_rent_set';
  if (totalExpected <= 0) return 'no_rent_set';
  if (totalPaid >= totalExpected) return 'paid_full';
  if (totalPaid > 0) return 'paid_partial';
  return 'unpaid';
}

function monthExpected(row: TenantRentSummary): number {
  return Number(row.current_month_amount) || Number(row.monthly_rent) || 0;
}

function monthPaid(row: TenantRentSummary): number {
  return Number(row.current_month_paid) || 0;
}

/** دمج ملخصات أشهر متعددة لمستأجر واحد */
export function aggregateTenantSummariesForPeriod(
  rowsByMonth: Map<string, TenantRentSummary[]>,
  monthKeys: string[],
): TenantRentSummary[] {
  const byId = new Map<string, TenantRentSummary>();

  for (const mk of monthKeys) {
    for (const row of rowsByMonth.get(mk) ?? []) {
      const expected = monthExpected(row);
      const paid = monthPaid(row);
      const existing = byId.get(row.id);

      if (!existing) {
        byId.set(row.id, {
          ...row,
          current_month_key: monthKeys.join(','),
          current_month_amount: String(expected),
          current_month_paid: String(paid),
          current_month_status: computeAggregatedStatus(
            Number(row.monthly_rent) || 0,
            expected,
            paid,
          ),
        });
        continue;
      }

      const totalExpected = Number(existing.current_month_amount) + expected;
      const totalPaid = Number(existing.current_month_paid) + paid;

      byId.set(row.id, {
        ...existing,
        current_month_amount: String(totalExpected),
        current_month_paid: String(totalPaid),
        current_month_key: monthKeys.join(','),
        current_month_status: computeAggregatedStatus(
          Number(existing.monthly_rent) || 0,
          totalExpected,
          totalPaid,
        ),
      });
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

export function periodSelectionKey(selection: TenantRentPeriodSelection): string {
  switch (selection.mode) {
    case 'month':
      return `month:${selection.monthKey}`;
    case 'quarter':
      return `quarter:${selection.year}:${selection.quarter}`;
    case 'half':
      return `half:${selection.year}:${selection.half}`;
    case 'year':
      return `year:${selection.year}`;
  }
}

/** مبلغ الإيجار المتوقع للصف (شهر أو فترة مجمّعة) */
export function tenantPeriodExpectedRent(row: TenantRentSummary): number {
  return Number(row.current_month_amount) || Number(row.monthly_rent) || 0;
}

/** المبلغ المسدّد للصف (شهر أو فترة مجمّعة) */
export function tenantPeriodPaid(row: TenantRentSummary): number {
  return Number(row.current_month_paid) || 0;
}

/** إحصائيات الفترة لقائمة مستأجرين */
export function computeTenantPeriodStats(tenants: TenantRentSummary[]) {
  const expectedTotal = tenants.reduce((sum, t) => sum + tenantPeriodExpectedRent(t), 0);
  const collectedTotal = tenants.reduce((sum, t) => sum + tenantPeriodPaid(t), 0);
  return {
    total: tenants.length,
    paid: tenants.filter((t) => t.current_month_status === 'paid_full').length,
    partial: tenants.filter((t) => t.current_month_status === 'paid_partial').length,
    unpaid: tenants.filter((t) => t.current_month_status === 'unpaid').length,
    noRentSet: tenants.filter((t) => t.current_month_status === 'no_rent_set').length,
    expectedTotal,
    collectedTotal,
  };
}

export function filterTenantsByStatusAndSearch(
  tenants: TenantRentSummary[],
  statusFilter: string,
  searchQuery: string,
): TenantRentSummary[] {
  return tenants.filter((t) => {
    if (statusFilter !== 'ALL' && t.current_month_status !== statusFilter) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.shop_number?.toLowerCase().includes(q) ||
      t.phone?.toLowerCase().includes(q)
    );
  });
}

const PERIOD_MODE_LABEL_AR: Record<TenantRentPeriodMode, string> = {
  month: 'شهر',
  quarter: 'ربع سنة',
  half: 'نصف سنة',
  year: 'سنة كاملة',
};

export type TenantsReportPeriodContext = {
  mode: TenantRentPeriodMode;
  modeLabelAr: string;
  periodLabelAr: string;
  periodShortAr: string;
  periodRangeAr: string;
  monthCount: number;
  year: number;
  statusFilterLabel?: string;
};

export function buildTenantsReportPeriodContext(
  selection: TenantRentPeriodSelection,
  statusFilterLabel?: string,
): TenantsReportPeriodContext {
  const monthKeys = getPeriodMonthKeys(selection);
  return {
    mode: selection.mode,
    modeLabelAr: PERIOD_MODE_LABEL_AR[selection.mode],
    periodLabelAr: formatPeriodLabelAr(selection),
    periodShortAr: formatPeriodShortLabelAr(selection),
    periodRangeAr: formatPeriodRangeHintAr(selection),
    monthCount: monthKeys.length,
    year: periodYear(selection),
    statusFilterLabel: statusFilterLabel?.trim() || undefined,
  };
}

export function tenantsReportPeriodSummary(
  ctx: TenantsReportPeriodContext,
): {
  eyebrow: string;
  title: string;
  subtitle: string;
  hint: string;
  badge: string;
} {
  const monthHint =
    ctx.monthCount > 1
      ? `${ctx.periodRangeAr} · ${ctx.monthCount} أشهر`
      : ctx.periodRangeAr;

  const filterHint = ctx.statusFilterLabel
    ? ` · فلتر: ${ctx.statusFilterLabel}`
    : '';

  return {
    eyebrow: 'فترة التقرير',
    badge: ctx.modeLabelAr,
    title: ctx.periodLabelAr,
    subtitle: String(ctx.year),
    hint: `${monthHint}${filterHint}`,
  };
}

export function withPeriodMode(
  selection: TenantRentPeriodSelection,
  mode: TenantRentPeriodMode,
): TenantRentPeriodSelection {
  const year = periodYear(selection);
  switch (mode) {
    case 'month':
      return { mode: 'month', monthKey: currentMonthKey(year) };
    case 'quarter':
      return { mode: 'quarter', year, quarter: 1 };
    case 'half':
      return { mode: 'half', year, half: 1 };
    case 'year':
      return { mode: 'year', year };
  }
}
