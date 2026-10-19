'use client';

import { useCallback } from 'react';
import { repeatPermissionKey, repeatPrefillFrom, type RepeatSource } from '@/lib/entry-guards';
import { usePermission } from '@/lib/supabase/use-permission';
import { useTxDialog } from '@/stores/transaction-dialog';

/**
 * «كرّر المعاملة»: opens the new-transaction dialog from an existing row, dated today, as a fresh entry.
 * Whoever may create that kind of transaction may repeat it; a draft or voided row can be repeated too
 * (it creates a new posted transaction). Transfers, openings and adjustments are not repeatable here.
 */
export function useRepeatTransaction() {
  const open = useTxDialog((s) => s.open);
  const { can } = usePermission();

  const canRepeat = (tx: RepeatSource): boolean => {
    const key = repeatPermissionKey(tx.kind);
    return key !== null && can(key);
  };

  const repeat = useCallback(
    (tx: RepeatSource) => {
      const prefill = repeatPrefillFrom(tx);
      if (prefill) open(prefill);
    },
    [open],
  );

  return { canRepeat, repeat };
}
