'use client';

import { RENT_MONTH_STATUS_LABEL, type RentMonthStatus } from '@/lib/rent-months';
import { cn } from '@/lib/utils';

const BADGE: Record<RentMonthStatus, string> = {
  paid: 'bg-success-soft text-success-ink border-success-line',
  partial: 'bg-warning-soft text-warning-ink border-warning-line',
  unpaid: 'bg-danger-soft text-danger-ink border-danger-line',
  no_charge: 'bg-muted text-foreground border-border',
  exempt: 'bg-canvas-sunken text-ink-soft border-dashed border-ink-mute/50',
  na: 'bg-canvas-sunken text-ink-mute border-border',
};

export function RentMonthStatusBadge({
  status,
  className,
}: {
  status: RentMonthStatus | null | undefined;
  className?: string;
}) {
  if (!status || status === 'na') return null;

  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        BADGE[status],
        className,
      )}
    >
      {RENT_MONTH_STATUS_LABEL[status]}
    </span>
  );
}
