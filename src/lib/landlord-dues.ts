/**
 * What the mall owes its landlords: for each landlord this month's rent (due, paid, remaining), the earlier
 * months that were not paid, and who to pay first.
 *
 * It is a reading of the month engine (`people/obligation-months.ts`), the same one the landlord's profile
 * draws its month grid from, so the directory, the profile and the dashboard show one answer:
 *   - a landlord is the contact the role tag (or the older rules) says is one, whether the file sits under
 *     vendors or customers;
 *   - months before the tracking start (the `[since]` tag, else the first recorded payment, else the month the
 *     system went live) were paid before the system and are never owed;
 *   - a landlord with no monthly rent is not dropped: the amount of the latest paid month stands in for it and
 *     every figure that depends on it is flagged as an estimate;
 *   - a payment is a counted (POSTED or RECONCILED) expense to the landlord; the month it is for is the one
 *     its description names.
 */
import { landlordMonthName, landlordPaymentDescription } from '@/lib/contacts/contact-roles';
import { isLandlord } from '@/lib/contacts/contact-tags';
import type { ContactKind, ContactRow } from '@/lib/db/types';
import {
  buildObligationYear,
  goLiveMonthOf,
  groupPaymentsByContact,
  type ObligationMonth,
  type ObligationPayment,
  type ObligationView,
  type TrackingStart,
} from '@/lib/people/obligation-months';
import { arabicCount } from '@/lib/utils';

export type LandlordDueStatus = 'arrears' | 'unpaid' | 'partial' | 'paid' | 'none';

/** Why this month carries no rent. */
export type LandlordIdleReason = 'before_contract' | 'after_contract' | 'before_system' | 'unknown_start';

export type LandlordOwedMonth = {
  monthKey: string;
  monthNameAr: string;
  year: number;
  /** what the month should hold; null when nothing says */
  due: number | null;
  paid: number;
  /** what still lacks (0 when `remainingKnown` is false) */
  remaining: number;
  remainingKnown: boolean;
  /** `due` is a guess from the latest paid month */
  estimated: boolean;
};

/** The payment the "سداد" action starts: the oldest month that still lacks money. */
export type LandlordNextPayment = {
  monthKey: string;
  monthNameAr: string;
  year: number;
  /** what that month still lacks; null when it is not known or only estimated, so the form is left empty */
  amount: number | null;
  /** the amount of the month is a guess */
  estimated: boolean;
  /** an earlier month than the current one */
  late: boolean;
  /** text for the new transaction; the month engine reads the month back from it */
  description: string;
};

/** One month of the current year as the strip under a landlord's name draws it. */
export type LandlordStripMonth = Pick<ObligationMonth, 'monthKey' | 'monthNameAr' | 'status' | 'overdue' | 'current' | 'paid' | 'expected' | 'estimated'>;

export type LandlordDue = {
  contactId: string;
  name: string;
  kind: ContactKind;
  /** the leased site */
  site: string | null;
  phone: string | null;
  /** the monthly rent, or the estimate; null when nothing says */
  monthlyAmount: number | null;
  amountSource: 'monthly_rent' | 'estimate' | 'unknown';
  status: LandlordDueStatus;
  /** why this month carries no rent; null when it does */
  idleReason: LandlordIdleReason | null;
  /** this month */
  due: number;
  paid: number;
  remaining: number;
  /** earlier months, oldest first, that still lack money */
  arrears: { months: LandlordOwedMonth[]; amount: number; amountComplete: boolean };
  /** this month's remainder plus the arrears (a floor when `owedComplete` is false) */
  owed: number;
  /** months owed up to now, this one included */
  owedMonths: number;
  /** every owed month has a known amount */
  owedComplete: boolean;
  /** some of `owed` is an estimate */
  owedEstimated: boolean;
  next: LandlordNextPayment | null;
  tracking: TrackingStart;
  contractDatesInvalid: boolean;
  /** the twelve months of the current year, oldest first */
  yearMonths: LandlordStripMonth[];
};

