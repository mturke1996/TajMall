'use client';

import { ArrowDownToLine, ArrowUpFromLine, Wallet, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
import { useDashboardStats } from '@/lib/db/queries';
import { Stat } from './stat';
import { Skeleton } from '@/components/ui/skeleton';

export function DashboardContent() {
  const { data: stats, isLoading } = useDashboardStats();

  const s = stats ?? { totalRevenue: 0, totalExpense: 0, netProfit: 0, totalCashboxBalance: 0 };

  return (
    <>
      <PageHeader
        eyebrow="نظرة عامة"
        title="لوحة التحكم"
        actions={<NewTransactionButton />}
      />

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {isLoading ? (
            <>
              <StatSkeleton />
              <StatSkeleton />
              <StatSkeleton />
              <StatSkeleton />
            </>
          ) : (
            <>
              <Stat
                label="الإيرادات"
                value={s.totalRevenue}
                currency="LYD"
                icon={ArrowDownToLine}
              />
              <Stat
                label="المصروفات"
                value={s.totalExpense}
                currency="LYD"
                icon={ArrowUpFromLine}
              />
              <Stat
                label="الصافي"
                value={s.netProfit}
                currency="LYD"
                icon={TrendingUp}
              />
              <Stat
                label="الخزائن"
                value={s.totalCashboxBalance}
                currency="LYD"
                icon={Wallet}
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}

function StatSkeleton() {
  return (
    <div className="surface p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>
    </div>
  );
}
