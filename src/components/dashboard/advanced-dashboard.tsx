'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Wallet,
  TrendingUp,
  TrendingDown,
  Calendar,
  Receipt,
  Users,
  Building2,
  ChevronLeft,
  Activity,
  CreditCard,
  Landmark,
  Sparkles,
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
import { PageHeader } from '@/components/layout/page-header';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
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
  const prevMonth = monthlyData[1];

  const revenueTrend = useMemo(() => {
    if (!currentMonth || !prevMonth) return undefined;
    const prev = Number(prevMonth.revenue_total);
    if (!Number.isFinite(prev) || prev === 0) return undefined;
    const cur = Number(currentMonth.revenue_total);
    return ((cur - prev) / prev) * 100;
  }, [currentMonth, prevMonth]);

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
      color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      description: 'تسجيل عملية دخول أموال للمنظومة',
    },
    {
      label: 'مصروف جديد',
      onClick: () => openTx('EXPENSE'),
      icon: ArrowUpFromLine,
      color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
      description: 'تسجيل عملية خروج أموال ومصاريف تشغيلية',
    },
    {
      label: 'إذن صرف',
      href: '/vouchers',
      icon: Receipt,
      color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      description: 'إصدار أو عرض سندات وأذونات الصرف المعتمدة',
    },
    {
      label: 'قيود اليومية',
      href: '/journals',
      icon: Calendar,
      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
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
            <NewTransactionButton />
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
              title="إجمالي الإيرادات"
              value={s.totalRevenue}
              icon={ArrowDownToLine}
              trend={revenueTrend}
              trendLabel="عن الشهر الماضي"
              color="emerald"
              isLoading={statsLoading}
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <StatCard
              title="إجمالي المصروفات"
              value={s.totalExpense}
              icon={ArrowUpFromLine}
              color="rose"
              isLoading={statsLoading}
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <StatCard
              title="صافي الربح"
              value={s.netProfit}
              icon={s.netProfit >= 0 ? TrendingUp : TrendingDown}
              subtitle={s.netProfit >= 0 ? 'النشاط رابح ✓' : 'النشاط خاسر'}
              color={s.netProfit >= 0 ? 'emerald' : 'rose'}
              isLoading={statsLoading}
              highlight
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <StatCard
              title="رصيد الخزائن"
              value={s.totalCashboxBalance}
              icon={Wallet}
              color="amber"
              isLoading={statsLoading}
            />
          </motion.div>
        </div>

        {/* ── Quick Actions Row (Horizontal Redesign) ── */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {quickActions.map((action) => {
            const cardContent = (
              <div className="flex items-center gap-3.5 p-4 rounded-xl border border-border bg-card text-card-foreground shadow-sm hover:shadow-lift transition-all duration-200 hover:border-border/60 group w-full text-start cursor-pointer h-full">
                <div className={cn('p-2.5 rounded-lg transition-transform duration-200 group-hover:scale-110 shrink-0', action.color)}>
                  <action.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold group-hover:text-primary transition-colors">{action.label}</h4>
                  <p className="text-[11px] text-muted-foreground truncate leading-normal mt-0.5">
                    {action.description}
                  </p>
                </div>
                <ChevronLeft className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-x-0.5 group-hover:text-primary shrink-0" />
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
                      <Activity className="h-4 w-4 text-sage-600" />
                      الأداء الشهري
                    </CardTitle>
                    <CardDescription>مقارنة الإيرادات والمصروفات — آخر 6 أشهر</CardDescription>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />إيرادات</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-400" />مصروفات</span>
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
                      <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', radius: 4 }} />
                      <Bar dataKey="إيرادات" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={36} />
                      <Bar dataKey="مصروفات" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={36} />
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
                  <Landmark className="h-4 w-4 text-sage-600" />
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
                          style={{ backgroundColor: box.color || '#D94841' }}
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
                  <ArrowUpFromLine className="h-4 w-4 text-rose-500" />
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
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
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
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                        formatter={(value) => (
                          <span style={{ color: 'hsl(var(--foreground))' }}>{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
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
                    <CreditCard className="h-4 w-4 text-sage-600" />
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
                    {recentTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between py-2.5 hover:bg-canvas-sunken rounded-lg px-2 -mx-2 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
                              tx.kind === 'REVENUE'
                                ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                            )}
                          >
                            {tx.kind === 'REVENUE' ? (
                              <ArrowDownToLine className="h-4 w-4" />
                            ) : (
                              <ArrowUpFromLine className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {tx.category?.name_ar || 'بدون بند'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {tx.cashbox?.name_ar} • {formatDateRelative(tx.tx_date)}
                            </p>
                          </div>
                        </div>
                        <div className="text-end tabular-nums shrink-0 ms-2">
                          <p
                            className={cn(
                              'font-bold text-sm',
                              tx.kind === 'REVENUE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                            )}
                          >
                            {tx.kind === 'REVENUE' ? '+' : '−'} {formatMoney(Number(tx.amount), tx.currency ?? 'LYD', { compact: true })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ── Info Cards Row ───────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <InfoCard icon={Building2} title="إدارة المول" description="المحلات، المستأجرين، العقود، والرسوم" href="/mall" />
          <InfoCard icon={Users} title="الدليل الشامل" description="جميع جهات التعامل داخل المول" href="/mall?tab=people" />
          <InfoCard icon={ArrowLeftRight} title="المعاملات" description="سجل الإيرادات والمصروفات" href="/transactions" />
          <InfoCard icon={Calendar} title="دفتر اليومية" description="القيود المحاسبية المزدوجة" href="/journals" />
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
  color,
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
  color: 'emerald' | 'rose' | 'amber' | 'blue';
  isLoading?: boolean;
  highlight?: boolean;
  formatType?: 'money' | 'percentage' | 'number';
}) {
  const configs = {
    emerald: {
      icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
      accent: 'stat-accent-emerald',
      border: 'border-emerald-200/60 dark:border-emerald-800/40',
    },
    rose: {
      icon: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400',
      accent: 'stat-accent-rose',
      border: 'border-rose-200/60 dark:border-rose-800/40',
    },
    amber: {
      icon: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
      accent: 'stat-accent-amber',
      border: 'border-amber-200/60 dark:border-amber-800/40',
    },
    blue: {
      icon: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
      accent: 'stat-accent-blue',
      border: 'border-blue-200/60 dark:border-blue-800/40',
    },
  };

  const cfg = configs[color];

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
    <Card
      className={cn(
        'h-full overflow-hidden transition-all duration-200 hover:shadow-lift',
        highlight && `${cfg.accent} ${cfg.border}`
      )}
    >
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-2 min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground leading-none">{title}</p>
            <p className="text-xl md:text-2xl font-bold tracking-tight tabular-nums leading-none">
              {formatType === 'money'
                ? formatMoney(value, 'LYD', { compact: value >= 100_000 })
                : formatType === 'percentage'
                ? `${value.toFixed(1)}%`
                : value.toLocaleString('ar-LY')}
            </p>
            {subtitle && (
              <p className={cn('text-xs font-medium truncate', value >= 0 || formatType !== 'money' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                {subtitle}
              </p>
            )}
            {trend !== undefined && (
              <div className="flex items-center gap-1 text-xs">
                <span className={cn('font-semibold', trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                  {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
                </span>
                <span className="text-muted-foreground">{trendLabel}</span>
              </div>
            )}
          </div>
          <div className={cn('p-2.5 rounded-xl shrink-0', cfg.icon)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Info Card ──────────────────────────────────────────────────────
function InfoCard({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link href={href} prefetch>
      <Card className="h-full cursor-pointer group hover:shadow-lift transition-all duration-200 hover:border-sage-300">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-canvas-sunken text-ink-mute group-hover:bg-sage-100 group-hover:text-sage-700 transition-colors shrink-0">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{title}</p>
            <p className="text-xs text-muted-foreground truncate">{description}</p>
          </div>
          <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5 group-hover:text-sage-700" />
        </CardContent>
      </Card>
    </Link>
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
