'use client';

import { CopyPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRepeatTransaction } from '@/components/transactions/use-repeat-transaction';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import type { TransactionWithRelations } from '@/lib/db/types';

export function MobileTransactionList({
  rows,
  emptyMessage = 'لا توجد معاملات',
}: {
  rows: TransactionWithRelations[];
  emptyMessage?: string;
}) {
  const { canRepeat, repeat } = useRepeatTransaction();

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
            </div>
            <p
              className={cn(
                'shrink-0 font-bold tabular-nums text-sm',
                tx.kind === 'REVENUE' ? 'text-success-ink' : 'text-danger-ink',
              )}
            >
              {formatMoney(Number(tx.amount), tx.currency)}
            </p>
          </div>
          {/* the 44px button overlaps the row's padding, so repeating adds no height */}
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span
              className={cn(
                'inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                tx.kind === 'REVENUE'
                  ? 'bg-success-soft text-success-ink'
                  : 'bg-danger-soft text-danger-ink',
              )}
            >
              {tx.kind === 'REVENUE' ? 'إيراد' : 'مصروف'}
            </span>
            {canRepeat(tx) && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => repeat(tx)}
                aria-label={`كرّر المعاملة #${tx.number}`}
                className="-my-3 h-11 gap-1.5 px-2.5 text-[13px]"
              >
                <CopyPlus /> كرّر
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
