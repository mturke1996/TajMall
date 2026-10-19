/**
 * A tenant's rent account, month by month: what each month is worth, what was paid on it, what is still
 * owed, and whether that is owed now or later. The profile's summary, its calendar and its totals all
 * read from this one model, so they cannot disagree.
 *
 * Inputs are the merged calendars (charges with their journal links, with months before the claim
 * start and manually exempt months already marked) and the database's pricing rules
 * (src/lib/rent-allocation.ts). A month without a charge is worth what the database would charge for it.
 *
 * Owed now = months that have started, are inside the claim period and are not fully paid. A month with
 * no charge counts only from the claim start (or, when no claim start is recorded, from the first charged
 * month): before that nothing says the tenant owed it. When every lease of the tenant has ended, a month with
 * no charge after the end of the last one is not owed either (`claimEnd`); a charge that was raised, or money
 * that was paid, keeps its month visible.
 */
import { isCountedTransaction } from '@/lib/contacts/contact-transactions';
import { resolveRentAmount, roundLyd, type RentPricing } from '@/lib/rent-allocation';
import {
  formatMonthLabelAr,
  monthNameAr,
  type RentCalendarMonth,
  type TenantRentCalendar,
} from '@/lib/rent-months';

export type RentAccountMonthKind =
  /** fully paid */
  | 'paid'
  /** part paid; the rest still owed */
  | 'partial'
  /** charged, nothing paid, the month has started */
  | 'due'
  /** started, inside the claim period, priced, but no charge was ever recorded */
  | 'uncharged'
  /** has not started yet */
  | 'upcoming'
  /** excluded from the claim: before the claim start, after the end of his last lease, or marked "no claim" */
  | 'exempt'
  /** no rent price for this month */
  | 'no_price';

export type RentAccountMonth = {
  month: string;
  kind: RentAccountMonthKind;
  /** charge amount, or what a new charge would be for a month without one */
  amount: number;
  paid: number;
  remaining: number;
  /** the month has started (it is the current month or earlier) */
  started: boolean;
  isCurrent: boolean;
  /** part of `remaining` that is owed now (0 for months that have not started) */
  owedNow: number;
  exemptReason: 'before_start' | 'after_end' | 'manual' | null;
  chargeId: string | null;
  journalNumbers: number[];
};

export type RentAccountYear = {
  year: number;
  months: RentAccountMonth[];
  counts: Record<RentAccountMonthKind, number>;
  /** paid on this year's months (including months paid ahead) */
  collected: number;
  owedNow: number;
};

export type TenantRentAccount = {
  /** newest year first */
  years: RentAccountYear[];
  owedNow: number;
  owedOnCharges: number;
  owedUncharged: number;
  /** months owed now, oldest first */
  owingMonths: string[];
  unchargedMonths: string[];
  currentMonth: RentAccountMonth | null;
  /** last month of the unbroken run of paid months from the start of the claim (null if none) */
  paidThrough: string | null;
  /** the month that unpaid/no-charge months are counted from, if known */
  claimFrom: string | null;
  /** the last month with no charge that is still claimed: the month his last lease ended in; null while a lease runs */
  claimTo: string | null;
};

const ZERO_COUNTS = (): Record<RentAccountMonthKind, number> => ({
  paid: 0,
  partial: 0,
  due: 0,
  uncharged: 0,
  upcoming: 0,
  exempt: 0,
  no_price: 0,
});

function journalNumbersOf(m: RentCalendarMonth): number[] {
  const fromLinks = (m.journal_links ?? [])
    .map((l) => l.journal_number)
    .filter((n): n is number => typeof n === 'number');
  if (fromLinks.length) return [...new Set(fromLinks)].sort((a, b) => a - b);
  return typeof m.journal_number === 'number' ? [m.journal_number] : [];
}

