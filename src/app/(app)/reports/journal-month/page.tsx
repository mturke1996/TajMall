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
  applyPeriodJournalCategoryFilter,
  formatPeriodJournalExportNames,
  buildContraLinesForFocus,
  periodLineCashboxKindsLabel,
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
import { useCategories } from '@/lib/db/queries';
import { formatMoney } from '@/lib/utils';

type StatusFilter = JournalStatus | 'ALL';
const ALL_CATEGORIES = 'all';

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
      const category = searchParams.get('category');
      if (status) params.set('status', status);
      if (category) params.set('category', category);
      router.replace(`/reports/journal-month?${params.toString()}`, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const categoryParam = searchParams.get('category');
  const [categoryFilterId, setCategoryFilterId] = useState<string>(() =>
    categoryParam && categoryParam !== ALL_CATEGORIES ? categoryParam : ALL_CATEGORIES,
  );

  const { data: categories = [], isLoading: categoriesLoading } = useCategories();

  useEffect(() => {
    if (categoryParam && categoryParam !== ALL_CATEGORIES) {
      setCategoryFilterId(categoryParam);
    } else if (!categoryParam) {
      setCategoryFilterId(ALL_CATEGORIES);
    }
  }, [categoryParam]);

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

  const onCategoryChange = (value: string) => {
    setCategoryFilterId(value);
    const params = reportPeriodToSearchParams(period);
    if (statusFilter !== 'POSTED') params.set('status', statusFilter);
    if (value !== ALL_CATEGORIES) params.set('category', value);
    router.replace(`/reports/journal-month?${params.toString()}`, {
      scroll: false,
    });
  };

  const onStatusChange = (value: StatusFilter) => {
    setStatusFilter(value);
    const params = reportPeriodToSearchParams(period);
    if (value !== 'POSTED') params.set('status', value);
    if (categoryFilterId !== ALL_CATEGORIES) params.set('category', categoryFilterId);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sourceEntries عبر sourceEntryKey
  }, [entriesLoading, sourceEntryKey, period.year, period.month, period.mode, statusFilter]);

  const selectedCategory = useMemo(
    () =>
      categoryFilterId === ALL_CATEGORIES
        ? null
        : categories.find((c) => c.id === categoryFilterId) ?? null,
    [categories, categoryFilterId],
  );

  const displayModel = useMemo(() => {
    if (!model) return null;
    return applyPeriodJournalCategoryFilter(
      model,
      categoryFilterId,
      selectedCategory
        ? {
            id: selectedCategory.id,
            code: selectedCategory.code,
            name_ar: selectedCategory.name_ar,
            type: selectedCategory.type,
          }
        : null,
    );
  }, [model, categoryFilterId, selectedCategory]);

  /** دائماً النموذج الشامل — لزر تقرير شامل PDF */
  const comprehensiveModel = useMemo(() => {
    if (!model) return null;
    return applyPeriodJournalCategoryFilter(model, ALL_CATEGORIES, null);
  }, [model]);

  const isSingleCategoryView = categoryFilterId !== ALL_CATEGORIES;
  const isLoading = entriesLoading || aggLoading || categoriesLoading;
  const isError = entriesError || !!aggError;
  const errorMessage =
    (entriesErr instanceof Error ? entriesErr.message : undefined) || aggError;

  const exportNames = useMemo(
    () => formatPeriodJournalExportNames(period, displayModel),
    [period, displayModel],
  );

  const comprehensiveExportNames = useMemo(
    () => formatPeriodJournalExportNames(period, comprehensiveModel),
    [period, comprehensiveModel],
  );

  const csvRows = useMemo(
    () =>
      (displayModel?.lines ?? []).map((l) => [
        l.category_code,
        l.category_name,
        periodLineCashboxKindsLabel(l),
        l.debit,
        l.credit,
        l.net,
      ]),
    [displayModel],
  );

  const renderComprehensivePdf = useCallback(async () => {
    const { PeriodJournalEntryPDF } = await import(
      '@/features/pdf/PeriodJournalEntryPDF'
    );
    if (!comprehensiveModel) throw new Error('لا توجد بيانات للقيد');
    return (
      <PeriodJournalEntryPDF
        model={comprehensiveModel}
        documentTitle={comprehensiveExportNames.documentTitle}
      />
    );
  }, [comprehensiveModel, comprehensiveExportNames.documentTitle]);

  const renderCategoryPdf = useCallback(async () => {
    const { PeriodJournalEntryPDF } = await import(
      '@/features/pdf/PeriodJournalEntryPDF'
    );
    if (!displayModel) throw new Error('لا توجد بيانات للقيد');
    return (
      <PeriodJournalEntryPDF
        model={displayModel}
        documentTitle={exportNames.documentTitle}
      />
    );
  }, [displayModel, exportNames.documentTitle]);

  const comprehensivePdfDisabled =
    isLoading || !comprehensiveModel || comprehensiveModel.lines.length === 0;
  const categoryPdfDisabled =
    isLoading || !displayModel || displayModel.lines.length === 0;

  return (
    <>
      <PageHeader
        eyebrow="مركز التقارير"
        title="قيد الفترة المحاسبي"
        description={
          isSingleCategoryView && displayModel?.categoryFilter
            ? `كشف بند: ${displayModel.categoryFilter.name_ar} · ${periodLabel}`
            : `تقرير شامل — مجاميع ثم مجموع كل بند (مدين + خزينة) · ${periodLabel}`
        }
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href={reportsHref('/reports', period)}>
                <LayoutGrid className="h-4 w-4" />
                مركز التقارير
              </Link>
            </Button>
            <ExportCsvButton
              fileName={exportNames.fileName}
              headers={['الرمز', 'البند', 'الخزينة', 'مدين', 'دائن', 'الصافي']}
              rows={csvRows}
              disabled={categoryPdfDisabled}
            />
            <TajMallPdfToolbar
              fileName={comprehensiveExportNames.fileName}
              shareTitle={comprehensiveExportNames.shareTitle}
              shareText={comprehensiveExportNames.shareText}
              cacheKey={`pje-comp:${startDate}:${endDate}:${statusFilter}:${comprehensiveModel?.lines.length ?? 0}:${comprehensiveModel?.totalDebit ?? 0}`}
              disabled={comprehensivePdfDisabled}
              openLabel="تقرير شامل PDF"
              render={renderComprehensivePdf}
            />
            {isSingleCategoryView ? (
              <TajMallPdfToolbar
                fileName={exportNames.fileName}
                shareTitle={exportNames.shareTitle}
                shareText={exportNames.shareText}
                cacheKey={`pje-cat:${startDate}:${endDate}:${statusFilter}:${categoryFilterId}:${displayModel?.lines.length ?? 0}:${displayModel?.totalDebit ?? 0}`}
                disabled={categoryPdfDisabled}
                openLabel="كشف البند PDF"
                render={renderCategoryPdf}
              />
            ) : null}
          </>
        }
      />

      <AccountingPageBody>
        <AccountingFilterCard>
          <div className="space-y-4">
            <ReportPeriodFilter value={period} onChange={setPeriod} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  البند المحاسبي
                </p>
                <Select value={categoryFilterId} onValueChange={onCategoryChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="جميع البنود" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_CATEGORIES}>جميع البنود</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.code} — {cat.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {isSingleCategoryView
                    ? 'بند واحد: كشف مزدوج كامل (مدين + دائن + الطرف المقابل).'
                    : 'جميع البنود: مجاميع ثم مجموع كل بند على حدة (مدين البند + دائن الخزينة) — بدون تفصيل القيود.'}
                </p>
              </div>
              <div className="space-y-2">
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
          </div>
        </AccountingFilterCard>

        {isLoading ? (
          <AccountingLoading />
        ) : isError ? (
          <AccountingError
            title="تعذّر بناء قيد الفترة"
            message={errorMessage ?? undefined}
          />
        ) : !displayModel || displayModel.lines.length === 0 ? (
          <AccountingEmpty
            icon={BookOpen}
            title={
              displayModel?.categoryFilter
                ? 'لا حركة على هذا البند'
                : 'لا توجد حركة لبناء القيد'
            }
            description={
              displayModel?.categoryFilter
                ? `البند «${displayModel.categoryFilter.name_ar}» لم يتحرك في ${periodLabel}.`
                : 'اختر شهراً فيه قيود مرحّلة، أو غيّر فلتر المصدر.'
            }
          >
            {displayModel?.categoryFilter ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onCategoryChange(ALL_CATEGORIES)}
              >
                عرض جميع البنود
              </Button>
            ) : (
              <>
                <AccountingBackfillBanner
                  title="قد توجد معاملات غير مرحّلة"
                  description="إن كانت لديك معاملات قديمة ولم تظهر هنا، اضغط ترحيل لإنشاء قيودها في دفتر اليومية."
                />
                <Button size="sm" asChild>
                  <Link href="/journals">دفتر اليومية</Link>
                </Button>
              </>
            )}
          </AccountingEmpty>
        ) : (
          <>
            <AccountingSummaryGrid
              stats={[
                {
                  label: displayModel.categoryFilter ? 'قيود مرتبطة' : 'بنود تحرّكت',
                  value: displayModel.categoryFilter
                    ? displayModel.vouchers.length
                    : displayModel.lines.length,
                  currency: '',
                },
                {
                  label: 'إجمالي المدين',
                  value: displayModel.totalDebit,
                  tone: 'positive',
                },
                {
                  label: 'إجمالي الدائن',
                  value: displayModel.totalCredit,
                  tone: 'negative',
                },
                {
                  label: 'فرق التوازن',
                  value: Math.abs(displayModel.totalDebit - displayModel.totalCredit),
                  tone: displayModel.balanced ? 'positive' : 'negative',
                },
              ]}
            />

            <Card className="border-sage-600/30">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b pb-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileSpreadsheet className="h-4 w-4 text-sage-700" />
                    {displayModel.title}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {displayModel.categoryFilter
                      ? `كشف مزدوج · ${displayModel.categoryFilter.code}`
                      : `مجاميع ${displayModel.lines.length} بند · ثم مجموع كل بند`}
                  </p>
                </div>
                <Badge
                  variant={displayModel.balanced ? 'success' : 'danger'}
                  className="font-normal normal-case tracking-normal"
                >
                  {displayModel.balanced ? 'متوازن — مدين = دائن' : 'غير متوازن'}
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-muted-foreground">
                        <th className="px-4 py-2.5 text-right font-medium">الرمز</th>
                        <th className="px-4 py-2.5 text-right font-medium">البند المحاسبي</th>
                        <th className="px-4 py-2.5 text-right font-medium">الخزينة</th>
                        <th className="px-4 py-2.5 text-left font-medium">مدين</th>
                        <th className="px-4 py-2.5 text-left font-medium">دائن</th>
                        <th className="px-4 py-2.5 text-left font-medium">الصافي</th>
                        {displayModel.categoryFilter ? (
                          <th className="px-4 py-2.5 text-left font-medium">حركات</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {displayModel.lines.map((line) => (
                        <tr
                          key={line.rowKey}
                          className="border-b last:border-0 hover:bg-muted/30"
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                            {line.category_code || '—'}
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="font-semibold">
                              {line.cashbox_name
                                ? line.cashbox_name
                                : line.category_name}
                              {displayModel.categoryFilter?.id === line.category_id
                                ? ' ★'
                                : ''}
                            </p>
                            {line.cashbox_name ? (
                              <p className="text-[11px] text-muted-foreground">
                                {line.category_name}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {periodLineCashboxKindsLabel(line)}
                          </td>
                          <td className="px-4 py-2.5 text-left font-mono tabular-nums text-emerald-700 font-semibold">
                            {formatMoney(line.debit, '')}
                          </td>
                          <td className="px-4 py-2.5 text-left font-mono tabular-nums text-red-600 font-semibold">
                            {formatMoney(line.credit, '')}
                          </td>
                          <td className="px-4 py-2.5 text-left font-mono tabular-nums">
                            {formatMoney(Math.abs(line.net), '')}
                          </td>
                          {displayModel.categoryFilter ? (
                            <td className="px-4 py-2.5 text-left tabular-nums text-muted-foreground">
                              {line.movements.length}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-sage-50/80 font-bold">
                        <td colSpan={3} className="px-4 py-3 text-right text-sm">
                          الإجمالي
                        </td>
                        <td className="px-4 py-3 text-left font-mono tabular-nums text-emerald-800">
                          {formatMoney(displayModel.totalDebit, '')}
                        </td>
                        <td className="px-4 py-3 text-left font-mono tabular-nums text-red-700">
                          {formatMoney(displayModel.totalCredit, '')}
                        </td>
                        <td className="px-4 py-3 text-left font-mono tabular-nums">
                          {formatMoney(
                            Math.abs(
                              displayModel.totalDebit - displayModel.totalCredit,
                            ),
                            '',
                          )}
                        </td>
                        {displayModel.categoryFilter ? (
                          <td className="px-4 py-3 text-left tabular-nums text-muted-foreground font-normal">
                            {displayModel.sourceLineCount}
                          </td>
                        ) : null}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>

            {displayModel.categoryFilter
              ? displayModel.vouchers.map((voucher, vIndex) => (
                  <Card key={voucher.journal_id} className="border-border/80">
                    <CardHeader className="border-b pb-3 space-y-0">
                      <CardTitle className="text-base">
                        {vIndex + 1}/{displayModel.vouchers.length} · قيد #
                        {voucher.journal_number} · {voucher.entry_date}
                      </CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {voucher.journal_description || 'قيد مزدوج'}
                        {voucher.balanced ? ' · متوازن' : ' · غير متوازن'}
                        {(() => {
                          const boxes = [
                            ...new Set(
                              voucher.lines
                                .map((vl) => vl.cashbox_name?.trim())
                                .filter(Boolean),
                            ),
                          ];
                          return boxes.length ? ` · ${boxes.join('، ')}` : '';
                        })()}
                      </p>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/40 text-muted-foreground">
                              <th className="px-4 py-2.5 text-right font-medium">الرمز</th>
                              <th className="px-4 py-2.5 text-right font-medium">البند</th>
                              <th className="px-4 py-2.5 text-right font-medium">الخزينة</th>
                              <th className="px-4 py-2.5 text-left font-medium">مدين</th>
                              <th className="px-4 py-2.5 text-left font-medium">دائن</th>
                            </tr>
                          </thead>
                          <tbody>
                            {voucher.lines.map((vl, i) => (
                              <tr
                                key={`${voucher.journal_id}-${vl.category_id}-${i}`}
                                className="border-b last:border-0 hover:bg-muted/30"
                              >
                                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                                  {vl.category_code || '—'}
                                </td>
                                <td className="px-4 py-2.5">
                                  <p className="font-semibold">
                                    {vl.category_name}
                                    {vl.is_focus ? ' ★' : ''}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {[
                                      vl.line_description,
                                      vl.contact_name && `جهة: ${vl.contact_name}`,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ') || '—'}
                                  </p>
                                </td>
                                <td className="px-4 py-2.5 text-xs font-medium text-ink">
                                  {vl.cashbox_name?.trim() || '—'}
                                </td>
                                <td className="px-4 py-2.5 text-left font-mono tabular-nums text-emerald-700 font-semibold">
                                  {formatMoney(vl.debit, '')}
                                </td>
                                <td className="px-4 py-2.5 text-left font-mono tabular-nums text-red-600 font-semibold">
                                  {formatMoney(vl.credit, '')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-sage-50/80 font-bold">
                              <td colSpan={3} className="px-4 py-3 text-right text-sm">
                                {voucher.balanced
                                  ? 'إجمالي القيد — مدين = دائن'
                                  : 'إجمالي القيد — فرق'}
                              </td>
                              <td className="px-4 py-3 text-left font-mono tabular-nums text-emerald-800">
                                {formatMoney(voucher.totalDebit, '')}
                              </td>
                              <td className="px-4 py-3 text-left font-mono tabular-nums text-red-700">
                                {formatMoney(voucher.totalCredit, '')}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                ))
              : model
                ? displayModel.lines.map((line, lineIndex) => {
                    const focusLine = line;
                    const contraLines = buildContraLinesForFocus(model, focusLine);
                    const cashboxCredit = contraLines.reduce(
                      (s, l) => s + l.credit,
                      0,
                    );
                    const totalDebit =
                      focusLine.debit +
                      contraLines.reduce((s, l) => s + l.debit, 0);
                    const totalCredit =
                      focusLine.credit +
                      contraLines.reduce((s, l) => s + l.credit, 0);
                    const balanced =
                      Math.abs(totalDebit - totalCredit) <= 0.005;

                    return (
                      <Card
                        key={line.rowKey}
                        className="border-border/80"
                      >
                        <CardHeader className="border-b pb-3 space-y-0">
                          <CardTitle className="text-base">
                            {lineIndex + 1}/{displayModel.lines.length} ·{' '}
                            {line.category_code || '—'} —{' '}
                            {line.cashbox_name || line.category_name}
                          </CardTitle>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {line.cashbox_name
                              ? `${line.category_name} · `
                              : ''}
                            مجموع البند فقط · مدين{' '}
                            {formatMoney(focusLine.debit, '')} · دائن خزينة{' '}
                            {formatMoney(cashboxCredit, '')}
                            {balanced ? ' · متوازن' : ' · مراجعة'} ·{' '}
                            {focusLine.movements.length} حركة مصدر
                          </p>
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
                                    الحساب
                                  </th>
                                  <th className="px-4 py-2.5 text-right font-medium">
                                    الدور
                                  </th>
                                  <th className="px-4 py-2.5 text-left font-medium">
                                    مدين
                                  </th>
                                  <th className="px-4 py-2.5 text-left font-medium">
                                    دائن
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-b bg-sage-50/40">
                                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                                    {focusLine.category_code || '—'}
                                  </td>
                                  <td className="px-4 py-2.5 font-semibold">
                                    {focusLine.cashbox_name ||
                                      focusLine.category_name}{' '}
                                    ★
                                  </td>
                                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                    مدين البند
                                  </td>
                                  <td className="px-4 py-2.5 text-left font-mono tabular-nums text-emerald-700 font-semibold">
                                    {formatMoney(focusLine.debit, '')}
                                  </td>
                                  <td className="px-4 py-2.5 text-left font-mono tabular-nums text-red-600 font-semibold">
                                    {formatMoney(focusLine.credit, '')}
                                  </td>
                                </tr>
                                {contraLines.map((cl) => (
                                  <tr
                                    key={cl.rowKey}
                                    className="border-b last:border-0 hover:bg-muted/30"
                                  >
                                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                                      {cl.category_code || '—'}
                                    </td>
                                    <td className="px-4 py-2.5 font-semibold">
                                      {cl.cashbox_name || cl.category_name}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                      {cl.credit > 0
                                        ? 'دائن الخزينة'
                                        : 'طرف مقابل'}
                                    </td>
                                    <td className="px-4 py-2.5 text-left font-mono tabular-nums text-emerald-700 font-semibold">
                                      {formatMoney(cl.debit, '')}
                                    </td>
                                    <td className="px-4 py-2.5 text-left font-mono tabular-nums text-red-600 font-semibold">
                                      {formatMoney(cl.credit, '')}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-sage-50/80 font-bold">
                                  <td
                                    colSpan={3}
                                    className="px-4 py-3 text-right text-sm"
                                  >
                                    {balanced
                                      ? 'مجموع القيد — مدين = دائن'
                                      : 'مجموع القيد — فرق'}
                                  </td>
                                  <td className="px-4 py-3 text-left font-mono tabular-nums text-emerald-800">
                                    {formatMoney(totalDebit, '')}
                                  </td>
                                  <td className="px-4 py-3 text-left font-mono tabular-nums text-red-700">
                                    {formatMoney(totalCredit, '')}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                : null}
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
