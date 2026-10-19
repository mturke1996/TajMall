'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { fetchAllPages } from '@/lib/db/fetch-all';
import { useContacts } from '@/lib/db/queries';
import type { LandlordRentTx } from '@/lib/contacts/contact-roles';
import { buildLandlordDues, landlordDuesWindowStart, selectDueLandlords, type LandlordDues } from '@/lib/landlord-dues';
import { todayISODate } from '@/lib/utils';

export type LandlordDuesState =
  | { state: 'loading' }
  | { state: 'error'; retry: () => void }
  | {
      state: 'ready';
      dues: LandlordDues;
      /** read again in the background (after a payment) */
      refreshing: boolean;
      /** the last read failed, so the figures may predate the latest change */
      refreshFailed: boolean;
      retry: () => void;
    };

const CHUNK = 150;

/**
 * What the mall owes its landlords this month. Reads the vendor files and, in one targeted request by the
 * landlords' ids, their counted expenses since the start of December last year (not every transaction).
 * It sits under the `transactions` cache root, so recording a payment refreshes it.
 *
 * A failed read is `error`, never an empty list: "nothing owed" must not be what a broken request looks like.
 */
export function useLandlordDues(): LandlordDuesState {
  const today = useMemo(() => todayISODate(), []);
  const contacts = useContacts('VENDOR');
  const { landlords } = useMemo(() => selectDueLandlords(contacts.data ?? []), [contacts.data]);
  const ids = useMemo(() => landlords.map((c) => c.id).sort(), [landlords]);
  const from = landlordDuesWindowStart(today);

  const payments = useQuery<LandlordRentTx[]>({
    queryKey: ['transactions', 'landlord-dues', from, ids.join(',')],
    enabled: contacts.isSuccess && ids.length > 0,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const rows: LandlordRentTx[] = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        rows.push(
          ...(await fetchAllPages<LandlordRentTx>(
            (a, b) =>
              supabase
                .from('transactions')
                .select('id, kind, status, amount, tx_date, description, contact_id')
                .in('contact_id', chunk)
                .eq('kind', 'EXPENSE')
                .in('status', ['POSTED', 'RECONCILED'])
                .gte('tx_date', from)
                .order('tx_date')
                .order('id')
                .range(a, b) as unknown as PromiseLike<{ data: LandlordRentTx[] | null; error: unknown }>,
          )),
        );
      }
      return rows;
    },
  });

  const retry = () => {
    void contacts.refetch();
    if (ids.length > 0) void payments.refetch();
  };

  const needPayments = ids.length > 0;
  // data kept from an earlier read stays usable when a later read fails; only "never read" is an error
  const contactsMissing = contacts.data === undefined;
  const paymentsMissing = needPayments && payments.data === undefined;
  const failed = (contactsMissing && contacts.isError) || (paymentsMissing && payments.isError);

  const dues = useMemo(
    () => (contactsMissing || paymentsMissing ? null : buildLandlordDues({ contacts: contacts.data ?? [], transactions: payments.data ?? [], today })),
    [contactsMissing, paymentsMissing, contacts.data, payments.data, today],
  );

  if (failed) return { state: 'error', retry };
  if (!dues) return { state: 'loading' };
  return {
    state: 'ready',
    dues,
    refreshing: contacts.isFetching || (needPayments && payments.isFetching),
    refreshFailed: contacts.isError || (needPayments && payments.isError),
    retry,
  };
}
