'use client';

/**
 * The period section of a report's options: ready-made periods as chips, «أشهر محددة» (a year and any
 * months of it), «نطاق مخصص» (two dates, checked) — and always, under them, the range that results,
 * in words. The choice is a `PeriodSelection` (src/lib/report-options.ts); this component only edits it.
 */
import { CalendarRange } from 'lucide-react';
import {
  MONTHS_AR,
  QUICK_PERIODS,
  type PeriodSelection,
  type QuickPeriodId,
  type ResolvedPeriod,
} from '@/lib/report-options';
import { cn } from '@/lib/utils';
import { ChipButton, Field, FIELD_CLASS, OptionSection } from './option-ui';

const QUARTERS: { label: string; months: number[] }[] = [
  { label: 'الربع الأول', months: [1, 2, 3] },
  { label: 'الربع الثاني', months: [4, 5, 6] },
  { label: 'الربع الثالث', months: [7, 8, 9] },
  { label: 'الربع الرابع', months: [10, 11, 12] },
];

const sameMonths = (a: number[], b: number[]) => a.length === b.length && a.every((m, i) => m === b[i]);

export function PeriodPicker({
  value,
  onChange,
  resolved,
  years,
}: {
  value: PeriodSelection;
  onChange: (next: PeriodSelection) => void;
  /** the choice turned into dates (resolvePeriod), for the sentence under the chips and the error */
  resolved: ResolvedPeriod;
  /** years offered by the month picker, newest first */
  years: number[];
}) {
  const set = (patch: Partial<PeriodSelection>) => onChange({ ...value, ...patch });
  const quick = (id: QuickPeriodId) => set({ mode: 'QUICK', quick: id });

  const toggleMonth = (m: number) =>
    set({ months: value.months.includes(m) ? value.months.filter((x) => x !== m) : [...value.months, m].sort((a, b) => a - b) });

  return (
    <OptionSection icon={CalendarRange} accent="blue" title="الفترة الزمنية">
      <div className="flex flex-col gap-3.5">
        <div role="group" aria-label="الفترة" className="flex flex-wrap gap-2">
          {QUICK_PERIODS.map((q) => (
            <ChipButton key={q.id} selected={value.mode === 'QUICK' && value.quick === q.id} onClick={() => quick(q.id)}>
              {q.label}
            </ChipButton>
          ))}
          <ChipButton selected={value.mode === 'ALL'} onClick={() => set({ mode: 'ALL' })}>
            كل المدة
          </ChipButton>
          <ChipButton selected={value.mode === 'MONTHS'} onClick={() => set({ mode: 'MONTHS' })}>
            أشهر محددة
          </ChipButton>
          <ChipButton selected={value.mode === 'RANGE'} onClick={() => set({ mode: 'RANGE' })}>
            نطاق مخصص
          </ChipButton>
        </div>

        {value.mode === 'MONTHS' ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-canvas-sunken/50 p-3">
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
              <Field label="السنة" htmlFor="period-year" className="w-32">
                <select
                  id="period-year"
                  value={value.year}
                  onChange={(e) => set({ year: Number(e.target.value) })}
                  className={cn(FIELD_CLASS, 'rounded-md border border-border bg-card px-3 text-foreground focus-visible:border-ring/60 focus-visible:shadow-focus focus-visible:outline-hidden')}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex flex-wrap gap-x-1 gap-y-1" role="group" aria-label="اختصارات الأشهر">
                {QUARTERS.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => set({ months: q.months })}
                    aria-pressed={sameMonths(value.months, q.months)}
                    className="min-h-11 rounded-md px-2 text-[13px] font-medium text-info-ink hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-ring sm:min-h-8"
                  >
                    {q.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => set({ months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] })}
                  className="min-h-11 rounded-md px-2 text-[13px] font-medium text-info-ink hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-ring sm:min-h-8"
                >
                  كل أشهر السنة
                </button>
              </div>
            </div>
            <div role="group" aria-label="الأشهر" className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {MONTHS_AR.map((name, i) => (
                <ChipButton key={name} selected={value.months.includes(i + 1)} onClick={() => toggleMonth(i + 1)} className="px-2">
                  {name}
                </ChipButton>
              ))}
            </div>
          </div>
        ) : null}

        {value.mode === 'RANGE' ? (
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-canvas-sunken/50 p-3 sm:grid-cols-2">
            <Field label="من تاريخ" htmlFor="period-from">
              <input
                id="period-from"
                type="date"
                dir="ltr"
                value={value.from}
                max={value.to || undefined}
                onChange={(e) => set({ from: e.target.value })}
                aria-invalid={Boolean(resolved.error) || undefined}
                className={cn(FIELD_CLASS, 'w-full rounded-md border border-border bg-card px-3 text-start text-foreground focus-visible:border-ring/60 focus-visible:shadow-focus focus-visible:outline-hidden', resolved.error && 'border-danger')}
              />
            </Field>
            <Field label="إلى تاريخ" htmlFor="period-to">
              <input
                id="period-to"
                type="date"
                dir="ltr"
                value={value.to}
                min={value.from || undefined}
                onChange={(e) => set({ to: e.target.value })}
                aria-invalid={Boolean(resolved.error) || undefined}
                className={cn(FIELD_CLASS, 'w-full rounded-md border border-border bg-card px-3 text-start text-foreground focus-visible:border-ring/60 focus-visible:shadow-focus focus-visible:outline-hidden', resolved.error && 'border-danger')}
              />
            </Field>
          </div>
        ) : null}

        <div
          role="status"
          className={cn(
            'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed',
            resolved.error ? 'border-warning-line bg-warning-soft text-warning-ink' : 'border-info-line bg-info-soft text-info-ink',
          )}
        >
          <CalendarRange className="mt-0.5 size-4 shrink-0" aria-hidden />
          {resolved.error ? (
            <span>{resolved.error}</span>
          ) : (
            <span>
              <span className="font-medium">الفترة: </span>
              {resolved.words}
            </span>
          )}
        </div>
      </div>
    </OptionSection>
  );
}
