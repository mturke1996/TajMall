'use client';

import { cn, formatDate, formatMoney } from '@/lib/utils';
import type { TransactionWithRelations } from '@/lib/db/types';

export function MobileTransactionList({
  rows,
  emptyMessage = 'لا توجد معاملات',
}: {
  rows: TransactionWithRelations[];
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-mute">{emptyMessage}</p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
      {rows.map((tx) => (
        <li key={tx.id} className="px-3 py-3 sm:px-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm leading-snug truncate">
                {tx.description || tx.category?.name_ar || '—'}
              </p>
              <p className="text-[12px] text-ink-mute mt-0.5">
                {formatDate(tx.tx_date)}
                {tx.cashbox?.name_ar ? ` · ${tx.cashbox.name_ar}` : ''}
              </p>
              <span
                className={cn(
                  'mt-1.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                  tx.kind === 'REVENUE'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-red-50 text-red-700',
                )}
              >
                {tx.kind === 'REVENUE' ? 'إيراد' : 'مصروف'}
              </span>
            </div>
            <p
              className={cn(
                'shrink-0 font-bold tabular-nums text-sm',
                tx.kind === 'REVENUE' ? 'text-green-600' : 'text-red-600',
              )}
            >
              {formatMoney(Number(tx.amount), tx.currency)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
