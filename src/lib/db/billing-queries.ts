'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { fetchAllPages } from '@/lib/db/fetch-all';
import { invalidateMoneyQueries } from '@/lib/db/invalidate';
import { useLeaseContracts } from '@/lib/db/mall-queries';
import {
  billingExemptWindow,
  parseBillingRunResult,
  shiftMonth,
  type BillingCharge,
  type BillingExempt,
  type BillingRunResult,
} from '@/lib/billing-preview';
import type { LeaseContractWithRelations } from '@/lib/db/types';

/**
 * The rent and service charges of the months the billing run can be pointed at, and nothing else: the
 * dashboard waits on this list, so it must not carry the charges tab's journals and payment links. The key
 * starts with `tenant_charges`, so every write that refreshes charges refreshes this list too.
 */
function useBillingCharges(today: string, enabled: boolean) {
  const window = billingExemptWindow(today);
  return useQuery<BillingCharge[]>({
    queryKey: ['tenant_charges', 'billing', window?.from ?? '', window?.to ?? ''],
    enabled: enabled && window != null,
    queryFn: async () => {
      if (!window) return [];
      const supabase = createSupabaseBrowserClient();
      return fetchAllPages<BillingCharge & { id: string }>(
        (from, to) =>
          supabase
            .from('tenant_charges')
            .select('id, contract_id, type, due_date, contract:lease_contracts(tenant_id)')
            .in('type', ['RENT', 'SERVICE'])
            .gte('due_date', `${window.from}-01`)
            .lt('due_date', `${shiftMonth(window.to, 1)}-01`)
            .order('due_date')
            .order('id')
            .range(from, to) as unknown as PromiseLike<{ data: (BillingCharge & { id: string })[] | null; error: unknown }>,
      );
    },
  });
}

/** Months a tenant is exempt from rent, for the span of months the billing run can be pointed at. */
function useBillingExempt(today: string, enabled: boolean) {
  const window = billingExemptWindow(today);
  return useQuery<BillingExempt[]>({
    queryKey: ['tenant_rent_exempt_months', 'billing', window?.from ?? '', window?.to ?? ''],
    enabled: enabled && window != null,
    // an exemption is set from a tenant's profile, so a short window keeps this list from lagging behind it
    staleTime: 30_000,
    queryFn: async () => {
      if (!window) return [];
      const supabase = createSupabaseBrowserClient();
      return fetchAllPages<BillingExempt & { id: string }>(
        (from, to) =>
          supabase
            .from('tenant_rent_exempt_months')
            .select('id, tenant_id, month_key')
            .gte('month_key', window.from)
            .lte('month_key', window.to)
            .order('id')
            .range(from, to) as unknown as PromiseLike<{ data: (BillingExempt & { id: string })[] | null; error: unknown }>,
      );
    },
  });
}

export type BillingSources =
  | { state: 'off' | 'loading'; refreshing: false; refreshFailed: false; error: null; retry: () => void }
  | { state: 'error'; refreshing: false; refreshFailed: false; error: unknown; retry: () => void }
  | {
      state: 'ready';
      contracts: LeaseContractWithRelations[];
      charges: BillingCharge[];
      /** undefined when the exempt marks could not be read: the preview then cannot tell exempt months apart */
      exempt: BillingExempt[] | undefined;
      /** the charges are being read again (after a run) */
      refreshing: boolean;
      /** the last read failed, so the figures may predate the latest change */
      refreshFailed: boolean;
      error: null;
      retry: () => void;
    };

/** Leases, charges and exempt months: everything the billing preview needs, with one state to branch on. */
export function useBillingSources(today: string, enabled = true): BillingSources {
  const charges = useBillingCharges(today, enabled);
  const contracts = useLeaseContracts();
  const exempt = useBillingExempt(today, enabled);

  const retry = () => {
    void charges.refetch();
    void contracts.refetch();
    void exempt.refetch();
  };

  if (!enabled) return { state: 'off', refreshing: false, refreshFailed: false, error: null, retry };
  // data kept from an earlier read stays usable when a later read fails; only "never read" is an error
  if (charges.data === undefined || contracts.data === undefined) {
    if (charges.isError || contracts.isError) {
      return { state: 'error', refreshing: false, refreshFailed: false, error: charges.error ?? contracts.error, retry };
    }
    return { state: 'loading', refreshing: false, refreshFailed: false, error: null, retry };
  }
  if (exempt.isLoading) return { state: 'loading', refreshing: false, refreshFailed: false, error: null, retry };

  return {
    state: 'ready',
    contracts: contracts.data,
    charges: charges.data,
    exempt: exempt.data,
    refreshing: charges.isFetching || contracts.isFetching,
    refreshFailed: charges.isError || contracts.isError,
    error: null,
    retry,
  };
}

/**
 * Runs generate_monthly_charges for one month and returns what the server says it created (null when the
 * reply is not the expected shape). The caller shows that, so no toast: the dialog stays open on it.
 */
export function useRunMonthlyBilling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (month: string): Promise<BillingRunResult | null> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('generate_monthly_charges', { p_month: month });
      if (error) throw error;
      return parseBillingRunResult(data);
    },
    onSuccess: () => {
      invalidateMoneyQueries(qc);
    },
  });
}
