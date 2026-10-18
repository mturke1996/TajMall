'use client';

import { useMemo, useState } from 'react';
import { Banknote, CalendarOff, ChevronDown, Info, Link2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SetRentMonthStatusDialog } from '@/components/tenants/set-rent-month-status-dialog';
import { SetRentExemptMonthsDialog } from '@/components/tenants/set-rent-exempt-months-dialog';
import { SetRentPriceScheduleDialog } from '@/components/tenants/set-rent-price-schedule-dialog';
import { RENT_ACCOUNT_KIND, RentAccountMonthCell } from '@/components/tenants/rent-account-month';
import { useTenantRentAccount } from '@/components/tenants/use-tenant-rent-account';
import { usePermission } from '@/lib/supabase/use-permission';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import {
  describeRentPrice,
  formatMonthRangesAr,
  type RentAccountMonthKind,
  type RentAccountYear,
} from '@/lib/tenant-rent-account';
import { currentMonthKey, currentYear } from '@/lib/rent-months';
import { cn, formatMoney } from '@/lib/utils';

const LEGEND_ORDER: RentAccountMonthKind[] = ['paid', 'partial', 'due', 'uncharged', 'upcoming', 'exempt', 'no_price'];
const COUNT_LABEL: Partial<Record<RentAccountMonthKind, string>> = {
  paid: 'مدفوع',
  partial: 'جزئي',
  due: 'غير مدفوع',
  uncharged: 'بلا مطالبة',
  upcoming: 'قادم',
};

