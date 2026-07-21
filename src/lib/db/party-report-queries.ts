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

async function fetchPartyLinkedTransactions(
  kind: 'REVENUE' | 'EXPENSE',
  contactKind: ContactKind,
  period: ReportPeriod,
): Promise<PartyAggRow[]> {
  const supabase = createSupabaseBrowserClient();
  const { startDate, endDate } = reportPeriodDateRange(period);

  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id, amount, contact_id, contact:contacts(id, name, kind, phone), category:categories(id, code, name_ar)',
    )
    .eq('kind', kind)
    .not('contact_id', 'is', null)
    .gte('tx_date', startDate)
    .lte('tx_date', endDate)
    .order('tx_date', { ascending: false })
    .limit(5000);

  if (error) throw error;

  const inputs: PartyTxAggInput[] = ((data as unknown as PartyTxRow[]) ?? [])
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
