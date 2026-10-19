/**
 * Options of a transactions report (revenues, expenses; the period journal dialog reuses the period,
 * the filters and the presets) and the pure logic behind them: the period picker's date presets, the
 * filters, sorting, grouping with subtotals, the live summary, an estimate of the page count, warnings,
 * saved presets and the file name. Nothing here touches the DOM or React, so every rule is checked by
 * scripts/verify-report-options.mjs.
 *
 * Rules the whole file follows:
 *  - Dates are "YYYY-MM-DD" strings compared as text and moved with mall-dates.ts (UTC calendar
 *    arithmetic), never `new Date('2026-03-01')`, which is still February west of Greenwich.
 *  - Money is added in whole thousandths (millimes) and divided once at the end, so 0.1 + 0.2 is 0.3 and
 *    a three-decimal amount never drifts.
 *  - A row counts when it is POSTED or RECONCILED. A DRAFT counts only when `includeDrafts` is on. A VOIDED
 *    row never counts, whatever the options say. A row without a status counts (the database default is
 *    POSTED).
 *  - An empty selection of accounts / parties / cashboxes / methods means "no restriction", never "nothing".
 */
import { addDaysISO } from './mall-dates';
import { LIBYA_TIME_ZONE, arabicCount, libyaDateParts, parseAmountInput } from './utils';

// ── vocabulary ───────────────────────────────────────────────────────────────

export type ReportKind = 'REVENUE' | 'EXPENSE';

export const PAYMENT_METHODS = ['CASH', 'CHEQUE', 'TRANSFER', 'CARD'] as const;
export type ReportMethod = (typeof PAYMENT_METHODS)[number];
export const METHOD_LABEL_AR: Record<ReportMethod, string> = {
  CASH: 'نقدي',
  CHEQUE: 'صك',
  TRANSFER: 'حوالة',
  CARD: 'بطاقة',
};

export const MONTHS_AR = [
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

/** the filter value that stands for "entries with no party" */
export const NO_PARTY = '__none__';

const ENTRY_FORMS: [string, string, string, string] = ['معاملة واحدة', 'معاملتان', 'معاملات', 'معاملة'];
export const entriesLabel = (n: number) => arabicCount(n, ENTRY_FORMS);

// ── options ──────────────────────────────────────────────────────────────────

export type QuickPeriodId = 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_QUARTER' | 'THIS_YEAR' | 'LAST_30_DAYS' | 'LAST_YEAR';
export type PeriodMode = 'ALL' | 'QUICK' | 'MONTHS' | 'RANGE';

export const QUICK_PERIODS: readonly { id: QuickPeriodId; label: string }[] = [
  { id: 'THIS_MONTH', label: 'هذا الشهر' },
  { id: 'LAST_MONTH', label: 'الشهر الماضي' },
  { id: 'THIS_QUARTER', label: 'الربع الحالي' },
  { id: 'THIS_YEAR', label: 'هذه السنة' },
  { id: 'LAST_30_DAYS', label: 'آخر 30 يوماً' },
  { id: 'LAST_YEAR', label: 'السنة الماضية' },
];

/** What the person chose in the period section. `quick` is read in QUICK mode; `year` and `months` in MONTHS; `from` and `to` in RANGE. */
export type PeriodSelection = {
  mode: PeriodMode;
  quick: QuickPeriodId;
  year: number;
  /** 1–12, several allowed */
  months: number[];
  /** "YYYY-MM-DD" or "" */
  from: string;
  to: string;
};

/** Every filter is optional. An empty list (or empty text) means no restriction. */
export type ReportFilters = {
  categoryIds: string[];
  /** contact ids; NO_PARTY selects entries without a party */
  partyIds: string[];
  cashboxIds: string[];
  methods: ReportMethod[];
  /** drafts are left out unless this is on; voided entries are never included */
  includeDrafts: boolean;
  /** typed text, so the field can hold a half-typed number; "" = no limit */
  minAmount: string;
  maxAmount: string;
};

export type ReportGrouping = 'METHOD' | 'NONE' | 'CATEGORY' | 'PARTY' | 'CASHBOX' | 'MONTH';
export type ReportSort = 'DATE_DESC' | 'DATE_ASC' | 'AMOUNT_DESC';

export const GROUPING_OPTIONS: readonly { id: ReportGrouping; label: string }[] = [
  { id: 'METHOD', label: 'طريقة الدفع' },
  { id: 'NONE', label: 'بدون تجميع' },
  { id: 'CATEGORY', label: 'البند' },
  { id: 'PARTY', label: 'الجهة' },
  { id: 'CASHBOX', label: 'الخزينة' },
  { id: 'MONTH', label: 'الشهر' },
];
export const SORT_OPTIONS: readonly { id: ReportSort; label: string }[] = [
  { id: 'DATE_DESC', label: 'الأحدث أولاً' },
  { id: 'DATE_ASC', label: 'الأقدم أولاً' },
  { id: 'AMOUNT_DESC', label: 'المبلغ الأكبر أولاً' },
];

/** How the report is laid out. The user's name and the print date are always printed, so they are not options. */
export type ReportLayout = {
  grouping: ReportGrouping;
  sort: ReportSort;
  /** the summary tables at the top of the report */
  includeSummaries: boolean;
  /** the «أعدّه / اعتمده» lines at the end */
  signature: boolean;
  /** "" = the report's own title */
  title: string;
  subtitle: string;
};

/**
 * Everything the options dialog edits. It is plain JSON (a saved preset is this object), so it can be
 * stored, compared and passed around freely.
 */
export type TransactionReportOptions = {
  period: PeriodSelection;
  filters: ReportFilters;
  layout: ReportLayout;
};

export function defaultPeriod(today: string): PeriodSelection {
  const { y, m } = ymd(today);
  return { mode: 'ALL', quick: 'THIS_MONTH', year: y, months: [m], from: '', to: '' };
}

/** Every filter off, in one step. A fresh object with fresh lists each time, so nothing is shared by accident. */
export function clearFilters(): ReportFilters {
  return { categoryIds: [], partyIds: [], cashboxIds: [], methods: [], includeDrafts: false, minAmount: '', maxAmount: '' };
}

export const DEFAULT_FILTERS: ReportFilters = clearFilters();

export const DEFAULT_LAYOUT: ReportLayout = {
  grouping: 'METHOD',
  sort: 'DATE_DESC',
  includeSummaries: true,
  signature: false,
  title: '',
  subtitle: '',
};

export function defaultReportOptions(today: string): TransactionReportOptions {
  return { period: defaultPeriod(today), filters: clearFilters(), layout: { ...DEFAULT_LAYOUT } };
}

// ── calendar helpers ─────────────────────────────────────────────────────────

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number, width = 2) => String(n).padStart(width, '0');

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/** True for a real calendar day: 2028-02-29 yes, 2027-02-29 and 2026-13-01 no. */
export function isValidISODate(value: string): boolean {
  const m = ISO_DAY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

function ymd(iso: string): { y: number; m: number; d: number } {
  const m = ISO_DAY.exec(iso);
  if (!m) {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  }
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export const monthStart = (y: number, m: number) => `${pad(y, 4)}-${pad(m)}-01`;
export const monthEnd = (y: number, m: number) => `${pad(y, 4)}-${pad(m)}-${pad(daysInMonth(y, m))}`;

/** "2026-10-01" → "01/10/2026" */
export function formatDmy(iso: string): string {
  const m = ISO_DAY.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** The first and last day of a ready-made period, counted from `today`. */
export function quickPeriodRange(id: QuickPeriodId, today: string): { from: string; to: string } {
  const { y, m } = ymd(today);
  switch (id) {
    case 'THIS_MONTH':
      return { from: monthStart(y, m), to: monthEnd(y, m) };
    case 'LAST_MONTH': {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: monthStart(py, pm), to: monthEnd(py, pm) };
    }
    case 'THIS_QUARTER': {
      const first = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: monthStart(y, first), to: monthEnd(y, first + 2) };
    }
    case 'THIS_YEAR':
      return { from: monthStart(y, 1), to: monthEnd(y, 12) };
    case 'LAST_30_DAYS':
      // thirty days including today
      return { from: addDaysISO(today, -29), to: today };
    case 'LAST_YEAR':
      return { from: monthStart(y - 1, 1), to: monthEnd(y - 1, 12) };
  }
}

// ── period ───────────────────────────────────────────────────────────────────

export type ResolvedPeriod = {
  mode: PeriodMode;
  /** false when the chosen dates cannot be used; `error` says why in plain Arabic */
  valid: boolean;
  error: string | null;
  /** inclusive bounds; null = open */
  from: string | null;
  to: string | null;
  /** "YYYY-MM" of each chosen month when they are not one unbroken block, else null */
  monthKeys: string[] | null;
  /** the range in words: «من 01/10/2026 إلى 31/10/2026» */
  words: string;
  /** what the PDF prints as the period (the range in words, or «كامل المدة المسجلة» for everything) */
  label: string;
  /** safe for a file name */
  slug: string;
};

const ALL_LABEL = 'كامل المدة المسجلة';

function monthsOf(sel: PeriodSelection): number[] {
  return [...new Set(sel.months.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))].sort((a, b) => a - b);
}

