/**
 * Everything a landlord's profile draws, from the contact and their payments: the twelve months of a year, the
 * four figures, the payments with the months each one covers, and the tracking-start line.
 *
 * The months and the "owed now" figure come from the same month engine as the directory strip and the
 * dashboard row (`landlord-dues.ts`), so the three can not disagree.
 */
import { withSince } from '@/lib/contacts/contact-tags';
import { isCountedTransaction } from '@/lib/contacts/contact-transactions';
import type { ContactRow } from '@/lib/db/types';
import { buildLandlordDue, landlordYearView, type LandlordDue } from '@/lib/landlord-dues';
import type { ObligationPayment, ObligationShareHow, ObligationView, TrackingStart } from '@/lib/people/obligation-months';

const EPS = 0.0005;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const MAX_YEARS_BACK = 20;
const amountOf = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type LandlordPaymentPart = { monthKey: string; amount: number; how: ObligationShareHow };

export type LandlordPaymentRow = {
  id: string;
  date: string;
  amount: number;
  description: string | null;
  /** the months this payment is counted for */
  parts: LandlordPaymentPart[];
  /** counted only for months after the one it was paid in */
  advance: boolean;
};

export type LandlordYearTotals = {
  /** everything counted for this year's months, also paid ahead */
  paid: number;
  /** what the months up to the current one still lack (known amounts only) */
  owed: number;
  /** part of `paid` that belongs to months that have not started */
  ahead: number;
  paidMonths: number;
  beforeSystemMonths: number;
  dueMonths: number;
};

export type LandlordProfile = {
  today: string;
  year: number;
  /** the twelve months of `year` */
  view: ObligationView;
  /** this month and the arrears, from today */
  due: LandlordDue;
  /** where tracking starts now, and where it would start without the owner's tag */
  tracking: TrackingStart;
  defaultTracking: TrackingStart;
  totals: LandlordYearTotals;
  lastPayment: { amount: number; date: string } | null;
  /** newest first */
  payments: LandlordPaymentRow[];
  /** the years the grid may show */
  years: { min: number; max: number };
};

export type LandlordProfileInput = {
  contact: ContactRow;
  /** the contact's transactions; others are ignored */
  payments: readonly ObligationPayment[];
  today: string;
  goLiveMonth: string | null;
  /** the year of the grid; default: the current one */
  year?: number;
};

const yearOf = (iso: string) => Number(String(iso).slice(0, 4));

export function buildLandlordProfile(input: LandlordProfileInput): LandlordProfile {
  const { contact, today } = input;
  const thisYear = yearOf(today);
  const engine = { contact, payments: input.payments, today, goLiveMonth: input.goLiveMonth };

  // the payments that count: money to this landlord that moved
  const counted = input.payments.filter((p) => {
    const owner = p.contact?.id ?? p.contact_id;
    return isCountedTransaction(p) && (!owner || owner === contact.id) && (p.kind == null || p.kind === 'EXPENSE') && amountOf(p.amount) > EPS;
  });

  const due = buildLandlordDue(contact, input.payments, today, { goLiveMonth: input.goLiveMonth });
  const tracking = due.tracking;
  const defaultTracking = landlordYearView({ ...engine, contact: { ...contact, notes: withSince(contact.notes, null) } }, thisYear).tracking;

  // the years worth showing: from the tracking start or the first payment, to the year after the last payment
  const firstYear = Math.max(
    Math.min(tracking.month ? Number(tracking.month.slice(0, 4)) : thisYear, ...counted.map((p) => yearOf(p.tx_date)), thisYear),
    thisYear - MAX_YEARS_BACK,
  );
  const lastYear = Math.max(thisYear, ...counted.map((p) => yearOf(p.tx_date))) + 1;
  const year = Math.min(Math.max(input.year ?? thisYear, firstYear), lastYear);
  const years = { min: firstYear, max: lastYear };

  // one view per year: the grid shows one of them, the payments table reads the months of all of them
  const views = new Map<number, ObligationView>();
  for (let y = firstYear; y <= lastYear + 1; y++) views.set(y, landlordYearView(engine, y));
  const view = views.get(year) ?? landlordYearView(engine, year);

  const parts = new Map<string, LandlordPaymentPart[]>();
  for (const v of views.values()) {
    for (const m of v.months) {
      for (const s of m.shares) {
        const list = parts.get(s.tx.id) ?? [];
        list.push({ monthKey: m.monthKey, amount: s.amount, how: s.how });
        parts.set(s.tx.id, list);
      }
    }
  }

  const payments: LandlordPaymentRow[] = counted
    .map((p) => {
      const own = (parts.get(p.id) ?? []).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
      const paidIn = String(p.tx_date).slice(0, 7);
      return {
        id: p.id,
        date: String(p.tx_date).slice(0, 10),
        amount: round3(amountOf(p.amount)),
        description: p.description ?? null,
        parts: own,
        advance: own.length > 0 && own.every((x) => x.monthKey > paidIn),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  const current = view.currentMonth;
  const totals: LandlordYearTotals = {
    paid: round3(view.months.reduce((s, m) => s + m.paid, 0)),
    owed: round3(view.months.filter((m) => m.monthKey <= current && (m.status === 'due' || m.status === 'partial')).reduce((s, m) => s + (m.remainingKnown ? m.remaining : 0), 0)),
    ahead: round3(view.months.filter((m) => m.monthKey > current).reduce((s, m) => s + m.paid, 0)),
    paidMonths: view.months.filter((m) => m.status === 'paid').length,
    beforeSystemMonths: view.months.filter((m) => m.status === 'before_system').length,
    dueMonths: view.months.filter((m) => m.status === 'due' || m.status === 'partial').length,
  };

  const last = payments[0];
  return {
    today,
    year,
    view,
    due,
    tracking,
    defaultTracking,
    totals,
    lastPayment: last ? { amount: last.amount, date: last.date } : null,
    payments,
    years,
  };
}

/** What choosing this tracking start would mean for the landlord: how much would read as owed. */
export function previewTrackingStart(input: LandlordProfileInput, month: string | null): { owedMonths: number; amount: number; amountComplete: boolean; oldest: string | null } {
  const contact = { ...input.contact, notes: withSince(input.contact.notes, month) };
  const due = buildLandlordDue(contact, input.payments, input.today, { goLiveMonth: input.goLiveMonth });
  return {
    owedMonths: due.owedMonths,
    amount: due.owed,
    amountComplete: due.owedComplete,
    oldest: due.arrears.months[0]?.monthKey ?? (due.owedMonths > 0 ? input.today.slice(0, 7) : null),
  };
}

/** The words that say how a payment was filed under a month. */
export const PAYMENT_HOW_TEXT: Record<ObligationShareHow, string> = {
  named: 'حسب البيان',
  payment_month: 'شهر الدفع',
  oldest_unpaid: 'سداد متأخر',
  spill: 'مقدّماً',
};
