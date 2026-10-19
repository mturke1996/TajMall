'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeftRight, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { DataToolbar, type DateRangePreset, isInDatePreset } from '@/components/data/toolbar';
import { exportTransactionsCsv, filterTransactions } from '@/lib/transactions-filter';
import { TransactionsTable } from '@/components/data/transactions-table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
import { useTransactions } from '@/lib/db/queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { formatMoney, todayISODate, arabicCount } from '@/lib/utils';
import { useHighlightScroll } from '@/lib/hooks/use-highlight-scroll';
import { transactionHighlightDomId } from '@/components/data/transactions-table';

export default function TransactionsPage() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const contactFilter = searchParams.get('contact');
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const { data, isLoading, isError, error, refetch } = useTransactions();
  // a failed first load is not an empty ledger: show the failure, never zeros (a failed background refetch keeps its rows)
  const failed = isError && !data;
  const tableError = failed ? error : undefined;
  const retry = () => void refetch();

  const rows = useMemo(() => {
    const all = data ?? [];
    if (!contactFilter) return all;
    return all.filter((r) => r.contact?.id === contactFilter);
  }, [data, contactFilter]);

  useEffect(() => {
    if (!highlightId || !rows.length) return;
    const hit = rows.find((r) => r.id === highlightId);
    if (!hit) return;
    if (hit.kind === 'REVENUE') setTab('revenues');
    else if (hit.kind === 'EXPENSE') setTab('expenses');
    else setTab('all');
  }, [highlightId, rows]);

  useHighlightScroll(highlightId, transactionHighlightDomId, [rows.length, tab]);

  // 1. Date filter
  const dateFiltered = useMemo(() => {
    if (datePreset === 'all') return rows;
    return rows.filter((r) => isInDatePreset(r.tx_date, datePreset));
  }, [rows, datePreset]);

  // 2. Text search
  const searched = useMemo(() => filterTransactions(dateFiltered, query), [dateFiltered, query]);
  const isFiltered = Boolean(query.trim()) || datePreset !== 'all';

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
  const pdfSubtitleAr = arabicCount(pdfRows.length, ['معاملة واحدة', 'معاملتان', 'معاملات', 'معاملة']);

  return (
    <>
      <PageHeader
        eyebrow="المعاملات"
        title="جميع المعاملات"
        description={
          contactFilter
            ? `معاملات مرتبطة بجهة محددة (${arabicCount(rows.length, ['معاملة واحدة', 'معاملتان', 'معاملات', 'معاملة'])}).`
            : 'إيرادات ومصروفات في مكان واحد.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TajMallPdfToolbar
              fileName={`معاملات-${tab}-${todayISODate()}`}
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
              <ArrowDownToLine className="h-3.5 w-3.5 text-success" />
              إيرادات
              <span className="tabular-nums text-[11px] text-success">
                {revenues.length > 0 && `(${revenues.length})`}
              </span>
            </TabsTrigger>
            <TabsTrigger value="expenses" className="gap-1.5">
              <ArrowUpFromLine className="h-3.5 w-3.5 text-danger" />
              مصروفات
              <span className="tabular-nums text-[11px] text-danger">
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
                  <span className="font-bold tabular-nums text-success ms-auto">
                    {failed ? '—' : formatMoney(revTotal, 'LYD')}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground">إجمالي المصروفات</span>
                  <span className="font-bold tabular-nums text-danger ms-auto">
                    {failed ? '—' : formatMoney(expTotal, 'LYD')}
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
              onExport={() => exportTransactionsCsv(pdfRows, `معاملات-${tab}-${todayISODate()}`)}
              datePreset={datePreset}
              onDatePreset={setDatePreset}
            />
          </div>

          {/* Tables */}
          <TabsContent value="all" className="mt-4">
            <TransactionsTable rows={searched} loading={isLoading} error={tableError} onRetry={retry} highlightId={highlightId} isFiltered={isFiltered} tableId="transactions-all" />
          </TabsContent>
          <TabsContent value="revenues" className="mt-4">
            <TransactionsTable rows={revenues} loading={isLoading} error={tableError} onRetry={retry} kindFilter="REVENUE" highlightId={highlightId} isFiltered={isFiltered} tableId="transactions-revenues" />
          </TabsContent>
          <TabsContent value="expenses" className="mt-4">
            <TransactionsTable rows={expenses} loading={isLoading} error={tableError} onRetry={retry} kindFilter="EXPENSE" highlightId={highlightId} isFiltered={isFiltered} tableId="transactions-expenses" />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
