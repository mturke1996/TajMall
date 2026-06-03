'use client';

import { cn } from '@/lib/utils';
import {
  formatMonthLabelAr,
  toggleMonthInSelection,
  yearMonthsThroughCurrent,
  type RentCalendarMonth,
  RENT_MONTH_STATUS_CLASS,
} from '@/lib/rent-months';

type Props = {
  year?: number;
  selected: string[];
  onChange: (months: string[]) => void;
  calendarMonths?: RentCalendarMonth[];
  /** عرض حالة الشهر من التقويم */
  showStatus?: boolean;
  className?: string;
};

export function RentMonthPicker({
  year = new Date().getFullYear(),
  selected,
  onChange,
  calendarMonths,
  showStatus = true,
  className,
}: Props) {
  const keys = yearMonthsThroughCurrent(year);
  const statusByMonth = new Map(
    (calendarMonths ?? []).map((m) => [m.month, m.status]),
  );

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-xs text-ink-mute leading-relaxed">
        اختر شهراً أو عدة أشهر متتالية. عند اختيار غير متتالي يُعاد التحديد من الشهر الجديد.
      </p>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {keys.map((key) => {
          const isSelected = selected.includes(key);
          const status = statusByMonth.get(key);
          const statusClass =
            showStatus && status ? RENT_MONTH_STATUS_CLASS[status] : 'border-border bg-card';
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(toggleMonthInSelection(selected, key))}
              className={cn(
                'rounded-lg border px-2 py-2 text-[11px] font-medium touch-manipulation transition-colors',
                statusClass,
                isSelected && 'ring-2 ring-sage-600 ring-offset-1',
              )}
            >
              {formatMonthLabelAr(key)}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="text-xs font-medium text-sage-800">
          المحدد: {selected.map(formatMonthLabelAr).join(' · ')}
        </p>
      )}
    </div>
  );
}
