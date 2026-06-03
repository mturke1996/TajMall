'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  getMallRentDashboardYear,
  type RentChargeSlice,
} from '@/lib/mall-rent-collection-series';

export const mallRentDashboardQk = {
  chargesYear: (year: number) => ['mall_rent_charges_year', year] as const,
};

type RentChargeRow = {
  id: string;
  contract_id: string;
  amount: string;
  total_paid: string;
  due_date: string;
  status: string;
  type: string;
};

export function useMallRentChargesForYear(
  year = getMallRentDashboardYear(),
) {
  return useQuery<RentChargeSlice[]>({
    queryKey: mallRentDashboardQk.chargesYear(year),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('tenant_charges')
        .select('id, contract_id, amount, total_paid, due_date, status, type')
        .eq('type', 'RENT')
        .gte('due_date', `${year}-01-01`)
        .lte('due_date', `${year}-12-31`)
        .order('due_date', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as RentChargeRow[]).map((row) => ({
        id: row.id,
        contract_id: row.contract_id,
        amount: Number(row.amount) || 0,
        total_paid: Number(row.total_paid) || 0,
        due_date: row.due_date,
        status: row.status,
      }));
    },
    staleTime: 60_000,
  });
}
