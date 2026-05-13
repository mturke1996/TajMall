'use client';

import { ArrowDownToLine, ArrowUpFromLine, Wallet, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { NAV } from '@/components/layout/nav-items';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
import { useDashboardStats } from '@/lib/db/queries';
import { Stat } from './stat';

const dashboardSectionEyebrow =
  NAV.find((section) => section.items.some((item) => item.href === '/dashboard'))?.titleAr ??
  'نظرة عامة';

export function DashboardContent() {
  const { data: stats, isLoading } = useDashboardStats();

  const s = stats ?? { totalRevenue: 0, totalExpense: 0, netProfit: 0, totalCashboxBalance: 0 };

  return (
    <>
      <PageHeader
        eyebrow={dashboardSectionEyebrow}
        title="لوحة التحكم"
        actions={<NewTransactionButton />}
      />

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="الإيرادات"
            value={s.totalRevenue}
            currency="LYD"
            icon={ArrowDownToLine}
            loading={isLoading}
          />
          <Stat
            label="المصروفات"
            value={s.totalExpense}
            currency="LYD"
            icon={ArrowUpFromLine}
            loading={isLoading}
          />
          <Stat
            label="الصافي"
            value={s.netProfit}
            currency="LYD"
            icon={TrendingUp}
            loading={isLoading}
          />
          <Stat
            label="الخزائن"
            value={s.totalCashboxBalance}
            currency="LYD"
            icon={Wallet}
            loading={isLoading}
          />
        </section>
      </div>
    </>
  );
}
