'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  TrendingUp,
  TrendingDown,
  Calendar,
  Receipt,
  ChevronLeft,
  Activity,
  CreditCard,
  Landmark,
} from 'lucide-react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { keepSeriesOrder } from '@/lib/chart-order';
import { PageHeader } from '@/components/layout/page-header';
import {
  useDashboardStats,
  useMonthlySummary,
  useRecentTransactions,
  useCashboxBalances,
} from '@/lib/db/queries';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, formatMoney, formatDateRelative } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useTxDialog } from '@/stores/transaction-dialog';
import { DashboardNewFeatures } from '@/components/dashboard/dashboard-new-features';
import { MallRentCollectionSection } from '@/components/dashboard/mall-rent-collection-section';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 120,
      damping: 18,
    },
  },
};

// Arabic greeting based on time of day
function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'صباح الخير';
  if (hour >= 12 && hour < 17) return 'مساء الخير';
  if (hour >= 17 && hour < 21) return 'مساء النور';
  return 'ليلة طيبة';
}

// Arabic day names
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const AR_MONTHS_SHORT = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function DateBadge() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const day = AR_DAYS[now.getDay()];
  const date = `${now.getDate()} ${AR_MONTHS_SHORT[now.getMonth()]} ${now.getFullYear()}`;
  return (
    <span className="text-sm text-muted-foreground hidden sm:block">
      {day}، {date}
    </span>
  );
}

// Custom Recharts Tooltip
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card shadow-lift px-3 py-2 text-sm">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="tabular-nums">
          {p.name}: {formatMoney(p.value, 'LYD', { compact: true })}
        </p>
      ))}
    </div>
  );
}

// Custom Pie Tooltip
function PieTooltipContent({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border border-border bg-card shadow-lift px-3 py-2 text-sm">
      <p className="font-semibold mb-0.5">{item.name}</p>
      <p className="text-muted-foreground tabular-nums">{formatMoney(item.value, 'LYD', { compact: true })}</p>
    </div>
  );
}

