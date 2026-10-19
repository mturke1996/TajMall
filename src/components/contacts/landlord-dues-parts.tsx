'use client';

import { useCallback } from 'react';
import { HandCoins } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCategories } from '@/lib/db/queries';
import {
  landlordDueHeadline,
  landlordPayLabel,
  type LandlordDue,
  type LandlordDueStatus,
  type LandlordNextPayment,
} from '@/lib/landlord-dues';
import { usePermission } from '@/lib/supabase/use-permission';
import { useTxDialog } from '@/stores/transaction-dialog';
import type { ContactKind } from '@/lib/db/types';
import { cn, formatMoney } from '@/lib/utils';

/** The state is the text; the colour only repeats it. */
const BADGE: Record<LandlordDueStatus, 'danger' | 'warning' | 'success' | 'neutral'> = {
  arrears: 'danger',
  unpaid: 'warning',
  partial: 'warning',
  paid: 'success',
  none: 'neutral',
};

export function LandlordDueBadge({ row, className }: { row: Pick<LandlordDue, 'status' | 'idleReason' | 'arrears'>; className?: string }) {
  return (
    <Badge variant={BADGE[row.status]} className={className}>
      {landlordDueHeadline(row)}
    </Badge>
  );
}

/**
 * Opens the normal expense dialog for a landlord payment: the landlord, the amount still owed for the month
 * and the text that names that month, on the rent account when it exists.
 */
export function useLandlordPay() {
  const open = useTxDialog((s) => s.open);
  const { can } = usePermission();
  const { data: categories } = useCategories();
  const rentCategoryId = categories?.find((c) => c.code === 'EXP-RNT')?.id;

  const pay = useCallback(
    (contactId: string, next: LandlordNextPayment, contactKind: ContactKind = 'VENDOR') =>
      open({
        kind: 'EXPENSE',
        contactId,
        contactKind,
        description: next.description,
        amount: next.amount,
        categoryId: rentCategoryId,
      }),
    [open, rentCategoryId],
  );
  return { canPay: can('expense.create'), pay };
}

/** Secondary on purpose: it exists only while money is owed, and says which month and how much it pays. */
export function LandlordPayButton({
  name,
  next,
  onPay,
  className,
}: {
  name: string;
  next: LandlordNextPayment;
  onPay: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn('h-11 gap-1.5 md:h-8', className)}
      aria-label={`سداد إيجار شهر ${next.monthNameAr} ${next.year} للمؤجر ${name}، المبلغ ${formatMoney(next.amount, 'LYD')}`}
      onClick={onPay}
    >
      <HandCoins aria-hidden />
      <span>{landlordPayLabel(next)}</span>
      <span className="tabular-nums text-ink-mute">{formatMoney(next.amount, 'LYD')}</span>
    </Button>
  );
}