export type LandlordDues = {
  today: string;
  /** "YYYY-MM" */
  month: string;
  monthNameAr: string;
  year: number;
  /** most urgent first */
  rows: LandlordDue[];
  totals: {
    landlords: number;
    /** this month */
    due: number;
    paid: number;
    remaining: number;
    arrears: number;
    /** remaining + arrears */
    owed: number;
    /** landlords the mall owes something to */
    owing: number;
    /** landlords with an earlier month unpaid */
    behind: number;
    /** landlords whose monthly rent is not recorded, so their figures are estimates */
    estimated: number;
    /** landlords with an owed month whose amount is not known */
    incomplete: number;
  };
};

const EPS = 0.0005;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
/** How far back the months before this year are looked at: the engine does not walk further either. */
const MAX_YEARS_BACK = 20;
const MONTH_FORMS: [string, string, string, string] = ['شهر واحد', 'شهران', 'أشهر', 'شهراً'];
export const LANDLORD_DUES_MONTHS = (n: number) => arabicCount(n, MONTH_FORMS);

/** The people directory with the landlords filter. */
export const LANDLORD_DUES_HREF = '/mall?tab=people&role=LANDLORD';

/** Active landlords, whatever list they are filed under. An inactive file owes nothing new. */
export function selectDueLandlords(contacts: readonly ContactRow[]): ContactRow[] {
  return contacts.filter((c) => c.is_active !== false && isLandlord(c));
}

type EngineInput = {
  contact: ContactRow;
  payments: readonly ObligationPayment[];
  today: string;
  goLiveMonth: string | null;
};

/** The one place the engine is called, so the dues and the profile always ask it the same way. */
export function landlordYearView(input: EngineInput, year: number): ObligationView {
  return buildObligationYear({
    contact: input.contact,
    payments: input.payments,
    today: input.today,
    goLiveMonth: input.goLiveMonth,
    kind: 'EXPENSE',
    year,
  });
}

/** Every month before the current one that is due or part-paid, oldest first, across years. */
function earlierOwedMonths(input: EngineInput, current: ObligationView): ObligationMonth[] {
  const trackingMonth = current.tracking.month;
  if (!trackingMonth) return [];
  const thisYear = Number(current.currentMonth.slice(0, 4));
  const firstYear = Math.max(Number(trackingMonth.slice(0, 4)), thisYear - MAX_YEARS_BACK);
  const out: ObligationMonth[] = [];
  for (let y = firstYear; y <= thisYear; y++) {
    const view = y === thisYear ? current : landlordYearView(input, y);
    for (const m of view.months) {
      if (m.monthKey < current.currentMonth && (m.status === 'due' || m.status === 'partial')) out.push(m);
    }
  }
  return out;
}

/**
 * The payment that settles one month: the amount it still lacks (left empty when that is only a guess, so a
 * wrong figure is never typed in for the accountant) and the text that names the month, which the month engine
 * reads back.
 */
export function landlordPaymentFor(
  contactName: string,
  month: Pick<ObligationMonth, 'monthKey' | 'monthNameAr' | 'year' | 'remaining' | 'remainingKnown' | 'estimated'>,
  today: string,
): LandlordNextPayment {
  return {
    monthKey: month.monthKey,
    monthNameAr: month.monthNameAr,
    year: month.year,
    amount: month.remainingKnown && !month.estimated && month.remaining > EPS ? month.remaining : null,
    estimated: month.estimated,
    late: month.monthKey < today.slice(0, 7),
    description: landlordPaymentDescription(contactName, month.monthKey),
  };
}

const owedMonthOf = (m: ObligationMonth): LandlordOwedMonth => ({
  monthKey: m.monthKey,
  monthNameAr: m.monthNameAr,
  year: m.year,
  due: m.expected,
  paid: m.paid,
  remaining: m.remainingKnown ? m.remaining : 0,
  remainingKnown: m.remainingKnown,
  estimated: m.estimated,
});

