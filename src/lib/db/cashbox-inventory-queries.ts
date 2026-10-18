'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { qk } from '@/lib/db/queries';
import { cashboxQk } from '@/lib/db/cashbox-queries';
import { todayISODate } from '@/lib/utils';
import { invalidateMoneyQueries } from '@/lib/db/invalidate';

export const inventoryQk = {
  pin: ['cashbox_inventory_pin'] as const,
  runs: ['cashbox_inventory_runs'] as const,
};

export type CashboxInventoryRun = {
  id: string;
  run_date: string;
  notes: string | null;
  journal_id: string | null;
  created_at: string;
  cashbox_inventory_lines: Array<{
    cashbox_id: string;
    book_balance: string;
    counted_amount: string;
    difference: string;
  }>;
};

export function useCashboxInventoryPinSet() {
  return useQuery({
    queryKey: inventoryQk.pin,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('cashbox_inventory_pin_is_set');
      if (error) throw error;
      return Boolean(data);
    },
  });
}

export function useSetCashboxInventoryPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { newPin: string; currentPin?: string }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('set_cashbox_inventory_pin', {
        p_new_pin: input.newPin,
        p_current_pin: input.currentPin ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inventoryQk.pin });
    },
  });
}

export function useApplyCashboxInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      pin: string;
      counts: Array<{ cashbox_id: string; counted: number }>;
      notes?: string;
      countDate?: string;
    }) => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('apply_cashbox_inventory', {
        p_pin: input.pin,
        p_counts: input.counts,
        p_notes: input.notes ?? null,
        p_count_date: input.countDate ?? todayISODate(),
      });
      if (error) throw error;
      return data as {
        ok: boolean;
        run_id: string;
        journal_id: string | null;
        adjusted: number;
        net: number;
      };
    },
    onSuccess: () => {
      // a count posts adjustment entries: balances, cashbox ledgers and reports all move
      invalidateMoneyQueries(qc);
      qc.invalidateQueries({ queryKey: inventoryQk.runs });
    },
  });
}

export function useCashboxInventoryRuns() {
  return useQuery({
    queryKey: inventoryQk.runs,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('cashbox_inventory_runs')
        .select(
          'id, run_date, notes, journal_id, created_at, cashbox_inventory_lines(cashbox_id, book_balance, counted_amount, difference)',
        )
        .order('created_at', { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data as CashboxInventoryRun[]) ?? [];
    },
  });
}
