import {
  currentCalendarMonthIndex,
  currentMonthKey,
  currentYear,
  monthKey,
  monthNameAr,
  yearMonthsAll,
} from '@/lib/rent-months';
import type { TenantRentSummary } from '@/lib/db/queries';
import {
  resolveStatusFilterKeys,
  statusMatchesFilter,
  type TenantRentStatusKey,
} from '@/components/tenants/tenant-status-config';

export type TenantRentPeriodMode =
  | 'month'
  | 'ytd'
  | 'quarter'
  | 'half'
  | 'year';

export type TenantRentPeriodSelection =
  | { mode: 'month'; monthKey: string }
  | { mode: 'ytd'; year: number }
  | { mode: 'quarter'; year: number; quarter: 1 | 2 | 3 | 4 }
  | { mode: 'half'; year: number; half: 1 | 2 }
  | { mode: 'year'; year: number };

export const PERIOD_MODE_OPTIONS: {
  mode: TenantRentPeriodMode;
  label: string;
  shortLabel: string;
}[] = [
  { mode: 'month', label: 'شهر', shortLabel: 'شهر' },
  { mode: 'ytd', label: 'الأشهر الحالية', shortLabel: 'حتى الآن' },
  { mode: 'quarter', label: 'ربع سنة', shortLabel: 'ربع' },
  { mode: 'half', label: 'نصف سنة', shortLabel: 'نصف' },
  { mode: 'year', label: 'سنة كاملة', shortLabel: 'سنة' },
];

/** آخر شهر يُضمَّن في «حتى الآن» لسنة معيّنة */
export function ytdThroughMonth(year: number): number {
  const cy = currentYear();
  if (year < cy) return 12;
  if (year > cy) return 1;
  return currentCalendarMonthIndex();
}

const QUARTER_AR = ['الربع الأول', 'الربع الثاني', 'الربع الثالث', 'الربع الرابع'] as const;
const HALF_AR = ['النصف الأول', 'النصف الثاني'] as const;

export function defaultTenantRentPeriodSelection(): TenantRentPeriodSelection {
  return { mode: 'month', monthKey: currentMonthKey() };
}