const invalid = (mode: PeriodMode, error: string): ResolvedPeriod => ({
  mode,
  valid: false,
  error,
  from: null,
  to: null,
  monthKeys: null,
  words: '—',
  label: '—',
  slug: 'بدون-فترة',
});

const rangeResult = (mode: PeriodMode, from: string, to: string, slug: string): ResolvedPeriod => {
  const words = `من ${formatDmy(from)} إلى ${formatDmy(to)}`;
  return { mode, valid: true, error: null, from, to, monthKeys: null, words, label: words, slug };
};

/**
 * Turns the person's choice into dates. `span` (the first and last day of the entries that would be
 * printed) is only used to put «كل المدة» into words.
 */
export function resolvePeriod(sel: PeriodSelection, today: string, span?: { min: string | null; max: string | null }): ResolvedPeriod {
  if (sel.mode === 'ALL') {
    const words = span?.min && span?.max ? `من ${formatDmy(span.min)} إلى ${formatDmy(span.max)}` : ALL_LABEL;
    return { mode: 'ALL', valid: true, error: null, from: null, to: null, monthKeys: null, words, label: ALL_LABEL, slug: 'كامل-المدة' };
  }

  if (sel.mode === 'QUICK') {
    const { from, to } = quickPeriodRange(sel.quick, today);
    return rangeResult('QUICK', from, to, `${from}_${to}`);
  }

  if (sel.mode === 'MONTHS') {
    const months = monthsOf(sel);
    if (!Number.isInteger(sel.year) || sel.year < 1900 || sel.year > 2999) return invalid('MONTHS', 'السنة غير صحيحة.');
    if (months.length === 0) return invalid('MONTHS', 'اختر شهراً واحداً على الأقل.');
    const first = months[0];
    const last = months[months.length - 1];
    const block = last - first + 1 === months.length;
    const from = monthStart(sel.year, first);
    const to = monthEnd(sel.year, last);
    const slug =
      months.length === 12
        ? String(sel.year)
        : months.length === 1
          ? `${sel.year}-${pad(first)}`
          : block
            ? `${sel.year}-${pad(first)}_${sel.year}-${pad(last)}`
            : `${sel.year}-${months.map((m) => pad(m)).join('-')}`;
    if (block) return rangeResult('MONTHS', from, to, slug);
    const words = `أشهر ${months.map((m) => MONTHS_AR[m - 1]).join('، ')} ${sel.year}`;
    return {
      mode: 'MONTHS',
      valid: true,
      error: null,
      from,
      to,
      monthKeys: months.map((m) => `${sel.year}-${pad(m)}`),
      words,
      label: words,
      slug,
    };
  }

  // RANGE
  const from = (sel.from ?? '').trim();
  const to = (sel.to ?? '').trim();
  if (!from && !to) return invalid('RANGE', 'حدد تاريخ البداية أو تاريخ النهاية.');
  if ((from && !isValidISODate(from)) || (to && !isValidISODate(to))) return invalid('RANGE', 'تاريخ غير صحيح، أدخل يوماً موجوداً في التقويم.');
  if (from && to && from > to) return invalid('RANGE', 'تاريخ البداية بعد تاريخ النهاية.');
  if (from && to) return rangeResult('RANGE', from, to, `${from}_${to}`);
  const words = from ? `من ${formatDmy(from)}` : `حتى ${formatDmy(to)}`;
  return {
    mode: 'RANGE',
    valid: true,
    error: null,
    from: from || null,
    to: to || null,
    monthKeys: null,
    words,
    label: words,
    slug: from ? `من-${from}` : `حتى-${to}`,
  };
}

