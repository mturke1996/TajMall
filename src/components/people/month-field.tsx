'use client';

import { useId, useState } from 'react';
import { cn, todayISODate } from '@/lib/utils';

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const SELECT =
  'h-11 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:h-10 ' +
  'transition-[border-color,box-shadow] duration-100 focus-visible:outline-hidden focus-visible:border-ring focus-visible:shadow-focus ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

/**
 * A month and a year, as two native selects (the best picker on a phone, and it works in every browser,
 * unlike `<input type="month">`). `value` is "YYYY-MM" or "" for none; `onChange` is called with a complete
 * month, or with "" when the pair is incomplete (cleared, or only one of the two chosen so far).
 */
export function MonthField({
  label,
  value,
  onChange,
  hint,
  disabled,
  minYear,
  maxYear,
  clearLabel = 'بلا تحديد',
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  disabled?: boolean;
  minYear?: number;
  maxYear?: number;
  clearLabel?: string;
  className?: string;
}) {
  const id = useId();
  // a complete month lives in `value`; only a half-chosen pair is kept here
  const valid = /^\d{4}-\d{2}$/.test(value);
  const [partial, setPartial] = useState({ month: '', year: '' });
  const month = valid ? value.slice(5, 7) : partial.month;
  const year = valid ? value.slice(0, 4) : partial.year;

  const thisYear = Number(todayISODate().slice(0, 4));
  const lo = Math.min(minYear ?? thisYear - 6, Number(year) || thisYear);
  const hi = Math.max(maxYear ?? thisYear + 1, Number(year) || thisYear);
  const years = Array.from({ length: hi - lo + 1 }, (_, i) => String(hi - i));

  // an incomplete pair is no value: clearing either select clears the field
  const set = (m: string, y: string) => {
    if (m && y) {
      setPartial({ month: '', year: '' });
      onChange(`${y}-${m}`);
    } else {
      setPartial({ month: m, year: y });
      onChange('');
    }
  };

  return (
    <div role="group" aria-labelledby={`${id}-label`} className={cn('space-y-1.5', className)}>
      <p id={`${id}-label`} className="text-[12.5px] font-medium text-ink-soft">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label={`${label}، الشهر`}
          className={SELECT}
          disabled={disabled}
          value={month}
          // a month chosen first takes this year until the person picks another
          onChange={(e) => set(e.target.value, year || (e.target.value ? String(thisYear) : ''))}
        >
          <option value="">{clearLabel}</option>
          {MONTHS.map((name, i) => (
            <option key={name} value={String(i + 1).padStart(2, '0')}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label}، السنة`}
          className={SELECT}
          disabled={disabled}
          value={year}
          onChange={(e) => set(month, e.target.value)}
        >
          <option value="">{clearLabel}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {hint && <p className="text-[12px] text-ink-mute">{hint}</p>}
    </div>
  );
}
