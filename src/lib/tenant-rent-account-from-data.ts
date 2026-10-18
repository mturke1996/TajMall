/**
 * One tenant's month-by-month rent account from already-loaded data. The tenant profile (through
 * useTenantRentAccount) and the all-tenants statements report both call this, so a tenant's balance is
 * the same number wherever it appears.
 */
import { buildMergedTenantRentCalendar } from '@/lib/rent-calendar-from-charges';
import { deriveTenantRentYears } from '@/lib/rent-calendar-years';
import { resolveRentAmount, type RentPricing } from '@/lib/rent-allocation';
import { buildTenantRentAccount } from '@/lib/tenant-rent-account';
import { currentMonthKey, currentYear } from '@/lib/rent-months';
import type { TenantChargeWithRelations } from '@/lib/db/types';

/** Every year with a charge or a lease start, plus each year from the claim start to now. Newest first. */
export function tenantRentYears(
  charges: TenantChargeWithRelations[],
  contractStartYear: number | null | undefined,
  claimStart: string | null,
): number[] {
  const ys = deriveTenantRentYears(charges, contractStartYear);
  const claimYear = claimStart ? Number(claimStart.slice(0, 4)) : NaN;
  // every year from the claim start up to now, so no owed month is left out of the account
  if (Number.isFinite(claimYear) && claimYear > 1990) {
    for (let y = claimYear; y <= currentYear(); y++) if (!ys.includes(y)) ys.push(y);
  }
  return ys.sort((a, b) => b - a);
}

export function buildTenantRentAccountFromData(input: {
  tenantId: string;
  contactRent: number;
  claimStart: string | null;
  years: number[];
  charges: TenantChargeWithRelations[];
  manualExemptMonths: string[];
  pricing: RentPricing;
}) {
  const { tenantId, contactRent, claimStart, years, charges, manualExemptMonths, pricing } = input;
  const exemptOptions = { claimStart, manualExemptMonths };
  const amountForMonth = (mk: string) => resolveRentAmount(mk, pricing);
  const calendars = years.map((year) =>
    buildMergedTenantRentCalendar({
      tenantId,
      year,
      monthlyRent: contactRent,
      charges,
      exemptOptions,
      amountForMonth,
    }),
  );
  return buildTenantRentAccount({
    calendars,
    pricing,
    claimStart,
    manualExemptMonths,
    now: currentMonthKey(),
  });
}

/** The lease rent the profile uses: the active lease that started last. */
export function activeLeaseRent(
  leases: { status: string; start_date: string | null; monthly_rent: number | string | null }[],
): number | null {
  const active = leases
    .filter((l) => l.status === 'ACTIVE')
    .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))[0];
  return active ? Number(active.monthly_rent) || 0 : null;
}