function YearBlock({
  year,
  defaultOpen,
  onCollect,
}: {
  year: RentAccountYear;
  defaultOpen: boolean;
  onCollect?: (month: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const counts = (Object.keys(COUNT_LABEL) as RentAccountMonthKind[])
    .filter((k) => year.counts[k] > 0)
    .map((k) => `${COUNT_LABEL[k]} ${year.counts[k]}`)
    .join(' · ');
  const panelId = `rent-year-${year.year}`;

  return (
    <section className="border-t border-border first:border-t-0" aria-labelledby={`${panelId}-h`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-canvas-sunken/60 px-4 py-2.5 sm:px-5">
        <button
          type="button"
          className="-ms-1 flex min-h-9 items-center gap-1.5 rounded-md px-1 text-start touch-manipulation focus-visible:outline-2 focus-visible:outline-ring"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown className={cn('h-4 w-4 text-ink-mute transition-transform', !open && '-rotate-90 rtl:rotate-90')} aria-hidden />
          <h3 id={`${panelId}-h`} className="text-[15px] font-semibold tabular-nums text-foreground">
            {year.year}
          </h3>
          {counts && <span className="text-[12px] text-ink-mute">{counts}</span>}
        </button>
        <p className="text-[12.5px] text-ink-mute">
          المحصّل <span className="font-semibold tabular-nums text-foreground">{formatMoney(year.collected, 'LYD')}</span>
          {year.owedNow > 0 && (
            <>
              {' · '}المتبقي حتى الآن{' '}
              <span className="font-semibold tabular-nums text-danger-ink">{formatMoney(year.owedNow, 'LYD')}</span>
            </>
          )}
        </p>
      </div>
      {open && (
        <ol id={panelId} className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4 sm:p-4 md:grid-cols-6">
          {year.months.map((m) => (
            <li key={m.month} className="flex">
              <RentAccountMonthCell m={m} onCollect={onCollect} />
            </li>
          ))}
        </ol>
      )}
    </section>
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
  onCollect,
  className,
}: {
  tenantId: string;
  tenantName: string;
  monthlyRent?: number;
  journalEntries?: JournalEntryRow[];
  journalsLoading?: boolean;
  contractStartYear?: number | null;
  claimStart?: string | null;
  /** open rent collection with this month selected */
  onCollect?: (month: string) => void;
  className?: string;
}) {
  const { canWrite } = usePermission();
  const resolvedClaimStart = claimStart ?? null;
  const { account, charges, years, manualExemptMonths, priceBands, pricing, loading } = useTenantRentAccount({
    tenantId,
    contactRent: monthlyRent,
    claimStart: resolvedClaimStart,
    contractStartYear,
  });
  const [statusOpen, setStatusOpen] = useState(false);
  const [exemptOpen, setExemptOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);

  const price = useMemo(() => describeRentPrice(currentMonthKey(), pricing), [pricing]);
  const kindsShown = useMemo(() => {
    const present = new Set(account.years.flatMap((y) => y.months.map((m) => m.kind)));
    return LEGEND_ORDER.filter((k) => present.has(k));
  }, [account.years]);
  const dialogYears = years.length > 0 ? years : [currentYear()];

  if (loading) {
    return (
      <Card className={cn('flex justify-center p-8', className)}>
        <Loader2 className="h-7 w-7 animate-spin text-ink-soft" aria-label="جارٍ تحميل تقويم الإيجار" />
      </Card>
    );
  }

  const priceLine =
    price.amount > 0
      ? `الإيجار الحالي ${formatMoney(price.amount, 'LYD')} شهرياً${
          price.source === 'bands'
            ? ` · جدول أسعار (${priceBands.length} ${priceBands.length === 1 ? 'فترة' : 'فترات'})`
            : price.source === 'lease'
              ? ' · من عقد الإيجار'
              : ''
        }`
      : 'لم يُحدَّد إيجار شهري — أضفه من «أسعار الشهور» أو من ملف المستأجر';

  return (
    <>
      <Card className={cn('overflow-hidden', className)}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-foreground">تقويم الإيجار</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-mute">{priceLine}</p>
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5 touch-manipulation" onClick={() => setPriceOpen(true)}>
                <Banknote className="h-4 w-4" aria-hidden />
                أسعار الشهور
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5 touch-manipulation" onClick={() => setExemptOpen(true)}>
                <CalendarOff className="h-4 w-4" aria-hidden />
                أشهر بلا مطالبة
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5 touch-manipulation" onClick={() => setStatusOpen(true)}>
                <Link2 className="h-4 w-4" aria-hidden />
                ربط إيصال بشهر
              </Button>
            </div>
          )}
        </div>

        {kindsShown.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-2.5 text-[12px] text-ink-mute sm:px-5">
            {kindsShown.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={cn('h-3 w-3 rounded-[4px] border', RENT_ACCOUNT_KIND[k].swatch)} aria-hidden />
                {RENT_ACCOUNT_KIND[k].label}
              </span>
            ))}
            {onCollect && account.owingMonths.length > 0 && (
              <span className="basis-full text-[12px] sm:ms-auto sm:basis-auto">اضغط شهراً عليه متبقٍ لتحصيله.</span>
            )}
          </div>
        )}

        {account.unchargedMonths.length > 0 && (
          <div className="flex flex-col gap-2 border-b border-border bg-info-soft/50 px-4 py-3 text-[12.5px] text-info-ink sm:flex-row sm:items-start sm:justify-between sm:px-5">
            <p className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {account.unchargedMonths.length === 1
                  ? 'شهر بدأ دون مطالبة مسجّلة: '
                  : `أشهر بدأت دون مطالبة مسجّلة (${account.unchargedMonths.length}): `}
                {formatMonthRangesAr(account.unchargedMonths)}. تُحسب مستحقة بسعرها (
                <span className="tabular-nums">{formatMoney(account.owedUncharged, 'LYD')}</span>) وتُنشأ مطالبتها عند
                التحصيل. إن لم تكن مستحقة فاجعلها «بلا مطالبة».
              </span>
            </p>
            {canWrite && (
              <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 bg-card text-xs" onClick={() => setExemptOpen(true)}>
                مراجعة الأشهر
              </Button>
            )}
          </div>
        )}

        {account.years.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-mute">لا توجد سنوات — حدّد الإيجار الشهري أو أنشئ عقداً</p>
        ) : (
          account.years.map((y) => (
            <YearBlock
              key={y.year}
              year={y}
              defaultOpen={y.year >= currentYear() || y.owedNow > 0 || y.counts.partial > 0}
              onCollect={onCollect}
            />
          ))
        )}
      </Card>

      {canWrite && (
        <>
          <SetRentPriceScheduleDialog
            tenantId={tenantId}
            tenantName={tenantName}
            monthlyRent={monthlyRent}
            years={dialogYears}
            open={priceOpen}
            onOpenChange={setPriceOpen}
          />
          <SetRentExemptMonthsDialog
            tenantId={tenantId}
            tenantName={tenantName}
            monthlyRent={monthlyRent}
            years={dialogYears}
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
            years={dialogYears}
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
