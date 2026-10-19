/**
 * What needs the owner's attention today, as numbers: arrears gone past 60 days, leases that ended or end
 * within 30 days, rent still owed this month, vouchers waiting for approval, months whose charges were not
 * all generated, shops empty for months.
 *
 * Each source is `undefined` when it does not apply (the user may not approve vouchers), `null` when it
 * could not be read, or its data. A source that could not be read is reported as unavailable, so a quiet
 * list is never mistaken for "nothing to do".
 */
import type { BillingMonthStatus } from '@/lib/billing-preview';
import { billingIsLate, latestIncompleteMonth } from '@/lib/billing-preview';
import type { ContractExpiry } from '@/lib/contract-expiry';

export type FollowUpKey = 'expired' | 'arrears60' | 'vouchers' | 'ending30' | 'billing' | 'rent' | 'vacant';
export type FollowUpTone = 'bad' | 'warn' | 'neutral';

export type FollowUpItem = {
  key: FollowUpKey;
  tone: FollowUpTone;
  /** tenants, leases, vouchers or shops, depending on the key */
  count: number;
  /** money that goes with the count (arrears, rent at stake, rent still owed); null when there is none */
  amount: number | null;
  href: string;
  /** only for 'billing': the month named, the leases it should bill, and how many earlier months are incomplete too */
  billing?: { month: string; total: number; earlierMonths: number };
};

export type FollowUp = {
  items: FollowUpItem[];
  /** sources that could not be read */
  unavailable: FollowUpKey[];
};

export type FollowUpAgingRow = { total_outstanding?: number | string | null; bucket_90_plus?: number | string | null };
type RentRow = {
  current_month_status: string | null;
  current_month_amount?: number | string | null;
  current_month_paid?: number | string | null;
  monthly_rent?: number | string | null;
};

export type FollowUpInput = {
  /** "YYYY-MM-DD" */
  today: string;
  aging: FollowUpAgingRow[] | null;
  expiry: ContractExpiry | null;
  rent: RentRow[] | null;
  /** disbursement vouchers waiting for approval; undefined when the user cannot approve them */
  pendingVouchers: number | null | undefined;
  /** shops free for months, from the occupancy picture */
  longVacant: number | null;
  /** billing completeness of the current month and the two before; undefined when the user cannot generate charges */
  billing?: BillingMonthStatus[] | null;
};

const EPS = 0.0005;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** From the 10th the month's rent is overdue enough to call for action; before that it is only a reminder. */
const RENT_OVERDUE_FROM_DAY = 10;

const HREF = {
  expired: '/mall?tab=contracts',
  ending30: '/mall?tab=contracts',
  arrears60: '/reports/ar-aging',
  rent: '/mall?tab=tenants',
  vouchers: '/vouchers',
  vacant: '/mall?tab=units',
  // the month is appended: the charges tab opens its generate dialog on it
  billing: '/mall?tab=charges&billing=',
} satisfies Record<FollowUpKey, string>;

export function buildFollowUp(input: FollowUpInput): FollowUp {
  const items: FollowUpItem[] = [];
  const unavailable: FollowUpKey[] = [];
  const dayOfMonth = Number(input.today.slice(8, 10)) || 1;

  // leases: ended and still active, then ending within 30 days
  if (input.expiry === null) {
    unavailable.push('expired', 'ending30');
  } else {
    for (const [key, bucket, tone] of [
      ['expired', 'expired', 'bad'],
      ['ending30', 'within30', 'warn'],
    ] as const) {
      const rows = input.expiry.items.filter((i) => i.bucket === bucket);
      if (rows.length > 0) {
        items.push({ key, tone, count: rows.length, amount: round3(rows.reduce((s, i) => s + i.monthlyRent, 0)) || null, href: HREF[key] });
      }
    }
  }

  // arrears older than 60 days: the last bucket of the aging report
  if (input.aging === null) {
    unavailable.push('arrears60');
  } else {
    const old = input.aging.filter((r) => num(r.bucket_90_plus) > EPS);
    if (old.length > 0) {
      items.push({ key: 'arrears60', tone: 'bad', count: old.length, amount: round3(old.reduce((s, r) => s + num(r.bucket_90_plus), 0)), href: HREF.arrears60 });
    }
  }

  if (input.pendingVouchers === null) {
    unavailable.push('vouchers');
  } else if (input.pendingVouchers !== undefined && input.pendingVouchers > 0) {
    items.push({ key: 'vouchers', tone: 'warn', count: input.pendingVouchers, amount: null, href: HREF.vouchers });
  }

  // months whose charges were not all generated: until they are, they never reach aging, notices or the income statement
  if (input.billing === null) {
    unavailable.push('billing');
  } else if (input.billing !== undefined) {
    const late = latestIncompleteMonth(input.billing, input.today);
    if (late) {
      const { status, earlierMonths } = late;
      items.push({
        key: 'billing',
        tone: billingIsLate(late, input.today) ? 'warn' : 'neutral',
        count: status.missing,
        amount: status.missingAmount > 0 ? status.missingAmount : null,
        href: `${HREF.billing}${status.month}`,
        billing: { month: status.month, total: status.total, earlierMonths },
      });
    }
  }

  // rent still owed for the current month (exempt tenants and tenants with no rent set owe nothing)
  if (input.rent === null) {
    unavailable.push('rent');
  } else {
    let owing = 0;
    let remaining = 0;
    for (const r of input.rent) {
      if (r.current_month_status === 'exempt' || r.current_month_status === 'no_rent_set' || r.current_month_status === 'paid_full') continue;
      const left = Math.max((num(r.current_month_amount) || num(r.monthly_rent)) - num(r.current_month_paid), 0);
      if (left > EPS) {
        owing += 1;
        remaining += left;
      }
    }
    if (owing > 0) {
      items.push({ key: 'rent', tone: dayOfMonth >= RENT_OVERDUE_FROM_DAY ? 'warn' : 'neutral', count: owing, amount: round3(remaining), href: HREF.rent });
    }
  }

  if (input.longVacant === null) {
    unavailable.push('vacant');
  } else if (input.longVacant > 0) {
    items.push({ key: 'vacant', tone: 'neutral', count: input.longVacant, amount: null, href: HREF.vacant });
  }

  const rank: Record<FollowUpTone, number> = { bad: 0, warn: 1, neutral: 2 };
  // stable: within a tone the order above (leases, arrears, vouchers, billing, rent, shops) is kept
  items.sort((a, b) => rank[a.tone] - rank[b.tone]);
  return { items, unavailable };
}
