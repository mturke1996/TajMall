'use client';

import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PERIOD_MODE_OPTIONS,
  availableYears,
  formatPeriodLabelAr,
  formatPeriodRangeHintAr,
  formatPeriodShortLabelAr,
  getPeriodMonthKeys,
  periodYear,
  type TenantRentPeriodMode,
  type TenantRentPeriodSelection,
} from '@/lib/tenant-rent-period';
import { monthKey, monthNameAr, currentCalendarMonthIndex } from '@/lib/rent-months';

const QUARTER_HINTS = [
  'يناير – مارس',
  'أبريل – يونيو',
  'يوليو – سبتمبر',
  'أكتوبر – ديسمبر',
] as const;

const HALF_HINTS = ['يناير – يونيو', 'يوليو – ديسمبر'] as const;

function ModeTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-8 shrink-0 rounded-md px-3 text-[13px] font-medium touch-manipulation transition-colors',
        active ? 'bg-card text-foreground shadow-xs' : 'text-ink-mute hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

export type TenantRentPeriodSelectorProps = {
  selection: TenantRentPeriodSelection;
  onChange: (selection: TenantRentPeriodSelection) => void;
  className?: string;
};

function withYear(
  selection: TenantRentPeriodSelection,
  year: number,
): TenantRentPeriodSelection {
  switch (selection.mode) {
    case 'month': {
      const month = Number(selection.monthKey.slice(5, 7)) || 1;
      return { mode: 'month', monthKey: monthKey(year, month) };
    }
    case 'ytd':
      return { mode: 'ytd', year };
    case 'quarter':
      return { mode: 'quarter', year, quarter: selection.quarter };
    case 'half':
      return { mode: 'half', year, half: selection.half };
    case 'year':
      return { mode: 'year', year };
  }
}

export function TenantRentPeriodSelector({
  selection,
  onChange,
  className,
}: TenantRentPeriodSelectorProps) {
  const year = periodYear(selection);
  const years = availableYears(year);

  const setMode = (mode: TenantRentPeriodMode) => {
    if (selection.mode === mode) return;
    switch (mode) {
      case 'month': {
        const month =
          year === new Date().getFullYear()
            ? currentCalendarMonthIndex()
            : 1;
        onChange({ mode: 'month', monthKey: monthKey(year, month) });
        break;
      }
      case 'ytd':
        onChange({ mode: 'ytd', year });
        break;
      case 'quarter':
        onChange({ mode: 'quarter', year, quarter: 1 });
        break;
      case 'half':
        onChange({ mode: 'half', year, half: 1 });
        break;
      case 'year':
        onChange({ mode: 'year', year });
        break;
    }
  };

  const subValue =
    selection.mode === 'month'
      ? selection.monthKey
      : selection.mode === 'quarter'
        ? String(selection.quarter)
        : selection.mode === 'half'
          ? String(selection.half)
          : '';

  const onSubChange = (v: string) => {
    if (selection.mode === 'month') onChange({ mode: 'month', monthKey: v });
    else if (selection.mode === 'quarter') onChange({ mode: 'quarter', year, quarter: Number(v) as 1 | 2 | 3 | 4 });
    else if (selection.mode === 'half') onChange({ mode: 'half', year, half: Number(v) as 1 | 2 });
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div
        className="flex max-w-full overflow-x-auto rounded-lg border border-border bg-canvas-sunken p-0.5 scrollbar-none"
        role="group"
        aria-label="نوع الفترة"
      >
        {PERIOD_MODE_OPTIONS.map((opt) => (
          <ModeTab key={opt.mode} active={selection.mode === opt.mode} onClick={() => setMode(opt.mode)} label={opt.shortLabel} />
        ))}
      </div>

      <Select value={String(year)} onValueChange={(v) => onChange(withYear(selection, Number(v)))}>
        <SelectTrigger className="h-9 w-24" aria-label="السنة">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selection.mode === 'month' || selection.mode === 'quarter' || selection.mode === 'half' ? (
        <Select value={subValue} onValueChange={onSubChange}>
          <SelectTrigger className="h-9 w-44" aria-label="الفترة">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {selection.mode === 'month' &&
              Array.from({ length: 12 }, (_, i) => {
                const key = monthKey(year, i + 1);
                return (
                  <SelectItem key={key} value={key}>
                    {monthNameAr(key)}
                  </SelectItem>
                );
              })}
            {selection.mode === 'quarter' &&
              ([1, 2, 3, 4] as const).map((q) => (
                <SelectItem key={q} value={String(q)}>
                  {formatPeriodShortLabelAr({ mode: 'quarter', year, quarter: q })} · {QUARTER_HINTS[q - 1]}
                </SelectItem>
              ))}
            {selection.mode === 'half' &&
              ([1, 2] as const).map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {formatPeriodShortLabelAr({ mode: 'half', year, half: h })} · {HALF_HINTS[h - 1]}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      ) : null}

      <p className="text-[12.5px] text-ink-mute">{formatPeriodRangeHintAr(selection)}</p>
    </div>
  );
}

export { getPeriodMonthKeys, formatPeriodLabelAr, formatPeriodShortLabelAr };
