'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { ElementType } from 'react';
import {
  Building2,
  TrendingUp,
  CalendarRange,
  ChevronLeft,
  Percent,
  Info,
} from 'lucide-react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import { motion, type Variants } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatMoney } from '@/lib/utils';
import { useTenantRentSummary } from '@/lib/db/queries';
import { useMallRentChargesForYear } from '@/lib/db/mall-rent-dashboard-queries';
import {
  buildMallRentDashboardModel,
  getMallRentDashboardYear,
  type PeriodRentKpis,
} from '@/lib/mall-rent-collection-series';
import {
  aggregateMallRentKpis,
  theoreticalYtdRentFromTenants,
} from '@/lib/mall-rent-kpis';

function RentTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string; dataKey?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card shadow-lift px-3 py-2 text-sm">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="tabular-nums">
          {p.name}:{' '}
          {p.name.includes('%') ||
          p.name.includes('معدل') ||
          p.dataKey === 'rate'
            ? `${Number(p.value).toFixed(1)}%`
            : formatMoney(p.value, 'LYD', { compact: true })}
        </p>
      ))}
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'emerald' | 'rose' | 'blue' | 'amber';
}) {
  const ring = {
    emerald:
      'border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-800/50 dark:bg-emerald-950/20',
    rose: 'border-rose-200/70 bg-rose-50/40 dark:border-rose-800/50 dark:bg-rose-950/20',
    blue: 'border-blue-200/70 bg-blue-50/40 dark:border-blue-800/50 dark:bg-blue-950/20',
    amber:
      'border-amber-200/70 bg-amber-50/40 dark:border-amber-800/50 dark:bg-amber-950/20',
  }[accent ?? 'blue'];

  return (
    <div className={cn('rounded-xl border p-3 md:p-4', ring)}>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="text-lg md:text-xl font-bold tabular-nums tracking-tight mt-1">
        {value}
      </p>
      {sub && (
        <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{sub}</p>
      )}
    </div>
  );
}

function periodChargeHint(kpis: PeriodRentKpis): string {
  return `${kpis.chargeCount} مطالبة · ${kpis.monthsWithCharges} شهر فيها تحصيل`;
}