/** One landlord's position on `today`, from any list of transactions that includes their payments. */
export function buildLandlordDue(
  contact: ContactRow,
  payments: readonly ObligationPayment[],
  today: string,
  options: { goLiveMonth?: string | null } = {},
): LandlordDue {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new RangeError(`today is not a date: ${today}`);
  const input: EngineInput = { contact, payments, today, goLiveMonth: options.goLiveMonth ?? null };
  const view = landlordYearView(input, Number(today.slice(0, 4)));
  const current = view.months.find((m) => m.current);
  if (!current) throw new RangeError(`today is not a date: ${today}`);

  const earlier = earlierOwedMonths(input, view).map(owedMonthOf);
  const arrearsAmount = round3(earlier.reduce((s, m) => s + m.remaining, 0));
  const currentOwed = current.status === 'due' || current.status === 'partial';
  const currentRemaining = currentOwed && current.remainingKnown ? current.remaining : 0;

  const status: LandlordDueStatus =
    earlier.length > 0
      ? 'arrears'
      : current.status === 'due'
        ? 'unpaid'
        : current.status === 'partial'
          ? 'partial'
          : current.status === 'paid'
            ? 'paid'
            : 'none';

  const idleReason: LandlordIdleReason | null =
    current.status === 'before_system' ? 'before_system' : current.status === 'idle' ? (current.idleReason ?? null) : null;

  const target = earlier[0] ?? (currentOwed ? owedMonthOf(current) : null);
  const amountComplete = earlier.every((m) => m.remainingKnown);

  return {
    contactId: contact.id,
    name: contact.name,
    kind: contact.kind,
    site: contact.shop_number?.trim() || null,
    phone: contact.phone?.trim() || null,
    monthlyAmount: view.monthlyAmount,
    amountSource: view.amountSource,
    status,
    idleReason,
    due: current.expected ?? (current.paid > EPS ? current.paid : 0),
    paid: current.paid,
    remaining: currentRemaining,
    arrears: { months: earlier, amount: arrearsAmount, amountComplete },
    owed: round3(currentRemaining + arrearsAmount),
    owedMonths: earlier.length + (currentOwed ? 1 : 0),
    owedComplete: amountComplete && (!currentOwed || current.remainingKnown),
    owedEstimated: earlier.some((m) => m.estimated) || (currentOwed && current.estimated),
    next: target ? landlordPaymentFor(contact.name, target, today) : null,
    tracking: view.tracking,
    contractDatesInvalid: view.contract.datesInvalid,
    yearMonths: view.months.map(({ monthKey, monthNameAr, status, overdue, current, paid, expected, estimated }) => ({ monthKey, monthNameAr, status, overdue, current, paid, expected, estimated })),
  };
}

const RANK: Record<LandlordDueStatus, number> = { arrears: 0, unpaid: 1, partial: 2, paid: 3, none: 4 };

/**
 * Most urgent first: landlords with an earlier month unpaid (the oldest gap, then the larger sum), then
 * those with nothing paid this month, then part-paid, then settled, then those owed no rent this month.
 */
export function compareLandlordDues(a: LandlordDue, b: LandlordDue): number {
  if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] - RANK[b.status];
  if (a.status === 'arrears') {
    const oldest = a.arrears.months[0].monthKey.localeCompare(b.arrears.months[0].monthKey);
    if (oldest !== 0) return oldest;
  }
  if (Math.abs(a.owed - b.owed) > EPS) return b.owed - a.owed;
  return a.name.localeCompare(b.name, 'ar');
}

/**
 * Every landlord with this month's position. `contacts` is the whole list (the go-live month is the earliest
 * file in it); `transactions` may hold anyone's rows, each landlord reads only their own.
 */
