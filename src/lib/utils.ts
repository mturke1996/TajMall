import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const arabicMonths = [
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
];

/**
 * `new Date('2026-03-01')` is midnight UTC, which is still February west of Greenwich. A date-only
 * string is a calendar day, so it is read as that day in local time.
 */
export function parseCalendarDate(d: Date | string | number): Date {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day);
  }
  return new Date(d);
}

export function formatDate(d: Date | string | number, locale: 'ar' | 'en' = 'ar') {
  const date = parseCalendarDate(d);
  if (Number.isNaN(date.getTime())) return '—';
  const day = date.getDate().toString().padStart(2, '0');
  const month = date.getMonth();
  const year = date.getFullYear();
  if (locale === 'ar') {
    return `${day} ${arabicMonths[month]} ${year}`;
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** "2026-10" → "أكتوبر 2026" */
export function formatMonthKeyAr(monthKey: string) {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return monthKey;
  return `${arabicMonths[m - 1]} ${y}`;
}

export function formatShortDate(d: Date | string | number) {
  const date = parseCalendarDate(d);
  if (Number.isNaN(date.getTime())) return '—';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

/** The mall's calendar: Libya is UTC+2 all year (no daylight saving). */
export const LIBYA_TIME_ZONE = 'Africa/Tripoli';

let libyaDayFormatter: Intl.DateTimeFormat | undefined;

/**
 * The calendar day it is in Libya at `at` (now when omitted), whatever time zone the machine is set to.
 * A server runs in UTC and a till can have its clock zone set wrongly; between midnight and 02:00 in Tripoli
 * both would otherwise still be on yesterday, so a payment would be dated, and a month's rent read, a day early.
 */
export function libyaDateParts(at: Date = new Date()): { year: number; month: number; day: number } {
  try {
    libyaDayFormatter ??= new Intl.DateTimeFormat('en-US-u-nu-latn', {
      timeZone: LIBYA_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = libyaDayFormatter.formatToParts(at);
    const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const year = pick('year');
    const month = pick('month');
    const day = pick('day');
    if (Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)) return { year, month, day };
  } catch {
    // a runtime without the time-zone database: fall back to the machine's own calendar
  }
  return { year: at.getFullYear(), month: at.getMonth() + 1, day: at.getDate() };
}

/**
 * "YYYY-MM-DD". Without an argument it is today in Libya. With a Date the caller built (`new Date(y, m, 1)`
 * for the first of a month, say) it is that date's own calendar day on this machine, so a date made with local
 * parts is written back with the same parts in any time zone.
 */
export function todayISODate(d?: Date) {
  const { year, month, day } = d
    ? { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
    : libyaDateParts();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** الخزينة النقدية أولاً حتى لا يُرحَّل النقد إلى مصرف بالخطأ. */
export function preferredCashboxId<T extends { id: string; kind: string; code?: string | null }>(
  boxes: T[],
): string {
  if (!boxes.length) return '';
  const cash =
    boxes.find((b) => b.code === 'CASH') ??
    boxes.find((b) => b.kind === 'CASH');
  return (cash ?? boxes[0]).id;
}

/** What a figure that could not be read is drawn as. */
export const MISSING_FIGURE = '—';

/** Currency codes shown to people in Arabic; other codes are shown as they are. */
const CURRENCY_LABEL: Record<string, string> = { LYD: 'د.ل' };

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
});
const fullFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

/**
 * "262,150.5 د.ل" — read right to left: the number first, then the currency after it (on its left).
 * The whole figure is an isolate that runs right to left (U+2067 … U+2069) whatever the surrounding
 * direction is, and the number alone (sign and digits) is a left-to-right isolate inside it (U+2066 … U+2069)
 * so it keeps its own digit order. Without the outer isolate a cell or span set to dir="ltr" (amount columns,
 * codes) drew the currency on the right of the number, i.e. read first in Arabic; without the inner one the
 * sign and the digits could trade places.
 * A negative amount always carries − (an overdrawn box or a net loss must never read as positive);
 * pass `signed` to also show + on positive amounts, and Math.abs() when a label already gives the side.
 * A missing or unreadable figure (null, undefined, blank, NaN, not a number) is "—", never "0".
 */
export function formatMoney(
  amount: number | string | bigint | null | undefined,
  currency: string = 'LYD',
  options?: { compact?: boolean; signed?: boolean },
) {
  const label = CURRENCY_LABEL[currency] ?? currency;
  const unit = label ? ` ${label}` : '';
  // a figure that failed to load is not zero: a dash says "unknown", a 0 would read as "nothing owed"
  if (amount == null || (typeof amount === 'string' && amount.trim() === '')) return MISSING_FIGURE;
  const raw = Number(amount);
  if (!Number.isFinite(raw)) return MISSING_FIGURE;

  // the sign follows the rounded value, so -0.0001 is shown as 0, not as a negative zero; a half rounds away
  // from zero on both sides, so +1.0005 and -1.0005 show the same size
  const abs = Math.round(Math.abs(raw) * 1000) / 1000;
  const sign = abs === 0 ? '' : raw < 0 ? '−' : options?.signed ? '+' : '';
  const digits = options?.compact && abs >= 1000 ? compactFormatter.format(abs) : fullFormatter.format(abs);
  return `⁧⁦${sign}${digits}⁩${unit}⁩`;
}

/** The largest amount a field accepts: a trillion dinars is a typo, and past it a double loses the thousandths. */
export const AMOUNT_INPUT_MAX = 999_999_999_999.999;

/**
 * A typed amount in dinars: accepts Arabic-Indic digits (١٥٠٫٥), the Arabic decimal mark, and thousands
 * separators ("1,250.5", "1،250", "1٬250"). Direction marks that come with text copied from a screen are ignored.
 * Returns NaN for anything that is not a plain amount with at most 3 decimals or that exceeds
 * AMOUNT_INPUT_MAX, and 0 for an empty field.
 */
export function parseAmountInput(raw: string): number {
  let s = String(raw ?? '')
    .replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/[٬\s ]/g, '')
    .replace(/،/g, ',')
    .trim();
  if (s === '') return 0;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^\d+,\d{1,3}$/.test(s)) s = s.replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(s) && !/^\.\d{1,3}$/.test(s)) return NaN;
  const n = Number(s);
  return n > AMOUNT_INPUT_MAX ? NaN : n;
}

export function formatNumber(n: number | string | null | undefined, fractionDigits: number = 0) {
  if (n == null || (typeof n === 'string' && n.trim() === '')) return MISSING_FIGURE;
  const num = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(num)) return MISSING_FIGURE;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(num);
}

