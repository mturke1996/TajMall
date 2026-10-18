/**
 * How a rent payment will be split across months — computed exactly as the database does it, so the
 * screen can show the result before anything is saved and refuse what would go wrong.
 *
 * Mirrors, line for line:
 *  - resolve_tenant_rent_amount: price band covering the month (latest start wins) → active lease
 *    rent → the tenant's monthly rent.
 *  - ensure_tenant_rent_charges: a month without a charge gets one at that amount; an existing charge
 *    that is UNPAID with nothing paid is re-priced to it; any other charge keeps its amount.
 *  - set_tenant_rent_month_status: months in calendar order; a month with nothing left is skipped; each
 *    month takes min(money left, what it still owes); running out before a month that still owes
 *    aborts the whole payment.
 *
 * Anything the database would silently get wrong is reported as an issue instead: a fully paid month
 * (it would be skipped and the money left unlinked), money left over after the last month (recorded
 * as revenue but linked to no month), or a month with no price (no charge can be created for it).
 */

export type RentPriceBandInput = { from_month: string; to_month: string; amount: number | string };

export type RentPricing = {
  bands: RentPriceBandInput[];
  /** monthly_rent of the newest ACTIVE lease (ordered by start_date) */
  leaseRent: number | null;
  /** contacts.monthly_rent */
  contactRent: number | null;
};

export type RentChargeInput = {
  amount: number | string | null;
  total_paid: number | string | null;
  status: string | null;
};

export type RentMonthBasis = {
  month: string;
  /** what the month will be worth when the payment is posted */
  amount: number;
  /** already paid on the month, as the database counts it (tenant_charges.total_paid) */
  paid: number;
  remaining: number;
  /** an unpaid charge whose stored amount differs and will be re-priced at payment time */
  repricedFrom: number | null;
  hasCharge: boolean;
};

export type RentAllocationLine = {
  month: string;
  amount: number;
  paidBefore: number;
  applied: number;
  paidAfter: number;
  status: 'paid' | 'partial' | 'skipped';
};

export type RentAllocationIssue =
  | { code: 'no_months' }
  | { code: 'not_consecutive' }
  | { code: 'no_amount' }
  | { code: 'no_price'; month: string }
  | { code: 'already_paid'; month: string }
  /** the money is used up by earlier months; it must be more than `needsMoreThan` to reach this one */
  | { code: 'does_not_reach'; month: string; needsMoreThan: number }
  | { code: 'overpaid'; leftover: number };

export type RentAllocation = {
  lines: RentAllocationLine[];
  totalRemaining: number;
  /** the least that still gives every selected month some money (all but the last paid in full) */
  minimumAmount: number;
  leftover: number;
  issues: RentAllocationIssue[];
  ok: boolean;
};

/** Libyan dinar amounts carry three decimals (1 LYD = 1000 dirhams). */
export const roundLyd = (n: number) => Math.round(n * 1000) / 1000;
const EPS = 0.0005;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function resolveRentAmount(month: string, pricing: RentPricing): number {
  const band = pricing.bands
    .filter((b) => month >= b.from_month && month <= b.to_month)
    .sort((a, b) => b.from_month.localeCompare(a.from_month))[0];
  if (band && num(band.amount) > 0) return num(band.amount);
  if (num(pricing.leaseRent) > 0) return num(pricing.leaseRent);
  if (num(pricing.contactRent) > 0) return num(pricing.contactRent);
  return 0;
}

export function rentMonthBasis(
  month: string,
  charge: RentChargeInput | null | undefined,
  pricing: RentPricing,
): RentMonthBasis {
  const resolved = resolveRentAmount(month, pricing);
  if (!charge) {
    return { month, amount: resolved, paid: 0, remaining: resolved, repricedFrom: null, hasCharge: false };
  }
  const stored = num(charge.amount);
  const paid = Math.max(num(charge.total_paid), 0);
  const reprices = resolved > 0 && charge.status === 'UNPAID' && paid === 0 && Math.abs(stored - resolved) > EPS;
  const amount = reprices ? resolved : stored;
  return {
    month,
    amount,
    paid,
    remaining: roundLyd(Math.max(amount - paid, 0)),
    repricedFrom: reprices ? stored : null,
    hasCharge: true,
  };
}

