'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Building2, ChevronLeft, Info } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { keepSeriesOrder } from '@/lib/chart-order';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatMoney } from '@/lib/utils';
import { usePersistedState } from '@/lib/hooks/use-persisted-state';
import { useTenantRentSummary } from '@/lib/db/queries';
import { useMallRentChargesForYear } from '@/lib/db/mall-rent-dashboard-queries';
import { buildMallRentDashboardModel, getMallRentDashboardYear } from '@/lib/mall-rent-collection-series';
import { aggregateMallRentKpis, theoreticalYtdRentFromTenants } from '@/lib/mall-rent-kpis';
import { currentMonthNameAr } from '@/lib/rent-months';
import { ACCENT_VAR, IconTile } from '@/components/dashboard/dashboard-ui';

type ChartRow = { month: string; مسدّد: number; متبقي: number; rate: number };

function RentTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: ChartRow }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div dir="rtl" className="rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] shadow-lift">
      <p className="mb-1 font-semibold">{label}</p>
      <p className="tabular-nums text-success-ink">مسدّد {formatMoney(row['مسدّد'], 'LYD')}</p>
      <p className="tabular-nums text-danger-ink">متبقٍ {formatMoney(row['متبقي'], 'LYD')}</p>
      <p className="tabular-nums text-ink-mute">معدل التحصيل {row.rate.toFixed(1)}%</p>
    </div>
  );
}

type Tone = 'info' | 'success' | 'danger' | 'warning' | 'neutral';
const FIGURE_TONE: Record<Tone, string> = {
  info: 'border-info-line bg-info-soft text-info-ink',
  success: 'border-success-line bg-success-soft text-success-ink',
  danger: 'border-danger-line bg-danger-soft text-danger-ink',
  warning: 'border-warning-line bg-warning-soft text-warning-ink',
  neutral: 'border-border bg-canvas-sunken text-foreground',
};

function Figure({ label, value, sub, tone, meter }: { label: string; value: string; sub?: string; tone: Tone; meter?: number }) {
  return (
    <div className={cn('rounded-xl border p-3.5', FIGURE_TONE[tone])}>
      <p className="text-[12.5px] font-medium opacity-90">{label}</p>
      <p className="mt-1 text-[18px] font-bold tabular-nums leading-tight sm:text-[20px]">{value}</p>
      {meter !== undefined && (
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
          <span className="block h-full rounded-full bg-current" style={{ width: `${Math.min(100, Math.max(0, meter))}%` }} />
        </span>
      )}
      {sub && <p className="mt-1 text-[12px] opacity-80">{sub}</p>}
    </div>
  );
}

