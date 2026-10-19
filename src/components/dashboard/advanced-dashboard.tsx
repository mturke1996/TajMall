'use client';

import { useMemo, useSyncExternalStore, type ElementType, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  ChevronLeft,
  CreditCard,
  Landmark,
  PieChart as PieChartIcon,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import { keepSeriesOrder } from '@/lib/chart-order';
import { PageHeader } from '@/components/layout/page-header';
import { useDashboardStats, useMonthlySummary, useRecentTransactions, useCashboxBalances } from '@/lib/db/queries';
import { useProfitLoss } from '@/lib/db/mall-queries';
import { usePermission } from '@/lib/supabase/use-permission';
import { useTxDialog } from '@/stores/transaction-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { arabicCount, cn, formatDate, formatMoney, todayISODate } from '@/lib/utils';
import { monthNameAr } from '@/lib/rent-months';
import { DashboardNewFeatures } from '@/components/dashboard/dashboard-new-features';
import { FollowUpCard } from '@/components/dashboard/follow-up-card';
import { MallRentCollectionSection } from '@/components/dashboard/mall-rent-collection-section';
import { ACCENT_VAR, IconTile, PhoneMoney, type Accent } from '@/components/dashboard/dashboard-ui';

const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** "2026-05" from the summary view becomes "مايو"; any other label is kept. */
const monthLabel = (label: string) => (/^\d{4}-\d{2}$/.test(label) ? monthNameAr(label) : label);

/** Greeting by the viewer's own clock; empty on the server and during hydration, so nothing mismatches. */
function greetingNow() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'صباح الخير';
  if (hour >= 12 && hour < 17) return 'مساء الخير';
  if (hour >= 17 && hour < 21) return 'مساء النور';
  return 'ليلة طيبة';
}
const noSubscription = () => () => {};

/** donut slices, largest first */
const SLICE_ORDER: Accent[] = ['red', 'amber', 'blue', 'violet', 'teal', 'green'];
const OTHER_SLICE = 'hsl(var(--ink-mute) / 0.4)';

type MonthRow = { month: string; إيرادات: number; مصروفات: number };

function MonthTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: MonthRow }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div dir="rtl" className="rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] shadow-lift">
      <p className="mb-1 font-semibold">{label}</p>
      <p className="tabular-nums text-success-ink">إيرادات {formatMoney(row['إيرادات'], 'LYD')}</p>
      <p className="tabular-nums text-danger-ink">مصروفات {formatMoney(row['مصروفات'], 'LYD')}</p>
      <p className="tabular-nums text-ink-mute">الصافي {formatMoney(row['إيرادات'] - row['مصروفات'], 'LYD', { signed: true })}</p>
    </div>
  );
}

type Slice = { label: string; value: number; fill: string };

function SliceTooltip({ active, payload, total }: { active?: boolean; payload?: { payload: Slice }[]; total: number }) {
  if (!active || !payload?.length) return null;
  const { label, value } = payload[0].payload;
  return (
    <div dir="rtl" className="rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] shadow-lift">
      <p className="mb-0.5 font-semibold">{label}</p>
      <p className="tabular-nums text-ink-mute">
        {formatMoney(value, 'LYD')} · {total > 0 ? ((value / total) * 100).toFixed(1) : '0'}%
      </p>
    </div>
  );
}

