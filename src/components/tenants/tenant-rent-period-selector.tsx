'use client';

import { cn } from '@/lib/utils';
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

function PeriodChip({
  active,
  onClick,
  label,
  hint,
  className,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 snap-center flex-col items-center justify-center rounded-lg border px-3 py-2 touch-manipulation min-w-[4.5rem]',
        active
          ? 'border-sage-700 bg-sage-700 text-white shadow-sm'
          : 'border-border bg-card text-ink hover:bg-secondary',
        className,
      )}
    >
      <span className="text-[12px] font-bold leading-tight">{label}</span>
      {hint && (
        <span
          className={cn(
            'text-[10px] font-medium leading-tight mt-0.5',
            active ? 'text-white/75' : 'text-ink-mute',
          )}
        >
          {hint}
        </span>
      )}
    </button>
  );
}

function ModeTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-[12px] font-semibold touch-manipulation transition-colors',
        active
          ? 'bg-sage-800 text-white shadow-sm'
          : 'text-ink-mute hover:bg-secondary hover:text-ink',
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

  const hideSubPeriodRow =
    selection.mode === 'year' || selection.mode === 'ytd';

  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="inline-flex items-center gap-0.5 rounded-full border border-border bg-canvas-sunken/60 p-0.5"
          role="tablist"
          aria-label="نوع الفترة"
        >
          {PERIOD_MODE_OPTIONS.map((opt) => (
            <ModeTab
              key={opt.mode}
              active={selection.mode === opt.mode}
              onClick={() => setMode(opt.mode)}
              label={opt.shortLabel}
            />
          ))}
        </div>
        <p className="hidden sm:block text-[11px] text-ink-mute truncate max-w-[14rem]">
          {formatPeriodRangeHintAr(selection)}
        </p>
      </div>

      {/* اختيار السنة متاح دائماً مع كل الأنماط */}
      <div
        className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar -mx-1 px-1"
        role="listbox"
        aria-label="اختيار السنة"
      >
        {years.map((y) => {
          const ytdHint =
            selection.mode === 'ytd'
              ? `${getPeriodMonthKeys({ mode: 'ytd', year: y }).length} أشهر`
              : selection.mode === 'year'
                ? '12 شهر'
                : 'سنة';
          return (
            <PeriodChip
              key={y}
              active={year === y}
              onClick={() => onChange(withYear(selection, y))}
              label={String(y)}
              hint={ytdHint}
              className="min-w-[4.25rem]"
            />
          );
        })}
      </div>

      {!hideSubPeriodRow && (
        <div
          className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar -mx-1 px-1"
          role="listbox"
          aria-label="اختيار الفترة"
        >
          {selection.mode === 'month' &&
            Array.from({ length: 12 }, (_, i) => {
              const key = monthKey(year, i + 1);
              return (
                <PeriodChip
                  key={key}
                  active={selection.monthKey === key}
                  onClick={() => onChange({ mode: 'month', monthKey: key })}
                  label={monthNameAr(key)}
                />
              );
            })}

          {selection.mode === 'quarter' &&
            ([1, 2, 3, 4] as const).map((q) => (
              <PeriodChip
                key={q}
                active={selection.quarter === q}
                onClick={() => onChange({ mode: 'quarter', year, quarter: q })}
                label={formatPeriodShortLabelAr({
                  mode: 'quarter',
                  year,
                  quarter: q,
                })}
                hint={QUARTER_HINTS[q - 1]}
                className="min-w-[5.5rem]"
              />
            ))}

          {selection.mode === 'half' &&
            ([1, 2] as const).map((h) => (
              <PeriodChip
                key={h}
                active={selection.half === h}
                onClick={() => onChange({ mode: 'half', year, half: h })}
                label={formatPeriodShortLabelAr({
                  mode: 'half',
                  year,
                  half: h,
                })}
                hint={HALF_HINTS[h - 1]}
                className="min-w-[6.5rem]"
              />
            ))}
        </div>
      )}
    </div>
  );
}

export { getPeriodMonthKeys, formatPeriodLabelAr, formatPeriodShortLabelAr };