/** Whether a day (or a timestamp starting with one) falls in the resolved period. An invalid period matches nothing. */
export function matchesPeriod(date: string | null | undefined, period: ResolvedPeriod): boolean {
  if (!period.valid) return false;
  if (period.mode === 'ALL') return true;
  const d = (date ?? '').slice(0, 10);
  if (!ISO_DAY.test(d)) return false;
  if (period.from && d < period.from) return false;
  if (period.to && d > period.to) return false;
  if (period.monthKeys && !period.monthKeys.includes(d.slice(0, 7))) return false;
  return true;
}

/**
 * The year and months that cover a range, to start the month picker from what was already chosen: the year
 * of `to`, and the months from `from` (the first month when `from` is in an earlier year) to `to`. An open end
 * or a bad date gives null, and the caller keeps its own default.
 */
export function monthsCovering(from: string | null | undefined, to: string | null | undefined): { year: number; months: number[] } | null {
  if (!from || !to || !isValidISODate(from) || !isValidISODate(to) || from > to) return null;
  const year = Number(to.slice(0, 4));
  const first = from.slice(0, 4) === to.slice(0, 4) ? Number(from.slice(5, 7)) : 1;
  const last = Number(to.slice(5, 7));
  return { year, months: Array.from({ length: last - first + 1 }, (_, i) => first + i) };
}

/** Years to offer in the month picker: this year, last year and every year the entries cover, newest first. */
export function availableYears(dates: Iterable<string | null | undefined>, today: string): number[] {
  const { y } = ymd(today);
  const years = new Set<number>([y, y - 1]);
  for (const raw of dates) {
    const m = ISO_DAY.exec((raw ?? '').slice(0, 10));
    if (m) years.add(Number(m[1]));
  }
  return [...years].sort((a, b) => b - a);
}

// ── rows ─────────────────────────────────────────────────────────────────────

/** The part of a transaction these functions read. Any row with relations (TransactionWithRelations) fits. */
export type ReportTxLike = {
  id: string;
  number?: number | string | null;
  status?: string | null;
  method?: string | null;
  amount?: number | string | null;
  tx_date?: string | null;
  category_id?: string | null;
  cashbox_id?: string | null;
  contact_id?: string | null;
  category?: { id?: string | null; name_ar?: string | null; code?: string | null } | null;
  cashbox?: { id?: string | null; name_ar?: string | null } | null;
  contact?: { id?: string | null; name?: string | null; shop_number?: string | null } | null;
};

/** Whole thousandths of a dinar. A non-number (null, "abc", NaN) is 0. */
export function amountMillis(tx: Pick<ReportTxLike, 'amount'>): number {
  const n = Number(tx.amount ?? 0);
  return Number.isFinite(n) ? Math.round(n * 1000) : 0;
}
export const txAmount = (tx: Pick<ReportTxLike, 'amount'>) => amountMillis(tx) / 1000;
export const sumAmounts = (rows: readonly Pick<ReportTxLike, 'amount'>[]) => rows.reduce((s, r) => s + amountMillis(r), 0) / 1000;

const txDay = (tx: ReportTxLike) => (tx.tx_date ?? '').slice(0, 10);
export const txCategoryId = (tx: ReportTxLike) => tx.category_id ?? tx.category?.id ?? null;
export const txCashboxId = (tx: ReportTxLike) => tx.cashbox_id ?? tx.cashbox?.id ?? null;
export const txPartyId = (tx: ReportTxLike) => tx.contact?.id ?? tx.contact_id ?? null;
export const txMethod = (tx: ReportTxLike): string => tx.method || 'CASH';

/** POSTED and RECONCILED count; DRAFT only when asked; VOIDED (and anything unknown) never. */
export function isCountedStatus(status: string | null | undefined, includeDrafts: boolean): boolean {
  if (!status) return true;
  if (status === 'POSTED' || status === 'RECONCILED') return true;
  return status === 'DRAFT' && includeDrafts;
}

/** The typed amount limits as numbers. `null` = no limit. `error` when a field is not an amount or the limits cross. */
export function parseAmountRange(minText: string, maxText: string): { min: number | null; max: number | null; error: string | null } {
  const read = (text: string): number | null | 'bad' => {
    if (!text.trim()) return null;
    const n = parseAmountInput(text);
    return Number.isFinite(n) && n >= 0 ? n : 'bad';
  };
  const min = read(minText);
  const max = read(maxText);
  if (min === 'bad' || max === 'bad') return { min: null, max: null, error: 'المبلغ غير صحيح، أدخل رقماً بثلاث خانات عشرية على الأكثر.' };
  if (min != null && max != null && min > max) return { min, max, error: 'الحد الأدنى للمبلغ أكبر من الحد الأعلى.' };
  return { min, max, error: null };
}

/** The filters that restrict something. */
export function activeFilterCount(f: ReportFilters): number {
  return (
    (f.categoryIds.length ? 1 : 0) +
    (f.partyIds.length ? 1 : 0) +
    (f.cashboxIds.length ? 1 : 0) +
    (f.methods.length ? 1 : 0) +
    (f.includeDrafts ? 1 : 0) +
    (f.minAmount.trim() || f.maxAmount.trim() ? 1 : 0)
  );
}

export type FilterFacet = 'category' | 'party' | 'cashbox' | 'method';

/**
 * One test for "does this entry belong in the report". `skip` leaves one list filter out, which is how a
 * list shows, for each of its choices, how many entries it would add under the other filters.
 * `ignoreStatus` leaves the status rule out altogether (used to count what the status rule removes).
 */
export function buildRowTest(
  options: Pick<TransactionReportOptions, 'period' | 'filters'>,
  today: string,
  opts: { skip?: FilterFacet; ignoreStatus?: boolean } = {},
) {
  const f = options.filters;
  const period = resolvePeriod(options.period, today);
  const amount = parseAmountRange(f.minAmount, f.maxAmount);
  const cats = opts.skip === 'category' || f.categoryIds.length === 0 ? null : new Set(f.categoryIds);
  const parties = opts.skip === 'party' || f.partyIds.length === 0 ? null : new Set(f.partyIds);
  const boxes = opts.skip === 'cashbox' || f.cashboxIds.length === 0 ? null : new Set(f.cashboxIds);
  const methods = opts.skip === 'method' || f.methods.length === 0 ? null : new Set<string>(f.methods);
  const minM = amount.error || amount.min == null ? null : Math.round(amount.min * 1000);
  const maxM = amount.error || amount.max == null ? null : Math.round(amount.max * 1000);

  const test = (tx: ReportTxLike): boolean => {
    if (!opts.ignoreStatus && !isCountedStatus(tx.status, f.includeDrafts)) return false;
    if (!matchesPeriod(tx.tx_date, period)) return false;
    if (cats && !cats.has(txCategoryId(tx) ?? '')) return false;
    if (parties && !parties.has(txPartyId(tx) ?? NO_PARTY)) return false;
    if (boxes && !boxes.has(txCashboxId(tx) ?? '')) return false;
    if (methods && !methods.has(txMethod(tx))) return false;
    if (amount.error) return false;
    if (minM != null || maxM != null) {
      const a = amountMillis(tx);
      if (minM != null && a < minM) return false;
      if (maxM != null && a > maxM) return false;
    }
    return true;
  };
  return { test, period, amountError: amount.error };
}

