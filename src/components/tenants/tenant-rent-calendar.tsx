'use client';

import { Loader2 } from 'lucide-react';
import { useTenantRentCalendar } from '@/lib/db/rent-queries';
import {
  currentYear,
  formatMonthLabelAr,
  RENT_MONTH_STATUS_LABEL,
  type RentMonthStatus,
} from '@/lib/rent-months';
import { cn, formatMoney } from '@/lib/utils';

const CELL: Record<RentMonthStatus, string> = {
  paid: 'bg-emerald-600 text-white',
  partial: 'bg-amber-500 text-white',
  unpaid: 'bg-red-600 text-white',
  no_charge: 'bg-slate-400 text-white',
  na: 'bg-canvas-sunken text-ink-mute',
};

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

  const paid = data.months.filter((m) => m.status === 'paid').length;
  const unpaid = data.months.filter(
    (m) => m.status === 'unpaid' || m.status === 'partial' || m.status === 'no_charge',
  ).length;

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

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {data.months.map((m) => {
          const short = formatMonthLabelAr(m.month).split(' ')[0];
          return (
            <div
              key={m.month}
              title={`${formatMonthLabelAr(m.month)} — ${RENT_MONTH_STATUS_LABEL[m.status]}`}
              className={cn(
                'rounded-lg px-2 py-2.5 text-center text-[11px] font-medium',
                CELL[m.status],
              )}
            >
              <div>{short}</div>
              <div className="text-[9px] opacity-90 mt-0.5">
                {RENT_MONTH_STATUS_LABEL[m.status]}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-ink-mute">
        {(['paid', 'partial', 'unpaid', 'no_charge'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={cn('h-2.5 w-2.5 rounded-sm', CELL[s])} />
            {RENT_MONTH_STATUS_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
