'use client';

import { useMemo, useState } from 'react';
import { ArrowLeftRight, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { DataToolbar, type DateRangePreset, getDateRange } from '@/components/data/toolbar';
import { TransactionsTable } from '@/components/data/transactions-table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
import { useTransactions } from '@/lib/db/queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { formatMoney } from '@/lib/utils';

export default function TransactionsPage() {
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const { data, isLoading } = useTransactions();

  const rows = useMemo(() => data ?? [], [data]);

  // 1. Date filter
  const dateFiltered = useMemo(() => {
    const { from, to } = getDateRange(datePreset);
    if (!from || !to) return rows;
    return rows.filter((r) => {
      const d = new Date(r.tx_date);
      return d >= from && d <= to;
    });
  }, [rows, datePreset]);

  // 2. Text search
  const searched = useMemo(() => {
    if (!query) return dateFiltered;
    const q = query.toLowerCase();
    return dateFiltered.filter(
      (r) =>
        (r.description ?? '').toLowerCase().includes(q) ||
        (r.category?.name_ar ?? '').includes(query) ||
        (r.reference ?? String(r.number)).includes(query),
    );
  }, [dateFiltered, query]);

  // 3. Split by kind
  const revenues = useMemo(() => searched.filter((r) => r.kind === 'REVENUE'), [searched]);
  const expenses = useMemo(() => searched.filter((r) => r.kind === 'EXPENSE'), [searched]);

  // Totals
  const revTotal = revenues.reduce((s, r) => s + Number(r.amount), 0);
  const expTotal = expenses.reduce((s, r) => s + Number(r.amount), 0);

  // PDF
  const pdfRows = tab === 'revenues' ? revenues : tab === 'expenses' ? expenses : searched;
  const pdfTitleAr =
    tab === 'revenues' ? 'كشف الإيرادات' :
    tab === 'expenses' ? 'كشف المصروفات' : 'كشف المعاملات المالية';
  const pdfSubtitleAr = `${pdfRows.length} قيد`;

  return (
    <>
      <PageHeader
        eyebrow="المعاملات"
        title="جميع المعاملات"
        description="إيرادات ومصروفات في مكان واحد."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TajMallPdfToolbar
              fileName={`معاملات-${tab}-${new Date().toISOString().slice(0, 10)}`}
              disabled={pdfRows.length === 0}
              render={async () => {
                const { TransactionsReportPDF } = await import('@/features/pdf/TransactionsReportPDF');
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

      <div className="flex flex-col gap-5 px-4 py-5 sm:px-5 sm:py-6 md:px-8 md:py-7">
        <Tabs value={tab} onValueChange={setTab}>
          {/* Tab list */}
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="all" className="gap-1.5">
              <ArrowLeftRight className="h-3.5 w-3.5" />
              الكل
              <span className="tabular-nums text-[11px] opacity-70">({searched.length})</span>
            </TabsTrigger>
            <TabsTrigger value="revenues" className="gap-1.5">
              <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              إيرادات
              <span className="tabular-nums text-[11px] text-emerald-600 dark:text-emerald-400">
                {revenues.length > 0 && `(${revenues.length})`}
              </span>
            </TabsTrigger>
            <TabsTrigger value="expenses" className="gap-1.5">
              <ArrowUpFromLine className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
              مصروفات
              <span className="tabular-nums text-[11px] text-rose-600 dark:text-rose-400">
                {expenses.length > 0 && `(${expenses.length})`}
              </span>
            </TabsTrigger>
          </TabsList>

          {/* Summary strip (only when a specific tab is active) */}
          {tab !== 'all' && (
            <div className="mt-3 flex items-center gap-3 rounded-lg bg-canvas-sunken border border-border px-4 py-2.5">
              {tab === 'revenues' ? (
                <>
                  <span className="text-xs text-muted-foreground">إجمالي الإيرادات</span>
                  <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400 ms-auto">
                    {formatMoney(revTotal, 'LYD', { compact: revTotal >= 100_000 })}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground">إجمالي المصروفات</span>
                  <span className="font-bold tabular-nums text-rose-600 dark:text-rose-400 ms-auto">
                    {formatMoney(expTotal, 'LYD', { compact: expTotal >= 100_000 })}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Search + date toolbar */}
          <div className="mt-3">
            <DataToolbar
              searchPlaceholder="ابحث في رقم القيد أو البيان أو البند…"
              count={pdfRows.length}
              onSearch={setQuery}
              onExport={() => {}}
              datePreset={datePreset}
              onDatePreset={setDatePreset}
            />
          </div>

          {/* Tables */}
          <TabsContent value="all" className="mt-4">
            <TransactionsTable rows={searched} loading={isLoading} />
          </TabsContent>
          <TabsContent value="revenues" className="mt-4">
            <TransactionsTable rows={revenues} loading={isLoading} kindFilter="REVENUE" />
          </TabsContent>
          <TabsContent value="expenses" className="mt-4">
            <TransactionsTable rows={expenses} loading={isLoading} kindFilter="EXPENSE" />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
