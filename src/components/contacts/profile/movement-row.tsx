'use client';

import { ArrowDownToLine, ArrowUpFromLine, CopyPlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconTile } from '@/components/dashboard/dashboard-ui';
import { CHIP } from '@/components/people';
import { isCountedTransaction } from '@/lib/contacts/contact-transactions';
import type { TransactionWithRelations } from '@/lib/db/types';
import { cn, formatDate, formatMoney } from '@/lib/utils';

export const MOVEMENT_STATUS: Record<string, { label: string; tone: 'warning' | 'neutral' }> = {
  DRAFT: { label: 'مسودة', tone: 'warning' },
  VOIDED: { label: 'ملغاة', tone: 'neutral' },
};

/** The movement's own amount with its direction: money in is green with +, money out red with −. */
export function MovementAmount({ tx, className }: { tx: TransactionWithRelations; className?: string }) {
  const incoming = tx.kind === 'REVENUE';
  const amount = Number(tx.amount) || 0;
  return (
    <span
      className={cn(
        'whitespace-nowrap text-[13.5px] font-semibold tabular-nums',
        isCountedTransaction(tx) ? (incoming ? 'text-success-ink' : 'text-danger-ink') : 'text-ink-mute',
        className,
      )}
    >
      {formatMoney(incoming ? amount : -amount, tx.currency || 'LYD', { signed: true })}
    </span>
  );
}

function MovementBody({ tx, showNumber }: { tx: TransactionWithRelations; showNumber: boolean }) {
  const incoming = tx.kind === 'REVENUE';
  const status = MOVEMENT_STATUS[tx.status];
  const title = tx.description?.trim() || tx.category?.name_ar || 'بدون بيان';
  // the account is the title when there is no description; otherwise it follows the date
  const account = tx.description?.trim() ? tx.category?.name_ar : null;
  return (
    <>
      <IconTile
        icon={incoming ? ArrowDownToLine : ArrowUpFromLine}
        accent={incoming ? 'green' : 'red'}
        className={cn('h-9 w-9 rounded-lg', !isCountedTransaction(tx) && 'opacity-50')}
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
    </>
  );
}

/** A transaction as one line of a list: direction tile, what it was for, the amount, repeat. */
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
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <MovementBody tx={tx} showNumber={showNumber} />
      <div className="flex shrink-0 items-center gap-1">
        <MovementAmount tx={tx} />
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

/** The same movement as a card (the table's phone and tablet layout), with repeat and delete under it. */
export function MovementCard({
  tx,
  onRepeat,
  onDelete,
}: {
  tx: TransactionWithRelations;
  onRepeat?: (tx: TransactionWithRelations) => void;
  onDelete?: (tx: TransactionWithRelations) => void;
}) {
  return (
    <div className="surface min-w-0 overflow-hidden p-3">
      <div className="flex items-center gap-3">
        <MovementBody tx={tx} showNumber />
        <MovementAmount tx={tx} className="shrink-0" />
      </div>
      {(onRepeat || onDelete) && (
        <div className="-mb-1 mt-1 flex items-center justify-end gap-1 border-t border-border pt-1">
          {onRepeat && (
            <Button type="button" variant="ghost" className="h-11 gap-1.5 px-3 text-[13px]" onClick={() => onRepeat(tx)} aria-label={`كرّر المعاملة #${tx.number}`}>
              <CopyPlus /> كرّر
            </Button>
          )}
          {onDelete && (
            <Button type="button" variant="ghost" className="h-11 gap-1.5 px-3 text-[13px] text-danger-ink" onClick={() => onDelete(tx)} aria-label={`حذف المعاملة #${tx.number}`}>
              <Trash2 /> حذف
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
