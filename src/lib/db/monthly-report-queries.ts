'use client';

import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { fetchAllPages } from '@/lib/db/fetch-all';
import { cashboxLedgerQuery } from '@/lib/db/cashbox-queries';
import { useCashboxes, useTenantRentSummaryForMonth } from '@/lib/db/queries';
import { useLeaseContracts, useMallUnits, useTenantArAging } from '@/lib/db/mall-queries';
import { buildContractExpiry } from '@/lib/contract-expiry';
import { buildMallOccupancy } from '@/lib/mall-occupancy';
import {
  buildMonthlyReport,
  monthBounds,
  shiftMonth,
  type ReportAgingRow,
  type ReportTx,
} from '@/lib/monthly-report';
import { todayISODate } from '@/lib/utils';

type Rows<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/**
 * Everything the monthly report needs, read through the same queries the other screens use (so the
 * numbers cannot differ from them) plus the month's transactions. Transactions and the month's rent
 * are essential; the rest degrades to an absent section, so one slow or failing source does not take
 * the whole report down.
 */
export function useMonthlyReport(month: string) {
  // the day the report was opened: stable across re-renders
  const today = useMemo(() => todayISODate(), []);
  const prev = shiftMonth(month, -1);
  const prevStart = monthBounds(prev).start;
  const { end } = monthBounds(month);
  const asOf = end > today ? today : end;

  const transactions = useQuery({
    // under "transactions" so any money change refreshes an open report
    queryKey: ['transactions', 'monthly_report', prevStart, end],
    queryFn: () => {
      const supabase = createSupabaseBrowserClient();
      return fetchAllPages<ReportTx>(
        (from, to) =>
          supabase
            .from('transactions')
            .select('id, kind, status, amount, tx_date, category:categories(code, name_ar, type)')
            .gte('tx_date', prevStart)
            .lte('tx_date', end)
            .order('tx_date')
            .order('id')
            .range(from, to) as unknown as Rows<ReportTx>,
      );
    },
  });
  const rent = useTenantRentSummaryForMonth(month);
  const rentPrev = useTenantRentSummaryForMonth(prev);
  const aging = useTenantArAging(asOf);
  const boxes = useCashboxes();
  const ledgers = useQueries({ queries: (boxes.data ?? []).map((b) => cashboxLedgerQuery(b.id)) });
  const units = useMallUnits();
  const contracts = useLeaseContracts();

  const ledgersReady = boxes.isSuccess && ledgers.every((q) => q.isSuccess);
  // one stable value for "a ledger changed": the list itself changes length once the cashboxes arrive
  const ledgersStamp = ledgers.map((q) => q.dataUpdatedAt).join('|');
  const loading =
    transactions.isLoading || rent.isLoading || boxes.isLoading || ledgers.some((q) => q.isLoading) || aging.isLoading;

  const report = useMemo(() => {
    if (!transactions.data || !rent.data) return null;
    const isCurrent = today.slice(0, 7) === month;
    const agingRows = aging.isSuccess ? (((aging.data as { rows?: ReportAgingRow[] } | null)?.rows ?? []) as ReportAgingRow[]) : null;
    const haveMall = isCurrent && units.isSuccess && contracts.isSuccess;
    return buildMonthlyReport({
      month,
      today,
      transactions: transactions.data,
      rent: rent.data,
      rentPrev: rentPrev.data ?? null,
      aging: agingRows,
      cashboxes: ledgersReady
        ? (boxes.data ?? []).map((b, i) => ({
            id: b.id,
            name_ar: b.name_ar,
            kind: b.kind,
            opening_balance: ledgers[i].data?.opening_balance ?? 0,
            rows: ledgers[i].data?.rows ?? [],
          }))
        : null,
      occupancy: haveMall ? buildMallOccupancy({ units: units.data ?? [], contracts: contracts.data ?? [], today }) : null,
      expiry: haveMall ? buildContractExpiry({ contracts: contracts.data ?? [], today }) : null,
    });
    // `ledgers` is a new array each render; ledgersStamp says when any of them changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, today, transactions.data, rent.data, rentPrev.data, aging.data, aging.isSuccess, boxes.data, ledgersReady, ledgersStamp, units.data, units.isSuccess, contracts.data, contracts.isSuccess]);

  return {
    report,
    loading,
    error: transactions.error ?? rent.error,
    /** sections left out because their source failed */
    missing: {
      arrears: aging.isError,
      cashboxes: boxes.isError || ledgers.some((q) => q.isError),
      rentPrev: rentPrev.isError,
    },
  };
}
