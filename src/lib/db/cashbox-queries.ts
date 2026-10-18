'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { qk } from '@/lib/db/queries';
import { todayISODate } from '@/lib/utils';
import { invalidateMoneyQueries } from '@/lib/db/invalidate';

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
  journal_id?: string | null;
  source_type: 'transaction' | 'cash_transfer' | 'journal';
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
  reconciled_at: string | null;
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

function invalidateCashboxCaches(qc: ReturnType<typeof useQueryClient>, _cashboxId?: string) {
  qc.invalidateQueries({ queryKey: qk.cashboxes });
  // balances, both boxes' ledgers, transfers and every report built on cash
  invalidateMoneyQueries(qc);
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

/**
 * Every movement of one cashbox. The function returns one JSON value per call, so it is read in pages
 * until a short page: the in/out totals and the reconciled balance on the page need all rows, not the
 * newest 200.
 */
export async function fetchCashboxLedger(cashboxId: string, pageSize = 500): Promise<CashboxLedgerPayload> {
  const supabase = createSupabaseBrowserClient();
  let first: CashboxLedgerPayload | null = null;
  const rows: CashboxLedgerPayload['rows'] = [];
  for (let offset = 0; offset < 100_000; offset += pageSize) {
    const { data, error } = await supabase.rpc('get_cashbox_ledger', {
      p_cashbox_id: cashboxId,
      p_limit: pageSize,
      p_offset: offset,
    });
    if (error) throw error;
    const payload = data as CashboxLedgerPayload;
    first ??= payload;
    const page = payload.rows ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  const payload = first as CashboxLedgerPayload;
  return {
    ...payload,
    opening_balance: Number(payload.opening_balance),
    current_balance: Number(payload.current_balance),
    rows: rows.map((r) => ({
      ...r,
      signed_amount: Number(r.signed_amount),
      balance_after: Number(r.balance_after),
    })),
  };
}

/** The query that holds one cashbox's full ledger; its key is shared with every screen that reads it. */
export const cashboxLedgerQuery = (cashboxId: string, pageSize = 500) => ({
  queryKey: [...cashboxQk.ledger(cashboxId), 'all'] as const,
  queryFn: () => fetchCashboxLedger(cashboxId, pageSize),
  enabled: !!cashboxId,
});

export function useCashboxLedger(cashboxId: string, pageSize = 500) {
  return useQuery<CashboxLedgerPayload>(cashboxLedgerQuery(cashboxId, pageSize));
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
        p_transfer_date: input.transfer_date ?? todayISODate(),
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

/** يبدّل حالة "مطابَق مع كشف الحساب" لحركة واحدة — للتسوية البنكية. */
export function useSetLedgerEventReconciled(cashboxId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sourceType: 'transaction' | 'cash_transfer' | 'journal';
      eventId: string;
      reconciled: boolean;
    }) => {
      if (input.sourceType === 'journal') {
        throw new Error('المطابقة البنكية متاحة للإيراد/المصروف والتحويلات فقط');
      }
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('set_ledger_event_reconciled', {
        p_source_type: input.sourceType,
        p_event_id: input.eventId,
        p_reconciled: input.reconciled,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cashboxQk.ledger(cashboxId) });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: cashboxQk.transfers });
    },
  });
}

export const LEDGER_KIND_LABELS: Record<string, string> = {
  REVENUE: 'إيراد',
  EXPENSE: 'مصروف',
  TRANSFER_IN: 'تحويل وارد',
  TRANSFER_OUT: 'تحويل صادر',
  VOUCHER: 'إذن صرف',
  CASHBOX_COUNT: 'جرد خزائن',
  IN: 'وارد',
  OUT: 'صادر',
  TRANSACTION: 'معاملة',
};