export function buildTenantRentAccount(input: {
  calendars: TenantRentCalendar[];
  pricing: RentPricing;
  /** YYYY-MM-DD or YYYY-MM; months before it are not claimed */
  claimStart: string | null | undefined;
  manualExemptMonths?: Iterable<string>;
  /**
   * YYYY-MM-DD or YYYY-MM: the day his last lease ended, when none of his leases is running (`tenantClaimEnd`).
   * A month after it with no charge is not owed. Omit it while a lease runs or when he has none.
   */
  claimEnd?: string | null;
  /** YYYY-MM of the current month */
  now: string;
}): TenantRentAccount {
  const manual = new Set(input.manualExemptMonths ?? []);
  const claimStartMonth = input.claimStart?.trim() ? input.claimStart.trim().slice(0, 7) : null;
  const claimEndMonth = input.claimEnd?.trim() ? input.claimEnd.trim().slice(0, 7) : null;
  const allMonths = input.calendars.flatMap((c) => c.months);
  const firstChargedMonth =
    allMonths
      .filter((m) => m.charge_id)
      .map((m) => m.month)
      .sort()[0] ?? null;
  const claimFrom = claimStartMonth ?? firstChargedMonth;

  const classify = (m: RentCalendarMonth): RentAccountMonth => {
    const started = m.month <= input.now;
    const base = {
      month: m.month,
      started,
      isCurrent: m.month === input.now,
      chargeId: m.charge_id,
      journalNumbers: journalNumbersOf(m),
      exemptReason: null as RentAccountMonth['exemptReason'],
    };
    const priced = (n: number) => roundLyd(Math.max(n, 0));

    if (m.status === 'exempt') {
      return {
        ...base,
        kind: 'exempt',
        amount: priced(m.amount),
        paid: 0,
        remaining: 0,
        owedNow: 0,
        exemptReason: manual.has(m.month) ? 'manual' : 'before_start',
      };
    }
    if (m.status === 'paid' || m.status === 'partial') {
      const amount = priced(m.amount);
      const paid = priced(Math.min(m.paid, amount));
      const remaining = roundLyd(Math.max(amount - paid, 0));
      return {
        ...base,
        kind: remaining > 0 ? 'partial' : 'paid',
        amount,
        paid,
        remaining,
        owedNow: started ? remaining : 0,
      };
    }
    if (m.status === 'unpaid') {
      // An unpaid charge with nothing paid is re-priced by the database when it is collected.
      const resolved = resolveRentAmount(m.month, input.pricing);
      const amount = priced(resolved > 0 ? resolved : m.amount);
      if (amount <= 0) {
        return { ...base, kind: 'no_price', amount: 0, paid: 0, remaining: 0, owedNow: 0 };
      }
      return {
        ...base,
        kind: started ? 'due' : 'upcoming',
        amount,
        paid: 0,
        remaining: amount,
        owedNow: started ? amount : 0,
      };
    }
    // no_charge / na: what the database would charge for it
    const amount = priced(resolveRentAmount(m.month, input.pricing));
    // his leases have all ended: the rent on his card is no longer billed, and the run raises no more charges
    if (claimEndMonth && m.month > claimEndMonth) {
      return { ...base, kind: 'exempt', amount, paid: 0, remaining: 0, owedNow: 0, exemptReason: 'after_end' };
    }
    if (amount <= 0) {
      return { ...base, kind: 'no_price', amount: 0, paid: 0, remaining: 0, owedNow: 0 };
    }
    if (!started) {
      return { ...base, kind: 'upcoming', amount, paid: 0, remaining: amount, owedNow: 0 };
    }
    if (!claimFrom || m.month < claimFrom) {
      return { ...base, kind: 'exempt', amount, paid: 0, remaining: 0, owedNow: 0, exemptReason: 'before_start' };
    }
    return { ...base, kind: 'uncharged', amount, paid: 0, remaining: amount, owedNow: amount };
  };

  const years: RentAccountYear[] = [...input.calendars]
    .sort((a, b) => b.year - a.year)
    .map((cal) => {
      const months = [...cal.months].sort((a, b) => a.month.localeCompare(b.month)).map(classify);
      const counts = ZERO_COUNTS();
      for (const m of months) counts[m.kind] += 1;
      return {
        year: cal.year,
        months,
        counts,
        collected: roundLyd(months.reduce((s, m) => s + m.paid, 0)),
        owedNow: roundLyd(months.reduce((s, m) => s + m.owedNow, 0)),
      };
    });

  const ordered = years.flatMap((y) => y.months).sort((a, b) => a.month.localeCompare(b.month));
  const owing = ordered.filter((m) => m.owedNow > 0);
  const uncharged = ordered.filter((m) => m.kind === 'uncharged');

  let paidThrough: string | null = null;
  for (const m of ordered) {
    if (m.kind === 'exempt' || m.kind === 'no_price') continue;
    if (m.kind !== 'paid') break;
    paidThrough = m.month;
  }

  return {
    years,
    owedNow: roundLyd(owing.reduce((s, m) => s + m.owedNow, 0)),
    owedOnCharges: roundLyd(owing.filter((m) => m.kind !== 'uncharged').reduce((s, m) => s + m.owedNow, 0)),
    owedUncharged: roundLyd(uncharged.reduce((s, m) => s + m.owedNow, 0)),
    owingMonths: owing.map((m) => m.month),
    unchargedMonths: uncharged.map((m) => m.month),
    currentMonth: ordered.find((m) => m.isCurrent) ?? null,
    paidThrough,
    claimFrom,
    claimTo: claimEndMonth,
  };
}

