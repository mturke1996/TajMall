'use client';

import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  AlertCircle,
  Link2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useTenantChargesForTenant } from '@/lib/db/mall-queries';
import { useTenantRentExemptMonths } from '@/lib/db/rent-queries';
import { buildMergedTenantRentCalendar } from '@/lib/rent-calendar-from-charges';
import { isCalendarMonthOutstanding } from '@/lib/rent-exempt-months';
import { deriveTenantRentYears } from '@/lib/rent-calendar-years';
import { SetRentMonthStatusDialog } from '@/components/tenants/set-rent-month-status-dialog';
import { SetRentExemptMonthsDialog } from '@/components/tenants/set-rent-exempt-months-dialog';
import { usePermission } from '@/lib/supabase/use-permission';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import { RentMonthLabel } from '@/components/rent/rent-month-label';
import {
  currentYear,
  formatMonthLabelAr,
  formatRentMonthPartialProgress,
  RENT_MONTH_CELL_FRAME,
  RENT_MONTH_STATUS_CLASS,
  RENT_MONTH_STATUS_LABEL,
  type RentCalendarMonth,
} from '@/lib/rent-months';
import { cn, formatMoney } from '@/lib/utils';

function monthPartialHint(m: RentCalendarMonth): string | null {
  if (m.status !== 'partial' || m.amount <= 0) return null;
  return formatRentMonthPartialProgress(m.paid, m.amount);
}

function MonthChip({ m }: { m: RentCalendarMonth }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1',
        RENT_MONTH_STATUS_CLASS[m.status],
      )}
    >
      <RentMonthLabel
        monthKey={m.month}
        status={m.status}
        journalNumber={m.status === 'paid' ? m.journal_number : null}
        partialProgress={monthPartialHint(m)}
        layout="inline"
      />
    </span>
  );
}

