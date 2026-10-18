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
  Receipt,
  Search,
  Building2,
  Calendar,
  Clock,
  ArrowDownLeft,
  SlidersHorizontal,
} from 'lucide-react';

import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { PeriodJournalPdfDialog } from '@/features/pdf/period-journal-pdf-dialog';
import { type JournalStatus } from '@/lib/db/journal-queries';

import {
  fetchPeriodJournalEntry,
  applyPeriodJournalCategoryFilter,
  formatPeriodJournalExportNames,
  buildCashBankSeparatedSections,
  completeCashboxJournalSections,
  buildContraLinesForFocus,
  describePeriodJournalSectionDisplay,
  periodLineCashboxKindsLabel,
  isPeriodJournalGroupByType,
  parsePeriodJournalTypeFilter,
  isPeriodJournalCashCollections,
  PERIOD_JOURNAL_GROUP_BY_TYPE,
  PERIOD_JOURNAL_TYPE_REVENUE,
  PERIOD_JOURNAL_TYPE_EXPENSE,
  PERIOD_JOURNAL_MODE_CASH_COLLECTIONS,
  buildPeriodCashCollectionsSummary,
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
import { useCategories, useCashboxes, useTransactions } from '@/lib/db/queries';
import { formatMoney, cn } from '@/lib/utils';

type StatusFilter = JournalStatus | 'ALL';
const ALL_CATEGORIES = 'all';

type ViewMode =
  | typeof ALL_CATEGORIES
  | typeof PERIOD_JOURNAL_GROUP_BY_TYPE
  | typeof PERIOD_JOURNAL_TYPE_REVENUE
  | typeof PERIOD_JOURNAL_TYPE_EXPENSE
  | typeof PERIOD_JOURNAL_MODE_CASH_COLLECTIONS;

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
  {
    value: PERIOD_JOURNAL_MODE_CASH_COLLECTIONS,
    label: 'التحصيل الفعلي في الفترة (تاريخ القبض/التسجيل)',
    shortLabel: 'التحصيل الفعلي',
    icon: Receipt,
  },
];

function isViewMode(value: string): value is ViewMode {
  return VIEW_MODE_OPTIONS.some((o) => o.value === value);
}