/** Rent billed and collected this year (or the last six months), month by month, in exact amounts. */
export function MallRentCollectionSection() {
  const year = getMallRentDashboardYear();
  const [range, setRange] = usePersistedState<'ytd' | 'last6'>('dashboard:rent-range', 'ytd');
  const { data: charges = [], isLoading: chargesLoading } = useMallRentChargesForYear(year);
  const { data: tenants = [], isLoading: tenantsLoading } = useTenantRentSummary();

  const model = useMemo(() => buildMallRentDashboardModel(charges, year), [charges, year]);
  const lifetime = useMemo(() => aggregateMallRentKpis(tenants), [tenants]);
  const kpis = range === 'ytd' ? model.yearKpis : model.last6Kpis;
  const theoretical = useMemo(() => theoreticalYtdRentFromTenants(tenants, kpis.ytdMonthCount), [tenants, kpis.ytdMonthCount]);
  const gap = theoretical > kpis.billed + 1 && theoretical > 0;

  const chartData = useMemo<ChartRow[]>(() => {
    const keys = range === 'ytd' ? null : new Set(model.last6Keys);
    return model.chartSeries
      .filter((m) => !keys || keys.has(m.monthKey))
      .map((m) => ({ month: m.label, مسدّد: m.collected, متبقي: m.outstanding, rate: Math.round(m.rate * 10) / 10 }));
  }, [model, range]);

  const loading = chargesLoading || tenantsLoading;

  return (
    <section className="flex flex-col gap-2" aria-labelledby="dash-rent">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 id="dash-rent" className="flex items-center gap-2.5 text-[15px] font-semibold text-foreground">
          <IconTile icon={Building2} accent="violet" className="h-9 w-9 rounded-lg" />
          تحصيل الإيجار
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-canvas-sunken p-0.5" role="group" aria-label="فترة المؤشرات">
            {(
              [
                ['ytd', `${year} حتى الآن`],
                ['last6', 'آخر 6 أشهر'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={range === key}
                onClick={() => setRange(key)}
                className={cn(
                  'h-8 rounded-md px-3 text-[12.5px] font-medium transition-colors',
                  range === key ? 'bg-card text-foreground shadow-xs' : 'text-ink-mute hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Link
            href="/mall?tab=tenants"
            prefetch
            className="hidden items-center gap-1 rounded-md px-2 py-1.5 text-[12.5px] text-ink-mute hover:text-foreground sm:inline-flex"
          >
            المستأجرون
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-52 w-full" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
              <Figure label="المطالَب" value={formatMoney(kpis.billed, 'LYD')} sub={`${kpis.chargeCount} مطالبة`} tone="info" />
              <Figure label="المحصّل" value={formatMoney(kpis.collected, 'LYD')} tone="success" />
              <Figure label="المتبقي" value={formatMoney(kpis.outstanding, 'LYD')} tone={kpis.outstanding > 0 ? 'danger' : 'neutral'} />
              <Figure label="معدل التحصيل" value={`${kpis.rate.toFixed(1)}%`} tone="warning" meter={kpis.rate} />
              <div className="col-span-2 sm:col-span-1">
                <Figure
                  label="مستحق من كل السنوات"
                  value={formatMoney(lifetime.outstandingRent, 'LYD')}
                  sub={lifetime.openChargesCount > 0 ? `${lifetime.openChargesCount} مطالبة مفتوحة` : 'لا مطالبات مفتوحة'}
                  tone={lifetime.outstandingRent > 0 ? 'danger' : 'neutral'}
                />
              </div>
            </div>

            {(model.duplicateCount > 0 || gap) && (
              <div className="space-y-1.5 border-t border-border px-4 py-2.5 text-[12.5px] text-info-ink">
                {gap && (
                  <p className="flex items-start gap-1.5">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    إيجار العقود لهذه الفترة نحو {formatMoney(theoretical, 'LYD')}، والمطالبات المسجّلة أقل منه — قد تكون
                    هناك أشهر لم تُولَّد مطالبتها بعد.
                  </p>
                )}
                {model.duplicateCount > 0 && (
                  <p className="flex items-start gap-1.5">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    احتُسبت كل مطالبة مكررة (العقد نفسه والشهر نفسه) مرة واحدة: {model.duplicateCount} من{' '}
                    {model.rawChargeCount}.
                  </p>
                )}
              </div>
            )}

            <div className="border-t border-border p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-mute">
                <span>التحصيل الشهري</span>
                <span className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-chart-green" aria-hidden />
                    مسدّد
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-chart-red/35" aria-hidden />
                    متبقٍ
                  </span>
                </span>
              </div>
              {chartData.length === 0 ? (
                <p className="py-10 text-center text-[13px] text-ink-mute">لا توجد مطالبات إيجار لهذه الفترة.</p>
              ) : (
                <div
                  role="img"
                  aria-label={`التحصيل الشهري: ${chartData.map((r) => `${r.month} مسدّد ${formatMoney(r['مسدّد'], 'LYD')} ومتبقٍ ${formatMoney(r['متبقي'], 'LYD')}`).join('، ')}`}
                >
                  <div aria-hidden dir="ltr">
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                        <YAxis
                          width={52}
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)} ألف` : String(v))}
                        />
                        <Tooltip content={<RentTooltip />} itemSorter={keepSeriesOrder} cursor={{ fill: 'hsl(var(--muted))' }} />
                        <Bar dataKey="مسدّد" stackId="rent" fill={ACCENT_VAR.green} maxBarSize={32} />
                        <Bar dataKey="متبقي" stackId="rent" fill="hsl(var(--chart-red) / 0.35)" radius={[5, 5, 0, 0]} maxBarSize={32} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            <p className="border-t border-border px-4 py-2.5 text-[12.5px] text-ink-mute">
              أكمل إيجار {currentMonthNameAr()}:{' '}
              <span className="font-medium text-foreground tabular-nums">{lifetime.currentMonthPaidCount}</span> من{' '}
              <span className="tabular-nums">{lifetime.totalTenants}</span> مستأجر نشط.
            </p>
          </>
        )}
      </Card>
    </section>
  );
}
