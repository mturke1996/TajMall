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

export function formatDate(d: Date | string | number, locale: 'ar' | 'en' = 'ar') {
  const date = new Date(d);
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
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

/** تاريخ اليوم حسب المنطقة المحلية (ليبيا UTC+2) وليس UTC. */
export function todayISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
 * "1,250.5 د.ل" — the number, then the currency, the same order as the PDFs.
 * The result is wrapped in a left-to-right isolate (U+2066 … U+2069) so the sign, digits and
 * currency keep their order inside Arabic sentences and right-aligned cells; without it the
 * browser moved the currency to the other side of the number in some places and not others.
 * Pass `signed` to show + / − (inside the isolate); otherwise the absolute value is shown.
 */
export function formatMoney(
  amount: number | string | bigint,
  currency: string = 'LYD',
  options?: { compact?: boolean; signed?: boolean },
) {
  const label = CURRENCY_LABEL[currency] ?? currency;
  const unit = label ? ` ${label}` : '';
  const n = typeof amount === 'string' ? Number(amount) : Number(amount);
  if (!Number.isFinite(n)) return `⁦0${unit}⁩`;

  const sign = options?.signed ? (n > 0 ? '+' : n < 0 ? '−' : '') : '';
  const abs = Math.abs(n);
  const digits = options?.compact && abs >= 1000 ? compactFormatter.format(abs) : fullFormatter.format(abs);
  return `⁦${sign}${digits}${unit}⁩`;
}

export function formatNumber(n: number | string, fractionDigits: number = 0) {
  const num = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(num)) return '0';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(num);
}

export function formatPercent(n: number, fractionDigits: number = 1) {
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(fractionDigits)}%`;
}

export function deltaPercent(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
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
function arabicCount(n: number, forms: [one: string, two: string, few: string, many: string]): string {
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