export function buildLandlordDues(input: {
  contacts: readonly ContactRow[];
  transactions: readonly ObligationPayment[];
  /** "YYYY-MM-DD" */
  today: string;
  /** "YYYY-MM"; default: the month of the earliest contact */
  goLiveMonth?: string | null;
}): LandlordDues {
  const { today } = input;
  const goLiveMonth = input.goLiveMonth === undefined ? goLiveMonthOf(input.contacts) : input.goLiveMonth;
  const byContact = groupPaymentsByContact(input.transactions);
  const rows = selectDueLandlords(input.contacts)
    .map((c) => buildLandlordDue(c, byContact.get(c.id) ?? [], today, { goLiveMonth }))
    .sort(compareLandlordDues);
  const sum = (pick: (r: LandlordDue) => number) => round3(rows.reduce((s, r) => s + pick(r), 0));
  const month = today.slice(0, 7);

  return {
    today,
    month,
    monthNameAr: landlordMonthName(Number(month.slice(5, 7))),
    year: Number(month.slice(0, 4)),
    rows,
    totals: {
      landlords: rows.length,
      due: sum((r) => r.due),
      paid: sum((r) => r.paid),
      remaining: sum((r) => r.remaining),
      arrears: sum((r) => r.arrears.amount),
      owed: sum((r) => r.owed),
      owing: rows.filter((r) => r.owedMonths > 0).length,
      behind: rows.filter((r) => r.arrears.months.length > 0).length,
      estimated: rows.filter((r) => r.amountSource !== 'monthly_rent').length,
      incomplete: rows.filter((r) => !r.owedComplete).length,
    },
  };
}

/**
 * What a dashboard follow-up row needs: how many landlords the mall owes, how much, whether any is behind
 * (bad) or it is only this month's rent (warn), and where to go. Null when nothing is owed.
 */
export type LandlordAttention = {
  count: number;
  amount: number;
  /** false when an owed month has no known amount, so `amount` is a floor */
  amountComplete: boolean;
  /** some of `amount` is a guess from the latest paid month, because the monthly rent is not recorded */
  estimated: boolean;
  /** landlords with an earlier month unpaid */
  behind: number;
  tone: 'bad' | 'warn';
  href: string;
};

export function landlordDuesAttention(dues: LandlordDues): LandlordAttention | null {
  if (dues.totals.owing === 0) return null;
  return {
    count: dues.totals.owing,
    amount: dues.totals.owed,
    amountComplete: dues.totals.incomplete === 0,
    estimated: dues.rows.some((r) => r.owedEstimated),
    behind: dues.totals.behind,
    tone: dues.totals.behind > 0 ? 'bad' : 'warn',
    href: LANDLORD_DUES_HREF,
  };
}

// ---- wording shared by the directory and the profile ----

/** Why this month carries no rent, in words. */
export function landlordIdleText(reason: LandlordDue['idleReason']): string | null {
  switch (reason) {
    case 'after_contract':
      return 'العقد منتهٍ، لا إيجار هذا الشهر';
    case 'before_contract':
      return 'العقد لم يبدأ، لا إيجار هذا الشهر';
    case 'before_system':
      return 'مسدّد قبل المنظومة';
    case 'unknown_start':
      return 'بداية المتابعة غير محدّدة';
    default:
      return null;
  }
}

/** The state in words, so it reads without colour. */
export function landlordDueHeadline(row: Pick<LandlordDue, 'status' | 'idleReason' | 'arrears'>): string {
  switch (row.status) {
    case 'arrears':
      return `إيجار متأخر: ${LANDLORD_DUES_MONTHS(row.arrears.months.length)}`;
    case 'unpaid':
      return 'لم يُسدَّد إيجار هذا الشهر';
    case 'partial':
      return 'سُدّد جزء من إيجار هذا الشهر';
    case 'paid':
      return 'سُدّد إيجار هذا الشهر';
    case 'none':
      return landlordIdleText(row.idleReason) ?? 'لا إيجار هذا الشهر';
  }
}

/** The unpaid earlier months by name; many months are counted and the oldest named. Null when there are none. */
export function landlordArrearsText(row: Pick<LandlordDue, 'arrears'>): string | null {
  const names = row.arrears.months.map((m) => m.monthNameAr);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  if (names.length <= 3) return `${names.slice(0, -1).join('، ')} و${names[names.length - 1]}`;
  return `${LANDLORD_DUES_MONTHS(names.length)} منذ ${names[0]}`;
}

/** The label of the pay action: names the month it pays. */
export function landlordPayLabel(next: Pick<LandlordNextPayment, 'monthNameAr'>): string {
  return `سداد ${next.monthNameAr}`;
}
