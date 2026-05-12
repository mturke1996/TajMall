'use client';

import { ArrowDownToLine, ArrowUpFromLine, Wallet, TrendingUp, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/page-header';
import { Stat } from '@/components/dashboard/stat';
import { RevenueExpenseChart } from '@/components/dashboard/revenue-expense-chart';
import { CategoryBreakdown } from '@/components/dashboard/category-breakdown';
import { CashboxRail } from '@/components/dashboard/cashbox-rail';
import { RecentTransactions } from '@/components/dashboard/recent-transactions';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
import { useDashboardStats } from '@/lib/db/queries';

/**
 * Client wrapper that owns dashboard data fetching.
 * Kept as its own file so the route can be a Server Component
 * with proper metadata and the data side stays React-Query driven.
 */
export function DashboardContent() {
  const { data, isLoading } = useDashboardStats();

  const stats = data ?? {
    totalRevenue: 0,
    totalExpense: 0,
    netProfit: 0,
    totalCashboxBalance: 0,
    monthlySeries: [],
    topExpenseCategories: [],
  };

  return (
    <>
      <PageHeader
        eyebrow="نظرة عامة"
        title="لوحة التحكم"
        description="ملخص الإيرادات والمصروفات والخزائن لحظياً."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="stroke-[1.6]" />
              <span className="hidden sm:inline">تصدير</span>
            </Button>
            <NewTransactionButton />
          </>
        }
      />

      <div className="flex flex-col gap-6 px-4 py-5 sm:gap-7 sm:px-5 sm:py-7 md:px-8 md:py-10">
        {/* Stats */}
        <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Stat
            label="إجمالي الإيرادات"
            value={stats.totalRevenue}
            currency="LYD"
            icon={ArrowDownToLine}
            loading={isLoading}
            hint={stats.totalRevenue ? undefined : 'لا يوجد بعد'}
          />
          <Stat
            label="إجمالي المصروفات"
            value={stats.totalExpense}
            currency="LYD"
            icon={ArrowUpFromLine}
            loading={isLoading}
            hint={stats.totalExpense ? undefined : 'لا يوجد بعد'}
          />
          <Stat
            label="صافي الربح"
            value={stats.netProfit}
            currency="LYD"
            icon={TrendingUp}
            loading={isLoading}
            hint={stats.netProfit ? undefined : 'يُحسب تلقائياً'}
          />
          <Stat
            label="رصيد الخزائن"
            value={stats.totalCashboxBalance}
            currency="LYD"
            icon={Wallet}
            loading={isLoading}
            hint={stats.totalCashboxBalance ? undefined : 'أضف خزائنك'}
          />
        </section>

        {/* Chart + Breakdown */}
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <article className="surface flex flex-col gap-2 p-4 sm:p-6 xl:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="eyebrow w-fit">التدفق المالي</span>
                <h2 className="text-[16px] font-semibold tracking-tight sm:text-[17px]">
                  الإيرادات مقابل المصروفات
                </h2>
                <p className="hidden text-[12.5px] text-ink-mute sm:block">
                  مقارنة شهرية للسنة المالية الحالية.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="success">
                  <span className="h-1.5 w-1.5 rounded-full bg-pastel-greenInk" />
                  إيرادات
                </Badge>
                <Badge variant="warning">
                  <span className="h-1.5 w-1.5 rounded-full bg-pastel-yellowInk" />
                  مصروفات
                </Badge>
              </div>
            </div>
            <div className="mt-3">
              <RevenueExpenseChart data={stats.monthlySeries} />
            </div>
          </article>

          <article className="surface flex flex-col gap-4 p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="eyebrow w-fit">التوزيع</span>
                <h2 className="text-[16px] font-semibold tracking-tight sm:text-[17px]">
                  المصروفات حسب البند
                </h2>
              </div>
              <Badge variant="outline">السنة الحالية</Badge>
            </div>
            <div className="pt-1">
              <CategoryBreakdown slices={stats.topExpenseCategories} />
            </div>
          </article>
        </section>

        {/* Cashboxes */}
        <section className="flex flex-col gap-3 sm:gap-4">
          <div className="flex items-end justify-between">
            <div className="flex flex-col gap-1.5">
              <span className="eyebrow w-fit">الخزائن والمصارف</span>
              <h2 className="text-[16px] font-semibold tracking-tight sm:text-[17px]">
                أرصدة الحسابات اللحظية
              </h2>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-[12px]">
              <a href="/cashboxes">عرض الكل</a>
            </Button>
          </div>
          <CashboxRail />
        </section>

        {/* Recent transactions */}
        <section className="flex flex-col gap-3 sm:gap-4">
          <div className="flex items-end justify-between">
            <div className="flex flex-col gap-1.5">
              <span className="eyebrow w-fit">المعاملات الأخيرة</span>
              <h2 className="text-[16px] font-semibold tracking-tight sm:text-[17px]">
                آخر القيود في النظام
              </h2>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-[12px]">
              <a href="/transactions">عرض الكل</a>
            </Button>
          </div>
          <RecentTransactions />
        </section>
      </div>
    </>
  );
}
