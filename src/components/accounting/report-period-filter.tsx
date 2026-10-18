'use client';

import { cn } from '@/lib/utils';
import { AccountingYearPicker } from '@/components/accounting/accounting-year-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type ReportPeriod, reportMonthOptions } from '@/lib/report-period';

/** Year and period (whole year or one month) on one line. */
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
  const selected = value.mode === 'year' ? 'year' : String(value.month ?? '');

  return (
    <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-3', className)}>
      <AccountingYearPicker value={value.year} onChange={(year) => onChange({ ...value, year })} />
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[12.5px] text-ink-mute">الفترة</span>
        <Select
          value={selected}
          onValueChange={(v) =>
            onChange(
              v === 'year'
                ? { year: value.year, month: null, mode: 'year' }
                : { year: value.year, month: Number(v), mode: 'month' },
            )
          }
        >
          <SelectTrigger className="h-9 w-40" aria-label="الفترة">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {showYearOnlyOption && <SelectItem value="year">السنة كاملة</SelectItem>}
            {months.map((m) => (
              <SelectItem key={m.value} value={String(m.value)}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
