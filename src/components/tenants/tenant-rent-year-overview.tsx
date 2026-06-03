'use client';

import { useMemo } from 'react';
import { CalendarDays, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useTenantCharges } from '@/lib/db/mall-queries';
import { useTenantRentCalendar } from '@/lib/db/rent-queries';
import {
  buildRentCalendarFromCharges,
  normalizeRpcRentCalendar,
} from '@/lib/rent-calendar-from-charges';
import {
  currentYear,
  formatMonthLabelAr,
  RENT_MONTH_STATUS_LABEL,
  type RentCalendarMonth,
  type RentMonthStatus,
} from '@/lib/rent-months';
import { cn, formatMoney } from '@/lib/utils';

const CELL: Record<RentMonthStatus, string> = {
  paid: 'bg-emerald-600 text-white shadow-sm',
  partial: 'bg-amber-500 text-white shadow-sm',
  unpaid: 'bg-red-600 text-white shadow-sm',
  no_charge: 'bg-slate-500 text-white shadow-sm',
  na: 'bg-canvas-sunken text-ink-mute border border-border',
};

const CHIP: Record<RentMonthStatus, string> = {
  paid: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  partial: 'bg-amber-100 text-amber-950 border-amber-300',
  unpaid: 'bg-red-100 text-red-900 border-red-300',
  no_charge: 'bg-slate-100 text-slate-800 border-slate-300',
  na: 'bg-canvas-sunken text-ink-mute border-border',
};

function isPaidStatus(s: RentMonthStatus) {
  return s === 'paid';
}

function isUnpaidStatus(s: RentMonthStatus) {
  return s === 'unpaid' || s === 'partial' || s === 'no_charge';
}

function MonthChip({ m }: { m: RentCalendarMonth }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium',
        CHIP[m.status],
      )}
    >
      {formatMonthLabelAr(m.month)}
      {m.status === 'partial' && (
        <span className="text-[10px] opacity-80">
          ({formatMoney(m.paid, 'LYD')})
        </span>
      )}
    </span>
  );
}

export function TenantRentYearOverview({
  tenantId,
  monthlyRent = 0,
  year = currentYear(),
  className,
}: {
  tenantId: string;
  monthlyRent?: number;
  year?: number;
  className?: string;
}) {
  const { data: allCharges = [], isLoading: chargesLoading } = useTenantCharges();
  const {
    data: rpcData,
    isLoading: rpcLoading,
    isError: rpcError,
  } = useTenantRentCalendar(tenantId, year);

  const calendar = useMemo(() => {
    const fromRpc = rpcData
      ? normalizeRpcRentCalendar(rpcData, tenantId, year) ?? rpcData
      : null;
    if (fromRpc && fromRpc.months.length > 0) {
      return fromRpc;
    }
    return buildRentCalendarFromCharges(
      tenantId,
      year,
      monthlyRent,
      allCharges,
    );
  }, [rpcData, tenantId, year, monthlyRent, allCharges]);

  const isLoading = chargesLoading || (rpcLoading && !rpcError);

  const paidMonths = calendar.months.filter((m) => isPaidStatus(m.status));
  const unpaidMonths = calendar.months.filter((m) => isUnpaidStatus(m.status));
  const partialCount = calendar.months.filter((m) => m.status === 'partial').length;

  if (isLoading) {
    return (
      <Card className={cn('p-8 flex justify-center', className)}>
        <Loader2 className="h-7 w-7 animate-spin text-sage-600" />
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'overflow-hidden border-sage-200/80 shadow-sm',
        className,
      )}
    >
      <div className="bg-gradient-to-l from-sage-800 via-sage-700 to-sage-600 px-4 py-4 sm:px-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold sm:text-lg">
                إيجار {year} — الشهور المدفوعة والمستحقة
              </h2>
              <p className="text-[12px] text-white/85 mt-0.5">
                {monthlyRent > 0
                  ? `الإيجار الشهري ${formatMoney(monthlyRent, 'LYD')}`
                  : 'حدّد الإيجار الشهري في بيانات المستأجر'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[12px]">
            <span className="rounded-full bg-emerald-500/90 px-3 py-1 font-semibold">
              مدفوع {paidMonths.length}
            </span>
            <span className="rounded-full bg-red-500/90 px-3 py-1 font-semibold">
              غير مدفوع {unpaidMonths.length}
            </span>
            {partialCount > 0 && (
              <span className="rounded-full bg-amber-500/90 px-3 py-1 font-semibold">
                جزئي {partialCount}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        <div className="rounded-xl border-2 border-emerald-200/80 bg-gradient-to-b from-emerald-50/90 to-white p-4 min-h-[7rem]">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0" />
            <h3 className="font-bold text-emerald-900 text-sm">
              الشهور المدفوعة ({paidMonths.length})
            </h3>
          </div>
          {paidMonths.length === 0 ? (
            <p className="text-sm text-ink-mute">لا توجد شهور مسدّدة بالكامل بعد</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {paidMonths.map((m) => (
                <MonthChip key={m.month} m={m} />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border-2 border-red-200/80 bg-gradient-to-b from-red-50/80 to-white p-4 min-h-[7rem]">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-5 w-5 text-red-700 shrink-0" />
            <h3 className="font-bold text-red-900 text-sm">
              الشهور غير المدفوعة / المستحقة ({unpaidMonths.length})
            </h3>
          </div>
          {unpaidMonths.length === 0 ? (
            <p className="text-sm text-emerald-800 font-medium">
              ممتاز — كل شهور السنة مسدّدة أو بلا مطالبة
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {unpaidMonths.map((m) => (
                <MonthChip key={m.month} m={m} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-canvas-sunken/40 px-4 pb-4 pt-3 sm:px-5">
        <p className="text-[11px] font-medium text-ink-mute mb-2.5">
          نظرة سريعة — كل شهر
        </p>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-12">
          {calendar.months.map((m) => {
            const short = formatMonthLabelAr(m.month).split(' ')[0];
            return (
              <div
                key={m.month}
                title={`${formatMonthLabelAr(m.month)} — ${RENT_MONTH_STATUS_LABEL[m.status]}`}
                className={cn(
                  'rounded-lg px-1 py-2 text-center text-[10px] sm:text-[11px] font-semibold leading-tight',
                  CELL[m.status],
                )}
              >
                <div>{short}</div>
                <div className="text-[8px] sm:text-[9px] font-normal opacity-95 mt-0.5">
                  {RENT_MONTH_STATUS_LABEL[m.status]}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-ink-mute">
          {(['paid', 'partial', 'unpaid', 'no_charge'] as const).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={cn('h-2.5 w-2.5 rounded-sm', CELL[s])} />
              {RENT_MONTH_STATUS_LABEL[s]}
            </span>
          ))}
        </div>
        {rpcError && paidMonths.length + unpaidMonths.length > 0 && (
          <p className="mt-2 text-[10px] text-amber-800">
            يُعرض من المطالبات المحلية — لتفعيل التقويم الكامل طبّق هجرة 022 على Supabase
          </p>
        )}
      </div>
    </Card>
  );
}