/**
 * The day to stop claiming rent that was never charged: the latest end date of the tenant's leases, once none
 * of them is running. null while a lease is ACTIVE (the monthly run still bills it, even past its end date),
 * for a tenant with no lease (billed from his card, as before) and when no ended lease has an end date.
 */
export function tenantClaimEnd(
  leases: { status: string; end_date?: string | null }[] | null | undefined,
): string | null {
  if (!leases || leases.length === 0) return null;
  if (leases.some((l) => l.status === 'ACTIVE')) return null;
  const ends = leases
    .map((l) => String(l.end_date ?? '').slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  return ends.length > 0 ? ends[ends.length - 1] : null;
}

const nextMonth = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

/** "شهر واحد"، "شهران"، "3 أشهر"، "12 شهراً" */
export function monthsCountAr(n: number): string {
  if (n === 1) return 'شهر واحد';
  if (n === 2) return 'شهران';
  if (n >= 3 && n <= 10) return `${n} أشهر`;
  return `${n} شهراً`;
}

/** "يناير–ديسمبر 2025، مارس 2026": consecutive months collapsed into ranges. */
export function formatMonthRangesAr(months: string[]): string {
  const sorted = [...new Set(months)].sort();
  const groups: [string, string][] = [];
  for (const m of sorted) {
    const last = groups[groups.length - 1];
    if (last && nextMonth(last[1]) === m) last[1] = m;
    else groups.push([m, m]);
  }
  return groups
    .map(([a, b]) => {
      if (a === b) return formatMonthLabelAr(a);
      if (a.slice(0, 4) === b.slice(0, 4)) return `${monthNameAr(a)}–${monthNameAr(b)} ${a.slice(0, 4)}`;
      return `${formatMonthLabelAr(a)}–${formatMonthLabelAr(b)}`;
    })
    .join('، ');
}

/** Where this month's rent comes from, and the next scheduled change after it. */
export function describeRentPrice(month: string, pricing: RentPricing) {
  const amount = resolveRentAmount(month, pricing);
  const band = pricing.bands
    .filter((b) => month >= b.from_month && month <= b.to_month)
    .sort((a, b) => b.from_month.localeCompare(a.from_month))[0];
  const source: 'bands' | 'lease' | 'contact' | 'none' =
    band && Number(band.amount) > 0
      ? 'bands'
      : Number(pricing.leaseRent) > 0
        ? 'lease'
        : Number(pricing.contactRent) > 0
          ? 'contact'
          : 'none';
  const next = pricing.bands
    .filter((b) => b.from_month > month && Number(b.amount) > 0)
    .sort((a, b) => a.from_month.localeCompare(b.from_month))
    .find((b) => Math.abs(Number(b.amount) - amount) > 0.0005);
  return {
    amount,
    source,
    nextChange: next ? { month: next.from_month, amount: Number(next.amount) } : null,
  };
}

/**
 * Money received as rent but linked to no month: each posted rent receipt minus what its journal entry
 * has been linked to months for. Until it is linked, "owed now" overstates the tenant's debt by it.
 */
export function unlinkedRentReceipts(input: {
  /** the tenant's transactions */
  receipts: { id: string; amount: number | string; status: string; kind: string; category?: { code?: string | null } | null }[];
  /** the tenant's journal entries (source_id is the transaction id for receipts) */
  journalEntries: { id: string; status: string; source_type?: string | null; source_id?: string | null }[];
  /** the tenant's charges with their month links */
  charges: {
    type: string;
    rent_journal_links?: { amount: number | string | null; journal_entry_id: string; journal?: { status?: string | null } | null }[] | null;
  }[];
}): { total: number; count: number } {
  const linked = new Map<string, number>();
  for (const c of input.charges) {
    if (c.type !== 'RENT') continue;
    for (const l of c.rent_journal_links ?? []) {
      if (l.journal?.status === 'REVERSED') continue;
      linked.set(l.journal_entry_id, (linked.get(l.journal_entry_id) ?? 0) + (Number(l.amount) || 0));
    }
  }
  const entryByReceipt = new Map(
    input.journalEntries
      .filter((je) => je.source_type === 'TRANSACTION' && je.source_id && je.status !== 'REVERSED')
      .map((je) => [je.source_id as string, je.id]),
  );
  let total = 0;
  let count = 0;
  for (const t of input.receipts) {
    if (!isCountedTransaction(t) || t.kind !== 'REVENUE' || t.category?.code !== 'REV-RNT') continue;
    const entry = entryByReceipt.get(t.id);
    if (!entry) continue;
    const free = roundLyd((Number(t.amount) || 0) - (linked.get(entry) ?? 0));
    if (free > 0.0005) {
      total += free;
      count += 1;
    }
  }
  return { total: roundLyd(total), count };
}
