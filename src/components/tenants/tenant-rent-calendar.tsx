'use client';

import { Loader2 } from 'lucide-react';
import { useTenantRentCalendar } from '@/lib/db/rent-queries';
import { RentMonthLabel } from '@/components/rent/rent-month-label';
import {
  currentYear,
  formatMonthLabelAr,
  RENT_MONTH_CELL_FRAME,
  RENT_MONTH_LEGEND_SWATCH,
  RENT_MONTH_STATUS_LABEL,
  RENT_MONTH_STATUS_TEXT_CLASS,
} from '@/lib/rent-months';
import {
  filterVisibleCalendarMonths,
  isCalendarMonthOutstanding,
} from '@/lib/rent-exempt-months';
import { cn, formatMoney } from '@/lib/utils';

export function TenantRentCalendar({
  tenantId,
  year = currentYear(),
}: {
  tenantId: string;
  year?: number;
}) {
  const { data, isLoading, isError } = useTenantRentCalendar(tenantId, year);

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-sm text-ink-mute py-4 text-center">
        تعذّر تحميل تقويم الإيجار — طبّق هجرة 022 على Supabase
      </p>
    );
  }

  const exemptCount = data.months.filter((m) => m.status === 'exempt').length;
  const visible = filterVisibleCalendarMonths(data.months);
  const paid = visible.filter((m) => m.status === 'paid').length;
  const unpaid = visible.filter(isCalendarMonthOutstanding).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold">إيجار {year}</span>
        <span className="text-ink-mute tabular-nums">
          مدفوع {paid} · متبقي/مستحق {unpaid}
          {data.monthly_rent > 0 && (
            <> · شهري {formatMoney(data.monthly_rent, 'LYD')}</>
          )}
        </span>
      </div>

      {exemptCount > 0 && (
        <p className="text-[11px] text-ink-mute">
          استُبعد {exemptCount} شهر بدون مطالبة من العرض والإجماليات
        </p>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-ink-mute py-2 text-center">
          لا أشهر مطالَبة في هذه السنة
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {visible.map((m) => (
            <div
              key={m.month}
              title={`${formatMonthLabelAr(m.month)} — ${RENT_MONTH_STATUS_LABEL[m.status]}`}
              className={cn(
                'rounded-lg px-2 py-2.5 text-center',
                RENT_MONTH_CELL_FRAME[m.status],
              )}
            >
              <RentMonthLabel
                monthKey={m.month}
                status={m.status}
                statusLabel={RENT_MONTH_STATUS_LABEL[m.status]}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-[11px] text-ink-mute">
        {(['paid', 'partial', 'unpaid', 'no_charge'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={cn('h-2.5 w-2.5 rounded-sm', RENT_MONTH_LEGEND_SWATCH[s])} />
            <span className={RENT_MONTH_STATUS_TEXT_CLASS[s]}>
              {RENT_MONTH_STATUS_LABEL[s]}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