// ── sorting ──────────────────────────────────────────────────────────────────

function compareNumbers(a: ReportTxLike, b: ReportTxLike): number {
  const na = Number(a.number);
  const nb = Number(b.number);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a.number ?? '').localeCompare(String(b.number ?? ''));
}

/** A sorted copy. Ties fall back to the entry number, then the id, so the order never depends on the input order. */
export function sortTransactions<T extends ReportTxLike>(rows: readonly T[], sort: ReportSort): T[] {
  const byDateAsc = (a: T, b: T) => txDay(a).localeCompare(txDay(b)) || compareNumbers(a, b) || a.id.localeCompare(b.id);
  const copy = [...rows];
  switch (sort) {
    case 'DATE_ASC':
      return copy.sort(byDateAsc);
    case 'AMOUNT_DESC':
      return copy.sort((a, b) => amountMillis(b) - amountMillis(a) || -byDateAsc(a, b));
    case 'DATE_DESC':
    default:
      return copy.sort((a, b) => -byDateAsc(a, b));
  }
}

// ── the whole pipeline ───────────────────────────────────────────────────────

export type ReportSelection<T> = {
  /** the entries to print, sorted */
  rows: T[];
  period: ResolvedPeriod;
  /** reasons the options cannot produce a report (a wrong date, crossed amount limits) */
  issues: string[];
  /** false when `issues` is not empty */
  valid: boolean;
  /** entries the status rule left out, among those that match every other option */
  excluded: { voided: number; drafts: number };
  /** entries matching the period alone (for «بدون التصفية يوجد N») */
  inPeriod: number;
};

export function selectReportRows<T extends ReportTxLike>(rows: readonly T[], options: TransactionReportOptions, today: string): ReportSelection<T> {
  const main = buildRowTest(options, today);
  const issues: string[] = [];
  if (main.period.error) issues.push(main.period.error);
  if (main.amountError) issues.push(main.amountError);

  const matching = rows.filter(main.test);
  const sorted = sortTransactions(matching, options.layout.sort);

  // what the status rule alone removed: entries that match every other option but are voided or a draft
  const noStatus = buildRowTest(options, today, { ignoreStatus: true });
  let voided = 0;
  let drafts = 0;
  for (const tx of rows) {
    if (tx.status === 'VOIDED' && noStatus.test(tx)) voided += 1;
    else if (tx.status === 'DRAFT' && !options.filters.includeDrafts && noStatus.test(tx)) drafts += 1;
  }

  const periodOnly = buildRowTest(
    { period: options.period, filters: { ...DEFAULT_FILTERS, includeDrafts: options.filters.includeDrafts } },
    today,
  );
  const inPeriod = rows.filter(periodOnly.test).length;

  return { rows: sorted, period: main.period, issues, valid: issues.length === 0, excluded: { voided, drafts }, inPeriod };
}

// ── grouping and summary ─────────────────────────────────────────────────────

export type ReportGroup<T> = {
  /** unique within one grouping */
  key: string;
  label: string;
  count: number;
  total: number;
  items: T[];
};

const NO_DATE_KEY = '0000-00';

function monthLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return 'بدون تاريخ';
  return `${MONTHS_AR[Number(m[2]) - 1]} ${m[1]}`;
}

/**
 * Splits already sorted rows into groups (rows keep their order inside a group) with a count and an
 * exact subtotal each. METHOD, CATEGORY, PARTY and CASHBOX groups come largest total first; MONTH groups
 * are chronological (newest first when the rows are sorted newest first).
 */
export function groupTransactions<T extends ReportTxLike>(rows: readonly T[], grouping: ReportGrouping, sort: ReportSort = 'DATE_DESC'): ReportGroup<T>[] {
  const keyOf = (tx: T): { key: string; label: string } => {
    switch (grouping) {
      case 'NONE':
        return { key: 'ALL', label: 'كل المعاملات' };
      case 'METHOD': {
        const m = txMethod(tx);
        return { key: m, label: METHOD_LABEL_AR[m as ReportMethod] ?? m };
      }
      case 'CATEGORY': {
        const id = txCategoryId(tx);
        return { key: id ?? 'none', label: tx.category?.name_ar || 'بدون بند' };
      }
      case 'PARTY': {
        const id = txPartyId(tx);
        return { key: id ?? NO_PARTY, label: tx.contact?.name || 'بدون جهة' };
      }
      case 'CASHBOX': {
        const id = txCashboxId(tx);
        return { key: id ?? 'none', label: tx.cashbox?.name_ar || 'بدون خزينة' };
      }
      case 'MONTH': {
        const d = txDay(tx);
        const key = ISO_DAY.test(d) ? d.slice(0, 7) : NO_DATE_KEY;
        return { key, label: monthLabel(key) };
      }
    }
  };

  const map = new Map<string, { key: string; label: string; millis: number; items: T[] }>();
  for (const tx of rows) {
    const { key, label } = keyOf(tx);
    let g = map.get(key);
    if (!g) {
      g = { key, label, millis: 0, items: [] };
      map.set(key, g);
    }
    g.millis += amountMillis(tx);
    g.items.push(tx);
  }
  const groups = [...map.values()];
  if (grouping === 'MONTH') {
    // rows without a date go last whichever way the months run
    const dir = sort === 'DATE_DESC' ? -1 : 1;
    groups.sort((a, b) => (a.key === NO_DATE_KEY ? 1 : b.key === NO_DATE_KEY ? -1 : dir * a.key.localeCompare(b.key)));
  } else if (grouping !== 'NONE') {
    groups.sort((a, b) => b.millis - a.millis || a.label.localeCompare(b.label, 'ar'));
  }
  return groups.map((g) => ({ key: g.key, label: g.label, count: g.items.length, total: g.millis / 1000, items: g.items }));
}

export type ReportSummary = {
  count: number;
  total: number;
  categories: number;
  parties: number;
  cashboxes: number;
  methods: number;
  months: number;
  firstDate: string | null;
  lastDate: string | null;
  byMethod: { method: string; count: number; total: number }[];
};

