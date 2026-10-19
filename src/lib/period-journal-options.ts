/**
 * Options of the accounting period entry (قيد الفترة المحاسبي) PDF and the pure logic behind them. The
 * dialog that edits them is src/features/pdf/options/journal-report-options-dialog.tsx; the report it
 * prints is PeriodJournalExecutivePDF. Nothing here touches the DOM or React, so every rule is checked by
 * scripts/verify-period-journal-options.mjs.
 *
 * What the original dialog did, and what is kept exactly:
 *  - basis: CASH_COLLECTED_IN_MONTH and GENERAL_ACCRUAL pick entries by their own date (`tx_date`);
 *    RENT_MONTH_TARGET picks them by the rent month the description names (extractTargetRentMonth).
 *  - level: SUMMARY_ONLY (a balanced entry per cashbox or bank) or DETAILED (every entry listed).
 *  - only POSTED and RECONCILED entries (drafts and voided ones are not in the books);
 *  - one account, or all accounts of ONE type at a time (revenue and expenses added together mean nothing);
 *  - one table per cashbox / bank, largest first, with the prior / current / future rent-month split.
 * What is new and stays optional: the period picker's ready-made periods and custom range, filters by
 * party, cashbox, payment method and amount, the order of the entries inside a table, a signature block,
 * a subtitle, and presets. A period that the old dialog could not express (a range with the rent-month
 * basis) filters by the months the range touches.
 *
 * Money is added in whole thousandths and divided once at the end, as in report-options.ts.
 */
import type { CashboxKind } from './db/types';
import { extractTargetRentMonth } from './period-journal-entry';
import {
  LARGE_REPORT_PAGES,
  MAX_SAVED_PRESETS,
  METHOD_LABEL_AR,
  MONTHS_AR,
  NO_PARTY,
  PAYMENT_METHODS,
  PRESET_NAME_MAX,
  QUICK_PERIODS,
  SORT_OPTIONS,
  amountMillis,
  defaultPeriod,
  isCountedStatus,
  isValidISODate,
  matchesPeriod,
  namesOrCount,
  parseAmountRange,
  resolvePeriod,
  sortTransactions,
  txCashboxId,
  txCategoryId,
  txMethod,
  txPartyId,
  type FilterFacet,
  type KeyValueStorage,
  type PeriodSelection,
  type ReportMethod,
  type ReportSort,
  type ReportTxLike,
  type ReportWarning,
  type ResolvedPeriod,
} from './report-options';
import { arabicCount, parseAmountInput } from './utils';

// ── vocabulary ───────────────────────────────────────────────────────────────

export type JournalBasis = 'CASH_COLLECTED_IN_MONTH' | 'RENT_MONTH_TARGET' | 'GENERAL_ACCRUAL';
export type JournalLevel = 'SUMMARY_ONLY' | 'DETAILED';
export type JournalKind = 'REVENUE' | 'EXPENSE';

/** the value of `categoryId` that means «all accounts of the chosen type» */
export const ALL_ACCOUNTS = 'ALL';

export const BASIS_OPTIONS: readonly { id: JournalBasis; title: string; description: string; pdfLabel: string }[] = [
  {
    id: 'CASH_COLLECTED_IN_MONTH',
    title: 'التحصيل الفعلي في الفترة',
    description: 'ما قُبض وسُجّل داخل الفترة، مع بيان ما يخص شهوراً سابقة.',
    pdfLabel: 'التحصيل والتسجيل الفعلي بالدفاتر',
  },
  {
    id: 'RENT_MONTH_TARGET',
    title: 'شهر الاستحقاق المستهدف',
    description: 'ما دُفع عن شهر الاستحقاق المختار، سواء دُفع فيه أو قبله أو بعده.',
    pdfLabel: 'شهر الاستحقاق والإيجار المستهدف',
  },
  {
    id: 'GENERAL_ACCRUAL',
    title: 'قيد اليومية المزدوج',
    description: 'القيد بالمدين والدائن لحركات الفترة، بتاريخ تسجيل كل حركة.',
    pdfLabel: 'قيد اليومية المحاسبي المزدوج',
  },
];

export const LEVEL_OPTIONS: readonly { id: JournalLevel; title: string; description: string }[] = [
  {
    id: 'SUMMARY_ONLY',
    title: 'المجموع فقط',
    description: 'قيد متوازن بالمجموع لكل خزينة ومصرف، دون سرد كل معاملة.',
  },
  {
    id: 'DETAILED',
    title: 'تفصيلي بكل المعاملات',
    description: 'جدول بكل معاملة: الجهة وتاريخ التسجيل وشهر الاستحقاق والبيان والمبلغ.',
  },
];

