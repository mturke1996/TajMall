'use client';

import { useMemo } from 'react';
import { useTenantChargesForTenant, useTenantLeaseContracts } from '@/lib/db/mall-queries';
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
  // Same query key as the one inside useTenantRentPricing, so no extra request: it lets retry reach the lease rent too.
  const leasesQuery = useTenantLeaseContracts(tenantId || undefined);

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

  // A failed load leaves these lists empty, and an empty list reads as «nothing charged / nothing exempt»,
  // which would show a wrong amount owed. `data === undefined` keeps good cached data when only a background refetch fails.
  const failed =
    (chargesQuery.isError && chargesQuery.data === undefined) ||
    (exemptQuery.isError && exemptQuery.data === undefined) ||
    (bandsQuery.isError && bandsQuery.data === undefined) ||
    (leasesQuery.isError && leasesQuery.data === undefined);

  const retry = () => {
    void chargesQuery.refetch();
    void exemptQuery.refetch();
    void bandsQuery.refetch();
    void leasesQuery.refetch();
  };

  return {
    account,
    charges,
    years,
    manualExemptMonths,
    priceBands,
    pricing,
    loading: chargesQuery.isLoading || exemptQuery.isLoading || pricingLoading,
    failed,
    retry,
  };
}