export function summarizeRows(rows: readonly ReportTxLike[]): ReportSummary {
  const cats = new Set<string>();
  const parties = new Set<string>();
  const boxes = new Set<string>();
  const months = new Set<string>();
  const byMethod = new Map<string, { count: number; millis: number }>();
  let millis = 0;
  let first: string | null = null;
  let last: string | null = null;
  for (const tx of rows) {
    millis += amountMillis(tx);
    cats.add(txCategoryId(tx) ?? 'none');
    const p = txPartyId(tx);
    if (p) parties.add(p);
    boxes.add(txCashboxId(tx) ?? 'none');
    const d = txDay(tx);
    if (ISO_DAY.test(d)) {
      months.add(d.slice(0, 7));
      if (first == null || d < first) first = d;
      if (last == null || d > last) last = d;
    }
    const m = txMethod(tx);
    const e = byMethod.get(m) ?? { count: 0, millis: 0 };
    e.count += 1;
    e.millis += amountMillis(tx);
    byMethod.set(m, e);
  }
  return {
    count: rows.length,
    total: millis / 1000,
    categories: cats.size,
    parties: parties.size,
    cashboxes: boxes.size,
    methods: byMethod.size,
    months: months.size,
    firstDate: first,
    lastDate: last,
    byMethod: [...byMethod.entries()]
      .map(([method, v]) => ({ method, count: v.count, total: v.millis / 1000 }))
      .sort((a, b) => b.total - a.total),
  };
}

// ── list choices with counts ─────────────────────────────────────────────────

export type FacetItem = { id: string; label: string; hint?: string; count: number; total: number };
export type FacetCatalogEntry = { id: string; label: string; hint?: string };

const facetKey = {
  category: (tx: ReportTxLike) => txCategoryId(tx) ?? 'none',
  party: (tx: ReportTxLike) => txPartyId(tx) ?? NO_PARTY,
  cashbox: (tx: ReportTxLike) => txCashboxId(tx) ?? 'none',
} as const;

/**
 * The choices of one filter list with how many entries (and how much) each would give, counted among
 * `rows` — pass the rows that match every option except this list, so a number is what picking that choice
 * adds. Choices without entries stay (they can still be ticked) and sit last. `catalog` names the choices;
 * a choice that appears only in the rows is added with the label the row carries.
 */
export function facetItems(rows: readonly ReportTxLike[], facet: 'category' | 'party' | 'cashbox', catalog: readonly FacetCatalogEntry[]): FacetItem[] {
  const key = facetKey[facet];
  const acc = new Map<string, { count: number; millis: number; label?: string }>();
  for (const tx of rows) {
    const k = key(tx);
    const e = acc.get(k) ?? { count: 0, millis: 0 };
    e.count += 1;
    e.millis += amountMillis(tx);
    if (!e.label) e.label = facet === 'category' ? tx.category?.name_ar ?? undefined : facet === 'party' ? tx.contact?.name ?? undefined : tx.cashbox?.name_ar ?? undefined;
    acc.set(k, e);
  }
  const out = new Map<string, FacetItem>();
  for (const c of catalog) {
    const e = acc.get(c.id);
    out.set(c.id, { id: c.id, label: c.label, hint: c.hint, count: e?.count ?? 0, total: (e?.millis ?? 0) / 1000 });
  }
  for (const [id, e] of acc) {
    if (out.has(id)) continue;
    const fallback = id === NO_PARTY ? 'بدون جهة' : id === 'none' ? (facet === 'category' ? 'بدون بند' : 'بدون خزينة') : 'غير معروف';
    out.set(id, { id, label: e.label || fallback, count: e.count, total: e.millis / 1000 });
  }
  return [...out.values()].sort((a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0) || b.total - a.total || a.label.localeCompare(b.label, 'ar'));
}

/**
 * The names of every choice a list filter can offer: the accounts the person can use (`categories`), and the
 * parties and cashboxes that appear in `rows`. Built from all the rows, not only the matching ones, so a choice
 * that the other options currently empty still shows up (as «بلا حركة») and can be unticked.
 */
export function buildFacetCatalogs(
  rows: readonly ReportTxLike[],
  categories: readonly { id: string; name_ar?: string | null; name?: string | null; code?: string | null }[],
): { category: FacetCatalogEntry[]; party: FacetCatalogEntry[]; cashbox: FacetCatalogEntry[] } {
  const category: FacetCatalogEntry[] = categories.map((c) => ({ id: c.id, label: c.name_ar || c.name || c.code || 'بند', hint: c.code || undefined }));
  const parties = new Map<string, FacetCatalogEntry>();
  const cashboxes = new Map<string, FacetCatalogEntry>();
  let withoutParty = false;
  for (const tx of rows) {
    const p = tx.contact;
    const pid = txPartyId(tx);
    if (!pid) withoutParty = true;
    else if (!parties.has(pid)) parties.set(pid, { id: pid, label: p?.name || 'جهة', hint: p?.shop_number ? `محل ${p.shop_number}` : undefined });
    const cid = txCashboxId(tx);
    if (cid && !cashboxes.has(cid)) cashboxes.set(cid, { id: cid, label: tx.cashbox?.name_ar || 'خزينة' });
  }
  const byName = (a: FacetCatalogEntry, b: FacetCatalogEntry) => a.label.localeCompare(b.label, 'ar');
  const party = [...parties.values()].sort(byName);
  if (withoutParty) party.push({ id: NO_PARTY, label: 'بدون جهة' });
  return { category, party, cashbox: [...cashboxes.values()].sort(byName) };
}

// ── wording of the choices ───────────────────────────────────────────────────

/** One name, up to three names joined, or a count: «محل الأمل»، «أ، ب، ج»، «5 جهات». */
export function namesOrCount(names: readonly string[], noun: [one: string, two: string, few: string, many: string]): string {
  if (names.length <= 3) return names.join('، ');
  return arabicCount(names.length, noun);
}

const numberText = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

/** What the report says it covers in the «البند المحدد» cell: every account, or the chosen ones by name. */
export function categoriesLabel(selectedIds: readonly string[], nameOf: (id: string) => string | null | undefined, allLabel: string): string {
  if (selectedIds.length === 0) return allLabel;
  const names = selectedIds.map((id) => nameOf(id)).filter((n): n is string => Boolean(n));
  if (selectedIds.length === 1) return names[0] || 'بند محدد';
  if (selectedIds.length <= 3 && names.length === selectedIds.length) return names.join('، ');
  return `${selectedIds.length} بنود مختارة`;
}