function PeriodBlock({
  title,
  icon: Icon,
  kpis,
  monthHint,
  theoreticalRent,
}: {
  title: string;
  icon: ElementType;
  kpis: PeriodRentKpis;
  monthHint: string;
  theoreticalRent?: number;
}) {
  const gap =
    theoreticalRent != null &&
    theoreticalRent > kpis.billed + 1 &&
    theoreticalRent > 0;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Icon className="h-4 w-4 text-sage-600 shrink-0" />
        <h4 className="text-xs font-semibold text-foreground">{title}</h4>
        <span className="text-[10px] text-muted-foreground">{monthHint}</span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        المبالغ من <strong className="font-medium text-foreground">مطالبات الإيجار</strong>{' '}
        المسجّلة (عقد + شهر)، وليست إيجار شهر واحد × عدد المحلات.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <KpiTile
          label="مجموع المطالبات"
          value={formatMoney(kpis.billed, 'LYD', { compact: true })}
          sub={periodChargeHint(kpis)}
          accent="blue"
        />
        <KpiTile
          label="المسدّد"
          value={formatMoney(kpis.collected, 'LYD', { compact: true })}
          sub="ما دُفع على هذه المطالبات"
          accent="emerald"
        />
        <KpiTile
          label="المتبقي"
          value={formatMoney(kpis.outstanding, 'LYD', { compact: true })}
          sub="مطالبات غير مكتملة السداد"
          accent="rose"
        />
        <KpiTile
          label="معدل التحصيل"
          value={`${kpis.rate.toFixed(1)}%`}
          sub="مسدّد ÷ مجموع المطالبات"
          accent="amber"
        />
      </div>
      {gap && (
        <p className="text-[10px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 px-2.5 py-2">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            تقدير العقود لهذه الفترة ≈{' '}
            {formatMoney(theoreticalRent!, 'LYD', { compact: true })} — قد تحتاج
            توليد مطالبات لشهور لم تُسجَّل بعد.
          </span>
        </p>
      )}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${Math.min(100, kpis.rate)}%` }}
        />
      </div>
    </div>
  );
}

export function MallRentCollectionSection({
  itemVariants,
}: {
  itemVariants?: Variants;
}) {
  const year = getMallRentDashboardYear();
  const { data: charges = [], isLoading: chargesLoading } =
    useMallRentChargesForYear(year);
  const { data: tenants = [], isLoading: tenantsLoading } = useTenantRentSummary();

  const model = useMemo(
    () => buildMallRentDashboardModel(charges, year),
    [charges, year],
  );
  const lifetime = useMemo(() => aggregateMallRentKpis(tenants), [tenants]);

  const yearTheoretical = useMemo(
    () => theoreticalYtdRentFromTenants(tenants, model.yearKpis.ytdMonthCount),
    [tenants, model.yearKpis.ytdMonthCount],
  );
  const last6Theoretical = useMemo(
    () =>
      theoreticalYtdRentFromTenants(tenants, model.last6Kpis.ytdMonthCount),
    [tenants, model.last6Kpis.ytdMonthCount],
  );

  const barChartData = useMemo(
    () =>
      model.chartSeries.map((m) => ({
        month: m.label,
        مسدّد: m.collected,
        متبقي: m.outstanding,
        'معدل %': Math.round(m.rate * 10) / 10,
      })),
    [model.chartSeries],
  );

  const rateCurveData = useMemo(
    () =>
      model.last6Keys.map((key) => {
        const bucket = model.series.find((s) => s.monthKey === key);
        return {
          month: bucket?.label ?? key,
          rate: bucket?.rate ?? 0,
          مسدّد: bucket?.collected ?? 0,
        };
      }),
    [model],
  );

  const loading = chargesLoading || tenantsLoading;
  const Wrapper = itemVariants ? motion.div : 'div';
  const wrapperProps = itemVariants ? { variants: itemVariants } : {};

  const ytdHint =
    model.ytdLabels.length > 0
      ? `من ${model.ytdLabels[0]} إلى ${model.ytdLabels[model.ytdLabels.length - 1]}`
      : `سنة ${year}`;

  return (
    <Wrapper {...wrapperProps} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Building2 className="h-4.5 w-4.5 text-sage-600" />
          مؤشرات الإيجار والتحصيل للمول — {year}
        </h3>
        <Link href="/mall?tab=tenants" prefetch>
          <Button variant="ghost" size="sm" className="gap-1 text-xs h-8">
            إدارة المستأجرين
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      <Card className="overflow-hidden border-sage-200/50 dark:border-sage-800/40">
        <CardHeader className="pb-3 border-b border-border/60 bg-gradient-to-l from-sage-50/80 to-transparent dark:from-sage-950/30">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-sage-600" />
                تحصيل إيجار {year}
              </CardTitle>
              <CardDescription>
                مطالبات RENT مجمّعة بشكل صحيح (عقد + شهر) — بدون مضاعفة التكرار
              </CardDescription>
            </div>
            {!loading && (
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100/80 dark:bg-blue-900/30 px-2.5 py-1 font-medium text-blue-800 dark:text-blue-300">
                  <Building2 className="h-3 w-3" />
                  {lifetime.totalTenants} مستأجر نشط
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 dark:bg-emerald-900/30 px-2.5 py-1 font-medium text-emerald-800 dark:text-emerald-300">
                  <TrendingUp className="h-3 w-3" />
                  {lifetime.currentMonthPaidCount} مكتمل الشهر الحالي
                </span>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-4 md:space-y-6 md:p-6">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          ) : (
            <>
              {model.duplicateCount > 0 && (
                <p className="text-xs text-amber-800 dark:text-amber-200 rounded-lg border border-amber-200/80 bg-amber-50/90 dark:bg-amber-950/40 px-3 py-2">
                  تم تجاهل {model.duplicateCount} مطالبة مكررة (نفس العقد والشهر)
                  عند الحساب — كان المجموع الخام {model.rawChargeCount} سجلّاً.
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 md:gap-6">
                <PeriodBlock
                  title={`من بداية ${year} حتى اليوم`}
                  icon={CalendarRange}
                  kpis={model.yearKpis}
                  monthHint={ytdHint}
                  theoreticalRent={yearTheoretical}
                />
                <PeriodBlock
                  title="آخر 6 أشهر"
                  icon={Percent}
                  kpis={model.last6Kpis}
                  monthHint={model.last6Labels.join(' · ')}
                  theoreticalRent={last6Theoretical}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 md:gap-6">
                <div className="xl:col-span-2 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    التحصيل الشهري — مسدّد ومتبقي ({year})
                  </p>
                  {barChartData.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      لا توجد مطالبات إيجار لسنة {year} — ولّد المطالبات من المول
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <ComposedChart
                        data={barChartData}
                        margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                        barGap={2}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="hsl(var(--border))"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="month"
                          tick={{
                            fontSize: 10,
                            fill: 'hsl(var(--muted-foreground))',
                          }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          yAxisId="amount"
                          tick={{
                            fontSize: 10,
                            fill: 'hsl(var(--muted-foreground))',
                          }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) =>
                            v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                          }
                        />
                        <YAxis yAxisId="rate" orientation="right" domain={[0, 100]} />
                        <Tooltip content={<RentTooltip />} />
                        <Legend
                          iconType="circle"
                          iconSize={8}
                          wrapperStyle={{ fontSize: '11px' }}
                        />
                        <Bar
                          yAxisId="amount"
                          dataKey="مسدّد"
                          stackId="rent"
                          fill="#10b981"
                          maxBarSize={28}
                        />
                        <Bar
                          yAxisId="amount"
                          dataKey="متبقي"
                          stackId="rent"
                          fill="#fda4af"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={28}
                        />
                        <Line
                          yAxisId="rate"
                          type="monotone"
                          dataKey="معدل %"
                          stroke="#2563eb"
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: '#2563eb' }}
                          name="معدل التحصيل %"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    منحنى معدل التحصيل — آخر 6 أشهر
                  </p>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart
                      data={rateCurveData}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="rentRateFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="month"
                        tick={{
                          fontSize: 10,
                          fill: 'hsl(var(--muted-foreground))',
                        }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{
                          fontSize: 10,
                          fill: 'hsl(var(--muted-foreground))',
                        }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip content={<RentTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="rate"
                        name="معدل التحصيل %"
                        stroke="#059669"
                        strokeWidth={2}
                        fill="url(#rentRateFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border/60">
                <KpiTile
                  label={`تحصيل ${year} (منقضي)`}
                  value={formatMoney(model.yearKpis.collected, 'LYD', {
                    compact: true,
                  })}
                  sub={`من ${formatMoney(model.yearKpis.billed, 'LYD', { compact: true })} مطالبات`}
                  accent="emerald"
                />
                <KpiTile
                  label={`معدل ${year}`}
                  value={`${model.yearKpis.rate.toFixed(1)}%`}
                  sub={`متبقي ${formatMoney(model.yearKpis.outstanding, 'LYD', { compact: true })}`}
                  accent="amber"
                />
                <KpiTile
                  label="مستحقات مفتوحة (كل السنوات)"
                  value={formatMoney(lifetime.outstandingRent, 'LYD', {
                    compact: true,
                  })}
                  sub={
                    lifetime.openChargesCount > 0
                      ? `${lifetime.openChargesCount} مطالبة — قد تشمل سنوات سابقة`
                      : 'لا مطالبات مفتوحة'
                  }
                  accent="rose"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </Wrapper>
  );
}
