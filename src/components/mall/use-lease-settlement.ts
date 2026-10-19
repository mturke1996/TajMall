'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTenantRentAccount } from '@/components/tenants/use-tenant-rent-account';
import { useJournalEntries } from '@/lib/db/journal-queries';
import { mqk, useTenantChargesForTenant, useTenantLeaseContracts } from '@/lib/db/mall-queries';
import { qk, useCategories, useContact, useContactTransactions, useTenantRentForContact } from '@/lib/db/queries';
import { buildSettlement, depositAccountState, type Settlement } from '@/lib/lease-settlement';
import { unlinkedRentReceipts } from '@/lib/tenant-rent-account';

export type LeaseSettlementState =
  | { status: 'loading' }
  | { status: 'ready' | 'failed'; settlement: Settlement };

/**
 * Loads what a tenant's closing statement is built from and builds it. The queries are the profile's own
 * (shared through React Query), but cached figures are not trusted here: the data is refreshed when the
 * statement opens and nothing is shown until that refresh has come back. A load that fails is a failure,
 * not an empty list, and so is a refresh that fails over cached figures.
 */
export function useLeaseSettlement(args: { tenantId: string; contractId: string; endDate: string; today: string }) {
  const { tenantId, contractId, endDate, today } = args;
  const qc = useQueryClient();
  const [openedAt] = useState(() => Date.now());

  const contactQ = useContact(tenantId);
  const summaryQ = useTenantRentForContact(tenantId);
  const leasesQ = useTenantLeaseContracts(tenantId);
  const txQ = useContactTransactions(tenantId);
  const chargesQ = useTenantChargesForTenant(tenantId);
  const journalQ = useJournalEntries({ contactId: tenantId, status: 'ALL' });
  const catsQ = useCategories();

  const contact = contactQ.data;
  const claimStart = summaryQ.data?.rent_claim_start ?? contact?.contract_start ?? null;
  const startDate = contact?.contract_start || summaryQ.data?.rent_claim_start;
  const rentAccount = useTenantRentAccount({
    tenantId,
    contactRent: Number(contact?.monthly_rent) || 0,
    claimStart,
    contractStartYear: startDate ? Number(String(startDate).slice(0, 4)) || null : null,
  });

  // figures cached a few minutes ago are asked for again as the statement opens
  useEffect(() => {
    const keys = [qk.contactTransactions(tenantId), mqk.tenantChargesForTenant(tenantId), [...qk.tenantRentSummary, tenantId], [...mqk.leaseContracts, 'tenant', tenantId]];
    for (const queryKey of keys) {
      const st = qc.getQueryState(queryKey);
      // a query already fetching is the refresh; invalidating it would cancel it and start over
      if (st && st.dataUpdatedAt > 0 && st.dataUpdatedAt < openedAt && st.fetchStatus === 'idle') {
        void qc.invalidateQueries({ queryKey, exact: true });
      }
    }
  }, [qc, tenantId, openedAt]);

  const money = [txQ, chargesQ, summaryQ, leasesQ];
  const loading =
    contactQ.isLoading ||
    rentAccount.loading ||
    journalQ.isLoading ||
    catsQ.isLoading ||
    money.some((q) => q.isLoading || (!q.isError && q.dataUpdatedAt < openedAt));

  const rentFailed = rentAccount.failed || chargesQ.isError || summaryQ.isError || (contactQ.isError && contactQ.data === undefined);
  const transactionsFailed = txQ.isError;
  const leasesFailed = leasesQ.isError;

  const unlinked = useMemo(() => {
    if (journalQ.isError) return null;
    if (!journalQ.isSuccess || !txQ.data) return undefined;
    return unlinkedRentReceipts({ receipts: txQ.data, journalEntries: journalQ.data ?? [], charges: rentAccount.charges });
  }, [journalQ.isError, journalQ.isSuccess, journalQ.data, txQ.data, rentAccount.charges]);

  const state = useMemo<LeaseSettlementState>(() => {
    if (loading) return { status: 'loading' };
    const settlement = buildSettlement({
      today,
      contract: { id: contractId, endDate },
      leases: leasesFailed ? null : (leasesQ.data ?? null),
      rent: rentFailed ? null : { years: rentAccount.account.years, charges: rentAccount.charges },
      transactions: transactionsFailed ? null : (txQ.data ?? null),
      unlinkedReceipts: unlinked,
    });
    return { status: settlement.complete ? 'ready' : 'failed', settlement };
  }, [loading, today, contractId, endDate, leasesFailed, rentFailed, transactionsFailed, leasesQ.data, rentAccount.account.years, rentAccount.charges, txQ.data, unlinked]);

  const depositAccount = useMemo(() => depositAccountState(catsQ.data), [catsQ.data]);

  function retry() {
    rentAccount.retry();
    void contactQ.refetch();
    void summaryQ.refetch();
    void leasesQ.refetch();
    void txQ.refetch();
    void chargesQ.refetch();
    void journalQ.refetch();
    void catsQ.refetch();
  }

  return {
    state,
    /** a retry (or the first load) is on its way */
    fetching: [contactQ, summaryQ, leasesQ, txQ, chargesQ].some((q) => q.isFetching),
    depositAccount,
    /** the account list failed to load: the refund cannot be prepared, the statement itself can */
    accountsFailed: catsQ.isError,
    retry,
  };
}
