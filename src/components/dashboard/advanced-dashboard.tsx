'use client';

import { useMemo } from 'react';
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
} from 'lucide-react';
import Link from 'next/link';
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
import { Progress } from '@/components/ui/progress';
import { cn, formatMoney, formatDateRelative } from '@/lib/utils';
import { motion } from 'framer-motion';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 100,
      damping: 15,
    },
  },
};

export function AdvancedDashboard() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: monthlyData = [], isLoading: monthlyLoading } = useMonthlySummary();
  const { data: recentTransactions = [], isLoading: txLoading } = useRecentTransactions(6);
  const { data: cashboxes = [], isLoading: cashboxLoading } = useCashboxBalances();

  const s = stats ?? { totalRevenue: 0, totalExpense: 0, netProfit: 0, totalCashboxBalance: 0 };

  const currentMonth = monthlyData[0];
  const prevMonth = monthlyData[1];

  const revenueTrend = useMemo(() => {
    if (!currentMonth || !prevMonth) return undefined;
    const prev = Number(prevMonth.revenue_total);
    if (!Number.isFinite(prev) || prev === 0) return undefined;
    const cur = Number(currentMonth.revenue_total);
    return ((cur - prev) / prev) * 100;
  }, [currentMonth, prevMonth]);

  // Quick action cards
  const quickActions = [
    { label: 'إضافة إيراد', href: '/revenues', icon: ArrowDownToLine, color: 'bg-emerald-100 text-emerald-700' },
    { label: 'إضافة مصروف', href: '/expenses', icon: ArrowUpFromLine, color: 'bg-rose-100 text-rose-700' },
    { label: 'إذن صرف', href: '/vouchers', icon: Receipt, color: 'bg-amber-100 text-amber-700' },
    { label: 'قيود اليومية', href: '/journals', icon: Calendar, color: 'bg-blue-100 text-blue-700' },
  ];

  return (
    <>
      <PageHeader
        eyebrow="نظرة عامة"
        title="لوحة التحكم"
        description="متابعة الأداء المالي والتشغيلي للمنظومة"
        actions={<NewTransactionButton />}
      />

      <motion.div
        className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Top Stats Row - Bento Grid Style */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Revenue Card */}
          <motion.div variants={itemVariants}>
            <StatCard
              title="إجمالي الإيرادات"
              value={s.totalRevenue}
              currency="LYD"
              icon={ArrowDownToLine}
              trend={revenueTrend}
              trendLabel="عن الشهر الماضي"
              color="emerald"
              isLoading={statsLoading}
            />
          </motion.div>

          {/* Expense Card */}
          <motion.div variants={itemVariants}>
            <StatCard
              title="إجمالي المصروفات"
              value={s.totalExpense}
              currency="LYD"
              icon={ArrowUpFromLine}
              color="rose"
              isLoading={statsLoading}
            />
          </motion.div>

          {/* Net Profit Card */}
          <motion.div variants={itemVariants}>
            <StatCard
              title="صافي الربح"
              value={s.netProfit}
              currency="LYD"
              icon={s.netProfit >= 0 ? TrendingUp : TrendingDown}
              subtitle={s.netProfit >= 0 ? 'النشاط رابح' : 'النشاط خاسر'}
              color={s.netProfit >= 0 ? 'emerald' : 'rose'}
              isLoading={statsLoading}
              highlight
            />
          </motion.div>

          {/* Cashbox Card */}
          <motion.div variants={itemVariants}>
            <StatCard
              title="رصيد الخزائن"
              value={s.totalCashboxBalance}
              currency="LYD"
              icon={Wallet}
              color="amber"
              isLoading={statsLoading}
            />
          </motion.div>
        </div>

        {/* Middle Section - Charts & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Monthly Summary Chart */}
          <motion.div variants={itemVariants} className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-sage-600" />
                  الأداء الشهري
                </CardTitle>
                <CardDescription>مقارنة الإيرادات والمصروفات آخر 6 أشهر</CardDescription>
              </CardHeader>
              <CardContent>
                {monthlyLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-32 w-full" />
                  </div>
                ) : monthlyData.length === 0 ? (
                  <EmptyState message="لا توجد بيانات كافية" />
                ) : (
                  <div className="space-y-4">
                    {monthlyData.slice(0, 6).map((month, i) => {
                      const revenue = Number(month.revenue_total);
                      const expense = Number(month.expense_total);
                      const max = Math.max(revenue, expense, 1);

                      return (
                        <div key={month.month} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{month.month_label}</span>
                            <span className="text-muted-foreground">
                              صافي: {formatMoney(Number(month.net_profit), 'LYD')}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <div className="flex-1 space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-emerald-600">إيرادات</span>
                                <span>{formatMoney(revenue, 'LYD')}</span>
                              </div>
                              <Progress value={(revenue / max) * 100} className="h-2 bg-emerald-100" />
                            </div>
                            <div className="flex-1 space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-rose-600">مصروفات</span>
                                <span>{formatMoney(expense, 'LYD')}</span>
                              </div>
                              <Progress value={(expense / max) * 100} className="h-2 bg-rose-100" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Quick Actions & Cashboxes */}
          <motion.div variants={itemVariants} className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">إجراءات سريعة</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                {quickActions.map((action) => (
                  <Link key={action.href} href={action.href} prefetch>
                    <Button
                      variant="outline"
                      className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:shadow-md transition-shadow"
                    >
                      <div className={cn('p-2 rounded-lg', action.color)}>
                        <action.icon className="h-4 w-4" />
                      </div>
                      <span className="text-xs">{action.label}</span>
                    </Button>
                  </Link>
                ))}
              </CardContent>
            </Card>

            {/* Cashboxes Status */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-sage-600" />
                  حالة الخزائن
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {cashboxLoading ? (
                  <>
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </>
                ) : cashboxes.length === 0 ? (
                  <EmptyState message="لا توجد خزائن" />
                ) : (
                  cashboxes.slice(0, 4).map((box) => (
                    <div key={box.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: box.color || '#4a5d4a' }}
                        />
                        <span className="text-sm font-medium">{box.name_ar}</span>
                      </div>
                      <span className="text-sm font-bold">
                        {formatMoney(Number(box.balance), 'LYD')}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Bottom Section - Recent Transactions */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-sage-600" />
                  آخر المعاملات
                </CardTitle>
                <CardDescription>آخر 6 معاملات تم تسجيلها في النظام</CardDescription>
              </div>
              <Link href="/transactions" prefetch>
                <Button variant="ghost" size="sm" className="gap-1">
                  عرض الكل
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {txLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : recentTransactions.length === 0 ? (
                <EmptyState message="لا توجد معاملات حديثة" />
              ) : (
                <div className="divide-y">
                  {recentTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between py-3 hover:bg-muted/50 rounded-lg px-2 -mx-2 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'h-10 w-10 rounded-lg flex items-center justify-center',
                            tx.kind === 'REVENUE'
                              ? 'bg-emerald-100 text-emerald-600'
                              : 'bg-rose-100 text-rose-600'
                          )}
                        >
                          {tx.kind === 'REVENUE' ? (
                            <ArrowDownToLine className="h-5 w-5" />
                          ) : (
                            <ArrowUpFromLine className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {tx.category?.name_ar || 'بدون بند'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {tx.cashbox?.name_ar} • {formatDateRelative(tx.tx_date)}
                          </p>
                        </div>
                      </div>
                      <div className="text-end tabular-nums">
                        <p
                          className={cn(
                            'font-bold',
                            tx.kind === 'REVENUE' ? 'text-emerald-600' : 'text-rose-600'
                          )}
                        >
                          {tx.kind === 'REVENUE' ? '+' : '-'} {formatMoney(Number(tx.amount), tx.currency ?? 'LYD')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Info Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <InfoCard
            icon={Users}
            title="الدليل الشامل"
            description="جهات الاتصال والعملاء والموردين"
            href="/contacts"
          />
          <InfoCard
            icon={Building2}
            title="المحلات"
            description="متابعة الإيجارات والمستأجرين"
            href="/tenants"
          />
          <InfoCard
            icon={ArrowLeftRight}
            title="المعاملات"
            description="سجل الإيرادات والمصروفات والحركة المالية"
            href="/transactions"
          />
          <InfoCard
            icon={Calendar}
            title="دفتر اليومية"
            description="القيود المحاسبية المزدوجة"
            href="/journals"
          />
        </div>
      </motion.div>
    </>
  );
}

// Stat Card Component
function StatCard({
  title,
  value,
  currency,
  icon: Icon,
  trend,
  trendLabel,
  subtitle,
  color,
  isLoading,
  highlight,
}: {
  title: string;
  value: number;
  currency?: string;
  icon: React.ElementType;
  trend?: number;
  trendLabel?: string;
  subtitle?: string;
  color: 'emerald' | 'rose' | 'amber' | 'blue';
  isLoading?: boolean;
  highlight?: boolean;
}) {
  const iconColors = {
    emerald: 'bg-emerald-100 text-emerald-600',
    rose: 'bg-rose-100 text-rose-600',
    amber: 'bg-amber-100 text-amber-600',
    blue: 'bg-blue-100 text-blue-600',
  };

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'h-full transition-all duration-200 hover:shadow-md',
        highlight && 'ring-2 ring-sage-500/20'
      )}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">
              {currency ? formatMoney(value, currency) : value.toLocaleString()}
            </p>
            {subtitle && (
              <p className={cn('text-xs', value >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                {subtitle}
              </p>
            )}
            {trend !== undefined && (
              <div className="flex items-center gap-1 text-xs">
                <span className={trend >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                  {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
                </span>
                <span className="text-muted-foreground">{trendLabel}</span>
              </div>
            )}
          </div>
          <div className={cn('p-3 rounded-xl', iconColors[color])}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Info Card Component
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
      <Card className="h-full cursor-pointer group hover:shadow-md transition-all duration-200 hover:border-sage-300">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-sage-100 text-sage-700 group-hover:bg-sage-200 transition-colors">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-sm">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <ChevronLeft className="h-4 w-4 ms-auto shrink-0 text-ink-mute transition-transform group-hover:-translate-x-0.5 group-hover:text-sage-700" />
        </CardContent>
      </Card>
    </Link>
  );
}

// Empty State Component
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Activity className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