export function formatPercent(n: number, fractionDigits: number = 1) {
  if (!Number.isFinite(n)) return MISSING_FIGURE;
  return `${n.toFixed(fractionDigits)}%`;
}

export function deltaPercent(current: number, previous: number) {
  if (!previous) return current > 0 ? 100 : current < 0 ? -100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  }) as T;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

/** Arabic count with the right noun form: 1 → "شهر"، 2 → "شهرين"، 3–10 → "3 أشهر"، 11+ → "11 شهراً". */
export function arabicCount(n: number, forms: [one: string, two: string, few: string, many: string]): string {
  if (n === 1) return forms[0];
  if (n === 2) return forms[1];
  if (n >= 3 && n <= 10) return `${n} ${forms[2]}`;
  return `${n} ${forms[3]}`;
}

const REL_UNITS = {
  minute: ['دقيقة', 'دقيقتين', 'دقائق', 'دقيقة'],
  hour: ['ساعة', 'ساعتين', 'ساعات', 'ساعة'],
  day: ['يوم', 'يومين', 'أيام', 'يوماً'],
  week: ['أسبوع', 'أسبوعين', 'أسابيع', 'أسبوعاً'],
  month: ['شهر', 'شهرين', 'أشهر', 'شهراً'],
  year: ['سنة', 'سنتين', 'سنوات', 'سنة'],
} as const satisfies Record<string, readonly [string, string, string, string]>;

export function formatDateRelative(date: Date | string | number) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  const seconds = Math.floor(Math.abs(diff) / 1000);
  if (seconds < 60) return 'الآن';
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const [n, unit] =
    minutes < 60
      ? [minutes, REL_UNITS.minute]
      : hours < 24
        ? [hours, REL_UNITS.hour]
        : days < 7
          ? [days, REL_UNITS.day]
          : days < 30
            ? [Math.floor(days / 7), REL_UNITS.week]
            : days < 365
              ? [Math.floor(days / 30), REL_UNITS.month]
              : [Math.floor(days / 365), REL_UNITS.year];
  return `${diff < 0 ? 'بعد' : 'منذ'} ${arabicCount(n, unit as unknown as [string, string, string, string])}`;
}