function SectionCard({
  title,
  description,
  icon,
  accent = 'green',
  link,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon: ElementType;
  accent?: Accent;
  link?: { href: string; label: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('flex flex-col overflow-hidden', className)}>
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <IconTile icon={icon} accent={accent} className="h-9 w-9 rounded-lg" />
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-foreground">{title}</h2>
            {description && <p className="truncate text-[12px] text-ink-mute">{description}</p>}
          </div>
        </div>
        {link && (
          <Link
            href={link.href}
            prefetch
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[12.5px] text-ink-mute hover:bg-canvas-sunken hover:text-foreground"
          >
            {link.label}
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </header>
      <div className="flex-1 border-t border-border">{children}</div>
    </Card>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-[13px] text-ink-mute">{children}</p>;
}

function KpiCard({
  label,
  value,
  sub,
  subTone = 'mute',
  icon,
  accent,
  pending,
  failed,
  negative,
  highlight,
}: {
  label: string;
  value: number;
  sub?: string;
  subTone?: 'mute' | 'good' | 'bad';
  icon: ElementType;
  accent: Accent;
  pending: boolean;
  failed: boolean;
  negative?: boolean;
  highlight?: 'good' | 'bad';
}) {
  return (
    <Card
      className={cn(
        'relative p-4 sm:p-5',
        highlight === 'good' && 'border-success-line bg-success-soft',
        highlight === 'bad' && 'border-danger-line bg-danger-soft',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 pt-0.5 text-[12.5px] font-medium text-ink-mute">{label}</p>
        <IconTile icon={icon} accent={accent} />
      </div>
      {pending ? (
        <Skeleton className="mt-3 h-7 w-32" />
      ) : (
        <p className={cn('mt-2 text-[20px] font-bold tabular-nums leading-tight text-foreground sm:text-[24px]', !failed && negative && 'text-danger-ink')}>
          {failed ? '—' : <PhoneMoney value={value} />}
        </p>
      )}
      {sub && !pending && !failed && (
        <p
          className={cn(
            'mt-1 text-[12px] tabular-nums',
            subTone === 'mute' && 'text-ink-mute',
            subTone === 'good' && 'text-success-ink',
            subTone === 'bad' && 'text-danger-ink',
          )}
        >
          {sub}
        </p>
      )}
    </Card>
  );
}

function QuickAction({
  icon,
  accent,
  title,
  hint,
  onClick,
  href,
}: {
  icon: ElementType;
  accent: Accent;
  title: string;
  hint: string;
  onClick?: () => void;
  href?: string;
}) {
  const body = (
    <>
      <IconTile icon={icon} accent={accent} />
      <span className="min-w-0 flex-1 text-start">
        <span className="block truncate text-[13.5px] font-semibold text-foreground">{title}</span>
        <span className="hidden truncate text-[12px] text-ink-mute sm:block">{hint}</span>
      </span>
      <ChevronLeft className="hidden h-4 w-4 shrink-0 text-ink-mute sm:block" aria-hidden />
    </>
  );
  const cls = 'flex h-full w-full items-center gap-2.5 rounded-xl border border-border bg-card p-3 shadow-whisper sm:gap-3 sm:p-3.5 transition-colors hover:bg-canvas-sunken';
  return href ? (
    <Link href={href} prefetch className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

/**
 * The owner's daily view: the year's money, rent collection, cash on hand, what was spent on what, and
 * the latest movements. Exact amounts throughout; colour tells money in (green) from money out (red).
 */
export function AdvancedDashboard() {
  // isPending (not isLoading): a paused offline query is not "loading", and must not fall through to zeros
  const { data: stats, isPending: statsPending, isError: statsError, refetch: refetchStats } = useDashboardStats();
  const {
    data: monthlyData = [],
    isPending: monthlyPending,
    isError: monthlyError,
    isSuccess: monthlyOk,
    refetch: refetchMonthly,
  } = useMonthlySummary();
  const { data: recentTransactions = [], isPending: txPending, isError: txError, refetch: refetchTx } = useRecentTransactions(8);
  const {
    data: cashboxes = [],
    isPending: cashboxPending,
    isError: cashboxError,
    isSuccess: cashboxOk,
    refetch: refetchCashbox,
  } = useCashboxBalances();
  const failed = statsError || monthlyError || txError || cashboxError;
  const retry = () => {
    if (statsError) void refetchStats();
    if (monthlyError) void refetchMonthly();
    if (txError) void refetchTx();
    if (cashboxError) void refetchCashbox();
  };
  const greeting = useSyncExternalStore(noSubscription, greetingNow, () => '');
  const openTx = useTxDialog((st) => st.open);
  const { can, loading: permLoading } = usePermission();
  const now = new Date();
  const year = now.getFullYear();
  // the income statement (accrual: rent counted in the month it is due) beside the cash figures
  const { data: pnl, isLoading: pnlLoading, isError: pnlError } = useProfitLoss(year, 'year');
  const accrual = useMemo(() => {
    const summary = (pnl as { summary?: Record<string, unknown> } | null | undefined)?.summary;
    if (!summary) return null;
    return {
      revenue: Number(summary.total_revenue || 0),
      expense: Number(summary.total_expense || 0),
      net: Number(summary.net_profit || 0),
    };
  }, [pnl]);

  const s = stats ?? { totalRevenue: 0, totalExpense: 0, netProfit: 0, totalCashboxBalance: 0, topExpenseCategories: [] };
  // monthlyData[0] is the latest month that has posted rows, which is last month until the first posting of this one
  const thisMonth = todayISODate(now).slice(0, 7);
  const currentMonth = monthlyData.find((m) => m.month_label === thisMonth);
  const monthRevenue = currentMonth ? Number(currentMonth.revenue_total) : 0;
  const monthExpense = currentMonth ? Number(currentMonth.expense_total) : 0;

  const barData = useMemo<MonthRow[]>(
    () =>
      [...monthlyData]
        .slice(0, 6)
        .reverse()
        .map((m) => ({ month: monthLabel(m.month_label), إيرادات: Number(m.revenue_total), مصروفات: Number(m.expense_total) })),
    [monthlyData],
  );
  const sixMonths = useMemo(() => {
    const revenue = barData.reduce((sum, r) => sum + r['إيرادات'], 0);
    const expense = barData.reduce((sum, r) => sum + r['مصروفات'], 0);
    return { revenue, expense, net: revenue - expense };
  }, [barData]);

  // the share is of ALL the year's expenses, not of the six shown (those would always add up to 100%);
  // whatever the six leave out is drawn as one grey slice so the ring is the whole year
  const expenseTotal = s.totalExpense;
  const slices = useMemo<Slice[]>(() => {
    const top = (s.topExpenseCategories ?? []).map((e, i) => ({ label: e.label, value: e.value, fill: ACCENT_VAR[SLICE_ORDER[i % SLICE_ORDER.length]] }));
    const rest = expenseTotal - top.reduce((sum, e) => sum + e.value, 0);
    return rest > 0.5 ? [...top, { label: 'بنود أخرى', value: rest, fill: OTHER_SLICE }] : top;
  }, [s.topExpenseCategories, expenseTotal]);
  const cashTotal = cashboxes.reduce((sum, b) => sum + Number(b.balance || 0), 0);

  const quick = [
    can('revenue.create') && { key: 'rev', icon: ArrowDownToLine, accent: 'green' as const, title: 'إيراد جديد', hint: 'تسجيل مبلغ دخل الخزينة', onClick: () => openTx('REVENUE') },
    can('expense.create') && { key: 'exp', icon: ArrowUpFromLine, accent: 'red' as const, title: 'مصروف جديد', hint: 'تسجيل مبلغ خرج من الخزينة', onClick: () => openTx('EXPENSE') },
    can('voucher.view') && { key: 'vou', icon: Receipt, accent: 'amber' as const, title: 'إذونات الصرف', hint: 'إصدار السندات ومتابعة اعتمادها', href: '/vouchers' },
    can('journal.view') && { key: 'jrn', icon: BookOpen, accent: 'blue' as const, title: 'قيود اليومية', hint: 'عرض القيود المحاسبية وإدخالها', href: '/journals' },
  ].filter(Boolean) as { key: string; icon: ElementType; accent: Accent; title: string; hint: string; onClick?: () => void; href?: string }[];

  return (
    <>
      <PageHeader eyebrow={greeting || undefined} title="لوحة التحكم" description={`${AR_DAYS[now.getDay()]} ${formatDate(now)}`} />

      <div className="flex flex-col gap-5 px-4 py-5 sm:px-5 sm:py-6 md:gap-6 md:px-8 md:py-7">
        {failed && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-[13px] text-danger-ink"
          >
            <p>تعذّر تحميل بعض الأرقام ولا يصح الاعتماد على ما يظهر.</p>
            <Button size="sm" variant="outline" onClick={retry}>
              إعادة المحاولة
            </Button>
          </div>
        )}

        <section aria-label="الأرقام الرئيسية" className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 md:gap-4">
            <KpiCard
              label={`المحصّل ${year}`}
              value={s.totalRevenue}
              icon={ArrowDownToLine}
              accent="green"
              pending={statsPending}
              failed={statsError}
              sub={monthlyOk ? `هذا الشهر ${formatMoney(monthRevenue, 'LYD')}` : undefined}
            />
            <KpiCard
              label={`المدفوع ${year}`}
              value={s.totalExpense}
              icon={ArrowUpFromLine}
              accent="red"
              pending={statsPending}
              failed={statsError}
              sub={monthlyOk ? `هذا الشهر ${formatMoney(monthExpense, 'LYD')}` : undefined}
            />
            <KpiCard
              label={`صافي النقد ${year}`}
              value={s.netProfit}
              icon={s.netProfit >= 0 ? TrendingUp : TrendingDown}
              accent={s.netProfit >= 0 ? 'teal' : 'red'}
              pending={statsPending}
              failed={statsError}
              negative={s.netProfit < 0}
              highlight={statsPending || statsError ? undefined : s.netProfit >= 0 ? 'good' : 'bad'}
              sub={s.netProfit >= 0 ? 'دخل أكثر مما خرج' : 'خرج أكثر مما دخل'}
              subTone={s.netProfit >= 0 ? 'good' : 'bad'}
            />
            <KpiCard
              label="النقد في الخزائن"
              value={s.totalCashboxBalance}
              icon={Wallet}
              accent="amber"
              pending={statsPending}
              failed={statsError}
              negative={s.totalCashboxBalance < 0}
              sub={
                cashboxOk
                  ? arabicCount(cashboxes.length, ['خزينة واحدة', 'خزينتان', 'خزائن ومصارف', 'خزينة ومصرف'])
                  : undefined
              }
            />
          </div>
          {/* Two bases, labelled: cash above (what moved through the boxes), accrual here (what was earned) */}
          <div className="flex flex-col gap-1 rounded-lg border border-info-line bg-info-soft px-4 py-2.5 text-[12.5px] sm:flex-row sm:items-center sm:justify-between">
            <p className="text-info-ink">الأرقام أعلاه نقدية: ما دخل الخزائن وخرج منها، ويشمل التأمينات المستلمة.</p>
            {pnlLoading ? (
              <Skeleton className="h-4 w-56" />
            ) : accrual && !pnlError ? (
              <Link
                href={`/reports/profit-loss?year=${year}&mode=year`}
                className="inline-flex flex-wrap items-center gap-x-2 font-medium text-info-ink hover:underline"
              >
                <span>قائمة الدخل (استحقاق):</span>
                <span className="tabular-nums">الإيراد {formatMoney(accrual.revenue, 'LYD')}</span>
                <span aria-hidden>·</span>
                <span className="tabular-nums">
                  {accrual.net < 0 ? 'صافي الخسارة' : 'صافي الربح'} {formatMoney(Math.abs(accrual.net), 'LYD')}
                </span>
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : null}
          </div>
        </section>

        {!permLoading && quick.length > 0 && (
          <section aria-label="إجراءات سريعة" className="grid grid-cols-2 gap-3 lg:grid-cols-4 md:gap-4">
            {quick.map((q) => (
              <QuickAction key={q.key} icon={q.icon} accent={q.accent} title={q.title} hint={q.hint} onClick={q.onClick} href={q.href} />
            ))}
          </section>
        )}

        <FollowUpCard />

        <MallRentCollectionSection />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 md:gap-6">
          <SectionCard
            title="المحصّل والمدفوع شهرياً"
            description="آخر 6 أشهر"
            icon={Activity}
            accent="green"
            link={{ href: '/transactions', label: 'المعاملات' }}
            className="lg:col-span-2"
          >
            <div className="p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-end gap-4 text-[12.5px] text-ink-mute">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-chart-green" aria-hidden />
                  إيرادات
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-chart-red" aria-hidden />
                  مصروفات
                </span>
              </div>
              {monthlyPending ? (
                <Skeleton className="h-52 w-full" />
              ) : monthlyError ? (
                <Quiet>تعذّر التحميل.</Quiet>
              ) : barData.length === 0 ? (
                <Quiet>لا توجد حركة بعد.</Quiet>
              ) : (
                <>
                  <div
                    role="img"
                    aria-label={`الإيرادات والمصروفات: ${barData.map((r) => `${r.month} إيرادات ${formatMoney(r['إيرادات'], 'LYD')} ومصروفات ${formatMoney(r['مصروفات'], 'LYD')}`).join('، ')}`}
                  >
                    <div aria-hidden dir="ltr">
                      <ResponsiveContainer width="100%" height={230}>
                        <BarChart data={barData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barGap={4}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                          <YAxis
                            width={52}
                            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)} ألف` : String(v))}
                          />
                          <RechartsTooltip content={<MonthTooltip />} itemSorter={keepSeriesOrder} cursor={{ fill: 'hsl(var(--muted))', radius: 6 }} />
                          <Bar dataKey="إيرادات" fill={ACCENT_VAR.green} radius={[5, 5, 0, 0]} maxBarSize={30} />
                          <Bar dataKey="مصروفات" fill={ACCENT_VAR.red} radius={[5, 5, 0, 0]} maxBarSize={30} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
                    <div className="relative rounded-lg border border-success-line bg-success-soft px-3 py-2">
                      <dt className="text-[12px] text-success-ink">إيرادات الأشهر</dt>
                      <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-success-ink sm:text-[14px]"><PhoneMoney value={sixMonths.revenue} /></dd>
                    </div>
                    <div className="relative rounded-lg border border-danger-line bg-danger-soft px-3 py-2">
                      <dt className="text-[12px] text-danger-ink">مصروفات الأشهر</dt>
                      <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-danger-ink sm:text-[14px]"><PhoneMoney value={sixMonths.expense} /></dd>
                    </div>
                    <div className="rounded-lg border border-info-line bg-info-soft px-3 py-2">
                      <dt className="text-[12px] text-info-ink">الصافي</dt>
                      <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-info-ink sm:text-[14px]">{formatMoney(sixMonths.net, 'LYD', { signed: true })}</dd>
                    </div>
                  </dl>
                </>
              )}
            </div>
          </SectionCard>

          <SectionCard title="الخزائن" description="الأرصدة الآن" icon={Landmark} accent="amber" link={{ href: '/cashboxes', label: 'كل الخزائن' }}>
            {cashboxPending ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
              </div>
            ) : cashboxError ? (
              <Quiet>تعذّر التحميل.</Quiet>
            ) : cashboxes.length === 0 ? (
              <Quiet>لا توجد خزائن.</Quiet>
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {cashboxes.map((box) => (
                    <li key={box.id}>
                      <Link href={`/cashboxes/${box.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas-sunken/60 sm:px-5">
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                            style={{ backgroundColor: `${box.color || '#6E7470'}26`, color: box.color || undefined }}
                            aria-hidden
                          >
                            {box.kind === 'BANK' ? <Landmark className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13.5px] font-medium text-foreground">{box.name_ar}</span>
                            <span className="block text-[12px] text-ink-mute">{box.kind === 'BANK' ? 'حساب مصرفي' : 'نقدية'}</span>
                          </span>
                        </span>
                        <span className={cn('shrink-0 text-[14px] font-semibold tabular-nums', Number(box.balance) < 0 ? 'text-danger-ink' : 'text-foreground')}>
                          {formatMoney(Number(box.balance), 'LYD')}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="relative flex items-center justify-between border-t border-border bg-warning-soft px-4 py-3 text-[13px] text-warning-ink sm:px-5">
                  الإجمالي
                  <span className="text-[15px] font-bold tabular-nums">
                    <PhoneMoney value={cashTotal} />
                  </span>
                </p>
              </>
            )}
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 md:gap-6">
          <SectionCard
            title="آخر المعاملات"
            description="أحدث ما سُجّل"
            icon={CreditCard}
            accent="blue"
            link={{ href: '/transactions', label: 'كل المعاملات' }}
            className="lg:col-span-2"
          >
            {txPending ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : txError ? (
              <Quiet>تعذّر التحميل.</Quiet>
            ) : recentTransactions.length === 0 ? (
              <Quiet>لا توجد معاملات بعد.</Quiet>
            ) : (
              <ul className="divide-y divide-border">
                {recentTransactions.map((tx) => {
                  const voided = tx.status === 'VOIDED';
                  const revenue = tx.kind === 'REVENUE';
                  return (
                    <li key={tx.id} className={cn('flex items-center gap-3 px-4 py-2.5 sm:px-5', voided && 'text-ink-mute')}>
                      <IconTile icon={revenue ? ArrowDownToLine : ArrowUpFromLine} accent={revenue ? 'green' : 'red'} className={cn('h-9 w-9 rounded-lg', voided && 'opacity-50')} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13.5px] font-medium text-foreground">
                            {tx.description || tx.category?.name_ar || (revenue ? 'إيراد' : 'مصروف')}
                          </span>
                          {voided && <span className="shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger-ink">ملغاة</span>}
                          {tx.status === 'DRAFT' && <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning-ink">مسودة</span>}
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

          <SectionCard
            title="توزيع المصروفات"
            description={`حصة كل بند من مدفوع ${year}`}
            icon={PieChartIcon}
            accent="red"
            link={{ href: '/expenses', label: 'المصروفات' }}
          >
            {statsPending ? (
              <div className="space-y-3 p-4">
                <Skeleton className="mx-auto h-40 w-40 rounded-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : statsError ? (
              <Quiet>تعذّر التحميل.</Quiet>
            ) : slices.length === 0 ? (
              <Quiet>لا توجد مصروفات هذا العام.</Quiet>
            ) : (
              <div className="flex flex-col gap-4 p-4 sm:p-5">
                <div className="relative mx-auto h-[180px] w-[180px]">
                  <div aria-hidden dir="ltr" className="h-full w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          rootTabIndex={-1}
                          data={slices}
                          dataKey="value"
                          nameKey="label"
                          innerRadius={58}
                          outerRadius={86}
                          paddingAngle={2}
                          stroke="hsl(var(--card))"
                          strokeWidth={2}
                        >
                          {slices.map((sl) => (
                            <Cell key={sl.label} fill={sl.fill} />
                          ))}
                        </Pie>
                        <RechartsTooltip content={<SliceTooltip total={expenseTotal} />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-[12px] text-ink-mute">المدفوع {year}</span>
                    <span className="mt-0.5 px-5 text-[14px] font-bold tabular-nums text-foreground">{formatMoney(expenseTotal, 'LYD')}</span>
                  </div>
                </div>
                <ul className="space-y-2">
                  {slices.map((sl) => {
                    const pct = expenseTotal > 0 ? (sl.value / expenseTotal) * 100 : 0;
                    return (
                      <li key={sl.label} className="flex items-center gap-2.5 text-[13px]">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: sl.fill }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-foreground">{sl.label}</span>
                        <span className="shrink-0 tabular-nums text-foreground">{formatMoney(sl.value, 'LYD')}</span>
                        <span className="w-10 shrink-0 text-end text-[12px] tabular-nums text-ink-mute">{pct.toFixed(0)}%</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </SectionCard>
        </div>

        <DashboardNewFeatures />
      </div>
    </>
  );
}
