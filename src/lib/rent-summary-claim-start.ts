/**
 * A month before a tenant's rent claim start is not owed. The database's monthly summary already answers
 * "exempt" for such a month; this is the same rule applied in the browser to any row that carries the tenant's
 * claim start, so a list built from such rows can never call that month unpaid, whatever produced the row.
 *
 * Like the calendar's exempt overlay (`applyExemptOverlayToCalendarMonths`), a month with money recorded stays
 * as it is: a payment is evidence, and hiding it would hide real money.
 */
import type { TenantRentSummary } from '@/lib/db/queries';

/** "2026-01-01", "2026-01-01T00:00:00Z" or "2026-01" → "2026-01"; anything else → null. */
export function claimStartMonth(value: string | null | undefined): string | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?/.exec(String(value ?? '').trim());
  return m ? `${m[1]}-${m[2]}` : null;
}

export function clampSummaryToClaimStart<T extends Pick<TenantRentSummary, 'current_month_status' | 'current_month_amount' | 'current_month_paid' | 'rent_claim_start'>>(
  row: T,
  monthKey: string,
): T {
  const claim = claimStartMonth(row.rent_claim_start);
  if (!claim || monthKey >= claim) return row;
  if (row.current_month_status === 'exempt' || row.current_month_status === 'paid_full' || row.current_month_status === 'paid_partial') return row;
  if (Number(row.current_month_paid) > 0) return row;
  return { ...row, current_month_status: 'exempt', current_month_amount: '0', current_month_paid: '0' };
}
