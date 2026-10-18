'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { fetchAllPages, fetchInChunks } from '@/lib/db/fetch-all';
import { buildPeriodReview, type ReviewTx } from '@/lib/period-review';

type Rows<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Everything the pre-close review needs for one period, read once when the review is opened. */
export function usePeriodReview(startDate: string, endDate: string, enabled: boolean) {
  return useQuery({
    // under "transactions" so any money change refreshes an open review
    queryKey: ['transactions', 'period_review', startDate, endDate],
    enabled: enabled && !!startDate && !!endDate,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();

      const transactions = await fetchAllPages<ReviewTx>(
        (from, to) =>
          supabase
            .from('transactions')
            .select('id, number, kind, status, amount, method, reference, description, contact_id, category_id, tx_date, category:categories(code)')
            .gte('tx_date', startDate)
            .lte('tx_date', endDate)
            .order('tx_date')
            .order('id')
            .range(from, to) as unknown as Rows<ReviewTx>,
      );

      // rent receipts and what their journal entries have been linked to months for
      const receipts = transactions.filter(
        (t) => (t.status === 'POSTED' || t.status === 'RECONCILED') && t.kind === 'REVENUE' && t.category?.code === 'REV-RNT',
      );
      const entries = await fetchInChunks<{ id: string; source_id: string }>(receipts.map((r) => r.id), (chunk) =>
        supabase
          .from('journal_entries')
          .select('id, source_id')
          .eq('source_type', 'TRANSACTION')
          .neq('status', 'REVERSED')
          .in('source_id', chunk) as unknown as Rows<{ id: string; source_id: string }>,
      );
      const links = await fetchInChunks<{ journal_entry_id: string; amount: number | string }>(
        entries.map((e) => e.id),
        (chunk) =>
          supabase
            .from('tenant_rent_journal_links')
            .select('journal_entry_id, amount')
            .in('journal_entry_id', chunk) as unknown as Rows<{ journal_entry_id: string; amount: number | string }>,
      );
      const linkedByEntry = new Map<string, number>();
      for (const l of links) linkedByEntry.set(l.journal_entry_id, (linkedByEntry.get(l.journal_entry_id) ?? 0) + (Number(l.amount) || 0));
      const entryByReceipt = new Map(entries.map((e) => [e.source_id, e.id]));
      const unlinkedReceipts = receipts
        .map((r) => {
          const entry = entryByReceipt.get(r.id);
          const free = Math.round(((Number(r.amount) || 0) - (entry ? linkedByEntry.get(entry) ?? 0 : 0)) * 1000) / 1000;
          return { transactionId: r.id, free };
        })
        .filter((r) => r.free > 0.0005);

      const [drafts, vouchers, counts] = await Promise.all([
        supabase
          .from('journal_entries')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'DRAFT')
          .gte('entry_date', startDate)
          .lte('entry_date', endDate),
        supabase
          .from('disbursement_vouchers')
          .select('id', { count: 'exact', head: true })
          .in('status', ['DRAFT', 'PENDING_APPROVAL'])
          .gte('voucher_date', startDate)
          .lte('voucher_date', endDate),
        supabase
          .from('cashbox_inventory_runs')
          .select('id', { count: 'exact', head: true })
          .gte('run_date', startDate)
          .lte('run_date', endDate),
      ]);
      for (const r of [drafts, vouchers, counts]) if (r.error) throw r.error;

      return buildPeriodReview({
        transactions,
        unlinkedReceipts,
        draftJournalCount: drafts.count ?? 0,
        pendingVoucherCount: vouchers.count ?? 0,
        cashboxCountRuns: counts.count ?? 0,
      });
    },
  });
}
