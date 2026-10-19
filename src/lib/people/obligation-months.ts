/**
 * Month by month, is a recurring obligation settled? Built for the rent the mall pays a landlord and reusable
 * for any monthly payable or receivable of one contact.
 *
 * Why a "before the system" status exists: the system went live in the middle of a year and everything earlier
 * had already been paid outside it. Those months are settled, nothing is owed, and they must never read as
 * missing. A contact's tracking start says where that line is.
 *
 * Tracking start, in this order:
 *   1. the `[since:YYYY-MM]` tag in the contact's notes (the owner decided);
 *   2. the month of the contact's first counted payment (the system saw them from then on);
 *   3. the go-live month the caller passes in (the earliest contact created_at: `goLiveMonthOf`);
 *   4. none: the months have no way to be judged and read as `idle`.
 *
 * Which month a payment belongs to, agreeing with `landlordPaymentMonthKey` (contact-roles.ts), which the
 * landlord dues and the landlord schedule use:
 *   - a month named in the description wins, with the same year rule (a year in the text decides, otherwise the
 *     occurrence nearest the payment date: December's rent paid in January is last year's). A payment may name
 *     several months ("يوليو وأغسطس", "من يوليو إلى سبتمبر"): its amount is split equally between them;
 *   - otherwise the month it was paid in. With a monthly rent set, such a payment fills the oldest month not
 *     yet full first (a late payment clears the arrears before it counts for the current month) and a surplus
 *     moves on to the following months. Without a rent nothing says when a month is full, so each payment stays
 *     in the month it was paid in. `unnamedPayments: 'payment_month'` turns the first behaviour off, which is
 *     exactly what the landlord dues do.
 *
 * The amount a month should hold: the contact's `monthly_rent`; without one, the amount of the latest month
 * with money recorded (flagged `estimated`, used only to say what a month with nothing paid would cost). With
 * no amount at all, any payment makes a month paid.
 */
import { landlordMonthName, landlordPaymentMonthKey } from '@/lib/contacts/contact-roles';
import { readTags } from '@/lib/contacts/contact-tags';
import { isCountedTransaction } from '@/lib/contacts/contact-transactions';
import { extractTargetRentMonth } from '@/lib/period-journal-entry';
import { arabicCount, todayISODate } from '@/lib/utils';

// ---------------------------------------------------------------- types

export type ObligationMonthStatus =
  /** earlier than the tracking start: settled outside the system, nothing owed */
  | 'before_system'
  | 'paid'
  | 'partial'
  /** the month has started (or passed) and nothing was paid for it */
  | 'due'
  /** a later month, nothing owed yet (paid ahead shows as paid) */
  | 'upcoming'
  /** nothing to judge: outside the contract, or no tracking start is known */
  | 'idle';

export type ObligationIdleReason = 'before_contract' | 'after_contract' | 'unknown_start';

/** What the engine needs of a payment: a transaction row of the contact fits. */
export type ObligationPayment = {
  id: string;
  tx_date: string;
  amount: string | number | null;
  /** only POSTED and RECONCILED count */
  status: string | null;
  description?: string | null;
  kind?: string | null;
  contact_id?: string | null;
  contact?: { id: string } | null;
};

export type ObligationContact = {
  id: string;
  notes?: string | null;
  monthly_rent?: string | number | null;
  contract_start?: string | null;
  contract_end?: string | null;
};

export type ObligationOptions = {
  /** local calendar day, "YYYY-MM-DD"; defaults to today */
  today?: string;
  /** "YYYY-MM", the month the system started, used when nothing better says where tracking starts */
  goLiveMonth?: string | null;
  /** count only this direction (rows without a kind always count) */
  kind?: 'EXPENSE' | 'REVENUE';
  /** see the file header; default 'oldest_unpaid' */
  unnamedPayments?: 'oldest_unpaid' | 'payment_month';
};

export type ObligationInput<T extends ObligationPayment = ObligationPayment> = ObligationOptions & {
  contact: ObligationContact;
  payments: readonly T[];
};

export type ObligationShareHow = 'named' | 'payment_month' | 'oldest_unpaid' | 'spill';

/** The part of one payment that belongs to a month. */
export type ObligationShare<T extends ObligationPayment = ObligationPayment> = {
  tx: T;
  amount: number;
  how: ObligationShareHow;
};