/**
 * The line under the report's scope strip: the filters that were applied and any non-default layout, so a
 * reader of the printout knows what is (and is not) in it. Empty when nothing was restricted.
 */
export function buildScopeNote(input: {
  filters: ReportFilters;
  layout: Pick<ReportLayout, 'grouping' | 'sort'>;
  partyName: (id: string) => string | null | undefined;
  cashboxName: (id: string) => string | null | undefined;
}): string {
  const { filters: f, layout } = input;
  const parts: string[] = [];
  if (f.partyIds.length) {
    const names = f.partyIds.map((id) => (id === NO_PARTY ? 'بدون جهة' : input.partyName(id))).filter((n): n is string => Boolean(n));
    const forms: [string, string, string, string] = ['جهة', 'جهتان', 'جهات', 'جهة'];
    parts.push(`الجهة: ${names.length === f.partyIds.length ? namesOrCount(names, forms) : arabicCount(f.partyIds.length, forms)}`);
  }
  if (f.cashboxIds.length) {
    const names = f.cashboxIds.map((id) => input.cashboxName(id)).filter((n): n is string => Boolean(n));
    parts.push(`الخزينة: ${names.length === f.cashboxIds.length ? namesOrCount(names, ['خزينة', 'خزينتان', 'خزائن', 'خزينة']) : arabicCount(f.cashboxIds.length, ['خزينة', 'خزينتان', 'خزائن', 'خزينة'])}`);
  }
  if (f.methods.length) parts.push(`طريقة الدفع: ${f.methods.map((m) => METHOD_LABEL_AR[m]).join('، ')}`);
  const { min, max, error } = parseAmountRange(f.minAmount, f.maxAmount);
  if (!error && (min != null || max != null)) {
    parts.push(min != null && max != null ? `المبلغ من ${numberText.format(min)} إلى ${numberText.format(max)} د.ل` : min != null ? `المبلغ ${numberText.format(min)} د.ل فأكثر` : `المبلغ حتى ${numberText.format(max as number)} د.ل`);
  }
  if (f.includeDrafts) parts.push('تشمل المسودات');
  if (layout.grouping !== 'METHOD') parts.push(`التجميع: ${layout.grouping === 'NONE' ? 'بدون تجميع' : `حسب ${GROUPING_OPTIONS.find((g) => g.id === layout.grouping)?.label}`}`);
  if (layout.sort !== 'DATE_DESC') parts.push(`الترتيب: ${SORT_OPTIONS.find((o) => o.id === layout.sort)?.label}`);
  return parts.join(' · ');
}

/** Drops choices that no longer exist (an account archived since a preset was saved). `dropped` counts them. */
export function pruneUnknownChoices(
  options: TransactionReportOptions,
  known: { categories: ReadonlySet<string>; parties: ReadonlySet<string>; cashboxes: ReadonlySet<string> },
): { options: TransactionReportOptions; dropped: number } {
  let dropped = 0;
  const keep = (ids: readonly string[], set: ReadonlySet<string>, always?: string) =>
    ids.filter((id) => {
      const ok = id === always || set.has(id);
      if (!ok) dropped += 1;
      return ok;
    });
  const f = options.filters;
  return {
    options: {
      ...options,
      filters: {
        ...f,
        categoryIds: keep(f.categoryIds, known.categories),
        partyIds: keep(f.partyIds, known.parties, NO_PARTY),
        cashboxIds: keep(f.cashboxIds, known.cashboxes),
      },
    },
    dropped,
  };
}

// ── page estimate and warnings ───────────────────────────────────────────────

/**
 * Rough size of the PDF, fitted to real renders of the revenues report (A4, the six-column table): the
 * first page holds the header, the scope strip and the figures and then about 9 rows (about 3 when the
 * summary tables follow them), a later page holds about 18 rows (a row is two lines tall), and a group
 * costs three rows for its band, gap and subtotal. Measured on 3 to 150 rows with 1 and 3 groups it is
 * within one page everywhere and exact for most sizes.
 */
const FIRST_PAGE_ROWS = 9;
const FIRST_PAGE_ROWS_WITH_SUMMARY = 3;
const ROWS_PER_PAGE = 18;
const GROUP_COST_ROWS = 3;
const SUMMARY_ROWS_ON_FIRST_PAGE = 3;
const SUMMARY_ROW_COST = 0.8;
const SIGNATURE_COST_ROWS = 3;

export function estimatePages(input: {
  rows: number;
  groups: number;
  includeSummaries: boolean;
  /** how many accounts the summary table lists (it is left out when there is only one); default 3 */
  summaryRows?: number;
  signature?: boolean;
}): number {
  if (!(input.rows > 0)) return 1;
  const summaryRows = input.summaryRows ?? SUMMARY_ROWS_ON_FIRST_PAGE;
  const hasSummary = input.includeSummaries && summaryRows > 1;
  const first = hasSummary ? FIRST_PAGE_ROWS_WITH_SUMMARY : FIRST_PAGE_ROWS;
  let load = input.rows + Math.max(0, input.groups) * GROUP_COST_ROWS + (input.signature ? SIGNATURE_COST_ROWS : 0);
  if (hasSummary) load += Math.max(0, summaryRows - SUMMARY_ROWS_ON_FIRST_PAGE) * SUMMARY_ROW_COST;
  if (load <= first) return 1;
  return 1 + Math.ceil((load - first) / ROWS_PER_PAGE);
}

export type ReportWarning = { tone: 'warning' | 'info'; text: string };

/** A report this long takes a while to build and is hard to read; say so calmly. */
export const LARGE_REPORT_PAGES = 40;

export function reportWarnings(input: {
  count: number;
  pages: number;
  issues: readonly string[];
  inPeriod: number;
  excluded: { voided: number; drafts: number };
}): ReportWarning[] {
  const out: ReportWarning[] = [];
  for (const issue of input.issues) out.push({ tone: 'warning', text: issue });
  if (input.issues.length === 0 && input.count === 0) {
    out.push({
      tone: 'warning',
      text: input.inPeriod > 0 ? `لا توجد معاملات مطابقة. في هذه الفترة ${entriesLabel(input.inPeriod)} قبل تطبيق التصفية.` : 'لا توجد معاملات مطابقة لهذه الفترة.',
    });
  }
  if (input.count > 0 && input.pages >= LARGE_REPORT_PAGES) {
    out.push({ tone: 'info', text: `تقرير كبير: نحو ${input.pages} صفحة، وقد يستغرق تجهيزه وقتاً. ضيّق الفترة أو التصفية إن لم تحتج كل الصفحات.` });
  }
  if (input.excluded.voided > 0) out.push({ tone: 'info', text: `استُبعدت ${arabicCount(input.excluded.voided, ['معاملة ملغاة', 'معاملتان ملغاتان', 'معاملات ملغاة', 'معاملة ملغاة'])}.` });
  if (input.excluded.drafts > 0) out.push({ tone: 'info', text: `استُبعدت ${arabicCount(input.excluded.drafts, ['مسودة', 'مسودتان', 'مسودات', 'مسودة'])}؛ فعّل «تضمين المسودات» لإدراجها.` });
  return out;
}

