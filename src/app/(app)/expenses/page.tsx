'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { ArrowUpFromLine, Receipt, Wallet, Hash, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { DataToolbar, type DateRangePreset, datePresetLabel, isInDatePreset } from '@/components/data/toolbar';
import { exportTransactionsCsv, filterTransactions } from '@/lib/transactions-filter';
import { TransactionsTable } from '@/components/data/transactions-table';
import { Stat } from '@/components/dashboard/stat';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
import { useTransactions, useCategories } from '@/lib/db/queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { ExpensesPdfDialog } from '@/features/pdf/expenses-pdf-dialog';
import { useHighlightScroll } from '@/lib/hooks/use-highlight-scroll';
import { transactionHighlightDomId } from '@/components/data/transactions-table';
import { todayISODate } from '@/lib/utils';

const CategoryBreakdown = dynamic(
  () =>
    import('@/components/dashboard/category-breakdown').then(
      (module) => module.CategoryBreakdown,
    ),
  {
    loading: () => (
      <div
        role="status"
        aria-label="جارٍ تحميل توزيع المصروفات"
        className="grid min-h-[180px] grid-cols-1 items-center gap-6 sm:grid-cols-[160px_1fr]"
      >
        <div className="mx-auto h-40 w-40 animate-pulse rounded-full border-18 border-canvas-sunken" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-3 animate-pulse rounded bg-canvas-sunken" />
          ))}
        </div>
      </div>
    ),
  },
);

export default function ExpensesPage() {
  const highlightId = useSearchParams().get('highlight');
  const [query, setQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [pdfModalOpen, setPdfModalOpen] = useState(false);


  const { data, isLoading } = useTransactions('EXPENSE');
  const { data: categories = [] } = useCategories('EXPENSE');

  const rows = useMemo(() => data ?? [], [data]);

  // Apply date range filter
  const dateFiltered = useMemo(() => {
    if (datePreset === 'all') return rows;
    return rows.filter((r) => isInDatePreset(r.tx_date, datePreset));
  }, [rows, datePreset]);

  // Apply text search filter
  const filtered = useMemo(() => filterTransactions(dateFiltered, query), [dateFiltered, query]);

  // Apply category dropdown filter
  const categoryFiltered = useMemo(() => {
    if (selectedCategoryId === 'ALL') return filtered;
    return filtered.filter((r) => r.category_id === selectedCategoryId);
  }, [filtered, selectedCategoryId]);

  useHighlightScroll(highlightId, transactionHighlightDomId, [categoryFiltered.length]);

  // Stats from category-filtered rows
  const total = categoryFiltered.reduce((s, r) => s + Number(r.amount), 0);
  const count = categoryFiltered.length;
  const avg = count ? Math.round((total / count) * 1000) / 1000 : 0;

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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPdfModalOpen(true)}
              className="min-h-11 touch-manipulation gap-1.5 font-semibold text-foreground border-border hover:bg-canvas-sunken sm:min-h-9"
              disabled={rows.length === 0}
            >
              <SlidersHorizontal className="h-4 w-4" />
              خيارات تقرير PDF المتقدمة
            </Button>
            <TajMallPdfToolbar
              fileName={
                selectedCategoryName
                  ? `مصروفات-${selectedCategoryName}-${todayISODate()}`
                  : `مصروفات-${todayISODate()}`
              }
              disabled={categoryFiltered.length === 0}
              openLabel="عرض PDF سريع"
              render={async () => {
                const { ExpensesReportPDF } = await import('@/features/pdf/ExpensesReportPDF');
                return (
                  <ExpensesReportPDF
                    titleAr={selectedCategoryName ? `كشف مصروفات: ${selectedCategoryName}` : 'كشف المصروفات العمومية'}
                    periodLabel={datePresetLabel(datePreset)}
                    categoryLabel={selectedCategoryName ?? undefined}
                    subtitleAr={`${datePresetLabel(datePreset)}${query.trim() ? ` · بحث: ${query.trim()}` : ''}`}
                    rows={categoryFiltered}
                    groupByPaymentMethod={true}
                    includeSummaries={true}
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
          {/* Left: 3 stat cards — click to reset filters */}
          <div className="grid grid-cols-2 gap-3 xl:col-span-1 xl:grid-cols-1">
            <Stat
              label="إجمالي المصروفات"
              value={total}
              currency="LYD"
              icon={ArrowUpFromLine}
              loading={isLoading}
              color="rose"
              className="col-span-2 xl:col-span-1"
              onClick={() => {
                setSelectedCategoryId('ALL');
                setQuery('');
              }}
              active={selectedCategoryId === 'ALL' && !query}
            />
            <Stat
              label="عدد القيود"
              value={count}
              icon={Hash}
              loading={isLoading}
              color="blue"
              onClick={() => {
                setSelectedCategoryId('ALL');
                setQuery('');
              }}
              active={selectedCategoryId === 'ALL' && !query}
            />
            <Stat
              label="متوسط القيد"
              value={avg}
              currency="LYD"
              icon={Wallet}
              loading={isLoading}
              color="amber"
              onClick={() => {
                setSelectedCategoryId('ALL');
                setQuery('');
              }}
              active={selectedCategoryId === 'ALL' && !query}
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
          searchValue={query}
          onExport={() => exportTransactionsCsv(categoryFiltered, `مصروفات-${todayISODate()}`)}
          datePreset={datePreset}
          onDatePreset={setDatePreset}
        >
          <select
            aria-label="تصفية حسب بند المصروف"
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="h-9 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold focus:ring-1 focus:ring-foreground outline-hidden select-none max-w-[180px] cursor-pointer"
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
          isFiltered={Boolean(query.trim()) || datePreset !== 'all' || selectedCategoryId !== 'ALL'}
          tableId="expenses"
        />
      </div>

      <ExpensesPdfDialog
        // opening it starts from the category chosen on the page
        key={pdfModalOpen ? `open-${selectedCategoryId}` : 'closed'}
        open={pdfModalOpen}
        onOpenChange={setPdfModalOpen}
        categories={categories}
        transactions={rows}
        defaultCategoryId={selectedCategoryId}
      />
    </>
  );
}