export type ObligationMonth<T extends ObligationPayment = ObligationPayment> = {
  monthKey: string;
  year: number;
  monthNum: number;
  monthNameAr: string;
  status: ObligationMonthStatus;
  /** short words for the status, ready for a chip (also for idle and overdue) */
  label: string;
  idleReason: ObligationIdleReason | null;
  /** the amount the month should hold; null when nothing says */
  expected: number | null;
  /** `expected` is a guess from the latest recorded month, not the contact's monthly rent */
  estimated: boolean;
  /** everything attributed to the month, also paid ahead or late */
  paid: number;
  /** what a due or part-paid month still lacks; for a due month with no known amount it is 0 and `remainingKnown` is false */
  remaining: number;
  remainingKnown: boolean;
  /** paid beyond the monthly rent */
  overpaid: number;
  /** due or part-paid and the month is over */
  overdue: boolean;
  /** this calendar month */
  current: boolean;
  shares: ObligationShare<T>[];
};

export type TrackingStart = {
  /** "YYYY-MM", null when there is no way to know */
  month: string | null;
  source: 'tag' | 'first_payment' | 'go_live' | 'none';
};

export type ObligationSummary = {
  /** counts of the months in the view */
  paid: number;
  partial: number;
  due: number;
  upcoming: number;
  idle: number;
  beforeSystem: number;
  /** everything still owed up to the current month, across all years (not only the view) */
  owed: {
    /** months due or part-paid up to the current one */
    months: number;
    /** of those, months already over */
    overdue: number;
    /** sum of the amounts that are known (remaining of part-paid months, expected of due months) */
    amount: number;
    /** false when a due month has no known amount, so `amount` is a floor */
    amountComplete: boolean;
    /** some of `amount` is an estimate */
    estimated: boolean;
    /** oldest and newest owed month, "YYYY-MM" */
    oldest: string | null;
    newest: string | null;
  };
};

export type ObligationView<T extends ObligationPayment = ObligationPayment> = {
  today: string;
  currentMonth: string;
  /** the months shown, oldest first */
  months: ObligationMonth<T>[];
  tracking: TrackingStart;
  /** where `monthlyAmount` comes from */
  amountSource: 'monthly_rent' | 'estimate' | 'unknown';
  /** the monthly rent, or the estimate; null when unknown */
  monthlyAmount: number | null;
  contract: { startMonth: string | null; endMonth: string | null; datesInvalid: boolean };
  summary: ObligationSummary;
};

// ---------------------------------------------------------------- labels

export const OBLIGATION_LABEL = {
  before_system: 'مسدّد قبل المنظومة',
  paid: 'مسدّد',
  partial: 'مسدّد جزئياً',
  due: 'مستحق',
  overdue: 'متأخر',
  upcoming: 'قادم',
  idle: 'لا استحقاق',
  before_contract: 'قبل العقد',
  after_contract: 'بعد العقد',
  unknown_start: 'بداية المتابعة غير محدّدة',
} as const;

/** Where the tracking start came from, in words. */
export const TRACKING_SOURCE_TEXT: Record<TrackingStart['source'], string> = {
  tag: 'محدّدة يدوياً',
  first_payment: 'من أول دفعة مسجّلة',
  go_live: 'من بداية تشغيل المنظومة',
  none: 'غير محدّدة',
};

const MONTH_FORMS: [string, string, string, string] = ['شهر واحد', 'شهران', 'أشهر', 'شهراً'];
export const obligationMonthsText = (n: number) => arabicCount(n, MONTH_FORMS);

// ---------------------------------------------------------------- month arithmetic

const EPS = 0.0005;
const MAX_FORWARD_SPILL = 24;
/** Tracking further back than this is not walked month by month: a tag such as 1999-01 must not freeze a page. */
const MAX_BACK_MONTHS = 240;
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const amountOf = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const monthKeyOf = (d: string | null | undefined) => {
  const s = String(d ?? '').slice(0, 7);
  return MONTH_KEY.test(s) ? s : null;
};
const monthIndex = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;
const keyOfIndex = (i: number) => `${String(Math.floor(i / 12)).padStart(4, '0')}-${String((i % 12) + 1).padStart(2, '0')}`;
export const addMonths = (key: string, n: number) => keyOfIndex(monthIndex(key) + n);

