'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  aggregatePartyTotals,
  type PartyAggRow,
  type PartyTxAggInput,
} from '@/lib/party-contacts';
import {
  reportPeriodDateRange,
  type ReportPeriod,
} from '@/lib/report-period';
import type { ContactKind } from '@/lib/db/types';
import { todayISODate } from '@/lib/utils';

type PartyTxRow = {
  id: string;
  amount: string | number;
  contact_id: string | null;
  contact: {
    id: string;
    name: string;
    kind: ContactKind;
    phone: string | null;
  } | null;
  category: {
    id: string;
    code: string;
    name_ar: string;
  } | null;
};

const PAGE = 1000;
/** money that actually moved: drafts and voided transactions are not counted */
const COUNTED_STATUSES = ['POSTED', 'RECONCILED'];

async function fetchPartyLinkedTransactions(
  kind: 'REVENUE' | 'EXPENSE',
  contactKind: ContactKind,
  period: ReportPeriod,
): Promise<PartyAggRow[]> {
  const supabase = createSupabaseBrowserClient();
  const { startDate, endDate } = reportPeriodDateRange(period);
  const all: PartyTxRow[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('transactions')
      .select(
        'id, amount, contact_id, contact:contacts(id, name, kind, phone), category:categories(id, code, name_ar)',
      )
      .eq('kind', kind)
      .in('status', COUNTED_STATUSES)
      .not('contact_id', 'is', null)
      .gte('tx_date', startDate)
      .lte('tx_date', endDate)
      .order('tx_date', { ascending: false })
      // a unique tie-breaker, or rows sharing a date can repeat or vanish between pages
      .order('id')
      .range(from, from + PAGE - 1);

    if (error) throw error;
    const page = (data as unknown as PartyTxRow[]) ?? [];
    all.push(...page);
    if (page.length < PAGE) break;
    from += PAGE;
  }

  const inputs: PartyTxAggInput[] = all
    .filter((row) => row.contact?.kind === contactKind && row.contact_id)
    .map((row) => ({
      contactId: row.contact_id as string,
      contactName: row.contact?.name ?? '—',
      phone: row.contact?.phone ?? null,
      amount: Number(row.amount),
      categoryCode: row.category?.code ?? null,
      categoryNameAr: row.category?.name_ar ?? null,
    }));

  return aggregatePartyTotals(inputs);
}

export function useVendorSpendReport(period: ReportPeriod) {
  return useQuery({
    queryKey: ['party_report', 'vendor_spend', period.year, period.month, period.mode],
    queryFn: () => fetchPartyLinkedTransactions('EXPENSE', 'VENDOR', period),
  });
}

export function useCustomerRevenueReport(period: ReportPeriod) {
  return useQuery({
    queryKey: [
      'party_report',
      'customer_revenue',
      period.year,
      period.month,
      period.mode,
    ],
    queryFn: () => fetchPartyLinkedTransactions('REVENUE', 'CUSTOMER', period),
  });
}

export function useEmployeeSpendReport(period: ReportPeriod) {
  return useQuery({
    queryKey: [
      'party_report',
      'employee_spend',
      period.year,
      period.month,
      period.mode,
    ],
    queryFn: () => fetchPartyLinkedTransactions('EXPENSE', 'EMPLOYEE', period),
  });
}

export type PartyActivity = { revenue: number; expense: number; count: number; lastDate: string | null };

/**
 * Last 12 months of posted money per contact (received from them, paid to them, how many movements,
 * the latest date), for the directory's activity column.
 */
export function usePartyActivity() {
  return useQuery({
    queryKey: ['party_report', 'activity_12m'],
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, PartyActivity>> => {
      const supabase = createSupabaseBrowserClient();
      const since = new Date();
      since.setFullYear(since.getFullYear() - 1);
      const sinceIso = todayISODate(since);
      const out = new Map<string, PartyActivity>();
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from('transactions')
          .select('amount, kind, tx_date, contact_id')
          .in('status', COUNTED_STATUSES)
          .not('contact_id', 'is', null)
          .gte('tx_date', sinceIso)
          .order('tx_date', { ascending: false })
          .order('id')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const page = (data ?? []) as { amount: string | number; kind: string; tx_date: string; contact_id: string | null }[];
        for (const row of page) {
          if (!row.contact_id) continue;
          const a = out.get(row.contact_id) ?? { revenue: 0, expense: 0, count: 0, lastDate: null };
          const amount = Number(row.amount) || 0;
          if (row.kind === 'REVENUE') a.revenue += amount;
          else if (row.kind === 'EXPENSE') a.expense += amount;
          a.count += 1;
          if (!a.lastDate || row.tx_date > a.lastDate) a.lastDate = row.tx_date;
          out.set(row.contact_id, a);
        }
        if (page.length < PAGE) break;
        from += PAGE;
      }
      return out;
    },
  });
}
