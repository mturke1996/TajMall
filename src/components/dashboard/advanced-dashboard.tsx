'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import { keepSeriesOrder } from '@/lib/chart-order';
import { PageHeader } from '@/components/layout/page-header';
import { useDashboardStats, useMonthlySummary, useRecentTransactions, useCashboxBalances } from '@/lib/db/queries';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { monthNameAr } from '@/lib/rent-months';
import { DashboardNewFeatures } from '@/components/dashboard/dashboard-new-features';
import { MallRentCollectionSection } from '@/components/dashboard/mall-rent-collection-section';

const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** "2026-05" from the summary view becomes "مايو"; any other label is kept. */
const monthLabel = (label: string) => (/^\d{4}-\d{2}$/.test(label) ? monthNameAr(label) : label);

type MonthRow = { month: string; إيرادات: number; مصروفات: number };

function MonthTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: MonthRow }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] shadow-lift">
      <p className="mb-1 font-semibold">{label}</p>
      <p className="tabular-nums text-success-ink">إيرادات {formatMoney(row['إيرادات'], 'LYD')}</p>
      <p className="tabular-nums text-danger-ink">مصروفات {formatMoney(row['مصروفات'], 'LYD')}</p>
      <p className="tabular-nums text-ink-mute">الصافي {formatMoney(row['إيرادات'] - row['مصروفات'], 'LYD', { signed: true })}</p>
    </div>
  );
}