/** "YYYY-MM" of the earliest contact creation: when the system started to be used. Null for no valid date. */
export function goLiveMonthOf(contacts: readonly { created_at?: string | null }[]): string | null {
  let first: string | null = null;
  for (const c of contacts) {
    if (!c.created_at) continue;
    const at = new Date(c.created_at);
    if (Number.isNaN(at.getTime())) continue;
    // local calendar day, the way every other date in the system is read
    const month = todayISODate(at).slice(0, 7);
    if (first === null || month < first) first = month;
  }
  return first;
}

/** Payments grouped by the contact they belong to (contact_id, else contact.id); rows without one are dropped. */
export function groupPaymentsByContact<T extends Pick<ObligationPayment, 'contact_id' | 'contact'>>(rows: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = row.contact_id ?? row.contact?.id;
    if (!id) continue;
    const list = map.get(id);
    if (list) list.push(row);
    else map.set(id, [row]);
  }
  return map;
}

// ---------------------------------------------------------------- which months a payment names

/** Same names, in the same spellings, as extractTargetRentMonth (verify-obligation-months keeps them in step). */
const MONTH_NAMES: ReadonlyArray<readonly [string, number]> = [
  ['يناير', 1], ['فبراير', 2], ['مارس', 3], ['أبريل', 4], ['ابريل', 4], ['مايو', 5], ['يونيو', 6],
  ['يوليو', 7], ['أغسطس', 8], ['اغسطس', 8], ['سبتمبر', 9], ['أكتوبر', 10], ['اكتوبر', 10], ['نوفمبر', 11], ['ديسمبر', 12],
];
const RANGE_WORDS = /^(?:إلى|الى|حتى|لغاية|لغايه|-|–|—|~)$/;

/**
 * The months a payment's description names, oldest first; empty when it names none. One month: exactly what
 * `landlordPaymentMonthKey` answers. Several months in one description (a list or a "from … to …" range) are
 * all returned.
 */
export function namedMonthKeys(tx: { description?: string | null; tx_date: string }): string[] {
  const description = tx.description ?? '';
  if (!description) return [];
  if (extractTargetRentMonth(description, tx.tx_date).target_rent_month === null) return [];
  const single = [landlordPaymentMonthKey(tx)];

  // an exact month in digits settles it, as in extractTargetRentMonth
  const lower = description.toLowerCase();
  if (/\b(202\d)-(0[1-9]|1[0-2])\b/.test(lower) || /\b(0?[1-9]|1[0-2])\/(202\d)\b/.test(lower)) return single;

  const hits: { at: number; end: number; month: number }[] = [];
  for (const [name, month] of MONTH_NAMES) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(name, from);
      if (at < 0) break;
      hits.push({ at, end: at + name.length, month });
      from = at + name.length;
    }
  }
  hits.sort((a, b) => a.at - b.at);
  if (new Set(hits.map((h) => h.month)).size < 2) return single;

  const paidIn = String(tx.tx_date).slice(0, 7);
  const textYear = /\b(202\d)\b/.exec(lower)?.[1];
  const yearOf = (hit: { end: number; month: number }): number => {
    const right = /^\s*(?:لعام|لسنة|عام|سنة)?\s*(202\d)\b/.exec(lower.slice(hit.end));
    if (right) return Number(right[1]);
    if (textYear) return Number(textYear);
    if (!MONTH_KEY.test(paidIn)) return Number(new Date().getFullYear());
    const ahead = hit.month - Number(paidIn.slice(5, 7));
    const paidYear = Number(paidIn.slice(0, 4));
    return ahead > 6 ? paidYear - 1 : ahead < -6 ? paidYear + 1 : paidYear;
  };
  const keyOf = (hit: { end: number; month: number }) => `${yearOf(hit)}-${String(hit.month).padStart(2, '0')}`;

  const keys = new Set<string>();
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    keys.add(keyOf(hit));
    const next = hits[i + 1];
    // the words between two months, without a year or its «لعام»: «من يوليو 2026 إلى سبتمبر 2026» is a range too
    const between = lower.slice(hit.end, next?.at ?? hit.end).replace(/\b202\d\b/g, ' ').replace(/(?:^|\s)(?:لعام|لسنة|عام|سنة)(?=\s|$)/g, ' ').trim();
    if (next && next.month !== hit.month && RANGE_WORDS.test(between)) {
      const a = monthIndex(keyOf(hit));
      const b = monthIndex(keyOf(next));
      if (b > a && b - a <= 24) for (let k = a + 1; k < b; k++) keys.add(keyOfIndex(k));
    }
  }
  return [...keys].sort();
}