export function periodYear(selection: TenantRentPeriodSelection): number {
  switch (selection.mode) {
    case 'month':
      return Number(selection.monthKey.slice(0, 4));
    case 'ytd':
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
    case 'ytd': {
      const through = ytdThroughMonth(selection.year);
      return Array.from({ length: through }, (_, i) =>
        monthKey(selection.year, i + 1),
      );
    }
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
    case 'ytd':
      return `${ytdThroughMonth(selection.year)} أشهر`;
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
    case 'ytd': {
      const through = ytdThroughMonth(selection.year);
      return `من يناير إلى ${monthNameAr(monthKey(year, through))} ${year} (${through} أشهر)`;
    }
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
  const base = currentYear();
  return [...new Set([base - 2, base - 1, base, base + 1, anchor])]
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);
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
    case 'ytd':
      return `ytd:${selection.year}:${ytdThroughMonth(selection.year)}`;
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
  const partial = tenants.filter((t) => t.current_month_status === 'paid_partial').length;
  const unpaid = tenants.filter((t) => t.current_month_status === 'unpaid').length;
  return {
    total: tenants.length,
    paid: tenants.filter((t) => t.current_month_status === 'paid_full').length,
    partial,
    unpaid,
    /** مستأجرون لديهم جزئي أو غير مدفوع (صف مجمّع) */
    partialUnpaid: tenants.filter((t) =>
      statusMatchesFilter(t.current_month_status, 'partial_unpaid'),
    ).length,
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
        if (!entries.some((e) => statusMatchesFilter(e.status, statusFilter))) {
          return false;
        }
      } else if (!statusMatchesFilter(t.current_month_status, statusFilter)) {
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
  ytd: 'الأشهر الحالية',
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

/** أرقام الشهور التي تطابق حالة الدفع المحددة (أو الفلتر المركّب) */
export function matchingMonthNumbersForStatus(
  entries: TenantMonthStatusEntry[] | undefined,
  statusFilter: string,
): number[] {
  if (!entries?.length || !statusFilter || statusFilter === 'ALL') return [];
  const nums = entries
    .filter((e) => statusMatchesFilter(e.status, statusFilter))
    .map((e) => e.monthNumber);
  return [...new Set(nums)].sort((a, b) => a - b);
}

/** تنسيق أرقام الشهور للعرض (مثل: 1، 3، 7) */
export function formatMonthNumbersList(months: number[]): string {
  if (months.length === 0) return '—';
  return months.join('، ');
}

/** أسماء الشهور بالعربية من أرقامها (مثل: يناير، مارس) */
export function formatMonthNumbersNamesAr(
  months: number[],
  year: number,
): string {
  if (months.length === 0) return '—';
  return months
    .map((n) => monthNameAr(monthKey(year, n)))
    .join('، ');
}

export type TenantMatchingMonthDetail = {
  months: number[];
  monthKeys: string[];
  expected: number;
  paid: number;
};

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
  const details = buildTenantMatchingMonthDetails(
    tenantIds,
    rowsByMonth,
    monthKeys,
    statusFilter,
  );
  const out: Record<string, number[]> = {};
  for (const id of tenantIds) {
    out[id] = details[id]?.months ?? [];
  }
  return out;
}

/**
 * تفصيل الشهور (أرقام 1–12) مع مبالغ الإيجار/المسدد لكل مستأجر.
 * statusFilter = ALL → كل شهور الفترة؛ وإلا الشهور المطابقة للحالة فقط.
 */
export function buildTenantMatchingMonthDetails(
  tenantIds: string[],
  rowsByMonth: Map<string, TenantRentSummary[]>,
  monthKeys: string[],
  statusFilter: string,
): Record<string, TenantMatchingMonthDetail> {
  if (monthKeys.length === 0) return {};

  const idSet = new Set(tenantIds);
  const out: Record<string, TenantMatchingMonthDetail> = {};

  for (const id of tenantIds) {
    out[id] = { months: [], monthKeys: [], expected: 0, paid: 0 };
  }

  for (const mk of monthKeys) {
    const monthNumber = Number(mk.slice(5, 7));
    if (!Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) {
      continue;
    }
    for (const row of rowsByMonth.get(mk) ?? []) {
      if (!idSet.has(row.id)) continue;
      if (
        statusFilter !== 'ALL' &&
        !statusMatchesFilter(row.current_month_status, statusFilter)
      ) {
        continue;
      }
      const bucket = out[row.id] ?? {
        months: [],
        monthKeys: [],
        expected: 0,
        paid: 0,
      };
      if (!bucket.monthKeys.includes(mk)) {
        bucket.months.push(monthNumber);
        bucket.monthKeys.push(mk);
        bucket.expected += monthExpected(row);
        bucket.paid += monthPaid(row);
      }
      out[row.id] = bucket;
    }
  }

  for (const id of Object.keys(out)) {
    out[id].months = [...new Set(out[id].months)].sort((a, b) => a - b);
    out[id].monthKeys.sort();
  }

  return out;
}

/** تفاصيل شهر واحد (وضع تقرير الشهر) — رقم الشهر 1–12 */
export function buildSingleMonthMatchingDetails(
  tenants: TenantRentSummary[],
  monthKeyStr: string,
): Record<string, TenantMatchingMonthDetail> {
  const monthNumber = Number(monthKeyStr.slice(5, 7));
  if (!Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return {};
  }
  const out: Record<string, TenantMatchingMonthDetail> = {};
  for (const t of tenants) {
    out[t.id] = {
      months: [monthNumber],
      monthKeys: [monthKeyStr],
      expected: monthExpected(t),
      paid: monthPaid(t),
    };
  }
  return out;
}

function displayStatusForFilteredMonths(
  statusFilter: string,
  detail: TenantMatchingMonthDetail,
): TenantRentStatusKey {
  const keys = resolveStatusFilterKeys(statusFilter);
  if (keys !== 'ALL' && keys.length === 1) return keys[0];
  if (detail.expected <= 0) return 'no_rent_set';
  if (detail.paid <= 0) return 'unpaid';
  if (detail.paid < detail.expected) return 'paid_partial';
  return 'paid_full';
}

/** يعيد بناء صف المستأجر ليعكس فقط الشهور المطابقة لفلتر الحالة */
export function applyMatchingMonthDetailsToTenants(
  tenants: TenantRentSummary[],
  details: Record<string, TenantMatchingMonthDetail>,
  statusFilter: string,
): TenantRentSummary[] {
  if (statusFilter === 'ALL') return tenants;
  return tenants.map((t) => {
    const d = details[t.id];
    if (!d || d.months.length === 0) return t;
    return {
      ...t,
      current_month_amount: String(d.expected),
      current_month_paid: String(d.paid),
      current_month_status: displayStatusForFilteredMonths(statusFilter, d),
      current_month_key: d.monthKeys.join(','),
    };
  });
}

/** إجماليات الشهور المطابقة عبر قائمة مستأجرين */
export function sumMatchingMonthDetails(
  details: Record<string, TenantMatchingMonthDetail>,
): { months: number; expected: number; paid: number } {
  let months = 0;
  let expected = 0;
  let paid = 0;
  for (const d of Object.values(details)) {
    months += d.months.length;
    expected += d.expected;
    paid += d.paid;
  }
  return { months, expected, paid };
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
    case 'ytd':
      return { mode: 'ytd', year };
    case 'quarter':
      return { mode: 'quarter', year, quarter: 1 };
    case 'half':
      return { mode: 'half', year, half: 1 };
    case 'year':
      return { mode: 'year', year };
  }
}
