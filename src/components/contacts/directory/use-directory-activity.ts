'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { fetchAllPages } from '@/lib/db/fetch-all';
import { COUNTED_TX_STATUSES } from '@/lib/contacts/contact-transactions';
import { activityWindowStart, buildDirectoryActivity, type ActivityInput, type ContactActivity } from '@/lib/contacts/directory';
import { todayISODate } from '@/lib/utils';

/**
 * The last twelve months of counted money for every contact, read once: one request (paged past the
 * 1,000-row limit) with only the columns the lists need, not one request per row. All lists share this
 * entry, so moving between vendors, customers and the full directory does not read it again.
 *
 * It sits under `party_report`, which every posted, edited or deleted transaction refreshes.
 */
export function useDirectoryActivity() {
  const asOf = todayISODate();
  const from = activityWindowStart(asOf);
  return useQuery<Map<string, ContactActivity>>({
    queryKey: ['party_report', 'directory_12m', from],
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const rows = await fetchAllPages<ActivityInput>(
        (a, b) =>
          supabase
            .from('transactions')
            .select('contact_id, kind, status, amount, tx_date, category:categories(code)')
            .in('status', [...COUNTED_TX_STATUSES])
            .not('contact_id', 'is', null)
            .gte('tx_date', from)
            .order('tx_date', { ascending: false })
            // a unique tie-breaker, or rows sharing a date can repeat or vanish between pages
            .order('id')
            .range(a, b) as unknown as PromiseLike<{ data: ActivityInput[] | null; error: unknown }>,
      );
      return buildDirectoryActivity(rows, { asOf });
    },
  });
}
