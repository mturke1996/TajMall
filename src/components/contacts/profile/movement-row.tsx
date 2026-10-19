'use client';

import { ArrowDownToLine, ArrowUpFromLine, CopyPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconTile } from '@/components/dashboard/dashboard-ui';
import { CHIP } from '@/components/people';
import { isCountedTransaction } from '@/lib/contacts/contact-transactions';
import type { TransactionWithRelations } from '@/lib/db/types';
import { cn, formatDate, formatMoney } from '@/lib/utils';

const STATUS_TEXT: Record<string, { label: string; tone: 'warning' | 'neutral' }> = {
  DRAFT: { label: 'مسودة', tone: 'warning' },
  VOIDED: { label: 'ملغاة', tone: 'neutral' },
};

/** A transaction as one line: direction tile, what it was for, where it went, the amount. */
export function MovementRow({
  tx,
  onRepeat,
  showNumber = true,
}: {
  tx: TransactionWithRelations;
  /** the repeat button; absent for people who may not create this kind of transaction */
  onRepeat?: (tx: TransactionWithRelations) => void;
  showNumber?: boolean;
}) {
  const incoming = tx.kind === 'REVENUE';
  const counted = isCountedTransaction(tx);
  const status = STATUS_TEXT[tx.status];
  const amount = Number(tx.amount) || 0;
  const title = tx.description?.trim() || tx.category?.name_ar || 'بدون بيان';
  // the account is the title when there is no description; otherwise it follows the date
  const account = tx.description?.trim() ? tx.category?.name_ar : null;
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <IconTile
        icon={incoming ? ArrowDownToLine : ArrowUpFromLine}
        accent={incoming ? 'green' : 'red'}
        className={cn('h-9 w-9 rounded-lg', !counted && 'opacity-50')}
      />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-[13.5px] font-medium text-foreground', tx.status === 'VOIDED' && 'line-through decoration-ink-mute')}>{title}</p>
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12px] text-ink-mute">
          <span className="tabular-nums">{formatDate(tx.tx_date)}</span>
          {account && <span className="truncate">· {account}</span>}
          {showNumber && (
            <span className="tabular-nums" dir="ltr">
              #{tx.number}
            </span>
          )}
          {status && <span className={cn('rounded-full border px-1.5 text-[11px] leading-5', CHIP[status.tone])}>{status.label}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className={cn('text-[13.5px] font-semibold tabular-nums', counted ? (incoming ? 'text-success-ink' : 'text-danger-ink') : 'text-ink-mute')}>
          {formatMoney(incoming ? amount : -amount, tx.currency || 'LYD', { signed: true })}
        </span>
        {onRepeat && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-my-1 h-11 w-11 sm:h-9 sm:w-9"
            onClick={() => onRepeat(tx)}
            aria-label={`كرّر المعاملة #${tx.number}`}
            title="كرّر المعاملة"
          >
            <CopyPlus />
          </Button>
        )}
      </div>
    </li>
  );
}
