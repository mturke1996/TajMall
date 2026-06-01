'use client';

import { Loader2, Receipt } from 'lucide-react';
import { useContactTransactions } from '@/lib/db/queries';
import { cn, formatDate, formatMoney } from '@/lib/utils';

export function TenantRentHistory({
  tenantId,
  limit = 24,
  compact,
}: {
  tenantId: string;
  limit?: number;
  compact?: boolean;
}) {
  const { data: transactions = [], isLoading } = useContactTransactions(tenantId);

  const rentPayments = transactions
    .filter((t) => t.kind === 'REVENUE')
    .slice(0, limit);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
      </div>
    );
  }

  if (rentPayments.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-ink-mute">
        <Receipt className="mx-auto h-8 w-8 opacity-40 mb-2" />
        لا توجد مدفوعات إيجار مسجّلة بعد
      </div>
    );
  }

  return (
    <ul
      className={cn(
        'divide-y divide-border rounded-xl border border-border bg-card overflow-hidden',
        compact && 'text-sm',
      )}
    >
      {rentPayments.map((tx) => (
        <li
          key={tx.id}
          className="flex items-center justify-between gap-3 px-3 py-3 sm:px-4"
        >
          <div className="min-w-0">
            <p className="font-medium truncate">
              {tx.description || tx.category?.name_ar || 'إيجار'}
            </p>
            <p className="text-xs text-ink-mute mt-0.5">
              {formatDate(tx.tx_date)}
              {tx.cashbox?.name_ar ? ` · ${tx.cashbox.name_ar}` : ''}
            </p>
          </div>
          <p className="shrink-0 font-semibold text-green-600 tabular-nums">
            {formatMoney(Number(tx.amount), tx.currency)}
          </p>
        </li>
      ))}
    </ul>
  );
}
