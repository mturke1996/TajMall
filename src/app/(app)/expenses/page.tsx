'use client';

import { useMemo, useState } from 'react';
import { ArrowUpFromLine, Receipt, Wallet, Hash } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { DataToolbar, type DateRangePreset, getDateRange } from '@/components/data/toolbar';
import { TransactionsTable } from '@/components/data/transactions-table';
import { Stat } from '@/components/dashboard/stat';
import { CategoryBreakdown } from '@/components/dashboard/category-breakdown';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
import { useTransactions } from '@/lib/db/queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';

export default function ExpensesPage() {
  const [query, setQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const { data, isLoading } = useTransactions('EXPENSE');

  const rows = useMemo(() => data ?? [], [data]);

  // Apply date range filter
  const dateFiltered = useMemo(() => {
    const { from, to } = getDateRange(datePreset);
    if (!from || !to) return rows;
    return rows.filter((r) => {
      const d = new Date(r.tx_date);
      return d >= from && d <= to;
    });
  }, [rows, datePreset]);

  // Apply text search filter
  const filtered = useMemo(() => {
    if (!query) return dateFiltered;
    const q = query.toLowerCase();
    return dateFiltered.filter(
      (r) =>
        (r.description ?? '').toLowerCase().includes(q) ||
        (r.category?.name_ar ?? '').includes(query) ||
        (r.reference ?? String(r.number)).includes(query),
    );
  }, [dateFiltered, query]);

  // Stats from date-filtered rows
  const total = dateFiltered.reduce((s, r) => s + Number(r.amount), 0);
  const count = dateFiltered.length;
  const avg = count ? Math.round(total / count) : 0;

  // Breakdown by category (from date-filtered rows)
  const byCategory = useMemo(() => {
    const map = new Map<string, { value: number; color: string }>();
    for (const r of dateFiltered) {
      const label = r.category?.name_ar ?? 'بدون بند';
      const color = r.category?.color ?? '#6E7470';
      const prev = map.get(label);
      map.set(label, { value: (prev?.value ?? 0) + Number(r.amount), color });
    }
    return Array.from(map.entries())
      .map(([label, { value, color }]) => ({ label, value, color }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [dateFiltered]);

  return (
    <>
      <PageHeader
        eyebrow="المصروفات"
        title="إدارة المصروفات"
        description="مصاريف إدارية وعمومية وتشغيلية مرتبة حسب البند."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TajMallPdfToolbar
              fileName={`مصروفات-${new Date().toISOString().slice(0, 10)}`}
              disabled={filtered.length === 0}
              render={async () => {
                const { TransactionsReportPDF } = await import('@/features/pdf/TransactionsReportPDF');
                return (
                  <TransactionsReportPDF
                    titleAr="كشف المصروفات"
                    subtitleAr={`عدد القيود: ${filtered.length} — بحسب عرض القائمة الحالي`}
                    rows={filtered}
                  />
                );
              }}
            />
            <NewTransactionButton kind="EXPENSE" label="مصروف جديد" />
          </div>
        }
      />

      <div className="flex flex-col gap-5 px-4 py-5 sm:px-5 sm:py-6 md:px-8 md:py-7">
        {/* Stats + Category breakdown */}
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* Left: 3 stat cards */}
          <div className="grid grid-cols-3 gap-3 xl:col-span-1 xl:grid-cols-1">
            <Stat
              label="إجمالي المصروفات"
              value={total}
              currency="LYD"
              icon={ArrowUpFromLine}
              loading={isLoading}
              color="rose"
            />
            <Stat
              label="عدد القيود"
              value={count}
              icon={Hash}
              loading={isLoading}
              color="blue"
            />
            <Stat
              label="متوسط القيد"
              value={avg}
              currency="LYD"
              icon={Wallet}
              loading={isLoading}
              color="amber"
            />
          </div>

          {/* Right: Category breakdown chart */}
          <article className="surface flex flex-col gap-4 p-4 sm:p-5 xl:col-span-2">
            <div className="flex items-end justify-between">
              <div className="flex flex-col gap-1">
                <span className="eyebrow w-fit">التوزيع</span>
                <h2 className="text-[16px] font-semibold tracking-tight">
                  المصروفات حسب البند
                </h2>
              </div>
            </div>
            <div className="pt-1">
              <CategoryBreakdown slices={byCategory} />
            </div>
          </article>
        </section>

        {/* Toolbar with search + date filter */}
        <DataToolbar
          searchPlaceholder="ابحث في المصروفات…"
          count={filtered.length}
          onSearch={setQuery}
          onExport={() => {}}
          datePreset={datePreset}
          onDatePreset={setDatePreset}
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