export const KIND_OPTIONS: readonly { id: JournalKind; label: string; plural: string; allAccounts: string; totalLabel: string }[] = [
  { id: 'REVENUE', label: 'إيرادات', plural: 'الإيرادات', allAccounts: 'كل حسابات الإيرادات', totalLabel: 'إجمالي الإيرادات' },
  { id: 'EXPENSE', label: 'مصروفات', plural: 'المصروفات', allAccounts: 'كل حسابات المصروفات', totalLabel: 'إجمالي المصروفات' },
];

export const JOURNAL_DEFAULT_TITLE = 'قيد الفترة المحاسبي المعتمد';
export const JOURNAL_STORAGE_KEY = 'taj-mall:pdf-options:period-journal';

const ENTRY_FORMS: [string, string, string, string] = ['معاملة واحدة', 'معاملتان', 'معاملات', 'معاملة'];
const entries = (n: number) => arabicCount(n, ENTRY_FORMS);

// ── options ──────────────────────────────────────────────────────────────────

/** Every filter is optional; an empty list (or empty text) means no restriction. */
export type JournalFilters = {
  /** contact ids; NO_PARTY selects entries without a party */
  partyIds: string[];
  cashboxIds: string[];
  methods: ReportMethod[];
  /** typed text, so a half-typed number is never lost; "" = no limit */
  minAmount: string;
  maxAmount: string;
};

export type JournalLayout = {
  /** the order of the entries inside each table (the tables themselves keep their order: largest first) */
  sort: ReportSort;
  /** the «أعدّه / اعتمده» lines at the end */
  signature: boolean;
  /** "" = the report's own title */
  title: string;
  subtitle: string;
};

/** Everything the dialog edits. Plain JSON, so a saved preset is this object. */
export type PeriodJournalOptions = {
  basis: JournalBasis;
  level: JournalLevel;
  kind: JournalKind;
  /** ALL_ACCOUNTS or the id of one account */
  categoryId: string;
  period: PeriodSelection;
  filters: JournalFilters;
  layout: JournalLayout;
};

export function clearJournalFilters(): JournalFilters {
  return { partyIds: [], cashboxIds: [], methods: [], minAmount: '', maxAmount: '' };
}

const ISO_PARTS = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * The options a fresh dialog starts with. `period` is what the page is showing: a month, or a whole year
 * (no month). Without it the current month starts. `kind` follows an account when one is given.
 */
export function defaultJournalOptions(
  today: string,
  init: { categoryId?: string; kind?: JournalKind; period?: { year: number; month?: number } } = {},
): PeriodJournalOptions {
  const m = ISO_PARTS.exec(today);
  const year = m ? Number(m[1]) : new Date().getFullYear();
  const month = m ? Number(m[2]) : new Date().getMonth() + 1;
  const page = init.period;
  const pageYear = page && Number.isInteger(page.year) && page.year >= 1990 && page.year <= 2100 ? page.year : null;
  const pageMonth = page?.month != null && Number.isInteger(page.month) && page.month >= 1 && page.month <= 12 ? page.month : null;
  const months = pageYear == null ? [month] : pageMonth != null ? [pageMonth] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  return {
    basis: 'CASH_COLLECTED_IN_MONTH',
    level: 'SUMMARY_ONLY',
    kind: init.kind ?? 'REVENUE',
    categoryId: init.categoryId && init.categoryId !== '' ? init.categoryId : ALL_ACCOUNTS,
    period: { ...defaultPeriod(today), mode: 'MONTHS', year: pageYear ?? year, months },
    filters: clearJournalFilters(),
    layout: { sort: 'DATE_DESC', signature: false, title: '', subtitle: '' },
  };
}

/** Filters that restrict something (the type and the account are not filters, they are the report's scope). */
export function activeJournalFilterCount(f: JournalFilters): number {
  return (f.partyIds.length ? 1 : 0) + (f.cashboxIds.length ? 1 : 0) + (f.methods.length ? 1 : 0) + (f.minAmount.trim() || f.maxAmount.trim() ? 1 : 0);
}

// ── rows ─────────────────────────────────────────────────────────────────────

/** The part of a transaction the journal reads. Any row with relations (TransactionWithRelations) fits. */
export type JournalTx = ReportTxLike & {
  kind?: string | null;
  description?: string | null;
  cashbox?: { id?: string | null; name_ar?: string | null; kind?: string | null } | null;
};

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
type TargetInfo = ReturnType<typeof extractTargetRentMonth>;
const targetCache = new WeakMap<object, TargetInfo>();
/** The rent month an entry names, found once per row (the text search is the slow part of a filter pass). */
function targetOf(tx: JournalTx): TargetInfo {
  let info = targetCache.get(tx);
  if (!info) {
    info = extractTargetRentMonth(tx.description, tx.tx_date ?? '');
    targetCache.set(tx, info);
  }
  return info;
}

