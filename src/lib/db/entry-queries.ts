import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { COUNTED_STATUSES, amountKey, dateWindow, type DuplicateCandidate, type DuplicateKind, type DuplicateProbe } from '@/lib/duplicate-check';
import type { UsageRow } from '@/lib/entry-suggestions';

// Both keys start with "transactions", so posting, deleting or re-linking a transaction refreshes them with
// everything else that depends on the ledger (src/lib/db/invalidate.ts).

/** What the duplicate check asks the database: one kind, one amount, a few days. Never the whole ledger. */
export type DuplicateQuery = { kind: DuplicateKind; amountKey: number; from: string; to: string };

/** Null while the amount or date cannot be used yet (nothing typed, a half-typed date). */
export function duplicateQueryFor(probe: Pick<DuplicateProbe, 'kind' | 'amount' | 'date'>): DuplicateQuery | null {
  const key = amountKey(probe.amount);
  const range = dateWindow(probe.date);
  if (key === null || !range) return null;
  return { kind: probe.kind, amountKey: key, ...range };
}

const duplicateKey = (q: DuplicateQuery) => ['transactions', 'duplicate_check', q.kind, q.amountKey, q.from, q.to] as const;

async function readDuplicateCandidates(q: DuplicateQuery): Promise<DuplicateCandidate[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('transactions')
    .select('id,number,kind,status,amount,tx_date,description,contact_id,category_id')
    .eq('kind', q.kind)
    // numeric(18,3): the same three decimals the key was rounded to
    .eq('amount', (q.amountKey / 1000).toFixed(3))
    .in('status', [...COUNTED_STATUSES])
    .gte('tx_date', q.from)
    .lte('tx_date', q.to)
    .order('tx_date', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as unknown as DuplicateCandidate[]) ?? [];
}

/** The same-kind, same-amount transactions around the entry date. `enabled` is false while the dialog is shut. */
export function useDuplicateCandidates(q: DuplicateQuery | null, enabled: boolean) {
  return useQuery<DuplicateCandidate[]>({
    queryKey: q ? duplicateKey(q) : ['transactions', 'duplicate_check', 'idle'],
    queryFn: () => readDuplicateCandidates(q as DuplicateQuery),
    enabled: enabled && q !== null,
    // while the next amount loads, the previous rows stay (the matcher re-filters them by amount, so none is shown wrongly)
    placeholderData: keepPreviousData,
    // a result is only as good as the ledger it saw: never reuse one from an earlier visit
    staleTime: 0,
    gcTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

/**
 * The same read at the moment of posting, for when the typing-time check has not finished or was for other
 * values. Reuses a result fetched in the last few seconds.
 */
export function checkDuplicatesNow(qc: QueryClient, q: DuplicateQuery): Promise<DuplicateCandidate[]> {
  return qc.fetchQuery({ queryKey: duplicateKey(q), queryFn: () => readDuplicateCandidates(q), staleTime: 5_000 });
}

const USAGE_ROWS = 400;

/**
 * Who and what the last 400 counted transactions of this kind were posted to: only three columns, so the
 * pickers can put the usual choices first without downloading the ledger.
 */
export function useEntryUsageRows(kind: DuplicateKind, enabled: boolean) {
  return useQuery<UsageRow[]>({
    queryKey: ['transactions', 'entry_usage', kind],
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('transactions')
        .select('contact_id,category_id,tx_date')
        .eq('kind', kind)
        .in('status', [...COUNTED_STATUSES])
        .order('tx_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(USAGE_ROWS);
      if (error) throw error;
      return (data as unknown as UsageRow[]) ?? [];
    },
  });
}
