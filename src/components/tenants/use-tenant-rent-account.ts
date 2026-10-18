'use client';

import { useMemo } from 'react';
import { useTenantChargesForTenant } from '@/lib/db/mall-queries';
import {
  useTenantRentExemptMonths,
  useTenantRentPriceBands,
  useTenantRentPricing,
} from '@/lib/db/rent-queries';
import { buildTenantRentAccountFromData, tenantRentYears } from '@/lib/tenant-rent-account-from-data';

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

  const years = useMemo(
    () => tenantRentYears(charges, contractStartYear, claimStart),
    [charges, contractStartYear, claimStart],
  );

  const account = useMemo(
    () =>
      buildTenantRentAccountFromData({
        tenantId,
        contactRent,
        claimStart,
        years,
        charges,
        manualExemptMonths,
        pricing,
      }),
    [years, tenantId, contactRent, charges, claimStart, manualExemptMonths, pricing],
  );

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