// ---------------------------------------------------------------- the engine

type Cell<T extends ObligationPayment> = { paid: number; shares: ObligationShare<T>[] };

type Analysis<T extends ObligationPayment> = {
  today: string;
  currentMonth: string;
  tracking: TrackingStart;
  rent: number;
  estimate: number | null;
  contract: { startMonth: string | null; endMonth: string | null; datesInvalid: boolean };
  cells: Map<string, Cell<T>>;
  scanFrom: string | null;
};

function analyze<T extends ObligationPayment>(input: ObligationInput<T>): Analysis<T> {
  const { contact } = input;
  const today = /^\d{4}-\d{2}-\d{2}$/.test(input.today ?? '') ? (input.today as string) : todayISODate();
  const currentMonth = today.slice(0, 7);
  const rent = Math.max(0, amountOf(contact.monthly_rent));
  const mode = input.unnamedPayments ?? 'oldest_unpaid';

  let startMonth = monthKeyOf(contact.contract_start);
  let endMonth = monthKeyOf(contact.contract_end);
  const datesInvalid = !!startMonth && !!endMonth && endMonth < startMonth;
  if (datesInvalid) {
    startMonth = null;
    endMonth = null;
  }
  const outsideContract = (key: string) => (startMonth !== null && key < startMonth) || (endMonth !== null && key > endMonth);

  // the payments that count: money that moved, of this contact, in the direction asked
  const usable: { tx: T; amount: number; paidIn: string }[] = [];
  for (const tx of input.payments) {
    if (!isCountedTransaction(tx)) continue;
    const owner = tx.contact?.id ?? tx.contact_id;
    if (owner && owner !== contact.id) continue;
    if (input.kind && tx.kind && tx.kind !== input.kind) continue;
    const amount = round3(amountOf(tx.amount));
    const paidIn = monthKeyOf(tx.tx_date);
    if (amount <= EPS || !paidIn) continue;
    usable.push({ tx, amount, paidIn });
  }
  usable.sort((a, b) => String(a.tx.tx_date).slice(0, 10).localeCompare(String(b.tx.tx_date).slice(0, 10)));

  // where tracking starts
  const tag = readTags(contact.notes).since;
  const goLive = input.goLiveMonth && MONTH_KEY.test(input.goLiveMonth) ? input.goLiveMonth : null;
  const tracking: TrackingStart = tag
    ? { month: tag, source: 'tag' }
    : usable.length > 0
      ? { month: usable[0].paidIn, source: 'first_payment' }
      : goLive
        ? { month: goLive, source: 'go_live' }
        : { month: null, source: 'none' };
  const scanFrom = tracking.month ? (tracking.month < addMonths(currentMonth, -MAX_BACK_MONTHS) ? addMonths(currentMonth, -MAX_BACK_MONTHS) : tracking.month) : null;

  // attribution
  const cells = new Map<string, Cell<T>>();
  const paidOf = (key: string) => cells.get(key)?.paid ?? 0;
  const add = (key: string, tx: T, amount: number, how: ObligationShareHow) => {
    if (amount <= EPS) return;
    const cell = cells.get(key) ?? { paid: 0, shares: [] };
    cell.paid = round3(cell.paid + amount);
    cell.shares.push({ tx, amount: round3(amount), how });
    cells.set(key, cell);
  };

  const unnamed: typeof usable = [];
  for (const p of usable) {
    const named = namedMonthKeys(p.tx);
    if (named.length === 0) {
      unnamed.push(p);
      continue;
    }
    // equal parts; the cent left over by rounding goes to the last month
    const part = round3(p.amount / named.length);
    named.forEach((key, i) => add(key, p.tx, i === named.length - 1 ? round3(p.amount - part * (named.length - 1)) : part, 'named'));
  }

  // with a rent set, "full" is known; without one a month with any money counts as full only for the status
  const fifo = mode === 'oldest_unpaid' && rent > 0;
  for (const { tx, amount, paidIn } of unnamed) {
    if (!fifo || !scanFrom || paidIn < scanFrom) {
      add(paidIn, tx, amount, 'payment_month');
      continue;
    }
    let left = amount;
    // 1. the oldest months that still lack money, up to the month it was paid in
    for (let i = monthIndex(scanFrom); i <= monthIndex(paidIn) && left > EPS; i++) {
      const key = keyOfIndex(i);
      if (outsideContract(key)) continue;
      const gap = round3(rent - paidOf(key));
      if (gap <= EPS) continue;
      const take = Math.min(left, gap);
      add(key, tx, take, key === paidIn ? 'payment_month' : 'oldest_unpaid');
      left = round3(left - take);
    }
    // 2. a surplus moves on to the following months (rent paid ahead), the rest stays in the last one used
    let last = paidIn;
    for (let step = 1; left > EPS && step <= MAX_FORWARD_SPILL; step++) {
      const key = addMonths(paidIn, step);
      if (outsideContract(key)) break;
      const gap = round3(rent - paidOf(key));
      if (gap <= EPS) continue;
      const take = Math.min(left, gap);
      add(key, tx, take, 'spill');
      left = round3(left - take);
      last = key;
    }
    if (left > EPS) add(last, tx, left, last === paidIn ? 'payment_month' : 'spill');
  }

  // without a rent: the latest month with money recorded, a finished month first
  let estimate: number | null = null;
  if (rent <= 0) {
    let latest: string | null = null;
    for (const [key, cell] of cells) {
      if (cell.paid <= EPS || key >= currentMonth || outsideContract(key)) continue;
      if (latest === null || key > latest) latest = key;
    }
    if (latest === null && paidOf(currentMonth) > EPS && !outsideContract(currentMonth)) latest = currentMonth;
    estimate = latest ? paidOf(latest) : null;
  }

  return { today, currentMonth, tracking, rent, estimate, contract: { startMonth, endMonth, datesInvalid }, cells, scanFrom };
}