function isSpecialCategoryFilter(value: string): boolean {
  return (
    isPeriodJournalGroupByType(value) ||
    parsePeriodJournalTypeFilter(value) != null ||
    isPeriodJournalCashCollections(value)
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
  const { data: cashboxes = [] } = useCashboxes();
  const { data: allTransactions = [] } = useTransactions();
  const { data: revenueTransactions = [], isLoading: transactionsLoading } = useTransactions('REVENUE');

  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  // Search & Status filters for Cash Collections Mode
  const [collectionSearch, setCollectionSearch] = useState('');
  const [collectionStatusFilter, setCollectionStatusFilter] = useState<'ALL' | 'PRIOR' | 'CURRENT' | 'FUTURE'>('ALL');
  const [collectionBankFilter, setCollectionBankFilter] = useState<string>('ALL');


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
  const isCashCollectionsView = isPeriodJournalCashCollections(categoryFilterId);
  const isTypeAggregateView = accountTypeFilter != null;
  const isAggregateView = isGroupedTypeView || isTypeAggregateView || isCashCollectionsView;

  const { startDate, endDate } = reportPeriodDateRange(period);
  const periodLabel = formatReportPeriodLabelAr(period);

  // Build Cash Collections Summary
  const cashCollectionsSummary = useMemo(() => {
    return buildPeriodCashCollectionsSummary(revenueTransactions, {
      startDate,
      endDate,
      periodLabel,
    });
  }, [revenueTransactions, startDate, endDate, periodLabel]);

  // Filtered Cash Collection Items for UI Table
  const filteredCollectionItems = useMemo(() => {
    if (!cashCollectionsSummary) return [];
    return cashCollectionsSummary.items.filter((it) => {
      if (collectionStatusFilter !== 'ALL' && it.target_month_status !== collectionStatusFilter) {
        return false;
      }
      if (collectionBankFilter !== 'ALL' && it.cashbox_id !== collectionBankFilter) {
        return false;
      }
      if (collectionSearch.trim()) {
        const q = collectionSearch.toLowerCase().trim();
        const match =
          (it.description ?? '').toLowerCase().includes(q) ||
          (it.contact_name ?? '').toLowerCase().includes(q) ||
          (it.shop_number ?? '').toLowerCase().includes(q) ||
          (it.cashbox_name ?? '').toLowerCase().includes(q) ||
          (it.category_name ?? '').toLowerCase().includes(q) ||
          (it.target_rent_month ?? '').toLowerCase().includes(q) ||
          String(it.number).includes(q) ||
          (it.reference ?? '').includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [cashCollectionsSummary, collectionStatusFilter, collectionBankFilter, collectionSearch]);

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
      if (isCashCollectionsView) {
        return;
      }
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
    isCashCollectionsView,
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

  const cashboxJournalSections = useMemo(() => {
    if (!displayModel?.categoryFilter || displayModel.typeGroupFilter) return [];
    const source = model ?? displayModel;
    const raw = buildCashBankSeparatedSections(
      source,
      displayModel.categoryFilter.id,
    );
    const focus =
      displayModel.lines.find(
        (l) => l.category_id === displayModel.categoryFilter?.id,
      ) ??
      raw[0]?.focusLine ??
      null;
    return completeCashboxJournalSections(
      raw,
      cashboxes.map((b) => ({
        id: b.id,
        name_ar: b.name_ar,
        kind: b.kind,
        code: b.code,
      })),
      focus,
    );
  }, [displayModel, model, cashboxes]);

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
  const isLoading = (aggLoading || categoriesLoading) && !isCashCollectionsView;
  const isError = !!aggError && !isCashCollectionsView;
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

  const cashCollectionCsvRows = useMemo(() => {
    if (!cashCollectionsSummary) return [];
    return cashCollectionsSummary.items.map((it) => [
      it.number,
      it.tx_date,
      it.target_rent_month || 'الشهر الحالي',
      it.target_month_status === 'PRIOR'
        ? 'مستحق سابق (متأخرات)'
        : it.target_month_status === 'FUTURE'
          ? 'إيجار مقدم'
          : 'الشهر الحالي',
      it.contact_name
        ? `${it.contact_name}${it.shop_number ? ` (${it.shop_number})` : ''}`
        : '—',
      it.cashbox_name,
      it.category_name,
      it.amount,
      it.description || '—',
    ]);
  }, [cashCollectionsSummary]);

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
    /** لفصل الخزائن/المصارف نحتاج كل أسطر القيود وليس صفوف البند فقط */
    const pdfModel =
      model &&
      (displayModel.typeGroupFilter?.mode === 'group' ||
        displayModel.categoryFilter)
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
          isCashCollectionsView
            ? `كشف الإيرادات والتحصيلات المسجلة خلال الفترة (بناءً على تاريخ القبض والتسجيل الفعلي) · ${periodLabel}`
            : isGroupedTypeView
              ? `إيرادات ومصاريف مجمّعة — مجموع فقط، والنقدي/كل مصرف دائن بورقة · ${periodLabel}`
              : isTypeAggregateView && displayModel?.typeGroupFilter
                ? `${displayModel.typeGroupFilter.name_ar} — مجموع فقط بلا تفصيل، والنقدي/كل مصرف دائن بورقة · ${periodLabel}`
                : isSingleCategoryView && displayModel?.categoryFilter
                  ? `كشف بند ${displayModel.categoryFilter.name_ar} — قيد لكل خزينة ومصرف (مدين/دائن) · ${periodLabel}`
                  : `اختر طريقة التجميع أعلاه — أو اعرض كل بند على حدة · ${periodLabel}`
        }
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPdfModalOpen(true)}
              className="min-h-11 touch-manipulation gap-1.5 font-semibold text-success-ink border-success-line hover:bg-success-soft sm:min-h-9"
            >
              <SlidersHorizontal className="h-4 w-4" />
              خيارات تقرير PDF المتقدمة
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href={reportsHref('/reports', period)}>
                <LayoutGrid className="h-4 w-4" />
                مركز التقارير
              </Link>
            </Button>



            {isCashCollectionsView ? (
              <>
                <ExportCsvButton
                  fileName={`تحصيلات-فعلية-${periodLabel}`}
                  headers={[
                    'الرقم',
                    'تاريخ القبض',
                    'شهر الاستحقاق',
                    'نوع التحصيل',
                    'المستأجر/العميل',
                    'الخزينة/المصرف',
                    'البند',
                    'المبلغ',
                    'البيان',
                  ]}
                  rows={cashCollectionCsvRows}
                  disabled={!cashCollectionsSummary || cashCollectionsSummary.items.length === 0}
                />
                <TajMallPdfToolbar
                  fileName={`كشف-التحصيلات-الفعلية-${periodLabel}`}
                  shareTitle={`كشف الإيرادات والتحصيلات المسجلة خلال ${periodLabel}`}
                  disabled={!cashCollectionsSummary || cashCollectionsSummary.items.length === 0}
                  openLabel="تقرير التحصيل الفعلي PDF"
                  render={async () => {
                    const { PeriodCashCollectionsReportPDF } = await import(
                      '@/features/pdf/PeriodCashCollectionsReportPDF'
                    );
                    if (!cashCollectionsSummary) throw new Error('لا توجد بيانات للتحصيل');
                    return (
                      <PeriodCashCollectionsReportPDF
                        summary={cashCollectionsSummary}
                        documentTitle={`تاج مول — كشف التحصيلات الفعلية — ${periodLabel}`}
                      />
                    );
                  }}
                />
              </>
            ) : (
              <>
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
                    openLabel={isAggregateView ? 'التجميع PDF' : 'كشف البند PDF'}
                    render={renderCategoryPdf}
                  />
                ) : null}
              </>
            )}
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
                  طريقة تجميع وعرض قيد الفترة
                </p>
                {isAggregateView ? (
                  <Badge
                    variant="success"
                    className="font-normal normal-case tracking-normal"
                  >
                    {isCashCollectionsView ? 'وضع التحصيل الفعلي مفعّل' : 'وضع التجميع مفعّل'}
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
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-5">
                  {VIEW_MODE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <TabsTrigger
                        key={opt.value}
                        value={opt.value}
                        className={cn(
                          'flex min-h-11 flex-col items-center justify-center gap-0.5 px-2 py-2 text-center sm:min-h-10 sm:flex-row sm:gap-1.5',
                          'data-[state=active]:bg-ink-soft data-[state=active]:text-white data-[state=active]:border-foreground',
                          opt.value === PERIOD_JOURNAL_MODE_CASH_COLLECTIONS &&
                            'data-[state=active]:bg-success data-[state=active]:border-success'
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-[11px] leading-tight sm:text-[12px]">
                          <span className="sm:hidden">{opt.shortLabel}</span>
                          <span className="hidden sm:inline">{opt.label}</span>
                        </span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {isCashCollectionsView
                  ? 'يعرض جميع الإيرادات والتحصيلات المقبوضة فعلياً خلال هذه الفترة (بتاريخ التسجيل) مع فرز ما يخص شهور سابقة (مثل إيجار مايو المسجل في يوليو) أو مقدماً أو لنفس الشهر.'
                  : isGroupedTypeView
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
                    ? 'معطّل أثناء وضع التجميع أو التحصيل الفعلي — اختر «كل البنود» أعلاه أولاً.'
                    : isSingleCategoryView
                      ? 'بند واحد: جدول قيد مستقل لكل خزينة نقدية ولكل مصرف — مدين ودائن.'
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
                  disabled={isCashCollectionsView}
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

        {/* VIEW A: Cash Collections by Actual Entry Date Mode */}
        {isCashCollectionsView ? (
          <div className="space-y-5">
            {/* Informational Scope Strip */}
            <div className="rounded-xl border border-success-line bg-success-soft/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success text-white shrink-0">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-success-ink">
                    كشف الإيرادات والتحصيلات المسجلة فعلياً خلال {periodLabel}
                  </h4>
                  <p className="text-xs text-success-ink/80 mt-0.5">
                    الأساس: تاريخ القبض والتسجيل بالدفاتر المالية ({startDate} إلى {endDate}).
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="border-success text-success-ink self-start sm:self-auto font-semibold">
                {cashCollectionsSummary.totalCount} عملية تحصيل
              </Badge>
            </div>

            {/* 4 Stat Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-success/30 bg-success-soft/30">
                <CardContent className="p-4 space-y-1">
                  <p className="text-xs font-semibold text-success-ink">
                    إجمالي المحصل في الفترة
                  </p>
                  <p className="text-lg font-bold text-foreground font-mono">
                    {formatMoney(cashCollectionsSummary.totalCollected, 'LYD')}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {cashCollectionsSummary.totalCount} قيد تحصيل مسجل
                  </p>
                </CardContent>
              </Card>

              <Card className="border-warning/30 bg-warning-soft/30">
                <CardContent className="p-4 space-y-1">
                  <div className="flex items-center gap-1.5 text-warning-ink">
                    <Clock className="h-3.5 w-3.5" />
                    <p className="text-xs font-semibold">
                      مستحقات شهور سابقة (متأخرات)
                    </p>
                  </div>
                  <p className="text-lg font-bold text-warning-ink font-mono">
                    {formatMoney(cashCollectionsSummary.priorPeriodAmount, 'LYD')}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {cashCollectionsSummary.priorPeriodCount} قيد يخص شهوراً سابقة
                  </p>
                </CardContent>
              </Card>

              <Card className="border-success/30 bg-success-soft/20">
                <CardContent className="p-4 space-y-1">
                  <div className="flex items-center gap-1.5 text-success-ink">
                    <Calendar className="h-3.5 w-3.5" />
                    <p className="text-xs font-semibold">
                      تحصيلات الشهر الحالي
                    </p>
                  </div>
                  <p className="text-lg font-bold text-success-ink font-mono">
                    {formatMoney(cashCollectionsSummary.currentPeriodAmount, 'LYD')}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {cashCollectionsSummary.currentPeriodCount} قيد لنفس الشهر
                  </p>
                </CardContent>
              </Card>

              <Card className="border-info/30 bg-info-soft/30">
                <CardContent className="p-4 space-y-1">
                  <div className="flex items-center gap-1.5 text-info-ink">
                    <ArrowDownLeft className="h-3.5 w-3.5" />
                    <p className="text-xs font-semibold">
                      تحصيلات إيجار مقدم
                    </p>
                  </div>
                  <p className="text-lg font-bold text-info-ink font-mono">
                    {formatMoney(cashCollectionsSummary.futurePeriodAmount, 'LYD')}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {cashCollectionsSummary.futurePeriodCount} قيد مقدم
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Distribution Cards: Banks & Categories */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Banks Distribution */}
              <Card className="border-border">
                <CardHeader className="py-3 px-4 border-b bg-canvas-sunken/40">
                  <CardTitle className="text-xs font-bold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-success-ink" />
                      مجموع كل مصرف وخزينة مودع بها
                    </span>
                    <span className="text-[11px] text-muted-foreground font-normal">
                      {cashCollectionsSummary.byBank.length} حسابات
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {cashCollectionsSummary.byBank.map((b) => {
                      const pct = cashCollectionsSummary.totalCollected > 0
                        ? ((b.total / cashCollectionsSummary.totalCollected) * 100).toFixed(1)
                        : '0';
                      return (
                        <div key={b.cashboxId} className="flex items-center justify-between p-3 text-xs hover:bg-canvas-sunken/30">
                          <div className="space-y-0.5">
                            <p className="font-semibold text-foreground">{b.name}</p>
                            <p className="text-[11px] text-muted-foreground">{b.count} عملية إيداع</p>
                          </div>
                          <div className="text-end space-y-0.5">
                            <p className="font-mono font-bold text-foreground">{formatMoney(b.total, 'LYD')}</p>
                            <p className="text-[11px] text-muted-foreground">{pct}%</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Categories Distribution */}
              <Card className="border-border">
                <CardHeader className="py-3 px-4 border-b bg-canvas-sunken/40">
                  <CardTitle className="text-xs font-bold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-success-ink" />
                      مجموع كل بند من بنود الإيرادات
                    </span>
                    <span className="text-[11px] text-muted-foreground font-normal">
                      {cashCollectionsSummary.byCategory.length} بنود
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {cashCollectionsSummary.byCategory.map((c) => {
                      const pct = cashCollectionsSummary.totalCollected > 0
                        ? ((c.total / cashCollectionsSummary.totalCollected) * 100).toFixed(1)
                        : '0';
                      return (
                        <div key={c.categoryId} className="flex items-center justify-between p-3 text-xs hover:bg-canvas-sunken/30">
                          <div className="space-y-0.5">
                            <p className="font-semibold text-foreground">{c.name}</p>
                            <p className="text-[11px] font-mono text-muted-foreground">{c.code} · {c.count} عملية</p>
                          </div>
                          <div className="text-end space-y-0.5">
                            <p className="font-mono font-bold text-foreground">{formatMoney(c.total, 'LYD')}</p>
                            <p className="text-[11px] text-muted-foreground">{pct}%</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filter & Search Bar for Table */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-card border rounded-xl p-3">
              <div className="relative w-full sm:w-72">
                <Search className="absolute inset-e-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={collectionSearch}
                  onChange={(e) => setCollectionSearch(e.target.value)}
                  placeholder="ابحث في المستأجرين، المحلات، البيان…"
                  className="h-8 pe-8 text-xs"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                <div className="flex items-center gap-1 bg-canvas-sunken p-0.5 rounded-lg border">
                  <button
                    type="button"
                    onClick={() => setCollectionStatusFilter('ALL')}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-md font-medium transition-colors',
                      collectionStatusFilter === 'ALL'
                        ? 'bg-card text-foreground font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    الكل
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollectionStatusFilter('PRIOR')}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-md font-medium transition-colors',
                      collectionStatusFilter === 'PRIOR'
                        ? 'bg-warning-soft text-warning-ink font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    ⏳ شهور سابقة
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollectionStatusFilter('CURRENT')}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-md font-medium transition-colors',
                      collectionStatusFilter === 'CURRENT'
                        ? 'bg-success-soft text-success-ink font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    الشهر الحالي
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollectionStatusFilter('FUTURE')}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-md font-medium transition-colors',
                      collectionStatusFilter === 'FUTURE'
                        ? 'bg-info-soft text-info-ink font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    مقدم
                  </button>
                </div>

                <Select
                  value={collectionBankFilter}
                  onValueChange={setCollectionBankFilter}
                >
                  <SelectTrigger className="h-8 text-xs w-[140px]">
                    <SelectValue placeholder="كل المصارف" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">كل المصارف/الخزائن</SelectItem>
                    {cashboxes.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Detailed Transactions Table */}
            <Card className="border-border overflow-hidden">
              <CardHeader className="py-3 px-4 border-b bg-canvas-sunken/40 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-success-ink" />
                  تفاصيل قيود التحصيل المسجلة ({filteredCollectionItems.length} عملية)
                </CardTitle>
                <Badge variant="outline" className="font-mono text-xs">
                  المجموع:{' '}
                  {formatMoney(
                    filteredCollectionItems.reduce((s, it) => s + it.amount, 0),
                    'LYD'
                  )}
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-muted-foreground text-xs">
                        <th className="px-3.5 py-2.5 text-center font-medium w-16">الرقم</th>
                        <th className="px-3.5 py-2.5 text-center font-medium w-24">تاريخ القبض</th>
                        <th className="px-3.5 py-2.5 text-center font-medium w-36">شهر الاستحقاق المستهدف</th>
                        <th className="px-3.5 py-2.5 text-start font-medium">المستأجر / المحل</th>
                        <th className="px-3.5 py-2.5 text-start font-medium">الخزينة / المصرف</th>
                        <th className="px-3.5 py-2.5 text-end font-medium">المبلغ</th>
                        <th className="px-3.5 py-2.5 text-start font-medium">البيان</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-xs">
                      {filteredCollectionItems.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-muted-foreground">
                            لا توجد عمليات تحصيل مسجلة مطابقة للبحث
                          </td>
                        </tr>
                      ) : (
                        filteredCollectionItems.map((it) => (
                          <tr key={it.transaction_id} className="hover:bg-muted/30">
                            <td className="px-3.5 py-2.5 text-center font-mono text-muted-foreground">
                              {it.number}
                            </td>
                            <td className="px-3.5 py-2.5 text-center font-mono text-muted-foreground">
                              {it.tx_date}
                            </td>
                            <td className="px-3.5 py-2.5 text-center">
                              {it.target_month_status === 'PRIOR' ? (
                                <Badge variant="outline" className="bg-warning-soft text-warning-ink border-warning-line text-[11px] font-medium gap-1">
                                  <span>⏳</span>
                                  <span>{it.target_rent_month || 'شهر سابق'}</span>
                                </Badge>
                              ) : it.target_month_status === 'FUTURE' ? (
                                <Badge variant="outline" className="bg-info-soft text-info-ink border-info-line text-[11px] font-medium gap-1">
                                  <span>{it.target_rent_month || 'مقدم'}</span>
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-success-soft text-success-ink border-success-line text-[11px] font-medium gap-1">
                                  <span>{it.target_rent_month || 'الشهر الحالي'}</span>
                                </Badge>
                              )}
                            </td>
                            <td className="px-3.5 py-2.5">
                              <p className="font-semibold text-foreground">
                                {it.contact_name || '—'}
                              </p>
                              {it.shop_number && (
                                <p className="text-[11px] text-muted-foreground">
                                  محل {it.shop_number}
                                </p>
                              )}
                            </td>
                            <td className="px-3.5 py-2.5">
                              <p className="font-medium text-foreground">{it.cashbox_name}</p>
                              <p className="text-[11px] text-muted-foreground font-mono">{it.method}</p>
                            </td>
                            <td className="px-3.5 py-2.5 text-end font-mono font-bold text-success-ink">
                              {formatMoney(it.amount, '')}
                            </td>
                            <td className="px-3.5 py-2.5 text-muted-foreground max-w-xs truncate" title={it.description || ''}>
                              {it.description || '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-success-soft/60 font-bold border-t border-success-line">
                        <td colSpan={5} className="px-3.5 py-3 text-start text-xs">
                          إجمالي المبالغ المعروضة
                        </td>
                        <td className="px-3.5 py-3 text-end font-mono text-success-ink font-bold">
                          {formatMoney(
                            filteredCollectionItems.reduce((s, it) => s + it.amount, 0),
                            'LYD'
                          )}
                        </td>
                        <td className="px-3.5 py-3 text-xs text-muted-foreground">
                          {filteredCollectionItems.length} عملية
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* VIEW B: Standard Accrual & Grouped Journal Views */
          <>
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
                    <Button size="sm" variant="ghost" asChild>
                      <Link href="/journals">فتح دفتر اليومية</Link>
                    </Button>
                  </>
                )}
              </AccountingEmpty>
            ) : (
              <>
                {displayModel.truncated ? (
                  <p role="status" className="rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-[13px] leading-relaxed text-warning-ink">
                    قد يكون المجموع ناقصاً: بلغ عدد قيود هذه الفترة حد الجلب. اختر بنداً واحداً من القائمة ليُجلب كاملاً.
                  </p>
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

                {!(displayModel.categoryFilter && !displayModel.typeGroupFilter) ? (
                  <Card className="border-ink-soft/30">
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b pb-3">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <FileSpreadsheet className="h-4 w-4 text-foreground" />
                          {displayModel.title}
                        </CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {displayModel.typeGroupFilter?.mode === 'group'
                            ? `إيرادات معاً · مصاريف معاً · ${displayModel.lines.length} صف`
                            : displayModel.categoryFilter
                              ? `قيد مستقل لكل خزينة ومصرف · ${displayModel.categoryFilter.code}`
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
                              <th className="px-4 py-2.5 text-start font-medium">الرمز</th>
                              <th className="px-4 py-2.5 text-start font-medium">البند المحاسبي</th>
                              <th className="px-4 py-2.5 text-start font-medium">الخزينة</th>
                              <th className="px-4 py-2.5 text-end font-medium">مدين</th>
                              <th className="px-4 py-2.5 text-end font-medium">دائن</th>
                              <th className="px-4 py-2.5 text-end font-medium">الصافي</th>
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
                                <td className="px-4 py-2.5 text-end font-mono tabular-nums text-success-ink font-semibold">
                                  {formatMoney(line.debit, '')}
                                </td>
                                <td className="px-4 py-2.5 text-end font-mono tabular-nums text-danger font-semibold">
                                  {formatMoney(line.credit, '')}
                                </td>
                                <td className="px-4 py-2.5 text-end font-mono tabular-nums">
                                  {formatMoney(Math.abs(line.net), '')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-canvas-sunken/80 font-bold">
                              <td colSpan={3} className="px-4 py-3 text-start text-sm">
                                الإجمالي
                              </td>
                              <td className="px-4 py-3 text-end font-mono tabular-nums text-success-ink">
                                {formatMoney(displayModel.totalDebit, '')}
                              </td>
                              <td className="px-4 py-3 text-end font-mono tabular-nums text-danger-ink">
                                {formatMoney(displayModel.totalCredit, '')}
                              </td>
                              <td className="px-4 py-3 text-end font-mono tabular-nums">
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
                ) : null}

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

                  const sections =
                    displayModel.categoryFilter && !displayModel.typeGroupFilter
                      ? cashboxJournalSections
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
                    return sections.map((section) => {
                      const focusLine = section.focusLine;
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
                      const totalDebit = section.totalDebit;
                      const totalCredit = section.totalCredit;
                      const balanced = section.balanced;

                      return (
                        <Card
                          key={section.sectionKey}
                          className="border-ink-soft/30 overflow-hidden"
                        >
                          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b pb-3 bg-muted/20">
                            <div>
                              <CardTitle className="text-base">
                                {section.title}
                              </CardTitle>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {section.subtitle}
                              </p>
                            </div>
                            <Badge
                              variant={balanced ? 'success' : 'danger'}
                              className="font-normal"
                            >
                              {balanced ? 'متوازن' : 'غير متوازن'}
                            </Badge>
                          </CardHeader>
                          <CardContent className="p-0">
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b bg-muted/40 text-muted-foreground">
                                    <th className="px-4 py-2.5 text-start font-medium">الرمز</th>
                                    <th className="px-4 py-2.5 text-start font-medium">الطرف / الحساب</th>
                                    <th className="px-4 py-2.5 text-start font-medium">الدور المحاسبي</th>
                                    <th className="px-4 py-2.5 text-end font-medium">مدين</th>
                                    <th className="px-4 py-2.5 text-end font-medium">دائن</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="border-b bg-canvas-sunken/40">
                                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                                      {focusLine.category_code || '—'}
                                    </td>
                                    <td className="px-4 py-2.5 font-semibold">
                                      {focusLine.cashbox_name || focusLine.category_name}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                      {display.headerFocusLabel}
                                    </td>
                                    <td className="px-4 py-2.5 text-end font-mono tabular-nums text-success-ink font-semibold">
                                      {formatMoney(focusLine.debit, '')}
                                    </td>
                                    <td className="px-4 py-2.5 text-end font-mono tabular-nums text-danger font-semibold">
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
                                      <td className="px-4 py-2.5 text-end font-mono tabular-nums text-success-ink font-semibold">
                                        {formatMoney(cl.debit, '')}
                                      </td>
                                      <td className="px-4 py-2.5 text-end font-mono tabular-nums text-danger font-semibold">
                                        {formatMoney(cl.credit, '')}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-canvas-sunken/80 font-bold">
                                    <td colSpan={3} className="px-4 py-3 text-start text-sm">
                                      {balanced ? 'مجموع القيد — مدين = دائن' : 'مجموع القيد — فرق'}
                                    </td>
                                    <td className="px-4 py-3 text-end font-mono tabular-nums text-success-ink">
                                      {formatMoney(totalDebit, '')}
                                    </td>
                                    <td className="px-4 py-3 text-end font-mono tabular-nums text-danger-ink">
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
                  }
                  return null;
                })()}
              </>
            )}
          </>
        )}
      </AccountingPageBody>

      <PeriodJournalPdfDialog
        // each opening starts from the page's current period and account
        key={pdfModalOpen ? `open-${period.year}-${period.month ?? 'y'}-${categoryFilterId}` : 'closed'}
        open={pdfModalOpen}
        onOpenChange={setPdfModalOpen}
        categories={categories}
        cashboxes={cashboxes}
        transactions={allTransactions}
        defaultCategoryId={
          categoryFilterId !== ALL_CATEGORIES && !isSpecialCategoryFilter(categoryFilterId)
            ? categoryFilterId
            : 'ALL'
        }
        defaultPeriod={{
          year: period.year,
          month: period.month ?? undefined,
        }}
      />

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
