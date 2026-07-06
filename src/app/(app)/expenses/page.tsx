'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowUpFromLine, Receipt, Wallet, Hash } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { DataToolbar, type DateRangePreset, getDateRange } from '@/components/data/toolbar';
import { TransactionsTable } from '@/components/data/transactions-table';
import { Stat } from '@/components/dashboard/stat';
import { CategoryBreakdown } from '@/components/dashboard/category-breakdown';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
import { useTransactions, useCategories } from '@/lib/db/queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { useHighlightScroll } from '@/lib/hooks/use-highlight-scroll';
import { transactionHighlightDomId } from '@/components/data/transactions-table';

export default function ExpensesPage() {
  const highlightId = useSearchParams().get('highlight');
  const [query, setQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');

  const { data, isLoading } = useTransactions('EXPENSE');
  const { data: categories = [] } = useCategories('EXPENSE');

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

  // Apply category dropdown filter
  const categoryFiltered = useMemo(() => {
    if (selectedCategoryId === 'ALL') return filtered;
    return filtered.filter((r) => r.category_id === selectedCategoryId);
  }, [filtered, selectedCategoryId]);

  useHighlightScroll(highlightId, transactionHighlightDomId, [categoryFiltered.length]);

  // Stats from category-filtered rows
  const total = categoryFiltered.reduce((s, r) => s + Number(r.amount), 0);
  const count = categoryFiltered.length;
  const avg = count ? Math.round(total / count) : 0;

  // Breakdown by category (from date-filtered rows, so it shows general ratios)
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

  const selectedCategoryName = useMemo(() => {
    if (selectedCategoryId === 'ALL') return null;
    return categories.find((c) => c.id === selectedCategoryId)?.name_ar ?? null;
  }, [selectedCategoryId, categories]);

  return (
    <>
      <PageHeader
        eyebrow="المصروفات"
        title="إدارة المصروفات"
        description="مصاريف إدارية وعمومية وتشغيلية مرتبة حسب البند."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TajMallPdfToolbar
              fileName={
                selectedCategoryName
                  ? `مصروفات-${selectedCategoryName}-${new Date().toISOString().slice(0, 10)}`
                  : `مصروفات-${new Date().toISOString().slice(0, 10)}`
              }
              disabled={categoryFiltered.length === 0}
              render={async () => {
                const { TransactionsReportPDF } = await import('@/features/pdf/TransactionsReportPDF');
                return (
                  <TransactionsReportPDF
                    titleAr={selectedCategoryName ? `كشف مصروفات: ${selectedCategoryName}` : "كشف المصروفات العمومية"}
                    subtitleAr={`عدد القيود: ${categoryFiltered.length} — بحسب عرض القائمة المصفاة`}
                    rows={categoryFiltered}
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
          <div className="grid grid-cols-2 gap-3 xl:col-span-1 xl:grid-cols-1">
            <Stat
              label="إجمالي المصروفات"
              value={total}
              currency="LYD"
              icon={ArrowUpFromLine}
              loading={isLoading}
              color="rose"
              className="col-span-2 xl:col-span-1"
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

        {/* Toolbar with search + date filter + category filter */}
        <DataToolbar
          searchPlaceholder="ابحث في المصروفات…"
          count={categoryFiltered.length}
          onSearch={setQuery}
          onExport={() => {}}
          datePreset={datePreset}
          onDatePreset={setDatePreset}
        >
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="h-9 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold focus:ring-1 focus:ring-sage-700 outline-none select-none max-w-[180px] cursor-pointer"
          >
            <option value="ALL">جميع بنود المصروفات</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name_ar}
              </option>
            ))}
          </select>
        </DataToolbar>

        <TransactionsTable
          rows={categoryFiltered}
          loading={isLoading}
          kindFilter="EXPENSE"
          highlightId={highlightId}
        />
      </div>
    </>
  );
}