function SectionCard({
  title,
  link,
  children,
  className,
}: {
  title: string;
  link?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {link && (
          <Link
            href={link.href}
            prefetch
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12.5px] text-ink-mute hover:text-foreground"
          >
            {link.label}
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </div>
      <Card className="flex-1 overflow-hidden">{children}</Card>
    </section>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center text-[13px] text-ink-mute">{children}</p>;
}

/**
 * The owner's daily view: the year's money, rent collection, cash on hand, what was spent on what, and
 * the latest movements. Exact amounts throughout; colour only on figures that mean money in or out.
 */
export function AdvancedDashboard() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: monthlyData = [], isLoading: monthlyLoading } = useMonthlySummary();
  const { data: recentTransactions = [], isLoading: txLoading } = useRecentTransactions(8);
  const { data: cashboxes = [], isLoading: cashboxLoading } = useCashboxBalances();

  const s = stats ?? { totalRevenue: 0, totalExpense: 0, netProfit: 0, totalCashboxBalance: 0, topExpenseCategories: [] };
  const currentMonth = monthlyData[0];
  const now = new Date();
  const year = now.getFullYear();

  const barData = useMemo<MonthRow[]>(
    () =>
      [...monthlyData]
        .slice(0, 6)
        .reverse()
        .map((m) => ({ month: monthLabel(m.month_label), إيرادات: Number(m.revenue_total), مصروفات: Number(m.expense_total) })),
    [monthlyData],
  );

  const expenses = s.topExpenseCategories ?? [];
  const expenseTotal = expenses.reduce((sum, e) => sum + e.value, 0);
  const cashTotal = cashboxes.reduce((sum, b) => sum + Number(b.balance || 0), 0);

  return (
    <>
      <PageHeader title="لوحة التحكم" description={`${AR_DAYS[now.getDay()]} ${formatDate(now)}`} />

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-6 md:px-8 md:py-7">
        <Card className="overflow-hidden">
          <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
            {[
              {
                label: `إيرادات ${year}`,
                value: s.totalRevenue,
                sub: currentMonth ? `هذا الشهر ${formatMoney(Number(currentMonth.revenue_total), 'LYD')}` : undefined,
              },
              {
                label: `مصروفات ${year}`,
                value: s.totalExpense,
                sub: currentMonth ? `هذا الشهر ${formatMoney(Number(currentMonth.expense_total), 'LYD')}` : undefined,
              },
              { label: `صافي ${year}`, value: s.netProfit, sub: s.netProfit >= 0 ? 'الإيرادات أكبر من المصروفات' : 'المصروفات أكبر من الإيرادات' },
              { label: 'النقد في الخزائن', value: s.totalCashboxBalance, sub: `${cashboxes.length} خزينة ومصرف` },
            ].map((k) => (
              <div key={k.label} className="bg-card p-4">
                <p className="text-[12.5px] text-ink-mute">{k.label}</p>
                {statsLoading ? (
                  <Skeleton className="mt-2 h-7 w-32" />
                ) : (
                  <p className={cn('mt-1 text-[20px] font-semibold tabular-nums text-foreground', k.value < 0 && 'text-danger-ink')}>
                    {formatMoney(k.value, 'LYD')}
                  </p>
                )}
                {k.sub && !statsLoading && <p className="mt-0.5 text-[12px] text-ink-mute tabular-nums">{k.sub}</p>}
              </div>
            ))}
          </div>
        </Card>

        <MallRentCollectionSection />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <SectionCard title="الإيرادات والمصروفات" link={{ href: '/transactions', label: 'المعاملات' }} className="lg:col-span-2">
            <div className="p-4">
              <div className="mb-2 flex items-center justify-between gap-2 text-[12.5px] text-ink-mute">
                <span>آخر 6 أشهر</span>
                <span className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-success" aria-hidden />
                    إيرادات
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-danger" aria-hidden />
                    مصروفات
                  </span>
                </span>
              </div>
              {monthlyLoading ? (
                <Skeleton className="h-52 w-full" />
              ) : barData.length === 0 ? (
                <Quiet>لا توجد حركة بعد.</Quiet>
              ) : (
                <div
                  role="img"
                  aria-label={`الإيرادات والمصروفات: ${barData.map((r) => `${r.month} إيرادات ${formatMoney(r['إيرادات'], 'LYD')} ومصروفات ${formatMoney(r['مصروفات'], 'LYD')}`).join('، ')}`}
                >
                  <div aria-hidden>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={barData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barGap={3}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                        <YAxis
                          width={52}
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)} ألف` : String(v))}
                        />
                        <RechartsTooltip content={<MonthTooltip />} itemSorter={keepSeriesOrder} cursor={{ fill: 'hsl(var(--muted))' }} />
                        <Bar dataKey="إيرادات" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} maxBarSize={30} />
                        <Bar dataKey="مصروفات" fill="hsl(var(--danger))" radius={[3, 3, 0, 0]} maxBarSize={30} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="الخزائن" link={{ href: '/cashboxes', label: 'كل الخزائن' }}>
            {cashboxLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : cashboxes.length === 0 ? (
              <Quiet>لا توجد خزائن.</Quiet>
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {cashboxes.map((box) => (
                    <li key={box.id}>
                      <Link
                        href={`/cashboxes/${box.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas-sunken/60"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium text-foreground">{box.name_ar}</span>
                          <span className="block text-[12px] text-ink-mute">{box.kind === 'BANK' ? 'حساب مصرفي' : 'نقدية'}</span>
                        </span>
                        <span className={cn('shrink-0 text-[14px] font-semibold tabular-nums', Number(box.balance) < 0 && 'text-danger-ink')}>
                          {formatMoney(Number(box.balance), 'LYD')}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="flex items-center justify-between border-t border-border bg-canvas-sunken/50 px-4 py-2.5 text-[12.5px] text-ink-mute">
                  الإجمالي
                  <span className="font-semibold tabular-nums text-foreground">{formatMoney(cashTotal, 'LYD')}</span>
                </p>
              </>
            )}
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <SectionCard title="آخر المعاملات" link={{ href: '/transactions', label: 'كل المعاملات' }} className="lg:col-span-2">
            {txLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : recentTransactions.length === 0 ? (
              <Quiet>لا توجد معاملات بعد.</Quiet>
            ) : (
              <ul className="divide-y divide-border">
                {recentTransactions.map((tx) => {
                  const voided = tx.status === 'VOIDED';
                  const revenue = tx.kind === 'REVENUE';
                  return (
                    <li key={tx.id} className={cn('flex items-center gap-3 px-4 py-2.5', voided && 'text-ink-mute')}>
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', revenue ? 'bg-success' : 'bg-danger')} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13.5px] font-medium text-foreground">
                            {tx.description || tx.category?.name_ar || (revenue ? 'إيراد' : 'مصروف')}
                          </span>
                          {voided && <span className="shrink-0 text-[12px] text-danger-ink">ملغاة</span>}
                          {tx.status === 'DRAFT' && <span className="shrink-0 text-[12px] text-warning-ink">مسودة</span>}
                        </span>
                        <span className="block truncate text-[12px] text-ink-mute">
                          {[formatDate(tx.tx_date), tx.category?.name_ar, tx.cashbox?.name_ar].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'shrink-0 text-[13.5px] font-semibold tabular-nums',
                          voided ? 'line-through' : revenue ? 'text-success-ink' : 'text-danger-ink',
                        )}
                      >
                        {formatMoney(revenue ? Number(tx.amount) : -Number(tx.amount), tx.currency ?? 'LYD', { signed: true })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={`أعلى المصروفات ${year}`} link={{ href: '/expenses', label: 'المصروفات' }}>
            {statsLoading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : expenses.length === 0 ? (
              <Quiet>لا توجد مصروفات هذا العام.</Quiet>
            ) : (
              <ul className="space-y-3 p-4">
                {expenses.map((e) => {
                  const pct = expenseTotal > 0 ? (e.value / expenseTotal) * 100 : 0;
                  return (
                    <li key={e.label}>
                      <div className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="truncate font-medium text-foreground">{e.label}</span>
                        <span className="shrink-0 tabular-nums text-foreground">{formatMoney(e.value, 'LYD')}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <span className="block h-full rounded-full bg-danger/70" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="w-10 shrink-0 text-end text-[12px] tabular-nums text-ink-mute">{pct.toFixed(0)}%</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>

        <DashboardNewFeatures />
      </div>
    </>
  );
}
