'use client';

import { useMemo } from 'react';
import { useFiscalPeriods } from '@/lib/db/mall-queries';
import { cn } from '@/lib/utils';

/** Fiscal year as a compact segmented control. */
export function AccountingYearPicker({
  value,
  onChange,
  years,
  className,
}: {
  value: number;
  onChange: (year: number) => void;
  years?: number[];
  className?: string;
}) {
  const { data: periods } = useFiscalPeriods();
  // every year that has a fiscal period, plus the last two and the next one, plus the chosen year
  const list = useMemo(() => {
    if (years) return years;
    const currentYear = new Date().getFullYear();
    const set = new Set<number>([currentYear - 2, currentYear - 1, currentYear, currentYear + 1, value]);
    for (const p of periods ?? []) {
      const y = Number(String(p.start_date).slice(0, 4));
      if (y > 1990 && y <= currentYear + 1) set.add(y);
    }
    return [...set].sort((a, b) => a - b);
  }, [years, periods, value]);

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <span className="shrink-0 text-[12.5px] text-ink-mute">السنة</span>
      <div
        className="flex min-w-0 overflow-x-auto rounded-lg border border-border bg-canvas-sunken p-0.5 scrollbar-none"
        role="group"
        aria-label="السنة المالية"
      >
        {list.map((year) => {
          const active = value === year;
          return (
            <button
              key={year}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(year)}
              className={cn(
                'h-8 shrink-0 rounded-md px-3 text-[13px] font-medium tabular-nums touch-manipulation transition-colors',
                active ? 'bg-card text-foreground shadow-xs' : 'text-ink-mute hover:text-foreground',
              )}
            >
              {year}
            </button>
          );
        })}
      </div>
    </div>
  );
}