export function monthsAreConsecutive(months: string[]): boolean {
  const sorted = [...months].sort();
  for (let i = 1; i < sorted.length; i++) {
    const [y, m] = sorted[i - 1].split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    if (sorted[i] !== next) return false;
  }
  return true;
}

export function allocateRentPayment(basis: RentMonthBasis[], amountInput: number): RentAllocation {
  const months = [...basis].sort((a, b) => a.month.localeCompare(b.month));
  const amount = roundLyd(Math.max(num(amountInput), 0));
  const issues: RentAllocationIssue[] = [];
  if (months.length === 0) issues.push({ code: 'no_months' });
  if (!monthsAreConsecutive(months.map((m) => m.month))) issues.push({ code: 'not_consecutive' });
  for (const m of months) {
    if (m.amount <= EPS) issues.push({ code: 'no_price', month: m.month });
    else if (m.remaining <= EPS) issues.push({ code: 'already_paid', month: m.month });
  }
  if (amount <= EPS) issues.push({ code: 'no_amount' });

  const totalRemaining = roundLyd(months.reduce((s, m) => s + m.remaining, 0));
  const owing = months.filter((m) => m.remaining > EPS);
  const minimumAmount = owing.length
    ? roundLyd(owing.slice(0, -1).reduce((s, m) => s + m.remaining, 0) + 0.001)
    : 0;

  let pool = amount;
  const lines: RentAllocationLine[] = [];
  for (const m of months) {
    if (m.remaining <= EPS) {
      lines.push({ month: m.month, amount: m.amount, paidBefore: m.paid, applied: 0, paidAfter: m.paid, status: 'skipped' });
      continue;
    }
    if (pool <= EPS) {
      if (amount > EPS) issues.push({ code: 'does_not_reach', month: m.month, needsMoreThan: roundLyd(minimumAmount - 0.001) });
      lines.push({ month: m.month, amount: m.amount, paidBefore: m.paid, applied: 0, paidAfter: m.paid, status: 'skipped' });
      continue;
    }
    const applied = roundLyd(Math.min(pool, m.remaining));
    pool = roundLyd(pool - applied);
    const paidAfter = roundLyd(m.paid + applied);
    lines.push({
      month: m.month,
      amount: m.amount,
      paidBefore: m.paid,
      applied,
      paidAfter,
      status: applied + EPS >= m.remaining ? 'paid' : 'partial',
    });
  }
  const leftover = pool > EPS ? pool : 0;
  if (leftover > 0 && amount > EPS) issues.push({ code: 'overpaid', leftover });

  return { lines, totalRemaining, minimumAmount, leftover, issues, ok: issues.length === 0 };
}

const fmt = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 3 })} د.ل`;

/** Plain Arabic for an issue, phrased as what to do about it. */
export function describeRentIssue(issue: RentAllocationIssue, monthLabel: (m: string) => string): string {
  switch (issue.code) {
    case 'no_months':
      return 'اختر شهر الإيجار الذي تُسدّده هذه الدفعة.';
    case 'not_consecutive':
      return 'اختر أشهراً متتالية؛ لتسديد أشهر متفرقة سجّل دفعة لكل منها.';
    case 'no_amount':
      return 'أدخل مبلغ الدفعة.';
    case 'no_price':
      return `لا يوجد سعر إيجار لـ ${monthLabel(issue.month)} — حدّد الإيجار الشهري أو جدول الأسعار أولاً.`;
    case 'already_paid':
      return `${monthLabel(issue.month)} مُسدَّد بالكامل — أزله من التحديد حتى لا يبقى المبلغ بلا شهر.`;
    case 'does_not_reach':
      return `المبلغ يُصرف كله على ما قبل ${monthLabel(issue.month)} ولا يصل إليه — أزله، أو اجعل المبلغ أكثر من ${fmt(issue.needsMoreThan)}.`;
    case 'overpaid':
      return `المبلغ يزيد على المستحق بـ ${fmt(issue.leftover)} سيُسجَّل بلا شهر — أضف الشهر التالي أو خفّض المبلغ.`;
  }
}
