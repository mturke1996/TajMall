'use client';

import { RENT_MONTH_STATUS_LABEL, type RentMonthStatus } from '@/lib/rent-months';
import { cn } from '@/lib/utils';

const BADGE: Record<RentMonthStatus, string> = {
  paid: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  partial: 'bg-amber-100 text-amber-950 border-amber-300',
  unpaid: 'bg-red-100 text-red-900 border-red-300',
  no_charge: 'bg-slate-100 text-slate-800 border-slate-300',
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
        'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold',
        BADGE[status],
        className,
      )}
    >
      {RENT_MONTH_STATUS_LABEL[status]}
    </span>
  );
}
