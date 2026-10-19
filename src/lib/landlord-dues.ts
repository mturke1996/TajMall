/**
 * What the mall owes its landlords: for each landlord this month's rent (due, paid, remaining), the earlier
 * months of the year that were never paid, and who to pay first.
 *
 * It is a reading of `buildLandlordRentSchedule`, so the directory, the landlord's profile and any
 * dashboard row show one answer. Rent is owed for a month that has started, inside the landlord's
 * contract; a payment is a counted (POSTED or RECONCILED) expense to the landlord, and the month it is for
 * is the one its description names. Months before January of the current year are not looked at.
 */
import {
  buildLandlordRentSchedule,
  extractContactBusinessRole,
  landlordMonthName,
  landlordPaymentDescription,
  type LandlordRentNotDueReason,
  type LandlordRentTx,
} from '@/lib/contacts/contact-roles';
import type { ContactRow } from '@/lib/db/types';
import { arabicCount } from '@/lib/utils';

export type LandlordDueStatus = 'arrears' | 'unpaid' | 'partial' | 'paid' | 'none';

export type LandlordOwedMonth = {
  monthKey: string;
  monthNameAr: string;
  year: number;
  due: number;
  paid: number;
  remaining: number;
};

/** The payment the "سداد" action starts: the oldest month that still lacks money. */
export type LandlordNextPayment = {
  monthKey: string;
  monthNameAr: string;
  year: number;
  /** what that month still lacks */
  amount: number;
  /** an earlier month than the current one */
  late: boolean;
  /** text for the new transaction; the schedule reads the month back from it */
  description: string;
};

export type LandlordDue = {
  contactId: string;
  name: string;
  /** the leased site */
  site: string | null;
  phone: string | null;
  monthlyRent: number;
  status: LandlordDueStatus;
  /** why this month carries no rent (contract ended or not begun yet); null when it does */
  idleReason: Extract<LandlordRentNotDueReason, 'before_contract' | 'after_contract' | 'no_rent'> | null;
  /** this month */
  due: number;
  paid: number;
  remaining: number;
  /** earlier months of the year, oldest first, that still lack money */
  arrears: { months: LandlordOwedMonth[]; amount: number };
  /** this month's remainder plus the arrears */
  owed: number;
  next: LandlordNextPayment | null;
  /** no contract start is recorded, so the arrears are counted from January */
  contractStartMissing: boolean;
  contractDatesInvalid: boolean;
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
  };
  /** landlords left out because no monthly rent is recorded for them */
  noRent: number;
};

const EPS = 0.0005;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const MONTH_FORMS: [string, string, string, string] = ['شهر واحد', 'شهران', 'أشهر', 'شهراً'];
export const LANDLORD_DUES_MONTHS = (n: number) => arabicCount(n, MONTH_FORMS);

/** The people directory with the landlords filter (the `role` parameter is read once the directory supports it; until then it opens the directory). */
export const LANDLORD_DUES_HREF = '/mall?tab=people&role=LANDLORD';

/**
 * First day the payments are read from. A rent for January is often paid in December, so the read starts
 * at the beginning of the month before the year.
 */
export function landlordDuesWindowStart(today: string): string {
  const year = Number(today.slice(0, 4));
  return `${year - 1}-12-01`;
}

/** Landlords with a monthly rent, and how many were left out for having none. Inactive files owe nothing new. */
export function selectDueLandlords(contacts: readonly ContactRow[]): { landlords: ContactRow[]; noRent: number } {
  const landlords: ContactRow[] = [];
  let noRent = 0;
  for (const c of contacts) {
    if (c.is_active === false || extractContactBusinessRole(c) !== 'LANDLORD') continue;
    if (Number(c.monthly_rent) > 0) landlords.push(c);
    else noRent += 1;
  }
  return { landlords, noRent };
}

/** One landlord's position on `today`, from any list of transactions that includes their payments. */
export function buildLandlordDue(contact: ContactRow, transactions: readonly LandlordRentTx[], today: string): LandlordDue {
  const year = Number(today.slice(0, 4));
  const monthKey = today.slice(0, 7);
  const schedule = buildLandlordRentSchedule(contact, transactions, year, { today });
  const current = schedule.months.find((m) => m.monthKey === monthKey);
  if (!current) throw new RangeError(`today is not a date: ${today}`);

  const owedMonth = (m: (typeof schedule.months)[number]): LandlordOwedMonth => ({
    monthKey: m.monthKey,
    monthNameAr: m.monthNameAr,
    year: m.year,
    due: m.expectedAmount,
    paid: m.paidAmount,
    remaining: m.remainingAmount,
  });
  const arrearsMonths = schedule.months.filter((m) => m.monthKey < monthKey && m.remainingAmount > 0).map(owedMonth);
  const arrearsAmount = round3(arrearsMonths.reduce((s, m) => s + m.remaining, 0));

  const status: LandlordDueStatus =
    arrearsMonths.length > 0
      ? 'arrears'
      : !current.due
        ? 'none'
        : current.remainingAmount > 0
          ? current.paidAmount > EPS
            ? 'partial'
            : 'unpaid'
          : 'paid';

  const target = arrearsMonths[0] ?? (current.remainingAmount > 0 ? owedMonth(current) : null);
  const reason = current.notDueReason;

  return {
    contactId: contact.id,
    name: contact.name,
    site: contact.shop_number?.trim() || null,
    phone: contact.phone?.trim() || null,
    monthlyRent: schedule.monthlyRent,
    status,
    idleReason: reason === 'before_contract' || reason === 'after_contract' || reason === 'no_rent' ? reason : null,
    due: current.expectedAmount,
    paid: current.paidAmount,
    remaining: current.remainingAmount,
    arrears: { months: arrearsMonths, amount: arrearsAmount },
    owed: round3(current.remainingAmount + arrearsAmount),
    next: target
      ? {
          monthKey: target.monthKey,
          monthNameAr: target.monthNameAr,
          year: target.year,
          amount: target.remaining,
          late: target.monthKey < monthKey,
          description: landlordPaymentDescription(contact.name, target.monthKey),
        }
      : null,
    contractStartMissing: schedule.contractStartMissing,
    contractDatesInvalid: schedule.contractDatesInvalid,
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

/** Every landlord with a monthly rent, with this month's position, from the contacts and their payments. */
export function buildLandlordDues(input: {
  contacts: readonly ContactRow[];
  transactions: readonly LandlordRentTx[];
  /** "YYYY-MM-DD" */
  today: string;
}): LandlordDues {
  const { today } = input;
  const { landlords, noRent } = selectDueLandlords(input.contacts);
  const rows = landlords.map((c) => buildLandlordDue(c, input.transactions, today)).sort(compareLandlordDues);
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
      owing: rows.filter((r) => r.owed > EPS).length,
      behind: rows.filter((r) => r.arrears.months.length > 0).length,
    },
    noRent,
  };
}

/**
 * What a dashboard follow-up row needs: how many landlords the mall owes, how much, whether any is behind
 * (bad) or it is only this month's rent (warn), and where to go. Null when nothing is owed.
 */
export function landlordDuesAttention(dues: LandlordDues): { count: number; amount: number; tone: 'bad' | 'warn'; href: string } | null {
  if (dues.totals.owing === 0) return null;
  return {
    count: dues.totals.owing,
    amount: dues.totals.owed,
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
    case 'no_rent':
      return 'الإيجار الشهري غير مسجَّل';
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
export function landlordPayLabel(next: LandlordNextPayment): string {
  return `سداد ${next.monthNameAr}`;
}
