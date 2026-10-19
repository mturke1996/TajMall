'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { cashboxLedgerQuery } from '@/lib/db/cashbox-queries';
import { useCashboxes } from '@/lib/db/queries';
import { buildDailyStatement } from '@/lib/daily-cashbox';
import { todayISODate } from '@/lib/utils';

/**
 * Every cashbox's ledger (the queries the cashbox pages already use, so the sheet cannot differ from
 * them) folded into one day. A box whose ledger could not be read fails the whole sheet: a handover
 * sheet with a box missing would look complete and not be.
 */
export function useDailyStatement(date: string) {
  const today = useMemo(() => todayISODate(), []);
  const boxes = useCashboxes();
  const ledgers = useQueries({ queries: (boxes.data ?? []).map((b) => cashboxLedgerQuery(b.id)) });

  const ready = boxes.isSuccess && ledgers.every((q) => q.isSuccess);
  // `ledgers` is a new array each render; this is one stable value for "a ledger changed"
  const stamp = ledgers.map((q) => q.dataUpdatedAt).join('|');
  const failed = ledgers.findIndex((q) => q.isError);

  const statement = useMemo(() => {
    if (!ready) return null;
    return buildDailyStatement({
      date,
      today,
      cashboxes: (boxes.data ?? []).map((b, i) => ({
        id: b.id,
        name_ar: b.name_ar,
        kind: b.kind,
        active: b.active,
        opening_balance: ledgers[i].data?.opening_balance ?? 0,
        current_balance: ledgers[i].data?.current_balance ?? null,
        rows: ledgers[i].data?.rows ?? [],
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, date, today, boxes.data, stamp]);

  return {
    statement,
    today,
    loading: boxes.isLoading || ledgers.some((q) => q.isLoading),
    error: boxes.error ?? (failed >= 0 ? ledgers[failed].error : null),
    failedBox: failed >= 0 ? (boxes.data ?? [])[failed]?.name_ar ?? null : null,
  };
}
