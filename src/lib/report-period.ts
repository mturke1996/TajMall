import { formatMonthLabelAr, monthNameAr, monthKey } from '@/lib/rent-months';

export type ReportPeriodMode = 'month' | 'year';

export type ReportPeriod = {
  year: number;
  /** 1–12 عند الوضع الشهري؛ null = السنة كاملة */
  month: number | null;
  mode: ReportPeriodMode;
};

const AR_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

export function currentReportPeriod(): ReportPeriod {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    mode: 'month',
  };
}

export function parseReportPeriod(
  searchParams: URLSearchParams | { get(name: string): string | null },
): ReportPeriod {
  const now = new Date();
  const yearRaw = Number(searchParams.get('year'));
  const year =
    Number.isFinite(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100
      ? yearRaw
      : now.getFullYear();

  const modeRaw = searchParams.get('mode');
  const monthRaw = searchParams.get('month');

  if (modeRaw === 'year' || monthRaw === 'all' || monthRaw === '') {
    return { year, month: null, mode: 'year' };
  }

  const monthNum = Number(monthRaw);
  if (Number.isFinite(monthNum) && monthNum >= 1 && monthNum <= 12) {
    return { year, month: monthNum, mode: 'month' };
  }

  // افتراضي: الشهر الحالي إن كانت السنة الحالية، وإلا يناير
  if (year === now.getFullYear()) {
    return { year, month: now.getMonth() + 1, mode: 'month' };
  }
  return { year, month: 1, mode: 'month' };
}

export function reportPeriodToSearchParams(period: ReportPeriod): URLSearchParams {
  const params = new URLSearchParams();
  params.set('year', String(period.year));
  if (period.mode === 'year' || period.month == null) {
    params.set('mode', 'year');
  } else {
    params.set('month', String(period.month));
  }
  return params;
}

export function reportsHref(path: string, period?: ReportPeriod): string {
  if (!period) return path;
  const q = reportPeriodToSearchParams(period).toString();
  return q ? `${path}?${q}` : path;
}

/** أول وآخر يوم في الفترة (ISO date YYYY-MM-DD) */
export function reportPeriodDateRange(period: ReportPeriod): {
  startDate: string;
  endDate: string;
} {
  if (period.mode === 'year' || period.month == null) {
    return {
      startDate: `${period.year}-01-01`,
      endDate: `${period.year}-12-31`,
    };
  }
  const m = String(period.month).padStart(2, '0');
  const lastDay = new Date(period.year, period.month, 0).getDate();
  return {
    startDate: `${period.year}-${m}-01`,
    endDate: `${period.year}-${m}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function formatReportPeriodLabelAr(period: ReportPeriod): string {
  if (period.mode === 'year' || period.month == null) {
    return `السنة المالية ${period.year}`;
  }
  return formatMonthLabelAr(monthKey(period.year, period.month));
}

export function reportMonthOptions(): Array<{ value: number; label: string }> {
  return AR_MONTHS.map((label, i) => ({ value: i + 1, label }));
}

export function reportMonthNameAr(month1to12: number): string {
  return monthNameAr(monthKey(2000, month1to12));
}

/** slug إنجليزي للفترة — للأسماء الآمنة عند مشاركة PDF */
export function formatReportPeriodSlugEn(period: ReportPeriod): string {
  if (period.mode === 'year' || period.month == null) {
    return `fy-${period.year}`;
  }
  const m = String(period.month).padStart(2, '0');
  return `${period.year}-${m}`;
}
