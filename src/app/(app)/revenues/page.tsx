'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TrendingUp, ArrowDownToLine, Receipt, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { DataToolbar, type DateRangePreset, getDateRange } from '@/components/data/toolbar';
import { TransactionsTable } from '@/components/data/transactions-table';
import { Stat } from '@/components/dashboard/stat';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
import { useTransactions, useCategories } from '@/lib/db/queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { RevenuesPdfDialog } from '@/features/pdf/revenues-pdf-dialog';
import { useHighlightScroll } from '@/lib/hooks/use-highlight-scroll';
import { transactionHighlightDomId } from '@/components/data/transactions-table';

export default function RevenuesPage() {
  const highlightId = useSearchParams().get('highlight');
  const [query, setQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const [methodFilter, setMethodFilter] = useState<'ALL' | 'CASH' | 'CHEQUE'>('ALL');
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  const { data, isLoading } = useTransactions('REVENUE');
  const { data: categories = [] } = useCategories('REVENUE');

  const rows = useMemo(() => {
    const list = data ?? [];
    return [...list].sort((a, b) => {
      const byCreated =
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (byCreated !== 0) return byCreated;
      return Number(b.number) - Number(a.number);
    });
  }, [data]);

  const dateFiltered = useMemo(() => {
    const { from, to } = getDateRange(datePreset);
    if (!from || !to) return rows;
    return rows.filter((r) => {
      const d = new Date(r.tx_date);
      return d >= from && d <= to;
    });
  }, [rows, datePreset]);

  const methodFiltered = useMemo(() => {
    if (methodFilter === 'ALL') return dateFiltered;
    return dateFiltered.filter((r) => r.method === methodFilter);
  }, [dateFiltered, methodFilter]);

  const filtered = useMemo(() => {
    if (!query) return methodFiltered;
    const q = query.toLowerCase();
    return methodFiltered.filter(
      (r) =>
        (r.description ?? '').toLowerCase().includes(q) ||
        (r.category?.name_ar ?? '').includes(query) ||
        (r.reference ?? String(r.number)).includes(query),
    );
  }, [methodFiltered, query]);

  useHighlightScroll(highlightId, transactionHighlightDomId, [filtered.length]);

  const total = dateFiltered.reduce((s, r) => s + Number(r.amount), 0);
  const cashTotal = dateFiltered
    .filter((r) => r.method === 'CASH')
    .reduce((s, r) => s + Number(r.amount), 0);
  const chequeTotal = dateFiltered
    .filter((r) => r.method === 'CHEQUE')
    .reduce((s, r) => s + Number(r.amount), 0);

  return (
    <>
      <PageHeader
        eyebrow="الإيرادات"
        title="إدارة الإيرادات"
        description="جميع الإيرادات النقدية والمصرفية للمنظومة المالية."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPdfModalOpen(true)}
              className="min-h-11 touch-manipulation gap-1.5 font-semibold text-emerald-800 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-200 dark:border-emerald-800 dark:hover:bg-emerald-950 sm:min-h-9"
              disabled={rows.length === 0}
            >
              <SlidersHorizontal className="h-4 w-4" />
              خيارات تقرير PDF المتقدمة
            </Button>
            <TajMallPdfToolbar
              fileName={`إيرادات-${new Date().toISOString().slice(0, 10)}`}
              disabled={filtered.length === 0}
              openLabel="عرض PDF سريع"
              render={async () => {
                const { RevenuesReportPDF } = await import(
                  '@/features/pdf/RevenuesReportPDF'
                );
                return (
                  <RevenuesReportPDF
                    titleAr="كشف الإيرادات التفصيلي"
                    subtitleAr={`عدد القيود: ${filtered.length} — بحسب تصفية الجدول`}
                    rows={filtered}
                    groupByPaymentMethod={true}
                    includeSummaries={true}
                  />
                );
              }}
            />
            <NewTransactionButton kind="REVENUE" label="إيراد جديد" />
          </div>
        }
      />

      <div className="flex flex-col gap-5 px-4 py-5 sm:px-5 sm:py-6 md:px-8 md:py-7">
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="إجمالي الإيرادات"
            value={total}
            currency="LYD"
            icon={TrendingUp}
            loading={isLoading}
            color="emerald"
            onClick={() => setMethodFilter('ALL')}
            active={methodFilter === 'ALL'}
          />
          <Stat
            label="الإيرادات النقدية"
            value={cashTotal}
            currency="LYD"
            icon={ArrowDownToLine}
            loading={isLoading}
            color="blue"
            onClick={() => setMethodFilter('CASH')}
            active={methodFilter === 'CASH'}
          />
          <Stat
            label="إيرادات الصكوك"
            value={chequeTotal}
            currency="LYD"
            icon={Receipt}
            loading={isLoading}
            color="amber"
            onClick={() => setMethodFilter('CHEQUE')}
            active={methodFilter === 'CHEQUE'}
          />
        </section>

        <DataToolbar
          searchPlaceholder="ابحث في الإيرادات…"
          count={filtered.length}
          onSearch={setQuery}
          onExport={() => {}}
          datePreset={datePreset}
          onDatePreset={setDatePreset}
        />

        <TransactionsTable
          rows={filtered}
          loading={isLoading}
          kindFilter="REVENUE"
          highlightId={highlightId}
        />
      </div>

      <RevenuesPdfDialog
        open={pdfModalOpen}
        onOpenChange={setPdfModalOpen}
        categories={categories}
        transactions={rows}
      />
    </>
  );
}
