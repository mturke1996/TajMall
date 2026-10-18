'use client';

import { useMemo } from 'react';
import { useTenantChargesForTenant } from '@/lib/db/mall-queries';
import {
  useTenantRentExemptMonths,
  useTenantRentPriceBands,
  useTenantRentPricing,
} from '@/lib/db/rent-queries';
import { buildMergedTenantRentCalendar } from '@/lib/rent-calendar-from-charges';
import { deriveTenantRentYears } from '@/lib/rent-calendar-years';
import { resolveRentAmount } from '@/lib/rent-allocation';
import { buildTenantRentAccount } from '@/lib/tenant-rent-account';
import { currentMonthKey, currentYear } from '@/lib/rent-months';

/**
 * Loads what a tenant's rent account needs (charges with their journal links, exempt months, price
 * bands, lease rent) and builds the month-by-month account. Queries are shared through React Query, so
 * several components on one page can call this without extra requests.
 */
export function useTenantRentAccount({
  tenantId,
  contactRent,
  claimStart,
  contractStartYear,
}: {
  tenantId: string;
  contactRent: number;
  claimStart: string | null;
  contractStartYear?: number | null;
}) {
  const chargesQuery = useTenantChargesForTenant(tenantId);
  const exemptQuery = useTenantRentExemptMonths(tenantId);
  const bandsQuery = useTenantRentPriceBands(tenantId);
  const { pricing, loading: pricingLoading } = useTenantRentPricing(tenantId, contactRent);

  const charges = useMemo(() => chargesQuery.data ?? [], [chargesQuery.data]);
  const manualExemptMonths = useMemo(
    () => (exemptQuery.data ?? []).map((r) => r.month_key),
    [exemptQuery.data],
  );
  const priceBands = useMemo(() => bandsQuery.data ?? [], [bandsQuery.data]);

  const years = useMemo(() => {
    const ys = deriveTenantRentYears(charges, contractStartYear);
    const claimYear = claimStart ? Number(claimStart.slice(0, 4)) : NaN;
    // every year from the claim start up to now, so no owed month is left out of the account
    if (Number.isFinite(claimYear) && claimYear > 1990) {
      for (let y = claimYear; y <= currentYear(); y++) if (!ys.includes(y)) ys.push(y);
    }
    return ys.sort((a, b) => b - a);
  }, [charges, contractStartYear, claimStart]);

  const account = useMemo(() => {
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
  }, [years, tenantId, contactRent, charges, claimStart, manualExemptMonths, pricing]);

  return {
    account,
    charges,
    years,
    manualExemptMonths,
    priceBands,
    pricing,
    loading: chargesQuery.isLoading || exemptQuery.isLoading || pricingLoading,
  };
}