function describe<T extends ObligationPayment>(a: Analysis<T>, key: string): ObligationMonth<T> {
  const cell = a.cells.get(key);
  const paid = cell?.paid ?? 0;
  const shares = cell?.shares ?? [];
  const { startMonth, endMonth } = a.contract;
  const authoritative = a.rent > 0;
  const monthNum = Number(key.slice(5, 7));
  const isPast = key < a.currentMonth;

  let idleReason: ObligationIdleReason | null = null;
  if (startMonth !== null && key < startMonth) idleReason = 'before_contract';
  else if (endMonth !== null && key > endMonth) idleReason = 'after_contract';

  let status: ObligationMonthStatus;
  if (idleReason) status = 'idle';
  else if (paid > EPS) status = authoritative && paid < a.rent - EPS ? 'partial' : 'paid';
  else if (a.tracking.month !== null && key < a.tracking.month) status = 'before_system';
  else if (key > a.currentMonth) status = 'upcoming';
  else if (a.tracking.month === null) {
    status = 'idle';
    idleReason = 'unknown_start';
  } else status = 'due';

  // what the month should hold: a rent is certain, an estimate only prices months nothing was paid for
  let expected: number | null = null;
  let estimated = false;
  if (authoritative) {
    if (status === 'paid' || status === 'partial' || status === 'due' || status === 'upcoming') expected = a.rent;
  } else if ((status === 'due' || status === 'upcoming') && a.estimate !== null) {
    expected = a.estimate;
    estimated = true;
  }

  const overdue = (status === 'due' || status === 'partial') && isPast;
  let remaining = 0;
  let remainingKnown = true;
  if (status === 'partial') remaining = round3((expected ?? 0) - paid);
  else if (status === 'due') {
    remaining = expected ?? 0;
    remainingKnown = expected !== null;
  }
  const overpaid = authoritative && (status === 'paid') && paid > a.rent + EPS ? round3(paid - a.rent) : 0;

  const label =
    status === 'idle' && idleReason
      ? OBLIGATION_LABEL[idleReason]
      : status === 'due'
        ? overdue ? OBLIGATION_LABEL.overdue : OBLIGATION_LABEL.due
        : OBLIGATION_LABEL[status];

  return {
    monthKey: key,
    year: Number(key.slice(0, 4)),
    monthNum,
    monthNameAr: landlordMonthName(monthNum),
    status,
    label,
    idleReason,
    expected,
    estimated,
    paid,
    remaining,
    remainingKnown,
    overpaid,
    overdue,
    current: key === a.currentMonth,
    shares,
  };
}

