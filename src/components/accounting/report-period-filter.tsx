'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AccountingYearPicker } from '@/components/accounting/accounting-year-picker';
import {
  type ReportPeriod,
  reportMonthOptions,
} from '@/lib/report-period';

export function ReportPeriodFilter({
  value,
  onChange,
  className,
  showYearOnlyOption = true,
}: {
  value: ReportPeriod;
  onChange: (next: ReportPeriod) => void;
  className?: string;
  showYearOnlyOption?: boolean;
}) {
  const months = reportMonthOptions();

  return (
    <div className={cn('space-y-4', className)}>
      <AccountingYearPicker
        value={value.year}
        onChange={(year) => onChange({ ...value, year })}
      />

      <div className="min-w-0">
        <p className="mb-2 text-xs font-medium text-muted-foreground">الفترة</p>
        <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
          {showYearOnlyOption ? (
            <Button
              type="button"
              variant={value.mode === 'year' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onChange({ year: value.year, month: null, mode: 'year' })}
              className={cn(
                'min-h-10 touch-manipulation',
                value.mode === 'year' &&
                  'bg-sage-700 hover:bg-sage-800 text-white border-sage-700',
              )}
            >
              السنة كاملة
            </Button>
          ) : null}
          {months.map((m) => {
            const active = value.mode === 'month' && value.month === m.value;
            return (
              <Button
                key={m.value}
                type="button"
                variant={active ? 'default' : 'outline'}
                size="sm"
                onClick={() =>
                  onChange({ year: value.year, month: m.value, mode: 'month' })
                }
                className={cn(
                  'min-h-10 min-w-[4.5rem] touch-manipulation',
                  active && 'bg-sage-700 hover:bg-sage-800 text-white border-sage-700',
                )}
              >
                {m.label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
