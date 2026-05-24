'use client';

import { useMemo, useState } from 'react';
import { TrendingUp, ArrowDownToLine, Receipt, Calendar } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { DataToolbar, type DateRangePreset, getDateRange } from '@/components/data/toolbar';
import { TransactionsTable } from '@/components/data/transactions-table';
import { Stat } from '@/components/dashboard/stat';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
import { useTransactions } from '@/lib/db/queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';

export default function RevenuesPage() {
  const [query, setQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const { data, isLoading } = useTransactions('REVENUE');

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

  // Stats computed from date-filtered rows (not search-filtered)
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
            <TajMallPdfToolbar
              fileName={`إيرادات-${new Date().toISOString().slice(0, 10)}`}
              disabled={filtered.length === 0}
              render={async () => {
                const { TransactionsReportPDF } = await import('@/features/pdf/TransactionsReportPDF');
                return (
                  <TransactionsReportPDF
                    titleAr="كشف الإيرادات"
                    subtitleAr={`عدد القيود: ${filtered.length} — بحسب عرض القائمة الحالي`}
                    rows={filtered}
                  />
                );
              }}
            />
            <NewTransactionButton kind="REVENUE" label="إيراد جديد" />
          </div>
        }
      />

      <div className="flex flex-col gap-5 px-4 py-5 sm:px-5 sm:py-6 md:px-8 md:py-7">
        {/* Stats */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="إجمالي الإيرادات"
            value={total}
            currency="LYD"
            icon={TrendingUp}
            loading={isLoading}
            color="emerald"
          />
          <Stat
            label="الإيرادات النقدية"
            value={cashTotal}
            currency="LYD"
            icon={ArrowDownToLine}
            loading={isLoading}
            color="blue"
          />
          <Stat
            label="إيرادات الصكوك"
            value={chequeTotal}
            currency="LYD"
            icon={Receipt}
            loading={isLoading}
            color="amber"
          />
        </section>

        {/* Toolbar with search + date filter */}
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
        />
      </div>
    </>
  );
}
