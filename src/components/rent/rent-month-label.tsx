'use client';

import {
  RENT_MONTH_NAME_CLASS,
  RENT_MONTH_STATUS_TEXT_CLASS,
  RENT_MONTH_YEAR_CLASS,
  splitMonthLabelAr,
  type RentMonthStatus,
} from '@/lib/rent-months';
import { cn } from '@/lib/utils';

type Props = {
  monthKey: string;
  status?: RentMonthStatus;
  /** سطر الحالة (مدفوع / غير مدفوع) */
  statusLabel?: string;
  journalNumber?: number | null;
  /** مثال: 500 / 1,000 د.ل */
  partialProgress?: string | null;
  layout?: 'inline' | 'stacked';
  className?: string;
  nameClassName?: string;
};

/** اسم الشهر بلون محايد، وحالة الدفع بلونها */
export function RentMonthLabel({
  monthKey,
  status,
  statusLabel,
  journalNumber,
  partialProgress,
  layout = 'stacked',
  className,
  nameClassName,
}: Props) {
  const { name, year } = splitMonthLabelAr(monthKey);
  const statusTextClass =
    status != null ? RENT_MONTH_STATUS_TEXT_CLASS[status] : undefined;

  if (layout === 'inline') {
    return (
      <span className={cn('inline-flex flex-wrap items-baseline gap-x-1 gap-y-0', className)}>
        <span className={cn(RENT_MONTH_NAME_CLASS, 'font-semibold', nameClassName)}>
          {name}
        </span>
        <span className={cn(RENT_MONTH_YEAR_CLASS, 'text-[10px] font-medium tabular-nums')}>
          {year}
        </span>
        {statusLabel && statusTextClass && (
          <span className={cn('text-[10px] font-medium', statusTextClass)}>
            · {statusLabel}
          </span>
        )}
        {journalNumber != null && (
          <span className={cn('text-[10px] font-normal', statusTextClass ?? 'text-ink-mute')}>
            قيد #{journalNumber}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={cn('inline-flex flex-col items-center leading-tight', className)}>
      <span className={cn(RENT_MONTH_NAME_CLASS, 'font-bold text-[11px] sm:text-xs', nameClassName)}>
        {name}
      </span>
      <span className={cn(RENT_MONTH_YEAR_CLASS, 'text-[9px] sm:text-[10px] font-medium tabular-nums')}>
        {year}
      </span>
      {partialProgress && (
        <span className="text-[8px] sm:text-[9px] font-semibold text-amber-800 mt-0.5 tabular-nums">
          {partialProgress}
        </span>
      )}
      {statusLabel && statusTextClass && (
        <span className={cn('text-[8px] sm:text-[9px] font-semibold mt-0.5', statusTextClass)}>
          {statusLabel}
        </span>
      )}
      {journalNumber != null && (
        <span className={cn('text-[7px] font-normal mt-0.5', statusTextClass ?? 'text-ink-mute')}>
          #{journalNumber}
        </span>
      )}
    </span>
  );
}
