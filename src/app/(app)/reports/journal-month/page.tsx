'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FileSpreadsheet,
  LayoutGrid,
  BookOpen,
  Layers,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { type JournalStatus } from '@/lib/db/journal-queries';
import {
  fetchPeriodJournalEntry,
  applyPeriodJournalCategoryFilter,
  formatPeriodJournalExportNames,
  buildCashBankSeparatedSections,
  buildContraLinesForFocus,
  describePeriodJournalSectionDisplay,
  periodLineCashboxKindsLabel,
  isPeriodJournalGroupByType,
  parsePeriodJournalTypeFilter,
  PERIOD_JOURNAL_GROUP_BY_TYPE,
  PERIOD_JOURNAL_TYPE_REVENUE,
  PERIOD_JOURNAL_TYPE_EXPENSE,
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
import { formatMoney, cn } from '@/lib/utils';

type StatusFilter = JournalStatus | 'ALL';
const ALL_CATEGORIES = 'all';

type ViewMode =
  | typeof ALL_CATEGORIES
  | typeof PERIOD_JOURNAL_GROUP_BY_TYPE
  | typeof PERIOD_JOURNAL_TYPE_REVENUE
  | typeof PERIOD_JOURNAL_TYPE_EXPENSE;

const VIEW_MODE_OPTIONS: Array<{
  value: ViewMode;
  label: string;
  shortLabel: string;
  icon: typeof Layers;
}> = [
  {
    value: ALL_CATEGORIES,
    label: 'كل بند على حدة',
    shortLabel: 'كل البنود',
    icon: LayoutGrid,
  },
  {
    value: PERIOD_JOURNAL_GROUP_BY_TYPE,
    label: 'إيرادات معاً ومصاريف معاً',
    shortLabel: 'إيراد+مصروف',
    icon: Layers,
  },
  {
    value: PERIOD_JOURNAL_TYPE_REVENUE,
    label: 'جميع الإيرادات معاً',
    shortLabel: 'الإيرادات',
    icon: TrendingUp,
  },
  {
    value: PERIOD_JOURNAL_TYPE_EXPENSE,
    label: 'جميع المصاريف معاً',
    shortLabel: 'المصاريف',
    icon: TrendingDown,
  },
];

function isViewMode(value: string): value is ViewMode {
  return VIEW_MODE_OPTIONS.some((o) => o.value === value);
}

function isSpecialCategoryFilter(value: string): boolean {
  return (
    isPeriodJournalGroupByType(value) || parsePeriodJournalTypeFilter(value) != null
  );
}

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

  useEffect(() => {
    if (
      statusParam === 'ALL' ||
      statusParam === 'DRAFT' ||
      statusParam === 'REVERSED' ||
      statusParam === 'POSTED'
    ) {
      setStatusFilter(statusParam);
    } else if (!statusParam) {
      setStatusFilter('POSTED');
    }
  }, [statusParam]);

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

  const isGroupedTypeView = isPeriodJournalGroupByType(categoryFilterId);
  const accountTypeFilter = parsePeriodJournalTypeFilter(categoryFilterId);
  const isTypeAggregateView = accountTypeFilter != null;
  const isAggregateView = isGroupedTypeView || isTypeAggregateView;

  const { startDate, endDate } = reportPeriodDateRange(period);
  const periodLabel = formatReportPeriodLabelAr(period);

  const selectedCategory = useMemo(
    () =>
      categoryFilterId === ALL_CATEGORIES || isSpecialCategoryFilter(categoryFilterId)
        ? null
        : categories.find((c) => c.id === categoryFilterId) ?? null,
    [categories, categoryFilterId],
  );

  const isSingleCategoryView =
    categoryFilterId !== ALL_CATEGORIES && !isAggregateView;
  /** بند واحد: جلب كامل لقيود البند (تجنّب قطع 2000 على رؤوس القيود) */
  const focusCategoryId = isSingleCategoryView ? categoryFilterId : null;

  const [model, setModel] = useState<PeriodJournalEntryModel | null>(null);
  const [comprehensiveModelRaw, setComprehensiveModelRaw] =
    useState<PeriodJournalEntryModel | null>(null);
  const [aggLoading, setAggLoading] = useState(false);
  const [aggError, setAggError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setAggLoading(true);
      setAggError(null);
      setModel(null);
      setComprehensiveModelRaw(null);
      try {
        if (focusCategoryId) {
          const focused = await fetchPeriodJournalEntry({
            period,
            statusFilter,
            categoryId: focusCategoryId,
          });
          if (cancelled) return;
          setModel(focused);
          /** حمّل الشامل في الخلفية لزر PDF الشامل دون حجب عرض البند */
          void fetchPeriodJournalEntry({ period, statusFilter }).then((full) => {
            if (!cancelled) setComprehensiveModelRaw(full);
          });
        } else {
          const full = await fetchPeriodJournalEntry({
            period,
            statusFilter,
          });
          if (cancelled) return;
          setModel(full);
          setComprehensiveModelRaw(full);
        }
      } catch (e) {
        if (!cancelled) {
          setAggError(e instanceof Error ? e.message : 'تعذّر تجميع القيد');
          setModel(null);
          setComprehensiveModelRaw(null);
        }
      } finally {
        if (!cancelled) setAggLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    focusCategoryId,
    period,
    statusFilter,
    startDate,
    endDate,
  ]);

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

  /** دائماً النموذج الشامل — لزر تقرير شامل PDF (لا تسقط على نموذج البند) */
  const comprehensiveModel = useMemo(() => {
    if (!comprehensiveModelRaw) return null;
    return applyPeriodJournalCategoryFilter(
      comprehensiveModelRaw,
      ALL_CATEGORIES,
      null,
    );
  }, [comprehensiveModelRaw]);

  const isFilteredView = categoryFilterId !== ALL_CATEGORIES;
  const isLoading = aggLoading || categoriesLoading;
  const isError = !!aggError;
  const errorMessage = aggError;

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
    /** في وضع التجميع نحتاج البنود التفصيلية لفصل النقدي/المصارف */
    const pdfModel =
      displayModel.typeGroupFilter?.mode === 'group' && model
        ? { ...displayModel, lines: model.lines }
        : displayModel;
    return (
      <PeriodJournalEntryPDF
        model={pdfModel}
        documentTitle={exportNames.documentTitle}
      />
    );
  }, [displayModel, model, exportNames.documentTitle]);

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
          isGroupedTypeView
            ? `إيرادات ومصاريف مجمّعة — مجموع فقط، والنقدي/كل مصرف دائن بورقة · ${periodLabel}`
            : isTypeAggregateView && displayModel?.typeGroupFilter
              ? `${displayModel.typeGroupFilter.name_ar} — مجموع فقط بلا تفصيل، والنقدي/كل مصرف دائن بورقة · ${periodLabel}`
              : isSingleCategoryView && displayModel?.categoryFilter
                ? `كشف بند ${displayModel.categoryFilter.name_ar} — النقدي بجدول مدين/دائن، وكل مصرف بورقة · ${periodLabel}`
                : `اختر طريقة التجميع أعلاه — أو اعرض كل بند على حدة · ${periodLabel}`
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
            {isFilteredView ? (
              <TajMallPdfToolbar
                fileName={exportNames.fileName}
                shareTitle={exportNames.shareTitle}
                shareText={exportNames.shareText}
                cacheKey={`pje-cat:${startDate}:${endDate}:${statusFilter}:${categoryFilterId}:${displayModel?.lines.length ?? 0}:${displayModel?.totalDebit ?? 0}`}
                disabled={categoryPdfDisabled}
                openLabel={
                  isAggregateView ? 'التجميع PDF' : 'كشف البند PDF'
                }
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

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  طريقة تجميع البنود
                </p>
                {isAggregateView ? (
                  <Badge
                    variant="success"
                    className="font-normal normal-case tracking-normal"
                  >
                    وضع التجميع مفعّل
                  </Badge>
                ) : null}
              </div>
              <Tabs
                value={
                  isViewMode(categoryFilterId) ? categoryFilterId : ALL_CATEGORIES
                }
                onValueChange={onCategoryChange}
                className="w-full"
              >
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-4">
                  {VIEW_MODE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <TabsTrigger
                        key={opt.value}
                        value={opt.value}
                        className={cn(
                          'flex min-h-11 flex-col items-center justify-center gap-0.5 px-2 py-2 text-center sm:min-h-10 sm:flex-row sm:gap-1.5',
                          'data-[state=active]:bg-sage-600 data-[state=active]:text-white data-[state=active]:border-sage-700',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-[11px] leading-tight sm:text-[12.5px]">
                          <span className="sm:hidden">{opt.shortLabel}</span>
                          <span className="hidden sm:inline">{opt.label}</span>
                        </span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {isGroupedTypeView
                  ? 'يجمع كل بنود الإيراد في صف واحد وكل بنود المصروف في صف واحد مع أطراف الخزينة.'
                  : isTypeAggregateView
                    ? 'يعرض مجموع النوع المختار فقط كقيد مزدوج (البند المجمّع + الطرف المقابل).'
                    : 'اعرض كل بند بإجماله، أو اختر بنداً واحداً من القائمة أدناه.'}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  بند محاسبي واحد (اختياري)
                </p>
                <Select
                  value={
                    isSpecialCategoryFilter(categoryFilterId)
                      ? ALL_CATEGORIES
                      : categoryFilterId
                  }
                  onValueChange={onCategoryChange}
                  disabled={isAggregateView}
                >
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
                  {isAggregateView
                    ? 'معطّل أثناء وضع التجميع — اختر «كل البنود» أعلاه أولاً.'
                    : isSingleCategoryView
                      ? 'بند واحد: يُجلب كاملاً للفترة (بدون قطع)، ويُفصل النقدي عن المصارف. إيجارات المحلات = إيراد مستحق من المطالبات وليس التحصيل النقدي.'
                      : 'اتركه على جميع البنود، أو اختر بنداً لكشف تفصيلي.'}
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
              displayModel?.categoryFilter || displayModel?.typeGroupFilter
                ? 'لا حركة على هذا التجميع'
                : 'لا توجد حركة لبناء القيد'
            }
            description={
              displayModel?.categoryFilter
                ? `البند «${displayModel.categoryFilter.name_ar}» لم يتحرك في ${periodLabel}.`
                : displayModel?.typeGroupFilter
                  ? `«${displayModel.typeGroupFilter.name_ar}» بلا حركة في ${periodLabel}.`
                  : 'اختر شهراً فيه قيود مرحّلة، أو غيّر فلتر المصدر.'
            }
          >
            {displayModel?.categoryFilter || displayModel?.typeGroupFilter ? (
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
            {displayModel.truncated ? (
              <AccountingBackfillBanner
                title="تنبيه: قد يكون المجموع ناقصاً"
                description="تم بلوغ حد جلب القيود لهذه الفترة. عند اختيار بند واحد (مثل إيجارات المحلات) يُعاد الجلب كاملاً لهذا البند — تأكد أن البند محدد من القائمة."
              />
            ) : null}
            <AccountingSummaryGrid
              stats={[
                {
                  label: displayModel.typeGroupFilter
                    ? 'صفوف مجمّعة'
                    : displayModel.categoryFilter
                      ? 'قيود البند'
                      : 'بنود تحرّكت',
                  value: displayModel.categoryFilter
                    ? displayModel.sourceEntryCount
                    : displayModel.lines.length,
                  currency: '',
                },
                {
                  label: displayModel.categoryFilter
                    ? 'مدين (البند + الطرف)'
                    : 'إجمالي المدين',
                  value: displayModel.totalDebit,
                  tone: 'positive',
                },
                {
                  label: displayModel.categoryFilter
                    ? 'دائن (البند + الطرف)'
                    : 'إجمالي الدائن',
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
                    {displayModel.typeGroupFilter?.mode === 'group'
                      ? `إيرادات معاً · مصاريف معاً · ${displayModel.lines.length} صف`
                      : displayModel.categoryFilter
                        ? `النقدي منفصل · كل مصرف بورقة · ${displayModel.categoryFilter.code} · بلا تفصيل قيود`
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
                              {displayModel.categoryFilter?.id === line.category_id ||
                              (displayModel.typeGroupFilter?.mode === 'group' &&
                                (line.category_type === 'REVENUE' ||
                                  line.category_type === 'EXPENSE'))
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
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>

            {(() => {
              const contraSource = displayModel.categoryFilter
                ? displayModel
                : displayModel.typeGroupFilter
                  ? displayModel
                  : model;
              if (!contraSource) return null;

              const sectionSource =
                displayModel.typeGroupFilter?.mode === 'group' && model
                  ? model
                  : displayModel;

              const sections = displayModel.categoryFilter
                ? buildCashBankSeparatedSections(
                    displayModel,
                    displayModel.categoryFilter.id,
                  )
                : displayModel.typeGroupFilter?.mode === 'group'
                  ? [
                      ...buildCashBankSeparatedSections(
                        sectionSource,
                        PERIOD_JOURNAL_TYPE_EXPENSE,
                      ),
                      ...buildCashBankSeparatedSections(
                        sectionSource,
                        PERIOD_JOURNAL_TYPE_REVENUE,
                      ),
                    ]
                  : null;

              if (sections && sections.length > 0) {
                return sections.map((section, sectionIndex) => {
                  const focusLine = section.focusLine;
                  const detailLines =
                    section.focusDetailLines &&
                    section.focusDetailLines.length > 0
                      ? section.focusDetailLines
                      : [focusLine];
                  const contraLines = section.contraLines;
                  const display = describePeriodJournalSectionDisplay(
                    focusLine,
                    contraLines,
                    {
                      fundingLabel: section.fundingLabel,
                      sectionKind: section.sectionKind,
                      focusTitle: section.title,
                    },
                  );
                  const kindBadge =
                    section.sectionKind === 'CASH'
                      ? 'نقدي'
                      : section.sectionKind === 'BANK'
                        ? 'مصرف'
                        : section.sectionKind === 'CARD'
                          ? 'بطاقة'
                          : null;
                  const contraRole =
                    section.sectionKind === 'CASH'
                      ? `${display.contraSideLabel} النقدي`
                      : section.sectionKind === 'BANK'
                        ? `${display.contraSideLabel} المصرف`
                        : `${display.contraSideLabel} ${display.contraLabel}`;
                  const focusRoleClass = display.focusIsCredit
                    ? 'text-red-700'
                    : 'text-emerald-800';
                  const contraRoleClass = display.focusIsCredit
                    ? 'text-emerald-800'
                    : 'text-red-700';

                  return (
                    <Card key={section.sectionKey} className="border-border/80">
                      <CardHeader className="border-b pb-3 space-y-0">
                        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                          <span>
                            {sectionIndex + 1}/{sections.length} · البند:{' '}
                            <span className="text-sage-800">
                              {section.title}
                            </span>
                          </span>
                          {kindBadge || display.contraLabel !== 'الطرف المقابل' ? (
                            <Badge
                              variant="outline"
                              className="font-normal normal-case tracking-normal"
                            >
                              {display.contraSideLabel}:{' '}
                              {display.contraLabel !== 'الطرف المقابل'
                                ? display.contraLabel
                                : kindBadge}
                            </Badge>
                          ) : null}
                        </CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {display.summaryLine} ·{' '}
                          {formatMoney(display.focusAmount, '')} /{' '}
                          {formatMoney(display.contraAmount, '')}
                          {section.balanced ? ' · متوازن' : ' · مراجعة'}
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
                              {detailLines.map((dl) => (
                                <tr
                                  key={dl.rowKey}
                                  className="border-b bg-sage-50/40"
                                >
                                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                                    {dl.category_code || '—'}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <p
                                      className={cn(
                                        'text-[11px] font-medium',
                                        focusRoleClass,
                                      )}
                                    >
                                      {display.focusRoleLabel}
                                    </p>
                                    <p className="text-base font-bold text-sage-900">
                                      {dl.category_name}
                                    </p>
                                  </td>
                                  <td
                                    className={cn(
                                      'px-4 py-2.5 text-xs font-semibold',
                                      focusRoleClass,
                                    )}
                                  >
                                    {display.focusSideLabel}
                                  </td>
                                  <td className="px-4 py-2.5 text-left font-mono tabular-nums text-emerald-700 font-semibold">
                                    {formatMoney(dl.debit, '')}
                                  </td>
                                  <td className="px-4 py-2.5 text-left font-mono tabular-nums text-red-600 font-semibold">
                                    {formatMoney(dl.credit, '')}
                                  </td>
                                </tr>
                              ))}
                              {contraLines.map((cl) => (
                                <tr
                                  key={cl.rowKey}
                                  className="border-b last:border-0 hover:bg-muted/30"
                                >
                                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                                    {cl.category_code || '—'}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <p
                                      className={cn(
                                        'text-[11px] font-medium',
                                        contraRoleClass,
                                      )}
                                    >
                                      {contraRole}
                                    </p>
                                    <p className="font-semibold">
                                      {section.sectionKind === 'CASH'
                                        ? cl.cashbox_name ||
                                          section.fundingLabel ||
                                          'النقدي'
                                        : cl.cashbox_name ||
                                          section.fundingLabel ||
                                          cl.category_name}
                                    </p>
                                  </td>
                                  <td
                                    className={cn(
                                      'px-4 py-2.5 text-xs font-semibold',
                                      contraRoleClass,
                                    )}
                                  >
                                    {cl.debit > 0 && cl.credit <= 0
                                      ? 'مدين'
                                      : cl.credit > 0 && cl.debit <= 0
                                        ? 'دائن'
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
                                  {section.balanced
                                    ? 'مجموع القيد — مدين = دائن'
                                    : 'مجموع القيد — فرق'}
                                </td>
                                <td className="px-4 py-3 text-left font-mono tabular-nums text-emerald-800">
                                  {formatMoney(section.totalDebit, '')}
                                </td>
                                <td className="px-4 py-3 text-left font-mono tabular-nums text-red-700">
                                  {formatMoney(section.totalCredit, '')}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  );
                });
              }

              const focusLines =
                displayModel.typeGroupFilter?.mode === 'group'
                  ? displayModel.lines.filter(
                      (l) =>
                        l.category_type === 'REVENUE' ||
                        l.category_type === 'EXPENSE',
                    )
                  : displayModel.lines;

              return focusLines.map((line, lineIndex) => {
                const focusLine = line;
                const contraLines = buildContraLinesForFocus(
                  contraSource,
                  focusLine,
                );
                const display = describePeriodJournalSectionDisplay(
                  focusLine,
                  contraLines,
                  {
                    focusTitle:
                      focusLine.cashbox_name || focusLine.category_name,
                  },
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
                  <Card key={line.rowKey} className="border-border/80">
                    <CardHeader className="border-b pb-3 space-y-0">
                      <CardTitle className="text-base">
                        {lineIndex + 1}/{focusLines.length} ·{' '}
                        {line.category_code || '—'} —{' '}
                        {line.cashbox_name || line.category_name}
                      </CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {line.cashbox_name ? `${line.category_name} · ` : ''}
                        {display.summaryLine} ·{' '}
                        {formatMoney(display.focusAmount, '')} /{' '}
                        {formatMoney(display.contraAmount, '')}
                        {balanced ? ' · متوازن' : ' · مراجعة'}
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
                                  focusLine.category_name}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                {display.headerFocusLabel}
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
                                  {cl.debit > 0 && cl.credit <= 0
                                    ? `مدين ${cl.cashbox_name || cl.category_name}`
                                    : cl.credit > 0 && cl.debit <= 0
                                      ? `دائن ${cl.cashbox_name || cl.category_name}`
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
              });
            })()}
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
