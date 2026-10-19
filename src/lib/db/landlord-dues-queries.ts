'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { fetchAllPages } from '@/lib/db/fetch-all';
import { useContacts } from '@/lib/db/queries';
import { buildLandlordDues, selectDueLandlords, type LandlordDues } from '@/lib/landlord-dues';
import { goLiveMonthOf, type ObligationPayment } from '@/lib/people/obligation-months';
import { todayISODate } from '@/lib/utils';

export type LandlordDuesState =
  | { state: 'off' }
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
 * The month the system went live: the earliest file, from the contacts every screen already shares. Null while
 * they load or when none has a date. Used only when nothing better says where a landlord's tracking starts.
 */
export function useGoLiveMonth(): string | null {
  const contacts = useContacts();
  return useMemo(() => goLiveMonthOf(contacts.data ?? []), [contacts.data]);
}

/**
 * What the mall owes its landlords. Reads the contacts (one cached request, vendors and customers alike: a
 * landlord is found by the role tag) and, in one targeted request by the landlords' ids, their counted
 * expenses. Every payment is read, not a window: where tracking starts can be the first payment's month, so a
 * cut-off would move it. It sits under the `transactions` cache root, so recording a payment refreshes it.
 *
 * A failed read is `error`, never an empty list: "nothing owed" must not be what a broken request looks like.
 * `enabled: false` (a role that may not see expenses) reads nothing and answers `off`.
 */
export function useLandlordDues(enabled = true): LandlordDuesState {
  const today = useMemo(() => todayISODate(), []);
  const contacts = useContacts();
  const landlords = useMemo(() => selectDueLandlords(contacts.data ?? []), [contacts.data]);
  const ids = useMemo(() => landlords.map((c) => c.id).sort(), [landlords]);
  const needPayments = enabled && ids.length > 0;

  const payments = useQuery<ObligationPayment[]>({
    queryKey: ['transactions', 'landlord-dues', ids.join(',')],
    // by the ids alone: a failed refresh of the files must not keep the payments from loading (an endless skeleton)
    enabled: needPayments,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const rows: ObligationPayment[] = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        rows.push(
          ...(await fetchAllPages<ObligationPayment>(
            (a, b) =>
              supabase
                .from('transactions')
                .select('id, kind, status, amount, tx_date, description, contact_id')
                .in('contact_id', chunk)
                .eq('kind', 'EXPENSE')
                .in('status', ['POSTED', 'RECONCILED'])
                .order('tx_date')
                .order('id')
                .range(a, b) as unknown as PromiseLike<{ data: ObligationPayment[] | null; error: unknown }>,
          )),
        );
      }
      return rows;
    },
  });

  const retry = () => {
    void contacts.refetch();
    if (needPayments) void payments.refetch();
  };

  // data kept from an earlier read stays usable when a later read fails; only "never read" is an error
  const contactsMissing = contacts.data === undefined;
  const paymentsMissing = needPayments && payments.data === undefined;
  const failed = enabled && ((contactsMissing && contacts.isError) || (paymentsMissing && payments.isError));

  const dues = useMemo(
    () =>
      !enabled || contactsMissing || paymentsMissing
        ? null
        : buildLandlordDues({ contacts: contacts.data ?? [], transactions: payments.data ?? [], today }),
    [enabled, contactsMissing, paymentsMissing, contacts.data, payments.data, today],
  );

  if (!enabled) return { state: 'off' };
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
