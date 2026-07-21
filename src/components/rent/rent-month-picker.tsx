'use client';

import { RentMonthLabel } from '@/components/rent/rent-month-label';
import { cn } from '@/lib/utils';
import {
  formatMonthLabelAr,
  toggleMonthInSelection,
  toggleMonthInSelectionCapped,
  yearMonthsAll,
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
  /** عرض كل شهور السنة (للتسوية اليدوية) */
  fullYear?: boolean;
  /** شهر واحد فقط في كل مرة */
  singleMonth?: boolean;
  /** حد أقصى لأشهر متتالية (مثلاً 2) */
  maxMonths?: number;
  className?: string;
};

export function RentMonthPicker({
  year = new Date().getFullYear(),
  selected,
  onChange,
  calendarMonths,
  showStatus = true,
  fullYear = false,
  singleMonth = false,
  maxMonths,
  className,
}: Props) {
  const keys = fullYear ? yearMonthsAll(year) : yearMonthsThroughCurrent(year);
  const statusByMonth = new Map(
    (calendarMonths ?? []).map((m) => [m.month, m.status]),
  );
  // إخفاء أشهر بدون مطالبة من شبكة الاختيار
  const visibleKeys = keys.filter((key) => statusByMonth.get(key) !== 'exempt');
  const hiddenExempt = keys.length - visibleKeys.length;

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-xs text-ink-mute leading-relaxed">
        {singleMonth
          ? 'اختر شهر الإيجار (مثلاً أبريل 2026) — الحالة تُحدَّد يدوياً وليس حسب تاريخ الدفع.'
          : maxMonths === 2
            ? 'اختر شهراً أو شهرين متتاليين (مثل مايو + يونيو) — يظهران مدفوعين بنفس القيد.'
            : 'اختر شهراً أو عدة أشهر متتالية. عند اختيار غير متتالي يُعاد التحديد من الشهر الجديد.'}
      </p>
      {hiddenExempt > 0 && (
        <p className="text-[11px] text-ink-mute">
          {hiddenExempt} شهر بدون مطالبة مخفي من الاختيار
        </p>
      )}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {visibleKeys.map((key) => {
          const isSelected = selected.includes(key);
          const status = statusByMonth.get(key);
          const statusClass =
            showStatus && status
              ? RENT_MONTH_STATUS_CLASS[status]
              : 'border-border bg-card';

          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (singleMonth) {
                  onChange(selected.includes(key) ? [] : [key]);
                  return;
                }
                if (maxMonths != null && maxMonths > 0) {
                  onChange(toggleMonthInSelectionCapped(selected, key, maxMonths));
                  return;
                }
                onChange(toggleMonthInSelection(selected, key));
              }}
              className={cn(
                'rounded-lg px-2 py-2 text-[11px] touch-manipulation transition-colors border-2',
                statusClass,
                isSelected && 'ring-2 ring-sage-600 ring-offset-1',
              )}
            >
              <RentMonthLabel
                monthKey={key}
                status={status}
                layout="stacked"
              />
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