// ── the document ─────────────────────────────────────────────────────────────

/** The words that differ between the revenues report and the expenses report. */
export const REPORT_KIND_TEXT: Record<
  ReportKind,
  { kindAr: string; plural: string; defaultTitle: string; allCategories: string; totalLabel: string; storageKey: string }
> = {
  REVENUE: {
    kindAr: 'إيرادات',
    plural: 'إيرادات',
    defaultTitle: 'كشف الإيرادات التفصيلي',
    allCategories: 'كافة بنود الإيرادات',
    totalLabel: 'إجمالي الإيرادات',
    storageKey: 'taj-mall:pdf-options:revenues',
  },
  EXPENSE: {
    kindAr: 'مصروفات',
    plural: 'مصروفات',
    defaultTitle: 'كشف المصروفات التفصيلي',
    allCategories: 'كافة البنود',
    totalLabel: 'إجمالي المصروفات',
    storageKey: 'taj-mall:pdf-options:expenses',
  },
};

/**
 * The small line above each group's name in the report. `undefined` for grouping by payment method: the
 * report's own caption («جدول إيرادات طريقة الدفع») is already right and must not change.
 */
export function groupCaption(kind: ReportKind, grouping: ReportGrouping): string | undefined {
  const plural = REPORT_KIND_TEXT[kind].plural;
  switch (grouping) {
    case 'METHOD':
      return undefined;
    case 'NONE':
      return `جدول ${plural}`;
    case 'CATEGORY':
      return `جدول ${plural} بند`;
    case 'PARTY':
      return `جدول ${plural} جهة`;
    case 'CASHBOX':
      return `جدول ${plural} خزينة`;
    case 'MONTH':
      return `جدول ${plural} شهر`;
  }
}

export type PdfGroup<T> = { method: string; labelAr: string; totalAmount: number; count: number; items: T[] };

/** The groups in the shape the revenues and expenses reports take (`paymentMethodGroups`), subtotals unchanged. */
export function toPdfGroups<T>(groups: readonly ReportGroup<T>[]): PdfGroup<T>[] {
  return groups.map((g) => ({ method: g.key, labelAr: g.label, totalAmount: g.total, count: g.count, items: g.items }));
}

/** «19/10/2026 18:08», the print date and time in Tripoli's clock, whatever the machine's time zone is. */
export function formatPrintStamp(at: Date = new Date()): string {
  const { year, month, day } = libyaDateParts(at);
  let hh = pad(at.getHours());
  let mm = pad(at.getMinutes());
  try {
    const parts = new Intl.DateTimeFormat('en-US-u-nu-latn', { timeZone: LIBYA_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
    const h = parts.find((p) => p.type === 'hour')?.value;
    const m = parts.find((p) => p.type === 'minute')?.value;
    if (h && m) {
      hh = h;
      mm = m;
    }
  } catch {
    // a runtime without the time-zone database keeps the machine's own clock
  }
  return `${pad(day)}/${pad(month)}/${year} ${hh}:${mm}`;
}

// ── file name ────────────────────────────────────────────────────────────────

const cleanPart = (text: string, max: number) =>
  text
    .replace(/[^ء-ي\w-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, max);

/** «تقرير-إيرادات-إيجارات-2026-10-01_2026-10-31-2026-10-19»: the report kind, what it covers, the period, the day it was made. */
export function reportFileName(input: { kindAr: string; scope: string; periodSlug: string; today: string }): string {
  const parts = ['تقرير', input.kindAr, cleanPart(input.scope, 25), cleanPart(input.periodSlug, 40), input.today].filter(Boolean);
  return parts.join('-');
}

// ── presets ──────────────────────────────────────────────────────────────────

export type ReportPreset = {
  id: string;
  name: string;
  /** a built-in preset cannot be deleted */
  builtIn?: boolean;
  options: TransactionReportOptions;
};

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const asText = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const asStrings = (v: unknown, max = 500): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64))].slice(0, max) : [];
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const asAmountText = (v: unknown): string => {
  const t = asText(v, 20).trim();
  return t && Number.isFinite(parseAmountInput(t)) ? t : '';
};

/**
 * Reads options that came from storage or a preset and returns options that are safe to use: anything
 * missing or of the wrong type falls back to the default, so an old or damaged preset never breaks the dialog.
 */
export function sanitizeOptions(raw: unknown, today: string): TransactionReportOptions {
  const base = defaultReportOptions(today);
  const o = asRecord(raw);
  const p = asRecord(o.period);
  const f = asRecord(o.filters);
  const l = asRecord(o.layout);
  const year = Number(p.year);
  return {
    period: {
      mode: oneOf(p.mode, ['ALL', 'QUICK', 'MONTHS', 'RANGE'] as const, 'ALL'),
      quick: oneOf(p.quick, QUICK_PERIODS.map((q) => q.id), 'THIS_MONTH'),
      year: Number.isInteger(year) && year >= 1990 && year <= 2100 ? year : base.period.year,
      months: Array.isArray(p.months) ? [...new Set(p.months.map(Number).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))].sort((a, b) => a - b) : base.period.months,
      from: typeof p.from === 'string' && isValidISODate(p.from) ? p.from : '',
      to: typeof p.to === 'string' && isValidISODate(p.to) ? p.to : '',
    },
    filters: {
      categoryIds: asStrings(f.categoryIds),
      partyIds: asStrings(f.partyIds),
      cashboxIds: asStrings(f.cashboxIds),
      methods: asStrings(f.methods).filter((m): m is ReportMethod => (PAYMENT_METHODS as readonly string[]).includes(m)),
      includeDrafts: f.includeDrafts === true,
      minAmount: asAmountText(f.minAmount),
      maxAmount: asAmountText(f.maxAmount),
    },
    layout: {
      grouping: oneOf(l.grouping, GROUPING_OPTIONS.map((g) => g.id), 'METHOD'),
      sort: oneOf(l.sort, SORT_OPTIONS.map((s) => s.id), 'DATE_DESC'),
      includeSummaries: l.includeSummaries === undefined ? true : l.includeSummaries === true,
      signature: l.signature === true,
      title: asText(l.title, 120),
      subtitle: asText(l.subtitle, 160),
    },
  };
}