function summarize<T extends ObligationPayment>(a: Analysis<T>, months: readonly ObligationMonth<T>[]): ObligationSummary {
  const count = (s: ObligationMonthStatus) => months.filter((m) => m.status === s).length;

  const owed = { months: 0, overdue: 0, amount: 0, amountComplete: true, estimated: false, oldest: null as string | null, newest: null as string | null };
  if (a.scanFrom) {
    for (let i = monthIndex(a.scanFrom); i <= monthIndex(a.currentMonth); i++) {
      const m = describe(a, keyOfIndex(i));
      if (m.status !== 'due' && m.status !== 'partial') continue;
      owed.months += 1;
      if (m.overdue) owed.overdue += 1;
      if (m.remainingKnown) owed.amount += m.remaining;
      else owed.amountComplete = false;
      if (m.estimated) owed.estimated = true;
      owed.oldest ??= m.monthKey;
      owed.newest = m.monthKey;
    }
  }
  owed.amount = round3(owed.amount);

  return {
    paid: count('paid'),
    partial: count('partial'),
    due: count('due'),
    upcoming: count('upcoming'),
    idle: count('idle'),
    beforeSystem: count('before_system'),
    owed,
  };
}

function view<T extends ObligationPayment>(a: Analysis<T>, keys: string[]): ObligationView<T> {
  const months = keys.map((k) => describe(a, k));
  return {
    today: a.today,
    currentMonth: a.currentMonth,
    months,
    tracking: a.tracking,
    amountSource: a.rent > 0 ? 'monthly_rent' : a.estimate !== null ? 'estimate' : 'unknown',
    monthlyAmount: a.rent > 0 ? a.rent : a.estimate,
    contract: a.contract,
    summary: summarize(a, months),
  };
}

// ---------------------------------------------------------------- public builders

/** The twelve months of a calendar year. */
export function buildObligationYear<T extends ObligationPayment>(input: ObligationInput<T> & { year?: number }): ObligationView<T> {
  const a = analyze(input);
  const year = input.year ?? (Number(a.currentMonth.slice(0, 4)) || new Date().getFullYear());
  return view(a, Array.from({ length: 12 }, (_, i) => `${String(year).padStart(4, '0')}-${String(i + 1).padStart(2, '0')}`));
}

/** The twelve months ending with the current one, across a year boundary when needed. */
export function buildObligationLast12<T extends ObligationPayment>(input: ObligationInput<T>): ObligationView<T> {
  const a = analyze(input);
  return view(a, Array.from({ length: 12 }, (_, i) => addMonths(a.currentMonth, i - 11)));
}

/** Only the numbers a list row needs: the current year's counts and everything owed. */
export function summarizeObligation<T extends ObligationPayment>(input: ObligationInput<T>): ObligationSummary {
  return buildObligationYear(input).summary;
}

export type ObligationAggregate = {
  contacts: number;
  /** contacts with at least one month due or part-paid */
  contactsOwing: number;
  /** months due or part-paid, all contacts */
  dueMonths: number;
  overdueMonths: number;
  amount: number;
  amountComplete: boolean;
  estimated: boolean;
  /** months settled before the system, in the views */
  settledBeforeSystem: number;
};

/** The totals of many contacts, for a list header or the dashboard. */
export function aggregateObligations(summaries: readonly ObligationSummary[]): ObligationAggregate {
  const out: ObligationAggregate = { contacts: summaries.length, contactsOwing: 0, dueMonths: 0, overdueMonths: 0, amount: 0, amountComplete: true, estimated: false, settledBeforeSystem: 0 };
  for (const s of summaries) {
    if (s.owed.months > 0) out.contactsOwing += 1;
    out.dueMonths += s.owed.months;
    out.overdueMonths += s.owed.overdue;
    out.amount += s.owed.amount;
    if (!s.owed.amountComplete) out.amountComplete = false;
    if (s.owed.estimated) out.estimated = true;
    out.settledBeforeSystem += s.beforeSystem;
  }
  out.amount = round3(out.amount);
  return out;
}
