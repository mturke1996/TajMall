/**
 * What a vendor / customer profile shows, as plain data: the four figures, the twelve-month bars, the account
 * split, the last movements, the statement rows, and the small changes a profile makes to a contact (move to
 * the other list, approve as landlord, keep the type and the tracking month through an edit-form save).
 *
 * The screens are a thin layer over this file. Money is counted by direction (see party-stats.ts), never by the
 * contact's kind, so a landlord filed under customers reads as money out.
 */
import { extractContactBusinessRole, type ContactBusinessRole } from '@/lib/contacts/contact-roles';
import { isCountedTransaction } from '@/lib/contacts/contact-transactions';
import { readTags, visibleNotes, withRole, withSince } from '@/lib/contacts/contact-tags';
import type { ContactRow } from '@/lib/db/types';
import {
  groupAccounts,
  primaryDirection,
  sideOf,
  type Direction,
  type DirectionStats,
  type PartyStats,
} from '@/lib/people/party-stats';
import { formatMonthLabelAr, monthNameAr } from '@/lib/rent-months';

type ContactHints = Partial<Pick<ContactRow, 'kind' | 'notes' | 'job_title' | 'department' | 'monthly_rent'>>;

// ---------------------------------------------------------------- words

/** The few words that change with the direction of the money. */
export const DIRECTION_WORDS: Record<
  Direction,
  { total: string; last: string; lastNone: string; voucher: string; countOf: string; chartTitle: string; accountsTitle: string; centre: string }
> = {
  out: {
    total: 'المدفوع',
    last: 'آخر دفعة',
    lastNone: 'لا دفعات بعد',
    voucher: 'سند صرف',
    countOf: 'سند صرف',
    chartTitle: 'المدفوع شهراً بشهر',
    accountsTitle: 'المدفوع حسب البند',
    centre: 'المدفوع',
  },
  in: {
    total: 'المقبوض',
    last: 'آخر قبض',
    lastNone: 'لا مقبوضات بعد',
    voucher: 'سند قبض',
    countOf: 'سند قبض',
    chartTitle: 'المقبوض شهراً بشهر',
    accountsTitle: 'المقبوض حسب البند',
    centre: 'المقبوض',
  },
};

export const txKindOfDirection = (d: Direction): 'REVENUE' | 'EXPENSE' => (d === 'in' ? 'REVENUE' : 'EXPENSE');

/**
 * The side the profile leads with. The role decides while the transactions are still loading (`stats` null);
 * once they are in, an empty side gives way to the other one (a customer file that only ever received money
 * is a landlord or a utility and leads with money out).
 */
export function profileDirection(contact: ContactHints | null | undefined, stats?: Pick<PartyStats, 'in' | 'out'> | null): Direction {
  return primaryDirection(contact, stats ?? undefined);
}

// ---------------------------------------------------------------- the four figures

