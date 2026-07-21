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

function isExemptSummaryRow(row: TenantRentSummary): boolean {
  return row.current_month_status === 'exempt';
}

function monthExpected(row: TenantRentSummary): number {
  if (isExemptSummaryRow(row)) return 0;
  return Number(row.current_month_amount) || Number(row.monthly_rent) || 0;
}

function monthPaid(row: TenantRentSummary): number {
  if (isExemptSummaryRow(row)) return 0;
  return Number(row.current_month_paid) || 0;
}

/** دمج ملخصات أشهر متعددة لمستأجر واحد (يستبعد أشهر بدون مطالبة) */
export function aggregateTenantSummariesForPeriod(
  rowsByMonth: Map<string, TenantRentSummary[]>,
  monthKeys: string[],
): TenantRentSummary[] {
  const byId = new Map<string, TenantRentSummary>();
  const billableMonthCount = new Map<string, number>();

  for (const mk of monthKeys) {
    for (const row of rowsByMonth.get(mk) ?? []) {
      const exempt = isExemptSummaryRow(row);
      const expected = monthExpected(row);
      const paid = monthPaid(row);
      const existing = byId.get(row.id);

      if (!existing) {
        byId.set(row.id, {
          ...row,
          current_month_key: monthKeys.join(','),
          current_month_amount: String(expected),
          current_month_paid: String(paid),
          current_month_status: exempt
            ? 'exempt'
            : computeAggregatedStatus(
                Number(row.monthly_rent) || 0,
                expected,
                paid,
              ),
        });
        billableMonthCount.set(row.id, exempt ? 0 : 1);
        continue;
      }

      const totalExpected = Number(existing.current_month_amount) + expected;
      const totalPaid = Number(existing.current_month_paid) + paid;
      const billable = (billableMonthCount.get(row.id) ?? 0) + (exempt ? 0 : 1);
      billableMonthCount.set(row.id, billable);

      byId.set(row.id, {
        ...existing,
        current_month_amount: String(totalExpected),
        current_month_paid: String(totalPaid),
        current_month_key: monthKeys.join(','),
        current_month_status:
          billable === 0
            ? 'exempt'
            : computeAggregatedStatus(
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

export type TenantMonthStatusEntry = {
  monthKey: string;
  /** رقم الشهر 1–12 */
  monthNumber: number;
  status: TenantRentStatusKey;
};

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
    exempt: tenants.filter((t) => t.current_month_status === 'exempt').length,
    expectedTotal,
    collectedTotal,
  };
}

export function filterTenantsByStatusAndSearch(
  tenants: TenantRentSummary[],
  statusFilter: string,
  searchQuery: string,
  /** عند تمريره (فترة متعددة الأشهر): الفلتر حسب وجود شهر يطابق الحالة */
  monthStatusesByTenant?: Map<string, TenantMonthStatusEntry[]>,
): TenantRentSummary[] {
  return tenants.filter((t) => {
    if (statusFilter !== 'ALL') {
      const entries = monthStatusesByTenant?.get(t.id);
      if (entries) {
        if (!entries.some((e) => e.status === statusFilter)) return false;
      } else if (t.current_month_status !== statusFilter) {
        return false;
      }
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
  /**
   * عند فلتر حالة دفع على فترة متعددة الأشهر:
   * يعرض PDF أرقام الشهور المطابقة بدل المبالغ.
   */
  showMonthNumbers?: boolean;
};

/** حالة كل شهر لكل مستأجر ضمن الفترة */
export function collectTenantMonthStatuses(
  rowsByMonth: Map<string, TenantRentSummary[]>,
  monthKeys: string[],
): Map<string, TenantMonthStatusEntry[]> {
  const byTenant = new Map<string, TenantMonthStatusEntry[]>();

  for (const mk of monthKeys) {
    const monthNumber = Number(mk.slice(5, 7));
    if (!Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) {
      continue;
    }
    for (const row of rowsByMonth.get(mk) ?? []) {
      const list = byTenant.get(row.id) ?? [];
      list.push({
        monthKey: mk,
        monthNumber,
        status: row.current_month_status as TenantRentStatusKey,
      });
      byTenant.set(row.id, list);
    }
  }

  return byTenant;
}

/** أرقام الشهور التي تطابق حالة الدفع المحددة */
export function matchingMonthNumbersForStatus(
  entries: TenantMonthStatusEntry[] | undefined,
  statusFilter: string,
): number[] {
  if (!entries?.length || !statusFilter || statusFilter === 'ALL') return [];
  const nums = entries
    .filter((e) => e.status === statusFilter)
    .map((e) => e.monthNumber);
  return [...new Set(nums)].sort((a, b) => a - b);
}

/** تنسيق أرقام الشهور للعرض (مثل: 1، 3، 7) */
export function formatMonthNumbersList(months: number[]): string {
  if (months.length === 0) return '—';
  return months.join('، ');
}

/**
 * خريطة مستأجر → أرقام الشهور المطابقة للفلتر.
 * تُستخدم في PDF عند سنة/ربع/نصف + مدفوع/جزئي/غير مدفوع.
 */
export function buildTenantMatchingMonthNumbers(
  tenantIds: string[],
  rowsByMonth: Map<string, TenantRentSummary[]>,
  monthKeys: string[],
  statusFilter: string,
): Record<string, number[]> {
  if (statusFilter === 'ALL' || monthKeys.length <= 1) return {};
  const statuses = collectTenantMonthStatuses(rowsByMonth, monthKeys);
  const out: Record<string, number[]> = {};
  for (const id of tenantIds) {
    out[id] = matchingMonthNumbersForStatus(statuses.get(id), statusFilter);
  }
  return out;
}

export function buildTenantsReportPeriodContext(
  selection: TenantRentPeriodSelection,
  statusFilterLabel?: string,
  options?: { showMonthNumbers?: boolean },
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
    showMonthNumbers: !!options?.showMonthNumbers,
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
