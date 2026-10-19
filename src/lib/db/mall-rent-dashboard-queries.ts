'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { fetchAllPages } from '@/lib/db/fetch-all';
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
      // a year of rent charges can pass 1,000 rows; an unpaged read would silently drop the latest months.
      // `id` breaks ties between charges sharing a due date so no row repeats or is skipped between pages.
      const data = await fetchAllPages<RentChargeRow>(
        (from, to) =>
          supabase
            .from('tenant_charges')
            .select('id, contract_id, amount, total_paid, due_date, status, type')
            .eq('type', 'RENT')
            .gte('due_date', `${year}-01-01`)
            .lte('due_date', `${year}-12-31`)
            .order('due_date', { ascending: true })
            .order('id')
            .range(from, to) as unknown as PromiseLike<{ data: RentChargeRow[] | null; error: unknown }>,
      );
      return data.map((row) => ({
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
