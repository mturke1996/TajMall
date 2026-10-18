'use client';

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
  const currentYear = new Date().getFullYear();
  const list = years ?? [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

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
