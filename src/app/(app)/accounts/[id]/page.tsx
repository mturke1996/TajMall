'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Landmark,
  Loader2,
  BookMarked,
  FileText,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { AccountingYearPicker } from '@/components/accounting/accounting-year-picker';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  useCategories,
  useCategoryTransactionsForMonth,
} from '@/lib/db/queries';
import { useGeneralLedger } from '@/lib/db/mall-queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { accountTypeLabelAr } from '@/lib/accounting-labels';
import { ledgerUrl } from '@/lib/accounting-nav';
import { currentYear, monthKey, monthNameAr } from '@/lib/rent-months';
import { cn, formatMoney, formatDate } from '@/lib/utils';
import { computeRunningBalances, toJournalAmount } from '@/lib/journal-entry-display';

const METHOD_AR: Record<string, string> = {
  CASH: 'نقدي',
  CHEQUE: 'صك',
  TRANSFER: 'حوالة',
  CARD: 'بطاقة',
};

const STATUS_AR: Record<string, string> = {
  POSTED: 'مرحّل',
  DRAFT: 'مسودة',
  VOIDED: 'ملغى',
  RECONCILED: 'مُسوّى',
};

type ViewMode = 'journal' | 'cash';

export default function CategoryDetailPage() {
  const params = useParams<{ id: string }>();
  const categoryId = params.id;

  const { data: categories = [], isLoading: catsLoading } = useCategories();
  const category = useMemo(
    () => categories.find((c) => c.id === categoryId),
    [categories, categoryId],
  );

  const [year, setYear] = useState(() => currentYear());
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('journal');

  const selectedMonthKey = monthKey(year, selectedMonth);
  const startDate = `${selectedMonthKey}-01`;
  const endDate = useMemo(() => {
    const [y, m] = selectedMonthKey.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return `${selectedMonthKey}-${String(last).padStart(2, '0')}`;
  }, [selectedMonthKey]);

  const { data: txs = [], isLoading: txLoading } =
    useCategoryTransactionsForMonth(categoryId, selectedMonthKey);

  const {
    data: ledgerResult,
    isLoading: ledgerLoading,
  } = useGeneralLedger(categoryId, startDate, endDate);

  const typeLabel = category ? accountTypeLabelAr(category.type) : '';
  const isRevenue = category?.type === 'REVENUE' || category?.kind === 'REVENUE';
  const isExpense = category?.type === 'EXPENSE' || category?.kind === 'EXPENSE';
  const tone: 'positive' | 'negative' | 'neutral' = isRevenue
    ? 'positive'
    : isExpense
      ? 'negative'
      : 'neutral';

  const isDebitIncrease =
    category?.type === 'ASSET' || category?.type === 'EXPENSE';

  const yearMonths = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const key = monthKey(year, i + 1);
        return { key, label: monthNameAr(key), monthIndex: i + 1 };
      }),
    [year],
  );

  const filteredTxs = useMemo(() => {
    if (!searchQuery) return txs;
    const q = searchQuery.toLowerCase();
    return txs.filter(
      (t) =>
        t.description?.toLowerCase().includes(q) ||
        String(t.number).includes(q) ||
        t.reference?.toLowerCase().includes(q) ||
        t.contact?.name?.toLowerCase().includes(q),
    );
  }, [txs, searchQuery]);

  const posted = filteredTxs.filter((t) => t.status === 'POSTED');
  const cashTotal = posted.reduce((s, t) => s + Number(t.amount || 0), 0);
  const draftCount = filteredTxs.filter((t) => t.status === 'DRAFT').length;

  const journalLines = useMemo(() => {
    const lines = ledgerResult?.lines ?? [];
    if (!searchQuery) return lines;
    const q = searchQuery.toLowerCase();
    return lines.filter(
      (l) =>
        l.description?.toLowerCase().includes(q) ||
        String(l.journal_number).includes(q) ||
        l.journal_reference?.toLowerCase().includes(q),
    );
  }, [ledgerResult?.lines, searchQuery]);

  const openingBalance = useMemo(() => {
    const od = ledgerResult?.openingDebit ?? 0;
    const oc = ledgerResult?.openingCredit ?? 0;
    return isDebitIncrease ? od - oc : oc - od;
  }, [ledgerResult, isDebitIncrease]);

  // رصيد تراكمي زمنياً ثم عرض الأحدث أولاً (مثل المصروفات)
  const journalRowsNewestFirst = useMemo(() => {
    const chronBalances =
      isDebitIncrease
        ? computeRunningBalances(journalLines, openingBalance)
        : (() => {
            let bal = openingBalance;
            return journalLines.map((line) => {
              bal += toJournalAmount(line.credit) - toJournalAmount(line.debit);
              return bal;
            });
          })();

    return journalLines
      .map((line, i) => ({ line, balance: chronBalances[i] ?? openingBalance }))
      .reverse();
  }, [journalLines, openingBalance, isDebitIncrease]);

  const periodDebit = journalLines.reduce((s, l) => s + toJournalAmount(l.debit), 0);
  const periodCredit = journalLines.reduce((s, l) => s + toJournalAmount(l.credit), 0);
  const closingBalance = journalRowsNewestFirst.length
    ? journalRowsNewestFirst[0].balance
    : openingBalance;

  const monthName = monthNameAr(selectedMonthKey);

  if (catsLoading) {
    return (
      <AccountingPageBody>
        <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-ink-mute">
          <Loader2 className="h-5 w-5 animate-spin" />
          جارٍ التحميل…
        </div>
      </AccountingPageBody>
    );
  }

  if (!category) {
    return (
      <AccountingPageBody>
        <Card className="p-8 text-center">
          <BookMarked className="mx-auto h-8 w-8 text-ink-mute" />
          <p className="mt-2 text-ink-mute">لم يتم العثور على البند</p>
          <Button className="mt-4" size="sm" asChild>
            <Link href="/accounts">العودة للبنود</Link>
          </Button>
        </Card>
      </AccountingPageBody>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="البنود المحاسبية"
        title={category.name_ar}
        description={`${typeLabel} · ${category.code}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <TajMallPdfToolbar
              fileName={`${category.code}-${selectedMonthKey}`}
              disabled={viewMode === 'cash' ? filteredTxs.length === 0 : journalLines.length === 0}
              render={async () => {
                if (viewMode === 'journal') {
                  const { LedgerReportPDF } = await import(
                    '@/features/pdf/LedgerReportPDF'
                  );
                  return (
                    <LedgerReportPDF
                      category={{
                        name_ar: category.name_ar,
                        code: category.code,
                        type: category.type,
                      }}
                      startDate={startDate}
                      endDate={endDate}
                      openingBalance={openingBalance}
                      closingBalance={closingBalance}
                      totalDebit={periodDebit}
                      totalCredit={periodCredit}
                      lines={[...journalRowsNewestFirst]
                        .reverse()
                        .map(({ line: l, balance }) => ({
                        entry_date: l.entry_date,
                        journal_number: l.journal_number,
                        journal_reference: l.journal_reference,
                        description: l.description,
                        debit: l.debit,
                        credit: l.credit,
                        runningBalance: balance,
                      }))}
                    />
                  );
                }
                const { CategoryMonthReportPDF } = await import(
                  '@/features/pdf/CategoryMonthReportPDF'
                );
                return (
                  <CategoryMonthReportPDF
                    category={category}
                    monthKey={selectedMonthKey}
                    monthNameAr={monthName}
                    rows={filteredTxs}
                  />
                );
              }}
            />
            <Button
              variant="outline"
              size="sm"
              asChild
              className="min-h-11 touch-manipulation sm:min-h-9"
            >
              <Link href={ledgerUrl(categoryId, year)}>
                <BookMarked className="h-4 w-4 stroke-[1.6]" />
                دفتر الأستاذ
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="min-h-11 touch-manipulation sm:min-h-9"
            >
              <Link href="/accounts">
                <ArrowRight className="h-4 w-4 stroke-[1.6]" />
                البنود
              </Link>
            </Button>
          </div>
        }
      />

      <AccountingPageBody className="gap-4 md:gap-5">
        <div className="surface flex items-start gap-3 p-4">
          <span
            className={cn(
              'grid h-11 w-11 shrink-0 place-items-center rounded-md border',
              tone === 'positive' &&
                'border-pastel-greenInk/15 bg-pastel-green text-pastel-greenInk',
              tone === 'negative' &&
                'border-pastel-redInk/15 bg-pastel-red text-pastel-redInk',
              tone === 'neutral' &&
                'border-sage-300/50 bg-sage-50 text-sage-700',
            )}
          >
            {tone === 'positive' ? (
              <ArrowDownToLine className="h-5 w-5 stroke-[1.6]" />
            ) : tone === 'negative' ? (
              <ArrowUpFromLine className="h-5 w-5 stroke-[1.6]" />
            ) : (
              <Landmark className="h-5 w-5 stroke-[1.6]" />
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-bold">{category.name_ar}</h2>
              <Badge variant="outline" className="text-[10px]">
                {typeLabel}
              </Badge>
            </div>
            <p className="text-[12px] text-ink-mute">
              {category.name} · كود {category.code}
            </p>
          </div>
        </div>

        <AccountingYearPicker value={year} onChange={setYear} />

        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 no-scrollbar snap-x snap-mandatory">
          {yearMonths.map((m) => {
            const active = selectedMonth === m.monthIndex;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setSelectedMonth(m.monthIndex)}
                className={cn(
                  'inline-flex shrink-0 snap-center items-center justify-center rounded-lg border px-3 py-2 text-[12.5px] font-semibold touch-manipulation min-w-[3.5rem]',
                  active
                    ? 'border-sage-700 bg-sage-700 text-white'
                    : 'border-border bg-card text-ink hover:bg-secondary',
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {/* View mode: journal (default) vs cash transactions */}
        <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-1.5">
          <button
            type="button"
            onClick={() => setViewMode('journal')}
            className={cn(
              'min-h-10 flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold touch-manipulation',
              viewMode === 'journal'
                ? 'bg-sage-700 text-white'
                : 'text-ink-mute hover:bg-secondary',
            )}
          >
            حركات القيد (مدين / دائن)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('cash')}
            className={cn(
              'min-h-10 flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold touch-manipulation',
              viewMode === 'cash'
                ? 'bg-sage-700 text-white'
                : 'text-ink-mute hover:bg-secondary',
            )}
          >
            المعاملات النقدية
          </button>
        </div>

        {viewMode === 'journal' ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard
              label="مدين الفترة"
              value={formatMoney(periodDebit, 'LYD')}
              tone="positive"
            />
            <SummaryCard
              label="دائن الفترة"
              value={formatMoney(periodCredit, 'LYD')}
              tone="negative"
            />
            <SummaryCard
              label="رصيد افتتاحي"
              value={formatMoney(openingBalance, 'LYD')}
              tone="default"
            />
            <SummaryCard
              label="رصيد ختامي"
              value={formatMoney(closingBalance, 'LYD')}
              tone="default"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard
              label={`${typeLabel} ${monthName}`}
              value={formatMoney(cashTotal, 'LYD')}
              tone={tone === 'neutral' ? 'default' : tone}
            />
            <SummaryCard
              label="عدد المعاملات"
              value={String(filteredTxs.length)}
              tone="default"
            />
            <SummaryCard
              label="معاملات مرحّلة"
              value={String(posted.length)}
              tone="default"
            />
            <SummaryCard
              label="مسودات"
              value={String(draftCount)}
              tone={draftCount > 0 ? 'warning' : 'default'}
            />
          </div>
        )}

        <div className="relative">
          <Input
            placeholder={
              viewMode === 'journal'
                ? 'بحث في البيان، رقم القيد، المرجع…'
                : 'بحث في البيان، الرقم، المرجع، الجهة…'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 text-base md:h-10 md:text-sm"
          />
        </div>

        {viewMode === 'journal' ? (
          ledgerLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-[12.5px] text-ink-mute">
              <Loader2 className="h-4 w-4 animate-spin" />
              جارٍ تحميل حركات القيد…
            </div>
          ) : journalLines.length === 0 ? (
            <Card className="p-8 text-center">
              <BookMarked className="mx-auto h-8 w-8 text-ink-mute" />
              <p className="mt-2 text-ink-mute">
                لا توجد حركات قيد مرحّلة لهذا البند خلال {monthName} {year}
              </p>
              <p className="mt-1 text-[12px] text-ink-mute">
                الحركات تظهر من دفتر اليومية المرحّل (مدين / دائن)
              </p>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[720px] border-collapse text-sm" dir="rtl">
                <thead>
                  <tr className="border-b bg-muted/40 text-[11px] font-semibold text-ink-mute">
                    <th className="px-3 py-2.5 text-start">التاريخ</th>
                    <th className="px-3 py-2.5 text-start">القيد</th>
                    <th className="px-3 py-2.5 text-start">البيان</th>
                    <th className="px-3 py-2.5 text-left text-emerald-800">مدين</th>
                    <th className="px-3 py-2.5 text-left text-rose-800">دائن</th>
                    <th className="px-3 py-2.5 text-left">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {(ledgerResult?.openingDebit || ledgerResult?.openingCredit) ? (
                    <tr className="border-b bg-canvas-sunken/40 text-[12.5px]">
                      <td className="px-3 py-2 text-ink-mute" colSpan={3}>
                        رصيد افتتاحي
                      </td>
                      <td className="px-3 py-2 text-left font-mono tabular-nums text-emerald-800" dir="ltr">
                        {(ledgerResult?.openingDebit ?? 0) > 0
                          ? formatMoney(ledgerResult!.openingDebit, 'LYD')
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-left font-mono tabular-nums text-rose-800" dir="ltr">
                        {(ledgerResult?.openingCredit ?? 0) > 0
                          ? formatMoney(ledgerResult!.openingCredit, 'LYD')
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-left font-mono tabular-nums" dir="ltr">
                        {formatMoney(openingBalance, 'LYD')}
                      </td>
                    </tr>
                  ) : null}
                  {journalRowsNewestFirst.map(({ line, balance }, i) => (
                    <tr
                      key={`${line.journal_id}-${i}`}
                      className="border-b border-border/70 hover:bg-muted/20"
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap text-[12.5px] text-ink-mute">
                        {formatDate(line.entry_date)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/journals?highlight=${line.journal_id}`}
                          className="font-medium text-sage-800 underline-offset-2 hover:underline"
                        >
                          قيد #{line.journal_number}
                        </Link>
                        {line.journal_reference && (
                          <p className="font-mono text-[10px] text-ink-mute" dir="ltr">
                            {line.journal_reference}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[13px] text-ink-main">
                        {line.description?.trim() || '—'}
                      </td>
                      <td
                        className="px-3 py-2.5 text-left font-mono tabular-nums text-emerald-800"
                        dir="ltr"
                      >
                        {line.debit > 0 ? formatMoney(line.debit, 'LYD') : '—'}
                      </td>
                      <td
                        className="px-3 py-2.5 text-left font-mono tabular-nums text-rose-800"
                        dir="ltr"
                      >
                        {line.credit > 0 ? formatMoney(line.credit, 'LYD') : '—'}
                      </td>
                      <td
                        className="px-3 py-2.5 text-left font-mono tabular-nums font-medium"
                        dir="ltr"
                      >
                        {formatMoney(balance, 'LYD')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-sage-600/40 bg-sage-50/80 font-semibold">
                    <td className="px-3 py-3 text-start" colSpan={3}>
                      إجمالي الفترة · {journalLines.length} حركة
                    </td>
                    <td className="px-3 py-3 text-left font-mono tabular-nums text-emerald-900" dir="ltr">
                      {formatMoney(periodDebit, 'LYD')}
                    </td>
                    <td className="px-3 py-3 text-left font-mono tabular-nums text-rose-900" dir="ltr">
                      {formatMoney(periodCredit, 'LYD')}
                    </td>
                    <td className="px-3 py-3 text-left font-mono tabular-nums" dir="ltr">
                      {formatMoney(closingBalance, 'LYD')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        ) : txLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-[12.5px] text-ink-mute">
            <Loader2 className="h-4 w-4 animate-spin" />
            جارٍ تحميل المعاملات…
          </div>
        ) : filteredTxs.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-ink-mute" />
            <p className="mt-2 text-ink-mute">
              لا توجد معاملات نقدية لهذا البند خلال {monthName} {year}
            </p>
          </Card>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-canvas-sunken/80 text-right text-[12px] text-ink-mute">
                    <th className="px-4 py-3 font-semibold">البيان</th>
                    <th className="px-4 py-3 font-semibold">الجهة</th>
                    <th className="px-4 py-3 font-semibold">الخزينة</th>
                    <th className="px-4 py-3 font-semibold">الطريقة</th>
                    <th className="px-4 py-3 font-semibold">الحالة</th>
                    <th className="px-4 py-3 font-semibold">التاريخ</th>
                    <th className="px-4 py-3 font-semibold text-left">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTxs.map((t, i) => (
                    <tr
                      key={t.id}
                      className={cn(
                        'border-b border-border/60',
                        i % 2 === 1 && 'bg-canvas-sunken/20',
                      )}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium">{t.description ?? '—'}</span>
                        <p className="text-[11px] text-ink-mute">
                          رقم {t.number}
                          {t.reference ? ` · ${t.reference}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[12.5px] text-ink-mute">
                        {t.contact?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[12.5px] text-ink-mute">
                        {t.cashbox?.name_ar ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[12.5px]">
                        {METHOD_AR[t.method] ?? t.method}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px]',
                            t.status === 'POSTED' && 'border-emerald-300 text-emerald-800',
                            t.status === 'DRAFT' && 'border-amber-300 text-amber-800',
                            t.status === 'VOIDED' && 'border-red-300 text-red-800',
                          )}
                        >
                          {STATUS_AR[t.status] ?? t.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-[12.5px] tabular-nums text-ink-mute">
                        {t.tx_date}
                      </td>
                      <td className="px-4 py-3 text-left font-semibold tabular-nums">
                        {formatMoney(Number(t.amount), 'LYD')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-sage-600 bg-sage-50">
                    <td className="px-4 py-3 font-bold" colSpan={6}>
                      إجمالي {typeLabel} — {monthName} {year}
                    </td>
                    <td className="px-4 py-3 text-left font-bold tabular-nums">
                      {formatMoney(cashTotal, 'LYD')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
              {filteredTxs.map((t) => (
                <Card key={t.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-[14px]">
                      {t.description ?? '—'}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 text-[10px]',
                        t.status === 'POSTED' && 'border-emerald-300 text-emerald-800',
                        t.status === 'DRAFT' && 'border-amber-300 text-amber-800',
                      )}
                    >
                      {STATUS_AR[t.status] ?? t.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[12px] text-ink-mute">
                    رقم {t.number} · {t.tx_date}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-mute">
                    {t.contact?.name ?? '—'} · {t.cashbox?.name_ar ?? '—'}
                  </p>
                  <p className="mt-2 text-[15px] font-bold tabular-nums">
                    {formatMoney(Number(t.amount), 'LYD')}
                  </p>
                </Card>
              ))}
            </div>
          </>
        )}
      </AccountingPageBody>
    </>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'default' | 'positive' | 'negative' | 'warning';
}) {
  return (
    <div
      className={cn(
        'surface flex flex-col gap-1 p-4',
        tone === 'positive' && 'border-emerald-200 bg-emerald-50/50',
        tone === 'negative' && 'border-red-200 bg-red-50/50',
        tone === 'warning' && 'border-amber-200 bg-amber-50/50',
      )}
    >
      <span className="text-[11px] text-ink-mute">{label}</span>
      <span
        className={cn(
          'text-[16px] font-bold tabular-nums',
          tone === 'positive' && 'text-emerald-800',
          tone === 'negative' && 'text-red-800',
          tone === 'warning' && 'text-amber-800',
        )}
      >
        {value}
      </span>
    </div>
  );
}
