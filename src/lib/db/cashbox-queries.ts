'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { qk } from '@/lib/db/queries';

export type CashTransferRow = {
  id: string;
  number: number;
  reference: string | null;
  from_cashbox_id: string;
  to_cashbox_id: string;
  amount: string;
  currency: string;
  transfer_date: string;
  description: string | null;
  notes: string | null;
  created_at: string;
  from_cashbox?: { id: string; code: string; name_ar: string; kind: string } | null;
  to_cashbox?: { id: string; code: string; name_ar: string; kind: string } | null;
};

export type CashboxLedgerRow = {
  event_id: string;
  source_type: 'transaction' | 'cash_transfer';
  event_kind: string;
  event_date: string;
  reference: string | null;
  seq_label: string | null;
  description: string | null;
  signed_amount: number;
  direction: 'in' | 'out';
  balance_after: number;
  counter_cashbox_id: string | null;
  counter_name_ar: string | null;
};

export type CashboxLedgerPayload = {
  cashbox_id: string;
  code: string;
  name_ar: string;
  kind: string;
  currency: string;
  opening_balance: number;
  current_balance: number;
  rows: CashboxLedgerRow[];
};

const TRANSFER_SELECT =
  '*, from_cashbox:cashboxes!cash_transfers_from_cashbox_id_fkey(id,code,name_ar,kind), to_cashbox:cashboxes!cash_transfers_to_cashbox_id_fkey(id,code,name_ar,kind)';

export const cashboxQk = {
  transfers: ['cash_transfers'] as const,
  ledger: (id: string) => ['cashbox_ledger', id] as const,
};

function invalidateCashboxCaches(qc: ReturnType<typeof useQueryClient>, cashboxId?: string) {
  qc.invalidateQueries({ queryKey: qk.cashboxBalances });
  qc.invalidateQueries({ queryKey: qk.cashboxes });
  qc.invalidateQueries({ queryKey: cashboxQk.transfers });
  qc.invalidateQueries({ queryKey: ['audit_log_feed'] });
  qc.invalidateQueries({ queryKey: qk.dashboardStats });
  qc.invalidateQueries({ queryKey: qk.monthlySummary });
  if (cashboxId) {
    qc.invalidateQueries({ queryKey: cashboxQk.ledger(cashboxId) });
  }
}

export function useCashTransfers(limit = 50) {
  return useQuery<CashTransferRow[]>({
    queryKey: [...cashboxQk.transfers, limit],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('cash_transfers')
        .select(TRANSFER_SELECT)
        .order('transfer_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as CashTransferRow[]) ?? [];
    },
  });
}

export function useCashboxLedger(cashboxId: string, limit = 200) {
  return useQuery<CashboxLedgerPayload>({
    queryKey: [...cashboxQk.ledger(cashboxId), limit],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('get_cashbox_ledger', {
        p_cashbox_id: cashboxId,
        p_limit: limit,
        p_offset: 0,
      });
      if (error) throw error;
      const payload = data as CashboxLedgerPayload;
      return {
        ...payload,
        opening_balance: Number(payload.opening_balance),
        current_balance: Number(payload.current_balance),
        rows: (payload.rows ?? []).map((r) => ({
          ...r,
          signed_amount: Number(r.signed_amount),
          balance_after: Number(r.balance_after),
        })),
      };
    },
    enabled: !!cashboxId,
  });
}

export function useRecordCashboxTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      from_cashbox_id: string;
      to_cashbox_id: string;
      amount: number;
      transfer_date?: string;
      description?: string;
      notes?: string;
    }) => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('record_cashbox_transfer', {
        p_from_cashbox_id: input.from_cashbox_id,
        p_to_cashbox_id: input.to_cashbox_id,
        p_amount: input.amount,
        p_transfer_date: input.transfer_date ?? new Date().toISOString().slice(0, 10),
        p_description: input.description ?? null,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
      return data as {
        id: string;
        reference: string;
        from_cashbox_id: string;
        to_cashbox_id: string;
        amount: number;
        transfer_date: string;
      };
    },
    onSuccess: (_data, vars) => {
      invalidateCashboxCaches(qc, vars.from_cashbox_id);
      invalidateCashboxCaches(qc, vars.to_cashbox_id);
    },
  });
}

export const LEDGER_KIND_LABELS: Record<string, string> = {
  REVENUE: 'إيراد',
  EXPENSE: 'مصروف',
  TRANSFER_IN: 'تحويل وارد',
  TRANSFER_OUT: 'تحويل صادر',
};
