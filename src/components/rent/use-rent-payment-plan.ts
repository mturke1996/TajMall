'use client';

import { useCallback, useMemo } from 'react';
import { useTenantRentPricing } from '@/lib/db/rent-queries';
import { rentChargesByMonth } from '@/lib/rent-journal-link';
import { allocateRentPayment, rentMonthBasis } from '@/lib/rent-allocation';
import type { TenantChargeWithRelations } from '@/lib/db/types';

/**
 * The split of a rent payment across months, as the database will record it (src/lib/rent-allocation.ts,
 * checked against the real functions by scripts/verify-rent-allocation.mjs).
 */
export function useRentPaymentPlan({
  tenantId,
  contactRent,
  charges,
  months,
  amount,
}: {
  tenantId: string;
  contactRent: number | null | undefined;
  charges: TenantChargeWithRelations[];
  months: string[];
  amount: number;
}) {
  const { pricing, loading } = useTenantRentPricing(tenantId, contactRent);
  const chargesByMonth = useMemo(() => rentChargesByMonth(charges, tenantId), [charges, tenantId]);
  const basisFor = useCallback(
    (month: string) => {
      const c = chargesByMonth.get(month);
      return rentMonthBasis(month, c ? { amount: c.amount, total_paid: c.total_paid, status: c.status } : null, pricing);
    },
    [chargesByMonth, pricing],
  );
  const basis = useMemo(() => months.map(basisFor), [months, basisFor]);
  const plan = useMemo(() => allocateRentPayment(basis, amount), [basis, amount]);
  return { plan, basis, basisFor, pricing, loading };
}