/** One line that says what a preset does: «هذا الشهر · بدون تجميع · الأقدم أولاً». */
export function describeOptions(o: TransactionReportOptions): string {
  const period =
    o.period.mode === 'ALL'
      ? 'كل المدة'
      : o.period.mode === 'QUICK'
        ? QUICK_PERIODS.find((q) => q.id === o.period.quick)?.label ?? 'فترة'
        : o.period.mode === 'MONTHS'
          ? `${o.period.months.length} من الأشهر`
          : 'نطاق مخصص';
  const grouping = GROUPING_OPTIONS.find((g) => g.id === o.layout.grouping)?.label ?? '';
  const group = o.layout.grouping === 'NONE' ? 'بدون تجميع' : o.layout.grouping === 'METHOD' ? 'حسب طريقة الدفع' : `حسب ${grouping}`;
  const sort = SORT_OPTIONS.find((s) => s.id === o.layout.sort)?.label ?? '';
  return [period, group, sort, o.layout.signature ? 'مع التوقيع' : ''].filter(Boolean).join(' · ');
}

/** Three presets that need no saving. They use the ready-made periods, so they stay current. */
export function builtInPresets(today: string): ReportPreset[] {
  const base = defaultReportOptions(today);
  const make = (id: string, name: string, period: Partial<PeriodSelection>, layout: Partial<ReportLayout>): ReportPreset => ({
    id: `builtin:${id}`,
    name,
    builtIn: true,
    options: { period: { ...base.period, ...period }, filters: { ...base.filters }, layout: { ...base.layout, ...layout } },
  });
  return [
    make('month-detail', 'كشف تفصيلي للشهر', { mode: 'QUICK', quick: 'THIS_MONTH' }, { grouping: 'NONE', sort: 'DATE_ASC', includeSummaries: false, signature: true }),
    make('year-by-category', 'ملخص حسب البند للسنة', { mode: 'QUICK', quick: 'THIS_YEAR' }, { grouping: 'CATEGORY', sort: 'AMOUNT_DESC', includeSummaries: true }),
    make('by-party', 'ملخص حسب الجهة', { mode: 'ALL' }, { grouping: 'PARTY', sort: 'AMOUNT_DESC', includeSummaries: true }),
  ];
}

/** Whether two sets of options ask for the same report (the title and subtitle are the person's own words and do not count). */
export function sameOptions(a: TransactionReportOptions, b: TransactionReportOptions): boolean {
  const key = (o: TransactionReportOptions) =>
    JSON.stringify({
      period: [o.period.mode, o.period.quick, o.period.mode === 'MONTHS' ? [o.period.year, o.period.months] : null, o.period.mode === 'RANGE' ? [o.period.from, o.period.to] : null],
      filters: [
        [...o.filters.categoryIds].sort(),
        [...o.filters.partyIds].sort(),
        [...o.filters.cashboxIds].sort(),
        [...o.filters.methods].sort(),
        o.filters.includeDrafts,
        o.filters.minAmount.trim(),
        o.filters.maxAmount.trim(),
      ],
      layout: [o.layout.grouping, o.layout.sort, o.layout.includeSummaries, o.layout.signature],
    });
  return key(a) === key(b);
}

/** The options a preset gives. The person's own title and subtitle stay unless the preset carries its own. */
export function applyPreset(current: TransactionReportOptions, preset: ReportPreset): TransactionReportOptions {
  const next = structuredCloneJson(preset.options);
  return {
    ...next,
    layout: { ...next.layout, title: next.layout.title || current.layout.title, subtitle: next.layout.subtitle || current.layout.subtitle },
  };
}

export const MAX_SAVED_PRESETS = 24;
export const PRESET_NAME_MAX = 40;
const STORE_VERSION = 1;

/** Reads the saved presets. Damaged or unknown data gives an empty list, never an error. */
export function parsePresetStore(text: string | null | undefined, today: string): ReportPreset[] {
  if (!text) return [];
  try {
    const data = asRecord(JSON.parse(text));
    if (data.v !== STORE_VERSION || !Array.isArray(data.presets)) return [];
    const out: ReportPreset[] = [];
    const seen = new Set<string>();
    for (const item of data.presets) {
      const r = asRecord(item);
      const id = asText(r.id, 64);
      const name = asText(r.name, PRESET_NAME_MAX).trim();
      if (!id || !name || id.startsWith('builtin:') || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name, options: sanitizeOptions(r.options, today) });
    }
    return out.slice(0, MAX_SAVED_PRESETS);
  } catch {
    return [];
  }
}

export function serializePresetStore(presets: readonly ReportPreset[]): string {
  return JSON.stringify({
    v: STORE_VERSION,
    presets: presets.filter((p) => !p.builtIn).slice(0, MAX_SAVED_PRESETS).map((p) => ({ id: p.id, name: p.name, options: p.options })),
  });
}

/** Saves `options` under `name`. The same name (ignoring spaces and case) replaces the older preset; the oldest go when the list is full. */
export function upsertPreset(presets: readonly ReportPreset[], name: string, options: TransactionReportOptions, id: string): { presets: ReportPreset[]; error: string | null } {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, PRESET_NAME_MAX);
  if (!clean) return { presets: [...presets], error: 'اكتب اسماً للإعداد.' };
  const same = presets.find((p) => p.name.toLowerCase() === clean.toLowerCase());
  const entry: ReportPreset = { id: same?.id ?? id, name: clean, options: structuredCloneJson(options) };
  const next = same ? presets.map((p) => (p.id === same.id ? entry : p)) : [...presets, entry];
  return { presets: next.slice(-MAX_SAVED_PRESETS), error: null };
}

export const deletePreset = (presets: readonly ReportPreset[], id: string): ReportPreset[] => presets.filter((p) => p.id !== id);

function structuredCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** What a storage needs to offer; `localStorage` fits. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // blocked storage throws on access
  }
}

export function loadPresets(key: string, today: string, storage: KeyValueStorage | null = defaultStorage()): ReportPreset[] {
  try {
    return parsePresetStore(storage?.getItem(key), today);
  } catch {
    return [];
  }
}

/** False when the browser refused (private window, full or blocked storage); the presets then live for this visit only. */
export function savePresets(key: string, presets: readonly ReportPreset[], storage: KeyValueStorage | null = defaultStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key, serializePresetStore(presets));
    return true;
  } catch {
    return false;
  }
}
