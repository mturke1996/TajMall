'use client';

import { useMemo, useState } from 'react';
import { ArrowUpFromLine, Receipt, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { DataToolbar } from '@/components/data/toolbar';
import { TransactionsTable } from '@/components/data/transactions-table';
import { Stat } from '@/components/dashboard/stat';
import { CategoryBreakdown } from '@/components/dashboard/category-breakdown';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
import { useTransactions } from '@/lib/db/queries';

export default function ExpensesPage() {
  const [query, setQuery] = useState('');
  const { data, isLoading } = useTransactions('EXPENSE');

  const rows = data ?? [];
  const filtered = useMemo(() => {
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        (r.description ?? '').toLowerCase().includes(q) ||
        (r.category?.name_ar ?? '').includes(query) ||
        (r.reference ?? String(r.number)).includes(query),
    );
  }, [rows, query]);

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const count = rows.length;
  const avg = count ? Math.round(total / count) : 0;

  // Breakdown
  const byCategory = useMemo(() => {
    const map = new Map<string, { value: number; color: string }>();
    for (const r of rows) {
      const label = r.category?.name_ar ?? 'بدون بند';
      const color = r.category?.color ?? '#6E7470';
      const prev = map.get(label);
      map.set(label, { value: (prev?.value ?? 0) + Number(r.amount), color });
    }
    return Array.from(map.entries())
      .map(([label, { value, color }]) => ({ label, value, color }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [rows]);

  return (
    <>
      <PageHeader
        eyebrow="المصروفات"
        title="إدارة المصروفات"
        description="مصاريف إدارية وعمومية وتشغيلية مرتبة حسب البند."
        actions={<NewTransactionButton kind="EXPENSE" label="مصروف جديد" />}
      />

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="flex flex-col gap-4 xl:col-span-1">
            <Stat
              label="إجمالي المصروفات"
              value={total}
              currency="LYD"
              icon={ArrowUpFromLine}
              loading={isLoading}
            />
            <Stat label="عدد القيود" value={count} icon={Receipt} loading={isLoading} />
            <Stat
              label="متوسط القيد"
              value={avg}
              currency="LYD"
              icon={Wallet}
              loading={isLoading}
            />
          </div>
          <article className="surface flex flex-col gap-4 p-4 sm:p-6 xl:col-span-2">
            <div className="flex items-end justify-between">
              <div className="flex flex-col gap-1.5">
                <span className="eyebrow w-fit">التوزيع</span>
                <h2 className="text-[16px] font-semibold tracking-tight sm:text-[17px]">
                  المصروفات حسب البند
                </h2>
              </div>
            </div>
            <div className="pt-2">
              <CategoryBreakdown slices={byCategory} />
            </div>
          </article>
        </section>

        <DataToolbar
          searchPlaceholder="ابحث في المصروفات…"
          count={filtered.length}
          onSearch={setQuery}
          onExport={() => {}}
        />

        <TransactionsTable
          rows={filtered}
          loading={isLoading}
          kindFilter="EXPENSE"
        />
      </div>
    </>
  );
}
