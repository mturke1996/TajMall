'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { arabicCount, cn, formatDate, formatMoney, todayISODate } from '@/lib/utils';
import { useTenantRentSummary } from '@/lib/db/queries';
import { aggregateMallRentKpis } from '@/lib/mall-rent-kpis';
import { useLeaseContracts, useMallUnits, useTenantCharges } from '@/lib/db/mall-queries';
import { buildContractExpiry } from '@/lib/contract-expiry';
import { buildMallOccupancy } from '@/lib/mall-occupancy';
import { currentMonthNameAr } from '@/lib/rent-months';
import type { MallTab } from '@/lib/mall/routes';
import { mallTabHref, peopleSegmentHref } from '@/lib/mall/routes';

/** A sentence about `n` things that agrees in number: one, two (dual) and three or more. */
function agree(n: number, forms: { one: string; two: string; many: (count: number) => string }) {
  return n === 1 ? forms.one : n === 2 ? forms.two : forms.many(n);
}
const count = (n: number, noun: [string, string]) => (n <= 10 ? `${n} ${noun[0]}` : `${n} ${noun[1]}`);

/**
 * The mall at a glance: how rent stands this month, what needs following up (unfinished rent, open
 * charges, leases ending soon) and who still owes this month.
 */
export function MallOverviewPanel({ onNavigate }: { onNavigate: (tab: MallTab) => void }) {
  const { data: contracts = [], isSuccess: contractsLoaded } = useLeaseContracts();
  const { data: units = [], isSuccess: unitsLoaded } = useMallUnits();
  const { data: charges = [] } = useTenantCharges();
  const { data: tenants = [] } = useTenantRentSummary();

  const activeContracts = contracts.filter((c) => c.status === 'ACTIVE');
  const rentKpis = aggregateMallRentKpis(tenants);
  const monthName = currentMonthNameAr();

  const owingThisMonth = useMemo(
    () =>
      tenants
        .filter((t) => t.current_month_status === 'unpaid' || t.current_month_status === 'paid_partial')
        .map((t) => {
          const amount = Number(t.current_month_amount) || Number(t.monthly_rent) || 0;
          const paid = Number(t.current_month_paid) || 0;
          return { ...t, amount, paid, remaining: Math.max(amount - paid, 0) };
        })
        .sort((a, b) => b.remaining - a.remaining),
    [tenants],
  );

  const openCharges = charges.filter((c) => c.status !== 'PAID' && Number(c.amount) > Number(c.total_paid));
  const openChargesTotal = openCharges.reduce((s, c) => s + (Number(c.amount) - Number(c.total_paid)), 0);

  // the day the page opened: stable across re-renders
  const [today] = useState(() => todayISODate());
  const expiry = useMemo(() => buildContractExpiry({ contracts, today }), [contracts, today]);
  const occupancy = useMemo(() => buildMallOccupancy({ units, contracts, today }), [units, contracts, today]);
  // only once both lists are in: with one missing every unit would read as vacant
  const occupancyReady = contractsLoaded && unitsLoaded && units.length > 0;
  const endingSoon = expiry.items.filter((i) => !i.pastEnd && i.daysLeft <= 60);

  const followUps: { label: string; detail: string; tab: MallTab }[] = [];
  if (owingThisMonth.length > 0)
    followUps.push({
      label: `${arabicCount(owingThisMonth.length, ['مستأجر واحد', 'مستأجران', 'مستأجرين', 'مستأجراً'])} لم ${owingThisMonth.length === 1 ? 'يكمل' : 'يكملوا'} إيجار ${monthName}`,
      detail: `متبقٍ ${formatMoney(owingThisMonth.reduce((s, t) => s + t.remaining, 0), 'LYD')}`,
      tab: 'tenants',
    });
  if (openCharges.length > 0)
    followUps.push({
      label: `${arabicCount(openCharges.length, ['مطالبة واحدة', 'مطالبتان', 'مطالبات', 'مطالبة'])} لم ${openCharges.length === 1 ? 'تُسدَّد' : 'تُسدَّد'} بالكامل`,
      detail: `متبقٍ ${formatMoney(openChargesTotal, 'LYD')}`,
      tab: 'charges',
    });
  if (expiry.counts.expired > 0)
    followUps.push({
      label: agree(expiry.counts.expired, {
        one: 'عقد واحد انتهى تاريخه وما زال نشطاً',
        two: 'عقدان انتهى تاريخهما وما زالا نشطين',
        many: (n) => `${count(n, ['عقود', 'عقداً'])} انتهى تاريخها وما زالت نشطة`,
      }),
      detail: 'جدّده أو أنهِه',
      tab: 'contracts',
    });
  if (endingSoon.length > 0)
    followUps.push({
      label: agree(endingSoon.length, {
        one: 'عقد واحد ينتهي خلال 60 يوماً',
        two: 'عقدان ينتهيان خلال 60 يوماً',
        many: (n) => `${count(n, ['عقود', 'عقداً'])} تنتهي خلال 60 يوماً`,
      }),
      detail: `أقربها ${formatDate(endingSoon[0].endDate)}`,
      tab: 'contracts',
    });
  if (occupancyReady && occupancy.flagged.length > 0)
    followUps.push({
      label: agree(occupancy.flagged.length, {
        one: 'محل واحد حالته لا تطابق عقوده',
        two: 'محلان حالتهما لا تطابق عقودهما',
        many: (n) => `${count(n, ['محلات', 'محلاً'])} حالتها لا تطابق عقودها`,
      }),
      detail: 'صحّحها من المحلات',
      tab: 'units',
    });
  if (occupancyReady && occupancy.longVacant.length > 0)
    followUps.push({
      label: agree(occupancy.longVacant.length, {
        one: 'محل واحد شاغر منذ ثلاثة أشهر أو أكثر',
        two: 'محلان شاغران منذ ثلاثة أشهر أو أكثر',
        many: (n) => `${count(n, ['محلات', 'محلاً'])} شاغرة منذ ثلاثة أشهر أو أكثر`,
      }),
      detail: `أطولها ${arabicCount(occupancy.longVacant[0].vacantDays ?? 0, ['يوم واحد', 'يومان', 'أيام', 'يوماً'])}`,
      tab: 'units',
    });

  return (
    <div className="flex flex-col gap-5">
      <Card className="overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-5">
          <div className="bg-card p-4">
            <p className="text-[12.5px] text-ink-mute">المستأجرون</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums">{tenants.length}</p>
            <p className="mt-0.5 text-[12px] text-ink-mute">{activeContracts.length} عقد نشط</p>
          </div>
          <div className="bg-card p-4">
            <p className="text-[12.5px] text-ink-mute">إشغال المحلات</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums">
              {occupancyReady ? `${occupancy.totals.rate.toLocaleString('en-US', { maximumFractionDigits: 1 })}%` : '—'}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-mute tabular-nums">
              {occupancyReady ? `${occupancy.totals.rented} مؤجر · ${occupancy.totals.vacant} شاغر` : 'جارٍ التحميل'}
            </p>
          </div>
          <div className="bg-card p-4">
            <p className="text-[12.5px] text-ink-mute">إيجار {monthName}</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums">
              {rentKpis.currentMonthPaidCount}
              <span className="text-[13px] font-normal text-ink-mute"> من {rentKpis.currentMonthDueCount} مكتمل</span>
            </p>
          </div>
          <div className="bg-card p-4">
            <p className="text-[12.5px] text-ink-mute">نسبة التحصيل</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums">{rentKpis.collectionRate.toFixed(1)}%</p>
            <p className="mt-0.5 text-[12px] text-ink-mute tabular-nums">
              {formatMoney(rentKpis.collectedRent, 'LYD')} من {formatMoney(rentKpis.expectedRent, 'LYD')}
            </p>
          </div>
          <div className="col-span-2 bg-card p-4 md:col-span-1">
            <p className="text-[12.5px] text-ink-mute">مستحقات مفتوحة</p>
            <p className={cn('mt-1 text-[20px] font-semibold tabular-nums', rentKpis.outstandingRent > 0 && 'text-danger-ink')}>
              {formatMoney(rentKpis.outstandingRent, 'LYD')}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-mute">كل السنوات</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="flex flex-col gap-2 lg:col-span-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <h2 className="text-[15px] font-semibold">يحتاج متابعة</h2>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="h-8 gap-1 text-[12.5px]" asChild>
                <Link href={peopleSegmentHref('TENANT', { add: 'TENANT' })}>
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  مستأجر
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1 text-[12.5px]" asChild>
                <Link href={mallTabHref('contracts')}>
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  عقد
                </Link>
              </Button>
            </div>
          </div>
          {followUps.length === 0 ? (
            <Card className="px-4 py-8 text-center text-[13px] text-ink-mute">لا شيء يحتاج متابعة الآن.</Card>
          ) : (
            <ul className="surface divide-y divide-border overflow-hidden">
              {followUps.map((f) => (
                <li key={f.label}>
                  <button
                    type="button"
                    onClick={() => onNavigate(f.tab)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-start touch-manipulation hover:bg-canvas-sunken/60"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium text-foreground">{f.label}</span>
                      <span className="block text-[12px] text-ink-mute tabular-nums">{f.detail}</span>
                    </span>
                    <ChevronLeft className="h-4 w-4 shrink-0 text-ink-mute" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2 lg:col-span-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <h2 className="text-[15px] font-semibold">لم يكملوا إيجار {monthName}</h2>
            <button
              type="button"
              onClick={() => onNavigate('tenants')}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12.5px] text-ink-mute hover:text-foreground"
            >
              كل المستأجرين
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {owingThisMonth.length === 0 ? (
            <Card className="px-4 py-8 text-center text-[13px] text-ink-mute">كل المستأجرين أكملوا إيجار {monthName}.</Card>
          ) : (
            <ul className="surface divide-y divide-border overflow-hidden">
              {owingThisMonth.slice(0, 8).map((t) => (
                <li key={t.id}>
                  <Link href={`/contacts/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas-sunken/60">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-foreground">{t.name}</span>
                      <span className="block text-[12px] text-ink-mute">
                        محل {t.shop_number || '—'} · {t.current_month_status === 'paid_partial' ? `مسدّد ${formatMoney(t.paid, 'LYD')}` : 'لم يُسدَّد شيء'}
                      </span>
                    </span>
                    <span className="shrink-0 text-end">
                      <span className="block text-[13.5px] font-semibold tabular-nums text-danger-ink">{formatMoney(t.remaining, 'LYD')}</span>
                      <span className="block text-[12px] text-ink-mute tabular-nums">من {formatMoney(t.amount, 'LYD')}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
