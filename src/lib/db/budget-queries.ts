'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export type BudgetRow = {
  id: string;
  category_id: string;
  year: number;
  month: number;
  amount: number;
};

export const budgetQk = {
  year: (year: number) => ['budgets', year] as const,
  actuals: (year: number) => ['budget_actuals', year] as const,
};

export function useBudgets(year: number) {
  return useQuery<BudgetRow[]>({
    queryKey: budgetQk.year(year),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('budgets')
        .select('id, category_id, year, month, amount')
        .eq('year', year);
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        category_id: r.category_id as string,
        year: Number(r.year),
        month: Number(r.month),
        amount: Number(r.amount),
      }));
    },
  });
}

export type ActualRow = {
  category_id: string;
  month: number;
  amount: number;
};

/** يجمع الفعلي (transactions مرحّلة) لكل بند/شهر خلال سنة معينة — تجميع في العميل، مناسب لحجم بيانات مول واحد. */
export function useBudgetActuals(year: number) {
  return useQuery<ActualRow[]>({
    queryKey: budgetQk.actuals(year),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('transactions')
        .select('category_id, amount, tx_date')
        .eq('status', 'POSTED')
        .gte('tx_date', `${year}-01-01`)
        .lte('tx_date', `${year}-12-31`);
      if (error) throw error;

      const byKey = new Map<string, number>();
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const categoryId = row.category_id as string;
        const month = new Date(row.tx_date as string).getMonth() + 1;
        const key = `${categoryId}-${month}`;
        byKey.set(key, (byKey.get(key) ?? 0) + Number(row.amount ?? 0));
      }

      return Array.from(byKey.entries()).map(([key, amount]) => {
        const [categoryId, month] = key.split('-');
        return { category_id: categoryId, month: Number(month), amount };
      });
    },
  });
}

export function useUpsertBudget(year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { category_id: string; month: number; amount: number }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from('budgets')
        .upsert(
          { category_id: input.category_id, year, month: input.month, amount: input.amount },
          { onConflict: 'category_id,year,month' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: budgetQk.year(year) });
    },
    onError: (e) => {
      toast.error('تعذّر حفظ الموازنة', {
        description: e instanceof Error ? e.message : undefined,
      });
    },
  });
}

/** خريطة سريعة category_id+month → amount لسهولة العرض. */
export function useBudgetMap(year: number) {
  const { data: budgets = [] } = useBudgets(year);
  return useMemo(() => {
    const map = new Map<string, number>();
    for (const b of budgets) map.set(`${b.category_id}-${b.month}`, b.amount);
    return map;
  }, [budgets]);
}

export function useActualMap(year: number) {
  const { data: actuals = [] } = useBudgetActuals(year);
  return useMemo(() => {
    const map = new Map<string, number>();
    for (const a of actuals) map.set(`${a.category_id}-${a.month}`, a.amount);
    return map;
  }, [actuals]);
}
