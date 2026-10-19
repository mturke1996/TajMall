'use client';

import { useCallback } from 'react';
import { HandCoins } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ACCENT_FILL } from '@/components/people';
import { useCategories } from '@/lib/db/queries';
import {
  landlordDueHeadline,
  landlordPayLabel,
  type LandlordDue,
  type LandlordDueStatus,
  type LandlordNextPayment,
  type LandlordStripMonth,
} from '@/lib/landlord-dues';
import { OBLIGATION_LABEL } from '@/lib/people/obligation-months';
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
        // an estimate is never typed in for the accountant: the field stays empty
        amount: next.amount ?? undefined,
        categoryId: rentCategoryId,
      }),
    [open, rentCategoryId],
  );
  return { canPay: can('expense.create'), pay };
}

/**
 * Secondary on purpose: it exists only while money is owed, and says which month and how much it pays.
 * `compact` is the short «سداد» that sits under a month cell, where the month is already named above it.
 */
export function LandlordPayButton({
  name,
  next,
  onPay,
  className,
  compact,
}: {
  name: string;
  next: LandlordNextPayment;
  onPay: () => void;
  className?: string;
  compact?: boolean;
}) {
  const money = next.amount != null ? formatMoney(next.amount, 'LYD') : null;
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn('h-11 gap-1.5 md:h-9', className)}
      onClick={onPay}
    >
      <HandCoins aria-hidden />
      <span>{compact ? 'سداد' : landlordPayLabel(next)}</span>
      {!compact && money && <span className="tabular-nums text-ink-mute">{money}</span>}
      {/* the name is the words on the button first (a voice command that says them finds it), then who and which year */}
      <span className="sr-only">
        {compact ? ` ${next.monthNameAr}` : ''} {next.year}، للمؤجر {name}
      </span>
    </Button>
  );
}

// ---------------------------------------------------------------- the year at a glance

type Look = 'before_system' | 'paid' | 'partial' | 'overdue' | 'due' | 'upcoming' | 'idle';
const lookOf = (m: Pick<LandlordStripMonth, 'status' | 'overdue'>): Look => (m.status === 'due' && m.overdue ? 'overdue' : m.status);

const SQUARE: Record<Look, string> = {
  before_system: 'border-info-line bg-info-soft',
  // the vivid accents, like the bars of a chart: a 12px square in the soft status colour would barely show
  paid: cn('border-transparent', ACCENT_FILL.green),
  partial: cn('border-transparent', ACCENT_FILL.amber),
  overdue: cn('border-transparent', ACCENT_FILL.red),
  due: cn('border-transparent', ACCENT_FILL.amber),
  upcoming: 'border-dashed border-ink-mute/60 bg-card',
  idle: 'border-dashed border-border bg-canvas-sunken',
};

const ORDER: Look[] = ['before_system', 'paid', 'partial', 'overdue', 'due', 'upcoming', 'idle'];

/**
 * Twelve small squares, one per month of the year, in the colours of the month grid on the landlord's page.
 * The words are in the label and in each square's tooltip, so the row reads without colour.
 */
export function LandlordMonthStrip({ months, className }: { months: readonly LandlordStripMonth[]; className?: string }) {
  const counts = new Map<Look, number>();
  for (const m of months) counts.set(lookOf(m), (counts.get(lookOf(m)) ?? 0) + 1);
  const summary = ORDER.filter((l) => counts.has(l))
    .map((l) => `${OBLIGATION_LABEL[l]} ${counts.get(l)}`)
    .join('، ');
  return (
    <div role="img" aria-label={`أشهر السنة: ${summary}`} className={cn('flex items-center gap-1', className)}>
      {months.map((m) => {
        const look = lookOf(m);
        return (
          <span
            key={m.monthKey}
            title={`${m.monthNameAr}: ${OBLIGATION_LABEL[look]}`}
            className={cn('h-3 w-3 shrink-0 rounded-[3px] border sm:h-3.5 sm:w-3.5', SQUARE[look], m.current && 'ring-2 ring-foreground/25 ring-offset-1 ring-offset-card')}
          />
        );
      })}
    </div>
  );
}