export function AdvancedDashboard() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: monthlyData = [], isLoading: monthlyLoading } = useMonthlySummary();
  const { data: recentTransactions = [], isLoading: txLoading } = useRecentTransactions(6);
  const { data: cashboxes = [], isLoading: cashboxLoading } = useCashboxBalances();

  const s = stats ?? {
    totalRevenue: 0,
    totalExpense: 0,
    netProfit: 0,
    totalCashboxBalance: 0,
    monthlySeries: [],
    topExpenseCategories: [],
  };

  const currentMonth = monthlyData[0];

  // Bar chart data — last 6 months reversed (oldest → newest)
  const barData = useMemo(() => {
    return [...monthlyData].slice(0, 6).reverse().map((m) => ({
      month: m.month_label,
      إيرادات: Number(m.revenue_total),
      مصروفات: Number(m.expense_total),
    }));
  }, [monthlyData]);

  // Pie chart data from dashboard stats (already computed server-side)
  const pieData = useMemo(() => {
    if (s.topExpenseCategories?.length) return s.topExpenseCategories;
    return [];
  }, [s.topExpenseCategories]);

  const openTx = useTxDialog((s) => s.open);

  // Quick action cards
  const quickActions = [
    {
      label: 'إيراد جديد',
      onClick: () => openTx('REVENUE'),
      icon: ArrowDownToLine,
      description: 'تسجيل عملية دخول أموال للمنظومة',
    },
    {
      label: 'مصروف جديد',
      onClick: () => openTx('EXPENSE'),
      icon: ArrowUpFromLine,
      description: 'تسجيل عملية خروج أموال ومصاريف تشغيلية',
    },
    {
      label: 'إذن صرف',
      href: '/vouchers',
      icon: Receipt,
      description: 'إصدار أو عرض سندات وأذونات الصرف المعتمدة',
    },
    {
      label: 'قيود اليومية',
      href: '/journals',
      icon: Calendar,
      description: 'عرض القيود المحاسبية المزدوجة وإدخالها',
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={getGreeting()}
        title="لوحة التحكم"
        description="متابعة الأداء المالي والتشغيلي للمنظومة"
        actions={
          <div className="flex items-center gap-2">
            <DateBadge />
            {/* The top bar carries «معاملة جديدة» on desktop; phones use the + button in the bottom bar. */}
          </div>
        }
      />

      <motion.div
        className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* ── KPI Stats Row ─────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <motion.div variants={itemVariants}>
            <StatCard
              title="إيرادات العام"
              value={s.totalRevenue}
              icon={ArrowDownToLine}
              subtitle={
                currentMonth
                  ? `الشهر الحالي: ${formatMoney(Number(currentMonth.revenue_total), 'LYD', { compact: true })}`
                  : undefined
              }
              isLoading={statsLoading}
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <StatCard
              title="مصروفات العام"
              value={s.totalExpense}
              icon={ArrowUpFromLine}
              isLoading={statsLoading}
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <StatCard
              title="صافي ربح العام"
              value={s.netProfit}
              icon={s.netProfit >= 0 ? TrendingUp : TrendingDown}
              subtitle={s.netProfit >= 0 ? 'النشاط رابح' : 'النشاط خاسر'}
              isLoading={statsLoading}
              highlight
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <StatCard
              title="رصيد الخزائن"
              value={s.totalCashboxBalance}
              icon={Wallet}
              isLoading={statsLoading}
            />
          </motion.div>
        </div>

        {/* ── Quick Actions Row (Horizontal Redesign) ── */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {quickActions.map((action) => {
            const cardContent = (
              <div className="flex items-center gap-3 p-3 sm:gap-3.5 sm:p-4 rounded-xl border border-border bg-card text-card-foreground transition-colors duration-150 hover:bg-canvas-sunken/60 group w-full text-start cursor-pointer h-full">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-canvas-sunken text-ink-soft transition-colors group-hover:text-foreground">
                  <action.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-[13px] font-semibold leading-snug transition-colors sm:truncate sm:text-sm">{action.label}</h4>
                  <p className="mt-0.5 hidden truncate text-[11px] leading-normal text-muted-foreground sm:block">
                    {action.description}
                  </p>
                </div>
                <ChevronLeft className="hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5 group-hover:text-primary sm:block" />
              </div>
            );

            if (action.onClick) {
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className="focus:outline-none block w-full text-start h-full"
                >
                  {cardContent}
                </button>
              );
            }

            return (
              <Link key={action.label} href={action.href!} prefetch className="block w-full h-full">
                {cardContent}
              </Link>
            );
          })}
        </motion.div>

        <MallRentCollectionSection itemVariants={itemVariants} />

        {/* ── Charts Row ────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Monthly Bar Chart */}
          <motion.div variants={itemVariants} className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-4 w-4 text-ink-soft" />
                      الأداء الشهري
                    </CardTitle>
                    <CardDescription>مقارنة الإيرادات والمصروفات — أشهر السنة الحالية</CardDescription>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-success" />إيرادات</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-danger" />مصروفات</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-1">
                {monthlyLoading ? (
                  <Skeleton className="h-52 w-full rounded-lg" />
                ) : barData.length === 0 ? (
                  <EmptyState message="لا توجد بيانات كافية للرسم البياني" />
                ) : (
                  <ResponsiveContainer width="100%" height={210}>
                    <BarChart data={barData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
                      />
                      <RechartsTooltip content={<ChartTooltip />} itemSorter={keepSeriesOrder} cursor={{ fill: 'hsl(var(--muted))', radius: 4 }} />
                      <Bar dataKey="إيرادات" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} maxBarSize={36} />
                      <Bar dataKey="مصروفات" fill="hsl(var(--danger))" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Cashboxes Status */}
          <motion.div variants={itemVariants}>
            <Card className="h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-ink-soft" />
                  حالة الخزائن
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {cashboxLoading ? (
                  <>
                    <Skeleton className="h-11 w-full" />
                    <Skeleton className="h-11 w-full" />
                    <Skeleton className="h-11 w-full" />
                  </>
                ) : cashboxes.length === 0 ? (
                  <EmptyState message="لا توجد خزائن" />
                ) : (
                  cashboxes.slice(0, 4).map((box) => (
                    <div
                      key={box.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-canvas-sunken hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: box.color || 'hsl(var(--ink-mute))' }}
                        />
                        <span className="text-sm font-medium truncate max-w-[120px]">{box.name_ar}</span>
                      </div>
                      <span className="text-sm font-bold tabular-nums">
                        {formatMoney(Number(box.balance), 'LYD', { compact: true })}
                      </span>
                    </div>
                  ))
                )}
                {cashboxes.length > 0 && (
                  <Link href="/cashboxes" className="block">
                    <Button variant="ghost" size="sm" className="w-full text-xs mt-1 gap-1">
                      عرض جميع الخزائن
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ── Expense Breakdown + Recent Transactions ──────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Expense Pie Chart */}
          <motion.div variants={itemVariants}>
            <Card className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowUpFromLine className="h-4 w-4 text-danger" />
                  توزيع المصروفات
                </CardTitle>
                <CardDescription>أعلى بنود الإنفاق هذا العام</CardDescription>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-48 w-full rounded-lg" />
                ) : pieData.length === 0 ? (
                  <EmptyState message="لا توجد مصروفات مسجلة" />
                ) : (
                  <div
                    role="img"
                    aria-label={`توزيع المصروفات: ${pieData.map((d) => `${d.label} ${formatMoney(d.value, 'LYD', { compact: true })}`).join('، ')}`}
                  >
                  <div aria-hidden>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        rootTabIndex={-1}
                        data={pieData}
                        cx="50%"
                        cy="45%"
                        innerRadius={52}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                        nameKey="label"
                      >
                        {pieData.map((entry, i) => (
                          <Cell
                            key={entry.label}
                            fill={entry.color || `hsl(${(i * 47) % 360}, 60%, 55%)`}
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<PieTooltipContent />} />
                      <Legend
                        itemSorter={null}
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                        formatter={(value) => (
                          <span style={{ color: 'hsl(var(--foreground))' }}>{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Recent Transactions */}
          <motion.div variants={itemVariants} className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-ink-soft" />
                    آخر المعاملات
                  </CardTitle>
                  <CardDescription>آخر 6 معاملات تم تسجيلها</CardDescription>
                </div>
                <Link href="/transactions" prefetch>
                  <Button variant="ghost" size="sm" className="gap-1 text-xs">
                    عرض الكل
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {txLoading ? (
                  <div className="space-y-2.5">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : recentTransactions.length === 0 ? (
                  <EmptyState message="لا توجد معاملات حديثة" />
                ) : (
                  <div className="divide-y divide-border/60">
                    {recentTransactions.map((tx) => {
                      const isVoided = tx.status === 'VOIDED';
                      const isDraft = tx.status === 'DRAFT';
                      return (
                      <div
                        key={tx.id}
                        className={cn(
                          'flex items-center justify-between py-2.5 hover:bg-canvas-sunken rounded-lg px-2 -mx-2 transition-colors group',
                          isVoided && 'opacity-50',
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className={cn(
                              'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
                              tx.kind === 'REVENUE'
                                ? 'bg-success-soft text-success'
                                : 'bg-danger-soft text-danger'
                            )}
                          >
                            {tx.kind === 'REVENUE' ? (
                              <ArrowDownToLine className="h-4 w-4" />
                            ) : (
                              <ArrowUpFromLine className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="font-medium text-sm truncate">
                                {tx.category?.name_ar || 'بدون بند'}
                              </p>
                              {isVoided && (
                                <span className="shrink-0 rounded-full bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold text-danger-ink">
                                  ملغى
                                </span>
                              )}
                              {isDraft && (
                                <span className="shrink-0 rounded-full bg-warning-soft px-1.5 py-0.5 text-[11px] font-semibold text-warning-ink">
                                  مسودة
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {tx.cashbox?.name_ar} • {formatDateRelative(tx.tx_date)}
                            </p>
                          </div>
                        </div>
                        <div className="text-end tabular-nums shrink-0 ms-2">
                          <p
                            className={cn(
                              'font-bold text-sm',
                              isVoided
                                ? 'text-muted-foreground line-through'
                                : tx.kind === 'REVENUE' ? 'text-success' : 'text-danger'
                            )}
                          >
                            {formatMoney(tx.kind === 'REVENUE' ? Number(tx.amount) : -Number(tx.amount), tx.currency ?? 'LYD', { compact: true, signed: true })}
                          </p>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>


        <motion.div variants={itemVariants}>
          <DashboardNewFeatures />
        </motion.div>
      </motion.div>
    </>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────
function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendLabel,
  subtitle,
  isLoading,
  highlight,
  formatType = 'money',
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  trend?: number;
  trendLabel?: string;
  subtitle?: string;
  isLoading?: boolean;
  highlight?: boolean;
  formatType?: 'money' | 'percentage' | 'number';
}) {
  // Colour carries meaning only: the figure of a loss is red, everything else stays neutral.
  const valueTone = formatType === 'money' && value < 0 ? 'text-danger-ink' : 'text-foreground';


  if (isLoading) {
    return (
      <Card className="h-full overflow-hidden">
        <CardContent className="p-4 md:p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-6 w-28" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('h-full overflow-hidden', highlight && 'bg-canvas-sunken/60')}>
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-2 min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground leading-none">{title}</p>
            <p className={cn('text-xl md:text-2xl font-semibold tabular-nums leading-none', valueTone)}>
              {formatType === 'money'
                ? formatMoney(value, 'LYD', { compact: value >= 100_000 })
                : formatType === 'percentage'
                ? `${value.toFixed(1)}%`
                : value.toLocaleString('ar-LY')}
            </p>
            {subtitle && (
              <p className={cn('text-xs truncate', formatType === 'money' && value < 0 ? 'text-danger-ink' : 'text-muted-foreground')}>
                {subtitle}
              </p>
            )}
            {trend !== undefined && (
              <div className="flex items-center gap-1 text-xs">
                <span className={cn('font-semibold', trend >= 0 ? 'text-success' : 'text-danger')}>
                  {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
                </span>
                <span className="text-muted-foreground">{trendLabel}</span>
              </div>
            )}
          </div>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Empty State ────────────────────────────────────────────────────
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
      <div className="h-11 w-11 rounded-full bg-canvas-sunken flex items-center justify-center">
        <Activity className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
