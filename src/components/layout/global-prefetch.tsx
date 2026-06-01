'use client';

import { useCategories, useCashboxes, useContacts, useCashboxBalances } from '@/lib/db/queries';
import { useMallUnits, useLeaseContracts, useFiscalPeriods, useTenantCharges } from '@/lib/db/mall-queries';

export function GlobalPrefetch() {
  // Trigger queries at the root level to cache all critical data immediately on app launch.
  // This warms up the TanStack Query cache, making transitions instant without showing "loading" skeletons.
  useCategories();
  useCashboxes();
  useContacts();
  useCashboxBalances();
  useMallUnits();
  useLeaseContracts();
  useFiscalPeriods();
  useTenantCharges();

  return null;
}
