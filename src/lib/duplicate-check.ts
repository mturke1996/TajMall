/**
 * "Did I just enter this already?" — the soft check the new-transaction dialog runs before posting.
 *
 * A possible duplicate is a counted transaction (POSTED or RECONCILED, like every total in the system)
 * of the same kind and the same amount, within ±3 days of the entry date, for the same party or the same
 * account. Two different parties paying the same amount on the same account are not duplicates (two
 * tenants paying the same rent), and nothing here blocks a save: the dialog asks for a tick
 * «ليست مكررة», so two genuinely identical payments in one day stay postable.
 *
 * Pure: the rows come from a narrow query (kind + amount + date window), not the whole ledger.
 */
import { arabicCount } from '@/lib/utils';

export const DUPLICATE_WINDOW_DAYS = 3;
/** the statuses every total counts; a draft or voided row cannot be the other copy */
export const COUNTED_STATUSES = ['POSTED', 'RECONCILED'] as const;
export type DuplicateKind = 'REVENUE' | 'EXPENSE';

/** the columns the narrow query reads */
export type DuplicateCandidate = {
  id: string;
  number: number | string;
  kind: string;
  status: string;
  amount: number | string;
  tx_date: string;
  description: string | null;
  contact_id: string | null;
  category_id: string | null;
};

export type DuplicateProbe = {
  kind: DuplicateKind;
  /** dinars */
  amount: number;
  contactId?: string | null;
  categoryId?: string | null;
  /** "YYYY-MM-DD" */
  date: string;
};

export type DuplicateMatch = {
  id: string;
  number: number;
  date: string;
  description: string | null;
  /** whole days between the two dates, never negative */
  daysApart: number;
  sameContact: boolean;
  sameCategory: boolean;
  /** same day, same party/none and same account: almost surely the same entry typed twice */
  identical: boolean;
};

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day as a day count (UTC arithmetic, so DST never shifts it); null for anything else. */
export function dayNumber(iso: string): number | null {
  const m = ISO.exec(iso ?? '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return Math.round(t / 86_400_000);
}

function isoFromDayNumber(n: number): string {
  const d = new Date(n * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function daysBetween(a: string, b: string): number | null {
  const x = dayNumber(a);
  const y = dayNumber(b);
  return x === null || y === null ? null : Math.abs(x - y);
}

/** The date range a query must cover: the entry date ± the window, as "YYYY-MM-DD". */
export function dateWindow(date: string, days = DUPLICATE_WINDOW_DAYS): { from: string; to: string } | null {
  const n = dayNumber(date);
  if (n === null) return null;
  return { from: isoFromDayNumber(n - days), to: isoFromDayNumber(n + days) };
}

/** An amount in thousandths of a dinar (the column has three decimals), so 0.1 + 0.2 meets 0.3. Null if not a positive amount. */
export function amountKey(value: number | string | null | undefined): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1000);
}

const same = (a: string | null | undefined, b: string | null | undefined) => Boolean(a) && Boolean(b) && a === b;

/**
 * The counted transactions that may be the same entry, nearest date first, then newest number.
 * Nothing found (or an unusable amount or date) is an empty list.
 */
export function findPossibleDuplicates(probe: DuplicateProbe, rows: readonly DuplicateCandidate[], limit = 5): DuplicateMatch[] {
  const key = amountKey(probe.amount);
  if (key === null || dayNumber(probe.date) === null) return [];

  const found: DuplicateMatch[] = [];
  for (const r of rows) {
    if (!(COUNTED_STATUSES as readonly string[]).includes(r.status)) continue;
    if (r.kind !== probe.kind) continue;
    if (amountKey(r.amount) !== key) continue;
    const apart = daysBetween(r.tx_date, probe.date);
    if (apart === null || apart > DUPLICATE_WINDOW_DAYS) continue;

    // two different parties are two different payments, whatever the account
    if (probe.contactId && r.contact_id && probe.contactId !== r.contact_id) continue;
    const sameContact = same(probe.contactId, r.contact_id);
    const sameCategory = same(probe.categoryId, r.category_id);
    if (!sameContact && !sameCategory) continue;

    const bothWithoutParty = !probe.contactId && !r.contact_id;
    found.push({
      id: r.id,
      number: Number(r.number),
      date: r.tx_date,
      description: r.description?.trim() || null,
      daysApart: apart,
      sameContact,
      sameCategory,
      identical: apart === 0 && sameCategory && (sameContact || bothWithoutParty),
    });
  }
  found.sort((a, b) => a.daysApart - b.daysApart || b.number - a.number);
  return found.slice(0, limit);
}

/**
 * Identifies the set of matches shown. The «ليست مكررة» tick belongs to one signature: when the amount,
 * party or date changes and the matches change, the tick no longer holds and is asked for again.
 */
export function duplicateSignature(matches: readonly DuplicateMatch[]): string {
  return matches
    .map((m) => m.id)
    .sort()
    .join('|');
}

/** Posting may go ahead when there is nothing to confirm, or the tick was given for exactly these matches. */
export function duplicatesConfirmed(matches: readonly DuplicateMatch[], acknowledgedSignature: string | null): boolean {
  return matches.length === 0 || acknowledgedSignature === duplicateSignature(matches);
}

const SIMILAR: [string, string, string, string] = ['معاملة مشابهة', 'معاملتان مشابهتان', 'معاملات مشابهة', 'معاملة مشابهة'];

/** «يوجد معاملة مشابهة» / «يوجد معاملتان مشابهتان» / «يوجد 3 معاملات مشابهة». */
export function duplicateHeadlineAr(matches: readonly DuplicateMatch[]): string {
  return `يوجد ${arabicCount(matches.length, SIMILAR)}`;
}

/** What made them similar, in words: «نفس المبلغ والجهة»، «نفس المبلغ والبند»، or both. */
export function duplicateReasonAr(matches: readonly DuplicateMatch[]): string {
  const parts = ['المبلغ'];
  if (matches.some((m) => m.sameContact)) parts.push('الجهة');
  if (matches.some((m) => m.sameCategory)) parts.push('البند');
  return `نفس ${parts.join(' و')}، بفارق ${arabicCount(DUPLICATE_WINDOW_DAYS, ['يوم', 'يومين', 'أيام', 'يوماً'])} على الأكثر`;
}
