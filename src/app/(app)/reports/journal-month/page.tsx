'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileSpreadsheet, LayoutGrid, BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { AccountingFilterCard } from '@/components/accounting/accounting-filter-card';
import { ReportPeriodFilter } from '@/components/accounting/report-period-filter';
import { AccountingSummaryGrid } from '@/components/accounting/accounting-summary-grid';
import {
  AccountingEmpty,
  AccountingError,
  AccountingLoading,
} from '@/components/accounting/accounting-states';
import { AccountingBackfillBanner } from '@/components/accounting/accounting-backfill-banner';
import { ExportCsvButton } from '@/components/data/export-csv-button';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import {
  useJournalEntriesForPeriod,
  type JournalStatus,
} from '@/lib/db/journal-queries';
import {
  fetchPeriodJournalEntry,
  formatPeriodJournalExportNames,
  type PeriodJournalEntryModel,
} from '@/lib/period-journal-entry';
import {
  formatReportPeriodLabelAr,
  parseReportPeriod,
  reportPeriodDateRange,
  reportPeriodToSearchParams,
  reportsHref,
  type ReportPeriod,
} from '@/lib/report-period';
import { formatMoney } from '@/lib/utils';

type StatusFilter = JournalStatus | 'ALL';

function JournalMonthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const period = useMemo(
    () => parseReportPeriod(searchParams),
    [searchParams],
  );

  const setPeriod = useCallback(
    (next: ReportPeriod) => {
      const params = reportPeriodToSearchParams(next);
      const status = searchParams.get('status');
      if (status) params.set('status', status);
      router.replace(`/reports/journal-month?${params.toString()}`, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const statusParam = searchParams.get('status');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    if (
      statusParam === 'ALL' ||
      statusParam === 'DRAFT' ||
      statusParam === 'REVERSED' ||
      statusParam === 'POSTED'
    ) {
      return statusParam;
    }
    return 'POSTED';
  });

  const onStatusChange = (value: StatusFilter) => {
    setStatusFilter(value);
    const params = reportPeriodToSearchParams(period);
    if (value !== 'POSTED') params.set('status', value);
    router.replace(`/reports/journal-month?${params.toString()}`, {
      scroll: false,
    });
  };

  const { startDate, endDate } = reportPeriodDateRange(period);
  const periodLabel = formatReportPeriodLabelAr(period);

  const {
    data: sourceEntries = [],
    isLoading: entriesLoading,
    isError: entriesError,
    error: entriesErr,
  } = useJournalEntriesForPeriod({
    startDate,
    endDate,
    status: statusFilter,
  });

  const [model, setModel] = useState<PeriodJournalEntryModel | null>(null);
  const [aggLoading, setAggLoading] = useState(false);
  const [aggError, setAggError] = useState<string | null>(null);

  const sourceEntryKey = useMemo(
    () => sourceEntries.map((e) => e.id).join(','),
    [sourceEntries],
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (entriesLoading) return;
      setAggLoading(true);
      setAggError(null);
      try {
        const next = await fetchPeriodJournalEntry({
          period,
          entries: sourceEntries,
          statusFilter,
        });
        if (!cancelled) setModel(next);
      } catch (e) {
        if (!cancelled) {
          setAggError(e instanceof Error ? e.message : 'تعذّر تجميع القيد');
          setModel(null);
        }
      } finally {
        if (!cancelled) setAggLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
    // sourceEntryKey يغطي تغيّر قائمة القيود دون إعادة طلب لا نهائية
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sourceEntries عبر المصدر sourceEntryKey
  }, [entriesLoading, sourceEntryKey, period.year, period.month, period.mode, statusFilter]);

  const isLoading = entriesLoading || aggLoading;
  const isError = entriesError || !!aggError;
  const errorMessage =
    (entriesErr instanceof Error ? entriesErr.message : undefined) || aggError;

  const exportNames = useMemo(
    () => formatPeriodJournalExportNames(period, model),
    [period, model],
  );

  const csvRows = useMemo(
    () =>
      (model?.lines ?? []).map((l) => [
        l.category_code,
        l.category_name,
        l.debit,
        l.credit,
        l.net,
      ]),
    [model],
  );

  const pdfFileName = exportNames.fileName;

  return (
    <>
      <PageHeader
        eyebrow="مركز التقارير"
        title="قيد الفترة المحاسبي"
        description={`قيد واحد ملخّص — كل بند بإجمالي حركته · ${periodLabel}`}
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href={reportsHref('/reports', period)}>
                <LayoutGrid className="h-4 w-4" />
                مركز التقارير
              </Link>
            </Button>
            <ExportCsvButton
              fileName={pdfFileName}
              headers={['الرمز', 'البند', 'مدين', 'دائن', 'الصافي']}
              rows={csvRows}
              disabled={!model || model.lines.length === 0}
            />
            <TajMallPdfToolbar
              fileName={pdfFileName}
              shareTitle={exportNames.shareTitle}
              shareText={exportNames.shareText}
              cacheKey={`pje:${startDate}:${endDate}:${statusFilter}:${model?.lines.length ?? 0}:${model?.totalDebit ?? 0}`}
              disabled={isLoading || !model || model.lines.length === 0}
              render={async () => {
                const { PeriodJournalEntryPDF } = await import(
                  '@/features/pdf/PeriodJournalEntryPDF'
                );
                if (!model) throw new Error('لا توجد بيانات للقيد');
                return (
                  <PeriodJournalEntryPDF
                    model={model}
                    documentTitle={exportNames.documentTitle}
                  />
                );
              }}
            />
          </>
        }
      />

      <AccountingPageBody>
        <AccountingBackfillBanner />

        <AccountingFilterCard>
          <div className="space-y-4">
            <ReportPeriodFilter value={period} onChange={setPeriod} />
            <div className="max-w-xs space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                مصدر التجميع
              </p>
              <Select
                value={statusFilter}
                onValueChange={(v) => onStatusChange(v as StatusFilter)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POSTED">قيود مرحّلة فقط</SelectItem>
                  <SelectItem value="ALL">كل الحالات</SelectItem>
                  <SelectItem value="DRAFT">مسودات</SelectItem>
                  <SelectItem value="REVERSED">معكوس / ملغى</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </AccountingFilterCard>

        {isLoading ? (
          <AccountingLoading />
        ) : isError ? (
          <AccountingError
            title="تعذّر بناء قيد الفترة"
            message={errorMessage ?? undefined}
          />
        ) : !model || model.lines.length === 0 ? (
          <AccountingEmpty
            icon={BookOpen}
            title="لا توجد حركة لبناء القيد"
            description="اختر شهراً فيه قيود مرحّلة، أو غيّر فلتر المصدر."
          >
            <Button size="sm" asChild>
              <Link href="/journals">دفتر اليومية</Link>
            </Button>
          </AccountingEmpty>
        ) : (
          <>
            <AccountingSummaryGrid
              stats={[
                {
                  label: 'بنود القيد',
                  value: model.lines.length,
                  currency: '',
                },
                {
                  label: 'إجمالي المدين',
                  value: model.totalDebit,
                  tone: 'positive',
                },
                {
                  label: 'إجمالي الدائن',
                  value: model.totalCredit,
                  tone: 'negative',
                },
                {
                  label: 'فرق التوازن',
                  value: Math.abs(model.totalDebit - model.totalCredit),
                  tone: model.balanced ? 'positive' : 'negative',
                },
              ]}
            />

            <Card className="border-sage-600/30">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b pb-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileSpreadsheet className="h-4 w-4 text-sage-700" />
                    {model.title}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    مبني على {model.sourceEntryCount} قيد مصدر ·{' '}
                    {model.sourceLineCount} بند تفصيلي → {model.lines.length} بند
                    ملخّص
                  </p>
                </div>
                <Badge
                  variant={model.balanced ? 'success' : 'danger'}
                  className="font-normal normal-case tracking-normal"
                >
                  {model.balanced ? 'قيد متوازن' : 'غير متوازن'}
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-muted-foreground">
                        <th className="px-4 py-2.5 text-right font-medium">
                          الرمز
                        </th>
                        <th className="px-4 py-2.5 text-right font-medium">
                          البند المحاسبي
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium">
                          مدين
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium">
                          دائن
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium">
                          الصافي
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.lines.map((line) => (
                        <tr
                          key={line.category_id}
                          className="border-b last:border-0 hover:bg-muted/30"
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                            {line.category_code || '—'}
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="font-semibold">{line.category_name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              إجمالي حركة الفترة
                            </p>
                          </td>
                          <td className="px-4 py-2.5 text-left font-mono tabular-nums text-emerald-700">
                            {line.debit > 0
                              ? formatMoney(line.debit, '')
                              : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-left font-mono tabular-nums text-red-600">
                            {line.credit > 0
                              ? formatMoney(line.credit, '')
                              : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-left font-mono tabular-nums">
                            {formatMoney(Math.abs(line.net), '')}
                            <span className="mr-1 text-[10px] text-muted-foreground">
                              {line.net > 0.005
                                ? 'مدين'
                                : line.net < -0.005
                                  ? 'دائن'
                                  : ''}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-sage-50/80 font-bold">
                        <td
                          colSpan={2}
                          className="px-4 py-3 text-right text-sm"
                        >
                          إجمالي القيد
                        </td>
                        <td className="px-4 py-3 text-left font-mono tabular-nums text-emerald-800">
                          {formatMoney(model.totalDebit, '')}
                        </td>
                        <td className="px-4 py-3 text-left font-mono tabular-nums text-red-700">
                          {formatMoney(model.totalCredit, '')}
                        </td>
                        <td className="px-4 py-3 text-left font-mono tabular-nums">
                          {formatMoney(
                            Math.abs(model.totalDebit - model.totalCredit),
                            '',
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </AccountingPageBody>
    </>
  );
}

export default function JournalMonthReportPage() {
  return (
    <Suspense
      fallback={
        <AccountingPageBody>
          <AccountingLoading />
        </AccountingPageBody>
      }
    >
      <JournalMonthContent />
    </Suspense>
  );
}
