'use client';

import { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { DataToolbar } from '@/components/data/toolbar';
import { TransactionsTable } from '@/components/data/transactions-table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
import { useTransactions } from '@/lib/db/queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';

export default function TransactionsPage() {
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const { data, isLoading } = useTransactions();

  const filtered = useMemo(() => {
    const rows = data ?? [];
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        (r.description ?? '').toLowerCase().includes(q) ||
        (r.category?.name_ar ?? '').includes(query) ||
        (r.reference ?? String(r.number)).includes(query),
    );
  }, [data, query]);

  const revenues = filtered.filter((r) => r.kind === 'REVENUE');
  const expenses = filtered.filter((r) => r.kind === 'EXPENSE');

  const pdfRows =
    tab === 'all' ? filtered : tab === 'revenues' ? revenues : expenses;
  const pdfTitleAr =
    tab === 'all'
      ? 'كشف المعاملات المالية'
      : tab === 'revenues'
        ? 'كشف الإيرادات (من تبويب المعاملات)'
        : 'كشف المصروفات (من تبويب المعاملات)';
  const pdfSubtitleAr =
    tab === 'all'
      ? `الكل — ${pdfRows.length} قيد`
      : tab === 'revenues'
        ? `الإيرادات — ${pdfRows.length} قيد`
        : `المصروفات — ${pdfRows.length} قيد`;

  return (
    <>
      <PageHeader
        eyebrow="المعاملات"
        title="جميع المعاملات"
        description="إيرادات ومصروفات ومعاملات الخزائن في مكان واحد."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TajMallPdfToolbar
              fileName={`معاملات-${tab}-${new Date().toISOString().slice(0, 10)}`}
              disabled={pdfRows.length === 0}
              render={async () => {
                const { TransactionsReportPDF } = await import(
                  '@/features/pdf/TransactionsReportPDF'
                );
                return (
                  <TransactionsReportPDF
                    titleAr={pdfTitleAr}
                    subtitleAr={pdfSubtitleAr}
                    rows={pdfRows}
                  />
                );
              }}
            />
            <NewTransactionButton />
          </div>
        }
      />

      <div className="flex flex-col gap-5 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">
              <ArrowLeftRight />
              الكل ({filtered.length})
            </TabsTrigger>
            <TabsTrigger value="revenues">الإيرادات ({revenues.length})</TabsTrigger>
            <TabsTrigger value="expenses">المصروفات ({expenses.length})</TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <DataToolbar
              searchPlaceholder="ابحث في رقم القيد أو البيان أو البند…"
              count={filtered.length}
              onSearch={setQuery}
              onExport={() => {}}
            />
          </div>

          <TabsContent value="all" className="mt-4">
            <TransactionsTable rows={filtered} loading={isLoading} />
          </TabsContent>
          <TabsContent value="revenues" className="mt-4">
            <TransactionsTable
              rows={revenues}
              loading={isLoading}
              kindFilter="REVENUE"
            />
          </TabsContent>
          <TabsContent value="expenses" className="mt-4">
            <TransactionsTable
              rows={expenses}
              loading={isLoading}
              kindFilter="EXPENSE"
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
