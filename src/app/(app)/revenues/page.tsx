'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { TrendingUp, ArrowDownToLine, Receipt, BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { DataToolbar, type DateRangePreset, getDateRange } from '@/components/data/toolbar';
import { TransactionsTable } from '@/components/data/transactions-table';
import { Stat } from '@/components/dashboard/stat';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
import { useTransactions } from '@/lib/db/queries';
import { fetchPeriodRevenueCompare } from '@/lib/db/period-revenue-compare';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { useHighlightScroll } from '@/lib/hooks/use-highlight-scroll';
import { transactionHighlightDomId } from '@/components/data/transactions-table';
import { formatMoney } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function RevenuesPage() {
  const highlightId = useSearchParams().get('highlight');
  const [query, setQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const [methodFilter, setMethodFilter] = useState<'ALL' | 'CASH' | 'CHEQUE'>('ALL');
  const { data, isLoading } = useTransactions('REVENUE');
  const [accruedRent, setAccruedRent] = useState<number | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

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

  const rentCash = dateFiltered
    .filter((r) => r.category?.code === 'REV-RNT')
    .reduce((s, r) => s + Number(r.amount), 0);

  const { from, to } = getDateRange(datePreset);
  const periodBounded = !!(from && to);

  useEffect(() => {
    if (!periodBounded || !from || !to) {
      setAccruedRent(null);
      return;
    }
    let cancelled = false;
    const start = from.toISOString().slice(0, 10);
    const end = to.toISOString().slice(0, 10);
    setCompareLoading(true);
    void fetchPeriodRevenueCompare(start, end)
      .then((cmp) => {
        if (!cancelled) setAccruedRent(cmp.accruedRent);
      })
      .catch(() => {
        if (!cancelled) setAccruedRent(null);
      })
      .finally(() => {
        if (!cancelled) setCompareLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [periodBounded, datePreset, from, to]);

  const journalMonthHref =
    periodBounded && from
      ? `/reports/journal-month?year=${from.getFullYear()}&month=${from.getMonth() + 1}`
      : '/reports/journal-month';

  return (
    <>
      <PageHeader
        eyebrow="الإيرادات"
        title="التحصيل النقدي للإيرادات"
        description="ما دخل الخزينة/المصرف فعلياً (معاملات). إيراد الإيجار المستحق محاسبياً يظهر في قيد الفترة وقد يختلف إن سُدِّدت متأخرات أشهر أخرى."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href={journalMonthHref}>
                <BookOpen className="me-1.5 h-3.5 w-3.5" />
                قيد الفترة
              </Link>
            </Button>
            <TajMallPdfToolbar
              fileName={`إيرادات-${new Date().toISOString().slice(0, 10)}`}
              disabled={filtered.length === 0}
              render={async () => {
                const { TransactionsReportPDF } = await import(
                  '@/features/pdf/TransactionsReportPDF'
                );
                return (
                  <TransactionsReportPDF
                    titleAr="كشف التحصيل النقدي للإيرادات"
                    subtitleAr={`عدد المعاملات: ${filtered.length} — بحسب عرض القائمة الحالي`}
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
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="إجمالي التحصيل"
            value={total}
            currency="LYD"
            icon={TrendingUp}
            loading={isLoading}
            color="emerald"
            onClick={() => setMethodFilter('ALL')}
            active={methodFilter === 'ALL'}
          />
          <Stat
            label="تحصيل نقدي"
            value={cashTotal}
            currency="LYD"
            icon={ArrowDownToLine}
            loading={isLoading}
            color="blue"
            onClick={() => setMethodFilter('CASH')}
            active={methodFilter === 'CASH'}
          />
          <Stat
            label="تحصيل بصكوك"
            value={chequeTotal}
            currency="LYD"
            icon={Receipt}
            loading={isLoading}
            color="amber"
            onClick={() => setMethodFilter('CHEQUE')}
            active={methodFilter === 'CHEQUE'}
          />
        </section>

        {periodBounded ? (
          <div className="rounded-xl border border-sage-600/25 bg-sage-50/60 px-4 py-3 text-sm text-ink">
            <p className="font-semibold text-sage-900">لماذا يختلف رقم الإيرادات عن قيد الفترة؟</p>
            <p className="mt-1.5 leading-relaxed text-ink-mute">
              تحصيل إيجار في الفترة:{' '}
              <span className="font-semibold text-ink">{formatMoney(rentCash, 'LYD')}</span>
              {' · '}
              إيراد إيجار مستحق (قيود REV-RNT):{' '}
              <span className="font-semibold text-ink">
                {compareLoading
                  ? '…'
                  : accruedRent != null
                    ? formatMoney(accruedRent, 'LYD')
                    : '—'}
              </span>
              . التحصيل قد يشمل متأخرات أشهر سابقة؛ قيد الفترة يعترف بإيجار الشهر المستحق فقط.
            </p>
            <Link
              href={journalMonthHref}
              className="mt-2 inline-block text-[13px] font-medium text-sage-800 underline-offset-2 hover:underline"
            >
              فتح قيد الفترة لنفس الشهر
            </Link>
          </div>
        ) : null}

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
    </>
  );
}