function matchesJournalDate(tx: JournalTx, basis: JournalBasis, period: ResolvedPeriod): boolean {
  if (basis === 'RENT_MONTH_TARGET') {
    // no limit on the period: every entry
    if (!period.from && !period.to && !period.monthKeys) return true;
    const key = targetOf(tx).target_rent_month_key;
    // an entry without a usable date has no rent month, so it is in no restricted period
    if (!key || !MONTH_KEY.test(key)) return false;
    if (period.monthKeys) return period.monthKeys.includes(key);
    if (period.from && key < period.from.slice(0, 7)) return false;
    if (period.to && key > period.to.slice(0, 7)) return false;
    return true;
  }
  // an entry without a date is in no period (and not in «كل المدة» either)
  if (!tx.tx_date) return false;
  return matchesPeriod(tx.tx_date, period);
}

/**
 * One test for "does this entry belong in the journal". `skip` leaves one list out, which is how a list
 * shows for each of its choices how many entries it would add under the other options; skipping the
 * account keeps the type, because the account list only offers accounts of the chosen type.
 * `ignoreStatus` leaves the status rule out (used to count what it removes).
 */
export function buildJournalRowTest(
  options: Pick<PeriodJournalOptions, 'basis' | 'kind' | 'categoryId' | 'period' | 'filters'>,
  today: string,
  opts: { skip?: FilterFacet; ignoreStatus?: boolean } = {},
) {
  const f = options.filters;
  const period = resolvePeriod(options.period, today);
  const amount = parseAmountRange(f.minAmount, f.maxAmount);
  const parties = opts.skip === 'party' || f.partyIds.length === 0 ? null : new Set(f.partyIds);
  const boxes = opts.skip === 'cashbox' || f.cashboxIds.length === 0 ? null : new Set(f.cashboxIds);
  const methods = opts.skip === 'method' || f.methods.length === 0 ? null : new Set<string>(f.methods);
  const minM = amount.error || amount.min == null ? null : Math.round(amount.min * 1000);
  const maxM = amount.error || amount.max == null ? null : Math.round(amount.max * 1000);
  const oneAccount = opts.skip !== 'category' && options.categoryId !== ALL_ACCOUNTS;

  const test = (tx: JournalTx): boolean => {
    // posted money only: drafts and voided entries are not in the books
    if (!opts.ignoreStatus && !isCountedStatus(tx.status, false)) return false;
    if (!period.valid) return false;
    if (oneAccount) {
      if (txCategoryId(tx) !== options.categoryId) return false;
    } else if (tx.kind !== options.kind) return false;
    if (!matchesJournalDate(tx, options.basis, period)) return false;
    if (parties && !parties.has(txPartyId(tx) ?? NO_PARTY)) return false;
    // a cashbox filter keeps only entries of the chosen cashboxes; an entry without one is not among them
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

export type JournalSelection<T> = {
  /** the entries to print, sorted by the chosen order */
  rows: T[];
  period: ResolvedPeriod;
  /** reasons the options cannot produce a report (a wrong date, crossed amount limits) */
  issues: string[];
  valid: boolean;
  /** entries the status rule left out, among those that match every other option */
  excluded: { voided: number; drafts: number };
  /** entries of the chosen type in the period, before the account and the filters */
  inPeriod: number;
};

export function selectJournalRows<T extends JournalTx>(rows: readonly T[], options: PeriodJournalOptions, today: string): JournalSelection<T> {
  const main = buildJournalRowTest(options, today);
  const issues: string[] = [];
  if (main.period.error) issues.push(main.period.error);
  if (main.amountError) issues.push(main.amountError);

  const matching = rows.filter(main.test);
  const sorted = sortTransactions(matching, options.layout.sort);

  const noStatus = buildJournalRowTest(options, today, { ignoreStatus: true });
  let voided = 0;
  let drafts = 0;
  for (const tx of rows) {
    if (tx.status === 'VOIDED' && noStatus.test(tx)) voided += 1;
    else if (tx.status === 'DRAFT' && noStatus.test(tx)) drafts += 1;
  }

  const wide = buildJournalRowTest({ ...options, categoryId: ALL_ACCOUNTS, filters: clearJournalFilters() }, today);
  const inPeriod = rows.filter(wide.test).length;

  return { rows: sorted, period: main.period, issues, valid: issues.length === 0, excluded: { voided, drafts }, inPeriod };
}

// ── the report data ──────────────────────────────────────────────────────────

/** One table of the report: a cashbox or bank with its entries. The shape PeriodJournalExecutivePDF takes. */
export type JournalBankGroup = {
  cashboxId: string;
  name: string;
  kind: CashboxKind | null;
  totalDebit: number;
  totalCredit: number;
  entryCount: number;
  focusLineName: string;
  focusLineCode: string;
  focusAmount: number;
  contraLineName: string;
  contraAmount: number;
  isCredit: boolean;
  items: {
    id: string;
    number: number;
    date: string;
    description: string | null;
    tenantName: string | null;
    shopNumber: string | null;
    targetRentMonth: string | null;
    targetMonthStatus: 'PRIOR' | 'CURRENT' | 'FUTURE' | 'GENERAL';
    debit: number;
    credit: number;
    amount: number;
  }[];
};

export type JournalData = {
  filteredCount: number;
  grandTotal: number;
  priorPeriodTotal: number;
  priorPeriodCount: number;
  currentPeriodTotal: number;
  currentPeriodCount: number;
  futurePeriodTotal: number;
  futurePeriodCount: number;
  bankGroups: JournalBankGroup[];
  categoriesSummary: { name: string; code: string; count: number; total: number }[];
  paymentMethodsSummary: { method: string; labelAr: string; count: number; total: number }[];
};

const METHOD_SUMMARY_LABEL: Record<string, string> = {
  CASH: 'نقدي (CASH)',
  CARD: 'بطاقة مصرفية (POS)',
  TRANSFER: 'حوالة مصرفية (TRANSFER)',
  CHEQUE: 'صك مصرفي (CHEQUE)',
};

/**
 * Turns the chosen entries into what the report prints: a table per cashbox or bank (largest first) with a
 * balanced debit and credit, the prior / current / future split, and the summaries. `account` is the one
 * account chosen, if any: it names the focus line of every table. Rows keep the order they are given in.
 */
export function buildJournalData(rows: readonly JournalTx[], account: { name_ar: string; code: string } | null): JournalData {
  let grand = 0;
  const split = { PRIOR: { m: 0, n: 0 }, CURRENT: { m: 0, n: 0 }, FUTURE: { m: 0, n: 0 } };
  const banks = new Map<string, { g: JournalBankGroup; millis: number }>();
  const cats = new Map<string, { name: string; code: string; count: number; millis: number }>();
  const methods = new Map<string, { labelAr: string; count: number; millis: number }>();

  for (const t of rows) {
    const a = amountMillis(t);
    grand += a;
    const target = targetOf(t);
    if (target.target_month_status === 'PRIOR' || target.target_month_status === 'CURRENT' || target.target_month_status === 'FUTURE') {
      split[target.target_month_status].m += a;
      split[target.target_month_status].n += 1;
    }

    const mKey = txMethod(t);
    const mc = methods.get(mKey) ?? { labelAr: METHOD_SUMMARY_LABEL[mKey] || mKey, count: 0, millis: 0 };
    mc.count += 1;
    mc.millis += a;
    methods.set(mKey, mc);

    const cId = txCategoryId(t) || 'OTHER';
    const cc = cats.get(cId) ?? { name: t.category?.name_ar || 'بدون بند', code: t.category?.code || '—', count: 0, millis: 0 };
    cc.count += 1;
    cc.millis += a;
    cats.set(cId, cc);

    const bId = txCashboxId(t) || 'OTHER';
    const bName = t.cashbox?.name_ar || 'الخزينة النقدية الرئيسية';
    let bank = banks.get(bId);
    if (!bank) {
      const isRevenue = t.kind === 'REVENUE';
      bank = {
        millis: 0,
        g: {
          cashboxId: bId,
          name: bName,
          kind: ((t.cashbox?.kind as CashboxKind | null | undefined) ?? 'CASH') as CashboxKind,
          totalDebit: 0,
          totalCredit: 0,
          entryCount: 0,
          focusLineName: account?.name_ar || (isRevenue ? 'إجمالي الإيرادات' : 'إجمالي المصروفات'),
          focusLineCode: account?.code || (isRevenue ? 'REV*' : 'EXP*'),
          focusAmount: 0,
          contraLineName: bName,
          contraAmount: 0,
          isCredit: isRevenue,
          items: [],
        },
      };
      banks.set(bId, bank);
    }
    bank.millis += a;
    bank.g.entryCount += 1;
    const amt = a / 1000;
    bank.g.items.push({
      id: t.id,
      number: typeof t.number === 'number' ? t.number : Number(t.number ?? 0),
      date: t.tx_date ?? '',
      description: t.description ?? null,
      tenantName: t.contact?.name ?? null,
      shopNumber: t.contact?.shop_number ?? null,
      targetRentMonth: target.target_rent_month,
      targetMonthStatus: target.target_month_status,
      debit: !bank.g.isCredit ? amt : 0,
      credit: bank.g.isCredit ? amt : 0,
      amount: amt,
    });
  }

  const bankGroups = [...banks.values()]
    .map(({ g, millis }) => {
      const total = millis / 1000;
      // revenue is credited against the cashbox, an expense is debited against it: both sides always carry the same total
      return { ...g, totalDebit: total, totalCredit: total, focusAmount: total, contraAmount: total };
    })
    .sort((x, y) => y.totalDebit - x.totalDebit || x.name.localeCompare(y.name, 'ar'));

  return {
    filteredCount: rows.length,
    grandTotal: grand / 1000,
    priorPeriodTotal: split.PRIOR.m / 1000,
    priorPeriodCount: split.PRIOR.n,
    currentPeriodTotal: split.CURRENT.m / 1000,
    currentPeriodCount: split.CURRENT.n,
    futurePeriodTotal: split.FUTURE.m / 1000,
    futurePeriodCount: split.FUTURE.n,
    bankGroups,
    categoriesSummary: [...cats.values()].map((c) => ({ name: c.name, code: c.code, count: c.count, total: c.millis / 1000 })).sort((x, y) => y.total - x.total),
    paymentMethodsSummary: [...methods.entries()].map(([method, v]) => ({ method, labelAr: v.labelAr, count: v.count, total: v.millis / 1000 })),
  };
}

// ── words ────────────────────────────────────────────────────────────────────

const monthsOf = (sel: PeriodSelection) => [...new Set(sel.months.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))].sort((a, b) => a - b);

/**
 * What the report prints as its period: «أكتوبر 2026», «من يناير إلى مارس 2026», «كامل عام 2026»,
 * «أشهر يناير، مارس 2026», or the range in words for a ready-made period or a custom range.
 */
export function journalPeriodLabel(sel: PeriodSelection, resolved: ResolvedPeriod): string {
  if (!resolved.valid) return resolved.label;
  if (sel.mode !== 'MONTHS') return resolved.label;
  const months = monthsOf(sel);
  const first = months[0];
  const last = months[months.length - 1];
  if (months.length === 12) return `كامل عام ${sel.year}`;
  if (months.length === 1) return `${MONTHS_AR[first - 1]} ${sel.year}`;
  if (last - first + 1 === months.length) return `من ${MONTHS_AR[first - 1]} إلى ${MONTHS_AR[last - 1]} ${sel.year}`;
  return resolved.label;
}

/** The scope cell of the report: one account with its code, or every account of the type. */
export function journalCategoryLabel(kind: JournalKind, account: { name_ar: string; code: string } | null): string {
  if (account) return `${account.name_ar} (${account.code})`;
  return kind === 'REVENUE' ? 'كافة بنود الإيرادات' : 'كافة بنود المصروفات';
}

export const journalBasisLabel = (basis: JournalBasis) => BASIS_OPTIONS.find((b) => b.id === basis)?.pdfLabel ?? '';

const cleanPart = (text: string, max: number) =>
  text
    .replace(/[^ء-ي\w-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, max);

/**
 * «قيد-الفترة-إيرادات-تفصيلي-2026-10-2026-10-19»: the report, what it covers (the account, or the type), the
 * level, the period and the day it was made. Safe for a file name.
 */
export function journalFileName(input: { scope: string; level: JournalLevel; periodSlug: string; today: string }): string {
  const levelSlug = input.level === 'SUMMARY_ONLY' ? 'مجموع' : 'تفصيلي';
  return ['قيد-الفترة', cleanPart(input.scope, 25), levelSlug, cleanPart(input.periodSlug, 40), input.today].filter(Boolean).join('-');
}

/** «التصفية: الجهة: محل الأمل · طريقة الدفع: نقدي»: the line printed at the end of the report when something is filtered. */
export function buildJournalScopeNote(input: {
  filters: JournalFilters;
  layout: Pick<JournalLayout, 'sort'>;
  level: JournalLevel;
  partyName: (id: string) => string | null | undefined;
  cashboxName: (id: string) => string | null | undefined;
}): string {
  const f = input.filters;
  const parts: string[] = [];
  if (f.partyIds.length) {
    const names = f.partyIds.map((id) => (id === NO_PARTY ? 'بدون جهة' : input.partyName(id))).filter((n): n is string => Boolean(n));
    const forms: [string, string, string, string] = ['جهة واحدة', 'جهتان', 'جهات', 'جهة'];
    parts.push(`الجهة: ${names.length === f.partyIds.length ? namesOrCount(names, forms) : arabicCount(f.partyIds.length, forms)}`);
  }
  if (f.cashboxIds.length) {
    const names = f.cashboxIds.map((id) => input.cashboxName(id)).filter((n): n is string => Boolean(n));
    const forms: [string, string, string, string] = ['خزينة واحدة', 'خزينتان', 'خزائن', 'خزينة'];
    parts.push(`الخزينة: ${names.length === f.cashboxIds.length ? namesOrCount(names, forms) : arabicCount(f.cashboxIds.length, forms)}`);
  }
  if (f.methods.length) parts.push(`طريقة الدفع: ${f.methods.map((m) => METHOD_LABEL_AR[m]).join('، ')}`);
  const { min, max, error } = parseAmountRange(f.minAmount, f.maxAmount);
  if (!error && (min != null || max != null)) {
    const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
    parts.push(min != null && max != null ? `المبلغ من ${fmt.format(min)} إلى ${fmt.format(max)} د.ل` : min != null ? `المبلغ ${fmt.format(min)} د.ل فأكثر` : `المبلغ حتى ${fmt.format(max as number)} د.ل`);
  }
  if (input.level === 'DETAILED' && input.layout.sort !== 'DATE_DESC') parts.push(`الترتيب: ${SORT_OPTIONS.find((o) => o.id === input.layout.sort)?.label}`);
  return parts.length ? `التصفية: ${parts.join(' · ')}` : '';
}

// ── page estimate and warnings ───────────────────────────────────────────────

/**
 * Rough size of the PDF, fitted to real renders of PeriodJournalExecutivePDF (A4, 1 to 12 tables, 2 to 130
 * entries). A summary table with its band takes a third of a page after the first page's header and figures;
 * a detailed table costs its band, head and subtotal (about 4 rows) plus a row per entry, with 12 rows on
 * the first page and 19 on each later one. The print line adds about one row and the signature lines two.
 * Within one page of the real count on all the sizes measured; the dialog says «نحو» for that reason.
 */
const SUMMARY_FIRST_PAGE = 16;
const SUMMARY_PER_PAGE = 24;
const SUMMARY_GROUP_COST = 8;
const SUMMARY_CLOSING = 3;
const DETAIL_FIRST_PAGE = 12;
const DETAIL_PER_PAGE = 19;
const DETAIL_GROUP_COST = 4;
const PRINT_LINE_COST = 1;
const SIGNATURE_COST = 2;

export function estimateJournalPages(input: { level: JournalLevel; groups: number; rows: number; signature?: boolean }): number {
  if (!(input.rows > 0)) return 1;
  const groups = Math.max(0, input.groups);
  const extras = PRINT_LINE_COST + (input.signature ? SIGNATURE_COST : 0);
  const summary = input.level === 'SUMMARY_ONLY';
  const load = (summary ? groups * SUMMARY_GROUP_COST + SUMMARY_CLOSING : groups * DETAIL_GROUP_COST + input.rows) + extras;
  const first = summary ? SUMMARY_FIRST_PAGE : DETAIL_FIRST_PAGE;
  const perPage = summary ? SUMMARY_PER_PAGE : DETAIL_PER_PAGE;
  if (load <= first) return 1;
  return 1 + Math.ceil((load - first) / perPage);
}

export function journalWarnings(input: {
  count: number;
  pages: number;
  issues: readonly string[];
  inPeriod: number;
  excluded: { voided: number; drafts: number };
  priorTotal: number;
  priorCount: number;
  formatMoney: (amount: number) => string;
}): ReportWarning[] {
  const out: ReportWarning[] = [];
  for (const issue of input.issues) out.push({ tone: 'warning', text: issue });
  if (input.issues.length === 0 && input.count === 0) {
    out.push({
      tone: 'warning',
      text: input.inPeriod > 0 ? `لا توجد معاملات مطابقة. في هذه الفترة ${entries(input.inPeriod)} قبل اختيار الحساب والتصفية.` : 'لا توجد معاملات مطابقة لهذه الفترة.',
    });
  }
  if (input.count > 0 && input.priorCount > 0) {
    out.push({ tone: 'info', text: `يشمل ${input.formatMoney(input.priorTotal)} مستحقات عن شهور سابقة (${entries(input.priorCount)}).` });
  }
  if (input.count > 0 && input.pages >= LARGE_REPORT_PAGES) {
    out.push({ tone: 'info', text: `تقرير كبير: نحو ${input.pages} صفحة، وقد يستغرق تجهيزه وقتاً. ضيّق الفترة أو التصفية إن لم تحتج كل الصفحات.` });
  }
  if (input.excluded.voided > 0) out.push({ tone: 'info', text: `استُبعدت ${arabicCount(input.excluded.voided, ['معاملة ملغاة', 'معاملتان ملغاتان', 'معاملات ملغاة', 'معاملة ملغاة'])}.` });
  if (input.excluded.drafts > 0) out.push({ tone: 'info', text: `استُبعدت ${arabicCount(input.excluded.drafts, ['مسودة', 'مسودتان', 'مسودات', 'مسودة'])} لأن القيد المعتمد لا يشمل المسودات.` });
  return out;
}

// ── presets ──────────────────────────────────────────────────────────────────

export type JournalPreset = {
  id: string;
  name: string;
  /** a built-in preset cannot be deleted */
  builtIn?: boolean;
  /** the preset leaves the chosen type (revenue or expenses) as it is */
  keepKind?: boolean;
  options: PeriodJournalOptions;
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
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Reads options that came from storage or a preset and returns options that are safe to use: anything
 * missing or of the wrong type falls back to the default, so an old or damaged preset never breaks the dialog.
 */
export function sanitizeJournalOptions(raw: unknown, today: string): PeriodJournalOptions {
  const base = defaultJournalOptions(today);
  const o = asRecord(raw);
  const p = asRecord(o.period);
  const f = asRecord(o.filters);
  const l = asRecord(o.layout);
  const year = Number(p.year);
  const categoryId = typeof o.categoryId === 'string' && o.categoryId.length > 0 && o.categoryId.length <= 64 ? o.categoryId : ALL_ACCOUNTS;
  return {
    basis: oneOf(o.basis, BASIS_OPTIONS.map((b) => b.id), base.basis),
    level: oneOf(o.level, LEVEL_OPTIONS.map((x) => x.id), base.level),
    kind: oneOf(o.kind, KIND_OPTIONS.map((k) => k.id), base.kind),
    categoryId,
    period: {
      mode: oneOf(p.mode, ['ALL', 'QUICK', 'MONTHS', 'RANGE'] as const, 'MONTHS'),
      quick: oneOf(p.quick, QUICK_PERIODS.map((q) => q.id), 'THIS_MONTH'),
      year: Number.isInteger(year) && year >= 1990 && year <= 2100 ? year : base.period.year,
      months: Array.isArray(p.months) ? [...new Set(p.months.map(Number).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))].sort((a, b) => a - b) : base.period.months,
      from: typeof p.from === 'string' && isValidISODate(p.from) ? p.from : '',
      to: typeof p.to === 'string' && isValidISODate(p.to) ? p.to : '',
    },
    filters: {
      partyIds: asStrings(f.partyIds),
      cashboxIds: asStrings(f.cashboxIds),
      methods: asStrings(f.methods).filter((m): m is ReportMethod => (PAYMENT_METHODS as readonly string[]).includes(m)),
      minAmount: asAmountText(f.minAmount),
      maxAmount: asAmountText(f.maxAmount),
    },
    layout: {
      sort: oneOf(l.sort, SORT_OPTIONS.map((s) => s.id), 'DATE_DESC'),
      signature: l.signature === true,
      title: asText(l.title, 120),
      subtitle: asText(l.subtitle, 160),
    },
  };
}

/** One line that says what a preset does: «التحصيل الفعلي · تفصيلي · هذا الشهر · مع التوقيع». */
export function describeJournalOptions(o: PeriodJournalOptions, keepKind = false): string {
  const basis = BASIS_OPTIONS.find((b) => b.id === o.basis)?.title ?? '';
  const level = o.level === 'DETAILED' ? 'تفصيلي' : 'مجموع فقط';
  const period =
    o.period.mode === 'ALL'
      ? 'كل المدة'
      : o.period.mode === 'QUICK'
        ? QUICK_PERIODS.find((q) => q.id === o.period.quick)?.label ?? 'فترة'
        : o.period.mode === 'MONTHS'
          ? arabicCount(o.period.months.length, ['شهر', 'شهران', 'أشهر', 'شهراً'])
          : 'نطاق مخصص';
  const kind = keepKind ? '' : KIND_OPTIONS.find((k) => k.id === o.kind)?.label ?? '';
  return [basis, level, period, kind, o.layout.signature ? 'مع التوقيع' : ''].filter(Boolean).join(' · ');
}

/** Three presets that need no saving. They use the ready-made periods, so they stay current. */
export function builtInJournalPresets(today: string): JournalPreset[] {
  const base = defaultJournalOptions(today);
  const make = (id: string, name: string, patch: { basis: JournalBasis; level: JournalLevel; kind?: JournalKind; quick: 'THIS_MONTH' | 'THIS_QUARTER'; sort?: ReportSort; signature?: boolean }): JournalPreset => ({
    id: `builtin:${id}`,
    name,
    builtIn: true,
    keepKind: patch.kind == null,
    options: {
      ...base,
      basis: patch.basis,
      level: patch.level,
      kind: patch.kind ?? base.kind,
      period: { ...base.period, mode: 'QUICK', quick: patch.quick },
      layout: { ...base.layout, sort: patch.sort ?? base.layout.sort, signature: patch.signature ?? false },
    },
  });
  return [
    make('month-detail', 'قيد الشهر الحالي المفصّل', { basis: 'GENERAL_ACCRUAL', level: 'DETAILED', quick: 'THIS_MONTH', sort: 'DATE_ASC', signature: true }),
    make('quarter-summary', 'تجميع الإيرادات والمصروفات للربع', { basis: 'GENERAL_ACCRUAL', level: 'SUMMARY_ONLY', quick: 'THIS_QUARTER' }),
    make('month-collections', 'التحصيل الفعلي للشهر', { basis: 'CASH_COLLECTED_IN_MONTH', level: 'DETAILED', kind: 'REVENUE', quick: 'THIS_MONTH', sort: 'DATE_ASC' }),
  ];
}

/** Whether two sets of options ask for the same report (the title and subtitle are the person's own words and do not count). */
export function sameJournalOptions(a: PeriodJournalOptions, b: PeriodJournalOptions): boolean {
  const key = (o: PeriodJournalOptions) =>
    JSON.stringify({
      scope: [o.basis, o.level, o.kind, o.categoryId],
      period: [o.period.mode, o.period.quick, o.period.mode === 'MONTHS' ? [o.period.year, o.period.months] : null, o.period.mode === 'RANGE' ? [o.period.from, o.period.to] : null],
      filters: [[...o.filters.partyIds].sort(), [...o.filters.cashboxIds].sort(), [...o.filters.methods].sort(), o.filters.minAmount.trim(), o.filters.maxAmount.trim()],
      layout: [o.layout.sort, o.layout.signature],
    });
  return key(a) === key(b);
}

/** The options a preset gives. The person's own title and subtitle stay unless the preset carries its own. */
export function applyJournalPreset(current: PeriodJournalOptions, preset: JournalPreset): PeriodJournalOptions {
  const next = cloneJson(preset.options);
  if (preset.keepKind) next.kind = current.kind;
  return { ...next, layout: { ...next.layout, title: next.layout.title || current.layout.title, subtitle: next.layout.subtitle || current.layout.subtitle } };
}

/** True when pressing the preset now would change nothing. */
export const isJournalPresetActive = (current: PeriodJournalOptions, preset: JournalPreset) => sameJournalOptions(applyJournalPreset(current, preset), current);

/**
 * Drops choices that no longer exist (an account archived or a party removed since a preset was saved) and
 * makes the type agree with the account. `dropped` counts what was dropped.
 */
export function pruneJournalChoices(
  options: PeriodJournalOptions,
  known: { categories: ReadonlyMap<string, JournalKind | null>; parties: ReadonlySet<string>; cashboxes: ReadonlySet<string> },
): { options: PeriodJournalOptions; dropped: number } {
  let dropped = 0;
  const keep = (ids: readonly string[], set: ReadonlySet<string>, always?: string) =>
    ids.filter((id) => {
      const ok = id === always || set.has(id);
      if (!ok) dropped += 1;
      return ok;
    });
  let { categoryId, kind } = options;
  if (categoryId !== ALL_ACCOUNTS) {
    if (!known.categories.has(categoryId)) {
      dropped += 1;
      categoryId = ALL_ACCOUNTS;
    } else {
      kind = known.categories.get(categoryId) ?? kind;
    }
  }
  const f = options.filters;
  return {
    options: { ...options, categoryId, kind, filters: { ...f, partyIds: keep(f.partyIds, known.parties, NO_PARTY), cashboxIds: keep(f.cashboxIds, known.cashboxes) } },
    dropped,
  };
}

const STORE_VERSION = 1;

/** Reads the saved presets. Damaged or unknown data gives an empty list, never an error. */
export function parseJournalPresetStore(text: string | null | undefined, today: string): JournalPreset[] {
  if (!text) return [];
  try {
    const data = asRecord(JSON.parse(text));
    if (data.v !== STORE_VERSION || !Array.isArray(data.presets)) return [];
    const out: JournalPreset[] = [];
    const seen = new Set<string>();
    for (const item of data.presets) {
      const r = asRecord(item);
      const id = asText(r.id, 64);
      const name = asText(r.name, PRESET_NAME_MAX).trim();
      if (!id || !name || id.startsWith('builtin:') || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name, options: sanitizeJournalOptions(r.options, today) });
    }
    return out.slice(0, MAX_SAVED_PRESETS);
  } catch {
    return [];
  }
}

export function serializeJournalPresetStore(presets: readonly JournalPreset[]): string {
  return JSON.stringify({
    v: STORE_VERSION,
    presets: presets.filter((p) => !p.builtIn).slice(0, MAX_SAVED_PRESETS).map((p) => ({ id: p.id, name: p.name, options: p.options })),
  });
}

/** Saves `options` under `name`. The same name (ignoring spaces and case) replaces the older preset; the oldest go when the list is full. */
export function upsertJournalPreset(presets: readonly JournalPreset[], name: string, options: PeriodJournalOptions, id: string): { presets: JournalPreset[]; error: string | null } {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, PRESET_NAME_MAX);
  if (!clean) return { presets: [...presets], error: 'اكتب اسماً للإعداد.' };
  const same = presets.find((p) => p.name.toLowerCase() === clean.toLowerCase());
  const entry: JournalPreset = { id: same?.id ?? id, name: clean, options: cloneJson(options) };
  const next = same ? presets.map((p) => (p.id === same.id ? entry : p)) : [...presets, entry];
  return { presets: next.slice(-MAX_SAVED_PRESETS), error: null };
}

export const deleteJournalPreset = (presets: readonly JournalPreset[], id: string): JournalPreset[] => presets.filter((p) => p.id !== id);

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // blocked storage throws on access
  }
}

/** False when the browser refused (private window, full or blocked storage); the presets then live for this visit only. */
export function saveJournalPresets(key: string, presets: readonly JournalPreset[], storage: KeyValueStorage | null = defaultStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key, serializeJournalPresetStore(presets));
    return true;
  } catch {
    return false;
  }
}
