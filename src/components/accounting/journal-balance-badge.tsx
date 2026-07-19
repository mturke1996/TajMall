'use client';

import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn, formatMoney } from '@/lib/utils';
import {
  journalAmountsBalanced,
  journalBalanceDifference,
  toJournalAmount,
} from '@/lib/journal-entry-display';

type Props = {
  debit: number | string | null | undefined;
  credit: number | string | null | undefined;
  className?: string;
  /** When true, hide badge if both sides are zero */
  hideWhenEmpty?: boolean;
};

/**
 * Compact accounting balance indicator for journal vouchers.
 * Shows «متوازن» when debit === credit (and > 0), otherwise the difference.
 */
export function JournalBalanceBadge({
  debit,
  credit,
  className,
  hideWhenEmpty = true,
}: Props) {
  const d = toJournalAmount(debit);
  const c = toJournalAmount(credit);
  if (hideWhenEmpty && d <= 0 && c <= 0) return null;

  const balanced = journalAmountsBalanced(d, c);
  const diff = journalBalanceDifference(d, c);

  if (balanced) {
    return (
      <Badge
        variant="success"
        className={cn('normal-case tracking-normal gap-1', className)}
      >
        <CheckCircle2 className="h-3 w-3" aria-hidden />
        متوازن
      </Badge>
    );
  }

  return (
    <Badge
      variant="danger"
      className={cn('normal-case tracking-normal gap-1', className)}
      title={`فرق المدين عن الدائن: ${formatMoney(diff, 'LYD')}`}
    >
      <AlertTriangle className="h-3 w-3" aria-hidden />
      غير متوازن · فرق {formatMoney(Math.abs(diff), 'LYD')}
    </Badge>
  );
}