function YearSection({
  year,
  months,
  monthlyRent,
}: {
  year: number;
  months: RentCalendarMonth[];
  monthlyRent: number;
}) {
  const paidMonths = months.filter((m) => m.status === 'paid');
  const exemptMonths = months.filter((m) => m.status === 'exempt');
  const unpaidMonths = months.filter(isCalendarMonthOutstanding);

  return (
    <div className="border-t border-border first:border-t-0">
      <div className="bg-sage-50/80 px-4 py-3 sm:px-5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-sage-900 text-sm sm:text-base">
          إيجار {year}
        </h3>
        <div className="flex gap-2 text-[11px]">
          <span className="rounded-full bg-emerald-600/90 text-white px-2.5 py-0.5 font-semibold">
            مدفوع {paidMonths.length}
          </span>
          {exemptMonths.length > 0 && (
            <span className="rounded-full bg-slate-500/90 text-white px-2.5 py-0.5 font-semibold">
              بدون مطالبة {exemptMonths.length}
            </span>
          )}
          <span className="rounded-full bg-red-600/90 text-white px-2.5 py-0.5 font-semibold">
            مستحق {unpaidMonths.length}
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
        <div className="rounded-xl border-2 border-emerald-200/80 bg-gradient-to-b from-emerald-50/90 to-white p-4 min-h-[6rem]">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            <h4 className="font-bold text-emerald-900 text-sm">
              الشهور المدفوعة ({paidMonths.length})
            </h4>
          </div>
          {paidMonths.length === 0 ? (
            <p className="text-sm text-ink-mute">لا شهور مسدّدة بعد</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {paidMonths.map((m) => (
                <MonthChip key={m.month} m={m} />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border-2 border-red-200/80 bg-gradient-to-b from-red-50/80 to-white p-4 min-h-[6rem]">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-red-700" />
            <h4 className="font-bold text-red-900 text-sm">
              مستحق ({unpaidMonths.length})
            </h4>
          </div>
          {unpaidMonths.length === 0 ? (
            <p className="text-sm text-emerald-800 font-medium">لا مستحقات</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {unpaidMonths.map((m) => (
                <MonthChip key={m.month} m={m} />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-gradient-to-b from-slate-50/90 to-white p-4 min-h-[6rem] sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <CalendarOff className="h-4 w-4 text-slate-600" />
            <h4 className="font-bold text-slate-800 text-sm">
              بدون مطالبة ({exemptMonths.length})
            </h4>
          </div>
          {exemptMonths.length === 0 ? (
            <p className="text-sm text-ink-mute">لا أشهر معفاة</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {exemptMonths.map((m) => (
                <MonthChip key={m.month} m={m} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-canvas-sunken/40 px-4 pb-4 pt-3 sm:px-5">
        <p className="text-[11px] font-medium text-ink-mute mb-2">
          نظرة سريعة — {year}
          {monthlyRent > 0 && (
            <span className="ms-1">
              · شهرياً {formatMoney(monthlyRent, 'LYD')}
            </span>
          )}
        </p>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-12">
          {months.map((m) => (
            <div
              key={m.month}
              title={`${formatMonthLabelAr(m.month)} — ${RENT_MONTH_STATUS_LABEL[m.status]}`}
              className={cn(
                'rounded-lg px-1 py-2 text-center',
                RENT_MONTH_CELL_FRAME[m.status],
              )}
            >
              <RentMonthLabel
                monthKey={m.month}
                status={m.status}
                statusLabel={RENT_MONTH_STATUS_LABEL[m.status]}
                journalNumber={m.status === 'paid' ? m.journal_number : null}
                partialProgress={monthPartialHint(m)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TenantRentCalendarPanel({
  tenantId,
  tenantName,
  monthlyRent = 0,
  journalEntries = [],
  journalsLoading = false,
  contractStartYear,
  claimStart,
  className,
}: {
  tenantId: string;
  tenantName: string;
  monthlyRent?: number;
  journalEntries?: JournalEntryRow[];
  journalsLoading?: boolean;
  contractStartYear?: number | null;
  claimStart?: string | null;
  className?: string;
}) {
  const { canWrite } = usePermission();
  const { data: charges = [], isLoading } = useTenantChargesForTenant(tenantId);
  const { data: exemptRows = [] } = useTenantRentExemptMonths(tenantId);
  const [statusOpen, setStatusOpen] = useState(false);
  const [exemptOpen, setExemptOpen] = useState(false);

  const manualExemptMonths = useMemo(
    () => exemptRows.map((r) => r.month_key),
    [exemptRows],
  );

  const resolvedClaimStart = claimStart ?? null;

  const exemptOptions = useMemo(
    () => ({
      claimStart: resolvedClaimStart,
      manualExemptMonths,
    }),
    [resolvedClaimStart, manualExemptMonths],
  );

  const years = useMemo(
    () => deriveTenantRentYears(charges, contractStartYear),
    [charges, contractStartYear],
  );

  const calendarsByYear = useMemo(() => {
    return years.map((year) =>
      buildMergedTenantRentCalendar({
        tenantId,
        year,
        monthlyRent,
        charges,
        exemptOptions,
      }),
    );
  }, [years, tenantId, monthlyRent, charges, exemptOptions]);

  if (isLoading) {
    return (
      <Card className={cn('p-8 flex justify-center', className)}>
        <Loader2 className="h-7 w-7 animate-spin text-sage-600" />
      </Card>
    );
  }

  return (
    <>
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
                <h2 className="text-base font-bold sm:text-lg">تقويم الإيجار</h2>
                <p className="text-[12px] text-white/85 mt-0.5">
                  {tenantName}
                  {monthlyRent > 0 &&
                    ` · ${formatMoney(monthlyRent, 'LYD')} شهرياً`}
                </p>
              </div>
            </div>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-9 gap-1.5 bg-white/15 text-white border-white/30 hover:bg-white/25 touch-manipulation"
                  onClick={() => setExemptOpen(true)}
                >
                  <CalendarOff className="h-4 w-4 shrink-0" />
                  بدون مطالبة
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-9 gap-1.5 bg-white text-sage-900 border-0 hover:bg-white/90 touch-manipulation font-semibold"
                  onClick={() => setStatusOpen(true)}
                >
                  <Link2 className="h-4 w-4 shrink-0" />
                  ربط شهر / شهرين
                </Button>
              </div>
            )}
          </div>
        </div>

        {calendarsByYear.length === 0 ? (
          <p className="text-sm text-ink-mute py-8 text-center px-4">
            لا توجد سنوات — حدّد الإيجار الشهري أو أنشئ عقداً
          </p>
        ) : (
          calendarsByYear.map((cal) => (
            <YearSection
              key={cal.year}
              year={cal.year}
              months={cal.months}
              monthlyRent={monthlyRent}
            />
          ))
        )}
      </Card>

      {canWrite && (
        <>
          <SetRentExemptMonthsDialog
            tenantId={tenantId}
            tenantName={tenantName}
            monthlyRent={monthlyRent}
            years={years.length > 0 ? years : [currentYear()]}
            charges={charges}
            claimStart={resolvedClaimStart}
            manualExemptMonths={manualExemptMonths}
            open={exemptOpen}
            onOpenChange={setExemptOpen}
          />
          <SetRentMonthStatusDialog
            tenantId={tenantId}
            tenantName={tenantName}
            monthlyRent={monthlyRent}
            years={years.length > 0 ? years : [currentYear()]}
            charges={charges}
            journalEntries={journalEntries}
            journalsLoading={journalsLoading}
            claimStart={resolvedClaimStart}
            manualExemptMonths={manualExemptMonths}
            open={statusOpen}
            onOpenChange={setStatusOpen}
          />
        </>
      )}
    </>
  );
}