export type ProfileFigures = {
  direction: Direction;
  /** the leading side, and the other one */
  side: DirectionStats;
  other: DirectionStats;
  /** the leading side over the twelve months ending this month */
  twelveMonths: number;
  /** all time, on the leading side */
  allTime: number;
  last: DirectionStats['last'];
  /** counted rows on the leading side and on both */
  count: number;
  totalCount: number;
  average: number;
  /** months with at least one row, behind `average` */
  activeMonths: number;
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function buildProfileFigures(stats: PartyStats, direction: Direction): ProfileFigures {
  const side = sideOf(stats, direction);
  const other = sideOf(stats, direction === 'in' ? 'out' : 'in');
  return {
    direction,
    side,
    other,
    twelveMonths: round3(side.series.reduce((s, p) => s + p.amount, 0)),
    allTime: side.total,
    last: side.last,
    count: side.count,
    totalCount: stats.count,
    average: side.averagePerActiveMonth,
    activeMonths: side.activeMonths,
  };
}

// ---------------------------------------------------------------- bars and slices

export type MonthBar = { monthKey: string; label: string; amount: number; count: number };

/**
 * The twelve bars, oldest first. The label is the month name: within twelve months a name never repeats, and the
 * range ("من نوفمبر 2025 إلى أكتوبر 2026") is given by `barsRange`.
 */
export function monthBars(side: Pick<DirectionStats, 'series'>): MonthBar[] {
  return side.series.map((p) => ({ monthKey: p.monthKey, label: monthNameAr(p.monthKey), amount: p.amount, count: p.count }));
}

/** «من نوفمبر 2025 إلى أكتوبر 2026», or an empty string for no bars. */
export function barsRange(bars: readonly Pick<MonthBar, 'monthKey'>[]): string {
  if (bars.length === 0) return '';
  return `من ${formatMonthLabelAr(bars[0].monthKey)} إلى ${formatMonthLabelAr(bars[bars.length - 1].monthKey)}`;
}

/** The month with the most money, for the line under the chart. Null when every month is empty. */
export function peakMonth(bars: readonly MonthBar[]): MonthBar | null {
  let best: MonthBar | null = null;
  for (const b of bars) if (b.amount > 0 && (!best || b.amount > best.amount)) best = b;
  return best;
}

export type AccountSlice = { key: string; label: string; value: number; rest?: boolean };

/** The biggest accounts as slices, the others grouped; the shares add up to the whole side. */
export function accountSlices(side: Pick<DirectionStats, 'accounts'>, top = 5): AccountSlice[] {
  return groupAccounts(side.accounts, { top }).map((a) => ({ key: a.key, label: a.name, value: a.total, rest: a.rest }));
}

// ---------------------------------------------------------------- last movements

type MovementTx = { id: string; tx_date: string; created_at?: string | null; number?: number | string | null };

/** The latest `n` rows by date (then by creation), every status: a draft is still something that happened. */
export function recentMovements<T extends MovementTx>(transactions: readonly T[], n = 5): T[] {
  return [...transactions]
    .sort(
      (a, b) =>
        String(b.tx_date).localeCompare(String(a.tx_date)) ||
        String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')) ||
        Number(b.number ?? 0) - Number(a.number ?? 0) ||
        String(b.id).localeCompare(String(a.id)),
    )
    .slice(0, Math.max(0, n));
}

/** Rows that do not count in any figure: drafts, voided ones. */
export function uncountedCount(transactions: readonly { status?: string | null }[]): number {
  return transactions.filter((t) => !isCountedTransaction(t)).length;
}

// ---------------------------------------------------------------- what the header says

export type ProfileLook = {
  /** the role chip, when the file says more than its kind */
  role: ContactBusinessRole | null;
  /** a plain chip with the kind, when there is no role chip */
  kindLabel: string | null;
};

const KIND_LABEL: Record<string, string> = { VENDOR: 'مورد', CUSTOMER: 'عميل', OTHER: 'جهة أخرى', TENANT: 'مستأجر', EMPLOYEE: 'موظف' };

/**
 * One chip under the name. A role chip when the file names its role (a tag) or the role is not what the kind
 * already says; otherwise the kind in plain words. A landlord never shows «مورد»: it lives under customers
 * whichever way its file is filed.
 */
export function profileLook(contact: ContactHints): ProfileLook {
  const role = extractContactBusinessRole(contact);
  const tagged = readTags(contact.notes).role;
  const plain = role === 'CUSTOMER' || role === 'SUPPLIER_GOODS' || role === 'OTHER';
  if (role === 'LANDLORD' || (tagged && tagged !== 'OTHER') || !plain) return { role, kindLabel: null };
  return { role: null, kindLabel: KIND_LABEL[String(contact.kind)] ?? KIND_LABEL.OTHER };
}

/** «العودة» goes to the list the file is shown in. */
export function backLabel(kind: string, landlord: boolean): string {
  if (landlord && (kind === 'VENDOR' || kind === 'CUSTOMER')) return 'المؤجرون';
  if (kind === 'VENDOR') return 'الموردون';
  if (kind === 'CUSTOMER') return 'العملاء';
  if (kind === 'EMPLOYEE') return 'الموظفون';
  return 'الجهات';
}

// ---------------------------------------------------------------- changing a contact

export type KindMove = 'CUSTOMER' | 'VENDOR';

/** The list a contact can be moved to from where it is; null when its kind is not one of the two. */
export function moveTarget(kind: string | null | undefined): KindMove | null {
  if (kind === 'VENDOR') return 'CUSTOMER';
  if (kind === 'CUSTOMER') return 'VENDOR';
  return null;
}

export const KIND_MOVE_WORDS: Record<KindMove, { menu: string; title: string; done: string; list: string; as: string }> = {
  CUSTOMER: { menu: 'نقل إلى العملاء', title: 'نقل إلى العملاء', done: 'نُقل الملف إلى العملاء', list: 'العملاء', as: 'عميلاً' },
  VENDOR: { menu: 'نقل إلى الموردين', title: 'نقل إلى الموردين', done: 'نُقل الملف إلى الموردين', list: 'الموردين', as: 'مورداً' },
};

/** What the confirmation says. A landlord stays a landlord; only the kind it is filed under changes. */
export function moveDescription(target: KindMove, landlord: boolean): string {
  const from: KindMove = target === 'CUSTOMER' ? 'VENDOR' : 'CUSTOMER';
  return landlord
    ? `يُسجَّل الملف ${KIND_MOVE_WORDS[target].as}. يبقى مؤجراً للمول، والحركات والقيود لا تتغير.`
    : `يُعرض الملف ضمن ${KIND_MOVE_WORDS[target].list} بدل ${KIND_MOVE_WORDS[from].list}. الحركات والقيود لا تتغير.`;
}

const orNull = (s: string) => (s.trim() === '' ? null : s);

/**
 * The change that files a contact under the other list. A landlord keeps its role whichever list it is in, so
 * the role goes into the notes as a tag (older landlords were only recognised by a rent or a title). Any other
 * role tag is dropped: a tag from the old list would keep reading the file as what it no longer is.
 * Transactions and journal entries are not touched.
 */
export function moveKindPatch(
  contact: ContactHints & { notes?: string | null },
  target: KindMove,
): { kind: KindMove; notes: string | null } {
  const landlord = extractContactBusinessRole(contact) === 'LANDLORD';
  return { kind: target, notes: orNull(withRole(contact.notes, landlord ? 'LANDLORD' : null)) };
}

/** The change that approves a contact as a landlord: the role tag in the notes, and the title the form sets. */
export function approveLandlordPatch(contact: Pick<ContactRow, 'notes' | 'job_title'>): { notes: string; job_title: string | null } {
  return {
    notes: withRole(contact.notes, 'LANDLORD'),
    job_title: contact.job_title?.trim() ? contact.job_title : 'مؤجر للمول',
  };
}

type SavePayload = { kind: ContactRow['kind']; notes: string | null };

/**
 * What the edit form built, corrected before it is saved:
 *  - a landlord keeps the list it was filed in (the form derives the kind from the role, which is VENDOR for
 *    every landlord, and would silently move a landlord from customers back to vendors);
 *  - the tracking month `[since:YYYY-MM]` survives, because the form only shows the visible notes.
 * `form` is the form state: `businessRole`, `kind` and, if the form edits it, `since`.
 */
export function reconcileSavePayload<P extends SavePayload>(
  payload: P,
  previous: Pick<ContactRow, 'notes'>,
  form: { businessRole?: ContactBusinessRole | null; kind?: string | null; since?: string | null },
): P {
  let next = payload;
  const filedAs = form.kind === 'CUSTOMER' || form.kind === 'VENDOR' ? form.kind : null;
  if (form.businessRole === 'LANDLORD' && filedAs && payload.kind !== filedAs) next = { ...next, kind: filedAs };

  // a form that carries its own `since` decided already; otherwise keep what the file had
  if (!('since' in form)) {
    const had = readTags(previous.notes).since;
    if (had && !readTags(next.notes).since) next = { ...next, notes: orNull(withSince(next.notes, had)) };
  }
  return next;
}

// ---------------------------------------------------------------- statement

export type StatementTx = {
  id: string;
  number?: number | string | null;
  kind?: string | null;
  status?: string | null;
  amount: string | number | null;
  tx_date: string;
  description?: string | null;
  category?: { name_ar?: string | null } | null;
};

export type StatementRow = {
  id: string;
  number: number | null;
  date: string;
  description: string;
  account: string;
  /** money received from the contact */
  received: number;
  /** money paid to the contact */
  paid: number;
  /** received minus paid, up to and including this row */
  net: number;
};

export type Statement = {
  rows: StatementRow[];
  totalReceived: number;
  totalPaid: number;
  net: number;
  from: string | null;
  to: string | null;
};

/** The counted movements of one contact in date order, each with its side and the running net. */
export function buildStatement(transactions: readonly StatementTx[]): Statement {
  const counted = transactions
    .filter((t) => isCountedTransaction(t) && (t.kind === 'REVENUE' || t.kind === 'EXPENSE'))
    .map((t) => ({ t, amount: Number(t.amount) }))
    .filter(({ amount }) => Number.isFinite(amount) && amount > 0)
    .sort(
      (a, b) =>
        String(a.t.tx_date).localeCompare(String(b.t.tx_date)) ||
        Number(a.t.number ?? 0) - Number(b.t.number ?? 0) ||
        String(a.t.id).localeCompare(String(b.t.id)),
    );

  let net = 0;
  let totalReceived = 0;
  let totalPaid = 0;
  const rows = counted.map(({ t, amount }): StatementRow => {
    const received = t.kind === 'REVENUE' ? amount : 0;
    const paid = t.kind === 'EXPENSE' ? amount : 0;
    totalReceived += received;
    totalPaid += paid;
    net = round3(net + received - paid);
    const n = Number(t.number);
    return {
      id: t.id,
      number: Number.isFinite(n) && t.number != null ? n : null,
      date: String(t.tx_date).slice(0, 10),
      description: (t.description ?? '').trim(),
      account: t.category?.name_ar?.trim() ?? '',
      received,
      paid,
      net,
    };
  });

  return {
    rows,
    totalReceived: round3(totalReceived),
    totalPaid: round3(totalPaid),
    net: round3(totalReceived - totalPaid),
    from: rows[0]?.date ?? null,
    to: rows[rows.length - 1]?.date ?? null,
  };
}

// ---------------------------------------------------------------- details

/** The person-written notes, for the profile. */
export const profileNotes = (notes: string | null | undefined) => visibleNotes(notes);
