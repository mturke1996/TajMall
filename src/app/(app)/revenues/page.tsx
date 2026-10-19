'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TrendingUp, ArrowDownToLine, Receipt, Landmark, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { DataToolbar, type DateRangePreset, isInDatePreset, datePresetLabel } from '@/components/data/toolbar';
import { exportTransactionsCsv, filterTransactions } from '@/lib/transactions-filter';
import { TransactionsTable } from '@/components/data/transactions-table';
import { Stat } from '@/components/dashboard/stat';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
import { useTransactions, useCategories } from '@/lib/db/queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { RevenuesPdfDialog } from '@/features/pdf/revenues-pdf-dialog';
import { useHighlightScroll } from '@/lib/hooks/use-highlight-scroll';
import { transactionHighlightDomId } from '@/components/data/transactions-table';
import { todayISODate } from '@/lib/utils';

export default function RevenuesPage() {
  const highlightId = useSearchParams().get('highlight');
  const [query, setQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const [methodFilter, setMethodFilter] = useState<'ALL' | 'CASH' | 'CHEQUE' | 'OTHER'>('ALL');
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useTransactions('REVENUE');
  // a failed first load is not an empty ledger: show the failure, never zeros (a failed background refetch keeps its rows)
  const failed = isError && !data;
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
    if (datePreset === 'all') return rows;
    return rows.filter((r) => isInDatePreset(r.tx_date, datePreset));
  }, [rows, datePreset]);

  const methodFiltered = useMemo(() => {
    if (methodFilter === 'ALL') return dateFiltered;
    // Transfers and cards are rent's usual route, so they get their own bucket to match against the bank statement.
    if (methodFilter === 'OTHER') {
      return dateFiltered.filter((r) => r.method !== 'CASH' && r.method !== 'CHEQUE');
    }
    return dateFiltered.filter((r) => r.method === methodFilter);
  }, [dateFiltered, methodFilter]);

  const filtered = useMemo(() => filterTransactions(methodFiltered, query), [methodFiltered, query]);
  const isFiltered = Boolean(query.trim()) || datePreset !== 'all' || methodFilter !== 'ALL';

  useHighlightScroll(highlightId, transactionHighlightDomId, [filtered.length]);

  const total = dateFiltered.reduce((s, r) => s + Number(r.amount), 0);
  const cashTotal = dateFiltered
    .filter((r) => r.method === 'CASH')
    .reduce((s, r) => s + Number(r.amount), 0);
  const chequeTotal = dateFiltered
    .filter((r) => r.method === 'CHEQUE')
    .reduce((s, r) => s + Number(r.amount), 0);
  const otherTotal = dateFiltered
    .filter((r) => r.method !== 'CASH' && r.method !== 'CHEQUE')
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
              className="min-h-11 touch-manipulation gap-1.5 font-semibold text-success-ink border-success-line hover:bg-success-soft sm:min-h-9"
              disabled={rows.length === 0}
            >
              <SlidersHorizontal className="h-4 w-4" />
              خيارات تقرير PDF المتقدمة
            </Button>
            <TajMallPdfToolbar
              fileName={`إيرادات-${todayISODate()}`}
              disabled={filtered.length === 0}
              openLabel="عرض PDF سريع"
              render={async () => {
                const { RevenuesReportPDF } = await import(
                  '@/features/pdf/RevenuesReportPDF'
                );
                return (
                  <RevenuesReportPDF
                    titleAr="كشف الإيرادات التفصيلي"
                    periodLabel={datePresetLabel(datePreset)}
                    subtitleAr={`${datePresetLabel(datePreset)}${methodFilter === 'CASH' ? ' · نقدي فقط' : methodFilter === 'CHEQUE' ? ' · صكوك فقط' : methodFilter === 'OTHER' ? ' · حوالات وبطاقات فقط' : ''}${query.trim() ? ` · بحث: ${query.trim()}` : ''}`}
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
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="إجمالي الإيرادات"
            value={failed ? '—' : total}
            currency="LYD"
            icon={TrendingUp}
            loading={isLoading}
            color="emerald"
            onClick={() => setMethodFilter('ALL')}
            active={methodFilter === 'ALL'}
          />
          <Stat
            label="الإيرادات النقدية"
            value={failed ? '—' : cashTotal}
            currency="LYD"
            icon={ArrowDownToLine}
            loading={isLoading}
            color="blue"
            onClick={() => setMethodFilter('CASH')}
            active={methodFilter === 'CASH'}
          />
          <Stat
            label="إيرادات الصكوك"
            value={failed ? '—' : chequeTotal}
            currency="LYD"
            icon={Receipt}
            loading={isLoading}
            color="amber"
            onClick={() => setMethodFilter('CHEQUE')}
            active={methodFilter === 'CHEQUE'}
          />
          <Stat
            label="حوالات وبطاقات"
            value={failed ? '—' : otherTotal}
            currency="LYD"
            icon={Landmark}
            loading={isLoading}
            color="neutral"
            onClick={() => setMethodFilter('OTHER')}
            active={methodFilter === 'OTHER'}
          />
        </section>

        <DataToolbar
          searchPlaceholder="ابحث في الإيرادات…"
          count={filtered.length}
          onSearch={setQuery}
          searchValue={query}
          onExport={() => exportTransactionsCsv(filtered, `إيرادات-${todayISODate()}`)}
          datePreset={datePreset}
          onDatePreset={setDatePreset}
        />

        <TransactionsTable
          rows={filtered}
          loading={isLoading}
          error={failed ? error : undefined}
          onRetry={() => void refetch()}
          kindFilter="REVENUE"
          highlightId={highlightId}
          isFiltered={isFiltered}
          tableId="revenues"
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
