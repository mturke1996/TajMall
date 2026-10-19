'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { TransactionWithRelations } from '@/lib/db/types';

// the same columns the transaction lists read, so what a receipt shows is what the list shows
const RECEIPT_TX_SELECT =
  '*, category:categories(id,code,name_ar,kind,color), cashbox:cashboxes(id,code,name_ar,kind,bank_name), contact:contacts(id,name,kind,shop_number)';

/**
 * One transaction read back by id. The rent function returns only the id of what it posted, and the receipt
 * needs the number, the status and the figures exactly as they were recorded.
 *
 * Not under a money key on purpose: a receipt that is on screen must not change under the person when the
 * lists behind it refresh.
 */
export function useReceiptTransaction(id: string | null) {
  return useQuery<TransactionWithRelations>({
    queryKey: ['receipt_transaction', id],
    enabled: !!id,
    // someone is waiting for it: one quick retry, then say so
    retry: 1,
    staleTime: Infinity,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.from('transactions').select(RECEIPT_TX_SELECT).eq('id', id as string).single();
      if (error) throw error;
      return data as unknown as TransactionWithRelations;
    },
  });
}
