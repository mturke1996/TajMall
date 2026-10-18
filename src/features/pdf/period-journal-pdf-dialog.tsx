'use client';

import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  FileText,
  FileDown,
  Calendar,
  Layers,
  Building2,
  SlidersHorizontal,
  Search,
  Check,
  CreditCard,
  PieChart,
  Loader2,
  Share2,
  BookOpen,
  Receipt,
  ArrowDownLeft,
  Clock,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import { renderPdfBlob, savePdfBlob, shouldUseInAppPdfViewer } from './pdf-blob-utils';
import { PdfPreviewDialog } from './pdf-preview-dialog';
import type { PeriodJournalBankGroup } from './PeriodJournalExecutivePDF';
import { extractTargetRentMonth } from '@/lib/period-journal-entry';
import type {
  CategoryRow,
  CashboxRow,
  TransactionWithRelations,
  CashboxKind,
} from '@/lib/db/types';

const MONTH_NAMES_AR = [
  'يناير (1)',
  'فبراير (2)',
  'مارس (3)',
  'أبريل (4)',
  'مايو (5)',
  'يونيو (6)',
  'يوليو (7)',
  'أغسطس (8)',
  'سبتمبر (9)',
  'أكتوبر (10)',
  'نوفمبر (11)',
  'ديسمبر (12)',
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryRow[];
  cashboxes: CashboxRow[];
  transactions: TransactionWithRelations[];
  defaultCategoryId?: string;
  defaultPeriod?: { year: number; month?: number };
};

export function PeriodJournalPdfDialog({
  open,
  onOpenChange,
  categories,
  cashboxes,
  transactions,
  defaultCategoryId = 'ALL',
  defaultPeriod,
}: Props) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // 1. Accounting Basis Option
  const [basisMode, setBasisMode] = useState<
    'CASH_COLLECTED_IN_MONTH' | 'RENT_MONTH_TARGET' | 'GENERAL_ACCRUAL'
  >('CASH_COLLECTED_IN_MONTH');

  // 2. View Level Option: Summary Only vs Detailed
  const [viewLevel, setViewLevel] = useState<'SUMMARY_ONLY' | 'DETAILED'>('SUMMARY_ONLY');

  // 3. Category Selection
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(defaultCategoryId);

  // 4. Period Selection
  const [selectedYear, setSelectedYear] = useState<number>(defaultPeriod?.year || currentYear);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([
    defaultPeriod?.month || currentMonth,
  ]);
  const [dateRangeMode, setDateRangeMode] = useState<'MONTHS' | 'RANGE' | 'ALL'>('MONTHS');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // 5. Cashboxes Filter
  const [selectedCashboxIds, setSelectedCashboxIds] = useState<string[]>([]);
  const [customTitle, setCustomTitle] = useState('');

  // Execution States
  const [openBusy, setOpenBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function';

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  const closePreview = useCallback(
    (nextOpen: boolean) => {
      setPreviewOpen(nextOpen);
      if (!nextOpen) {
        revokePreviewUrl();
      }
    },
    [revokePreviewUrl]
  );

  const toggleMonth = (m: number) => {
    setSelectedMonths((prev) =>
      prev.includes(m) ? (prev.length > 1 ? prev.filter((item) => item !== m) : prev) : [...prev, m].sort((a, b) => a - b)
    );
  };

  const selectQuarter = (q: 1 | 2 | 3 | 4) => {
    if (q === 1) setSelectedMonths([1, 2, 3]);
    if (q === 2) setSelectedMonths([4, 5, 6]);
    if (q === 3) setSelectedMonths([7, 8, 9]);
    if (q === 4) setSelectedMonths([10, 11, 12]);
  };

  // Period label
  const periodLabel = useMemo(() => {
    if (dateRangeMode === 'ALL') return'كامل المدة المسجلة';
    if (dateRangeMode === 'MONTHS') {
      if (selectedMonths.length === 12) return `كامل عام ${selectedYear}`;
      const monthsStr = selectedMonths
        .map((m) => MONTH_NAMES_AR[m - 1].split(' ')[0])
        .join('، ');
      return `شهور: ${monthsStr} (${selectedYear})`;
    }
    if (dateRangeMode === 'RANGE') {
      if (fromDate && toDate) return `من ${fromDate} إلى ${toDate}`;
      if (fromDate) return `من تاريخ ${fromDate}`;
      if (toDate) return `حتى تاريخ ${toDate}`;
      return 'نطاق تواريخ مخصص';
    }
    return '';
  }, [dateRangeMode, selectedYear, selectedMonths, fromDate, toDate]);

  // Selected Category Object & Label
  const selectedCategory = useMemo(() => {
    if (selectedCategoryId === 'ALL') return null;
    return categories.find((c) => c.id === selectedCategoryId) ?? null;
  }, [categories, selectedCategoryId]);

  const categoryLabel = useMemo(() => {
    if (selectedCategoryId === 'ALL') return'كافة البنود المحاسبية';
    return selectedCategory ? `${selectedCategory.name_ar} (${selectedCategory.code})` : 'بند محدد';
  }, [selectedCategoryId, selectedCategory]);

  const basisLabel = useMemo(() => {
    if (basisMode === 'CASH_COLLECTED_IN_MONTH') return'التحصيل والتسجيل الفعلي بالدفاتر';
    if (basisMode === 'RENT_MONTH_TARGET') return'شهر الاستحقاق والإيجار المستهدف';
    return 'قيد اليومية المحاسبي المزدوج';
  }, [basisMode]);

  // Process Transactions and Build Bank Groups & Metrics
  const processedData = useMemo(() => {
    // 1. Filter Transactions by Period and Category
    const filtered = transactions.filter((t) => {
      // Category filter
      if (selectedCategoryId !== 'ALL' && t.category_id !== selectedCategoryId) {
        return false;
      }

      // Cashbox filter
      if (selectedCashboxIds.length > 0 && t.cashbox_id && !selectedCashboxIds.includes(t.cashbox_id)) {
        return false;
      }

      // Date filtering depending on basis
      if (basisMode === 'CASH_COLLECTED_IN_MONTH' || basisMode === 'GENERAL_ACCRUAL') {
        if (!t.tx_date) return false;
        if (dateRangeMode === 'MONTHS') {
          const d = new Date(t.tx_date);
          const y = d.getFullYear();
          const m = d.getMonth() + 1;
          if (y !== selectedYear || !selectedMonths.includes(m)) return false;
        } else if (dateRangeMode === 'RANGE') {
          const d = t.tx_date.slice(0, 10);
          if (fromDate && d < fromDate) return false;
          if (toDate && d > toDate) return false;
        }
      } else if (basisMode === 'RENT_MONTH_TARGET') {
        // Target rent month filtering
        const { target_rent_month_key } = extractTargetRentMonth(t.description, t.tx_date);
        if (dateRangeMode === 'MONTHS') {
          const targetKeys = selectedMonths.map(
            (m) => `${selectedYear}-${String(m).padStart(2, '0')}`
          );
          if (!target_rent_month_key || !targetKeys.includes(target_rent_month_key)) {
            return false;
          }
        }
      }

      return true;
    });

    let grandTotal = 0;
    let priorPeriodTotal = 0;
    let priorPeriodCount = 0;
    let currentPeriodTotal = 0;
    let currentPeriodCount = 0;
    let futurePeriodTotal = 0;
    let futurePeriodCount = 0;

    // Group by Cashbox / Bank
    const bankGroupsMap = new Map<string, PeriodJournalBankGroup>();
    const catMap = new Map<string, { name: string; code: string; count: number; total: number }>();
    const methodMap = new Map<string, { labelAr: string; count: number; total: number }>();

    for (const t of filtered) {
      const amt = Number(t.amount || 0);
      grandTotal += amt;

      const { target_rent_month, target_month_status } = extractTargetRentMonth(
        t.description,
        t.tx_date
      );

      if (target_month_status === 'PRIOR') {
        priorPeriodTotal += amt;
        priorPeriodCount += 1;
      } else if (target_month_status === 'CURRENT') {
        currentPeriodTotal += amt;
        currentPeriodCount += 1;
      } else if (target_month_status === 'FUTURE') {
        futurePeriodTotal += amt;
        futurePeriodCount += 1;
      }

      // Method stats
      const mKey = t.method || 'CASH';
      const mLabels: Record<string, string> = {
        CASH: 'نقدي (CASH)',
        CARD: 'بطاقة مصرفية (POS)',
        TRANSFER: 'حوالة مصرفية (TRANSFER)',
        CHEQUE: 'صك مصرفي (CHEQUE)',
      };
      const mCurr = methodMap.get(mKey) || { labelAr: mLabels[mKey] || mKey, count: 0, total: 0 };
      mCurr.count += 1;
      mCurr.total += amt;
      methodMap.set(mKey, mCurr);

      // Category stats
      const cId = t.category_id || 'OTHER';
      const cName = t.category?.name_ar || 'بدون بند';
      const cCode = t.category?.code || '—';
      const cCurr = catMap.get(cId) || { name: cName, code: cCode, count: 0, total: 0 };
      cCurr.count += 1;
      cCurr.total += amt;
      catMap.set(cId, cCurr);

      // Cashbox / Bank Group
      const bId = t.cashbox_id || 'OTHER';
      const bName = t.cashbox?.name_ar || 'الخزينة النقدية الرئيسية';
      const bKind = t.cashbox?.kind ?? ('CASH' as CashboxKind);

      let group = bankGroupsMap.get(bId);
      if (!group) {
        const isRevenue = t.kind === 'REVENUE';
        group = {
          cashboxId: bId,
          name: bName,
          kind: bKind,
          totalDebit: 0,
          totalCredit: 0,
          entryCount: 0,
          focusLineName: selectedCategory?.name_ar || (isRevenue ? 'إجمالي الإيرادات' : 'إجمالي المصروفات'),
          focusLineCode: selectedCategory?.code || (isRevenue ? 'REV*' : 'EXP*'),
          focusAmount: 0,
          contraLineName: bName,
          contraAmount: 0,
          isCredit: isRevenue, // Revenue is Credit, Expense is Debit
          items: [],
        };
        bankGroupsMap.set(bId, group);
      }

      group.entryCount += 1;
      group.focusAmount += amt;
      group.contraAmount += amt;

      if (group.isCredit) {
        group.totalCredit += amt;
        group.totalDebit += amt;
      } else {
        group.totalDebit += amt;
        group.totalCredit += amt;
      }

      group.items.push({
        id: t.id,
        number: t.number,
        date: t.tx_date,
        description: t.description,
        tenantName: t.contact?.name ?? null,
        shopNumber: t.contact?.shop_number ?? null,
        targetRentMonth: target_rent_month,
        targetMonthStatus: target_month_status,
        debit: !group.isCredit ? amt : 0,
        credit: group.isCredit ? amt : 0,
        amount: amt,
      });
    }

    return {
      filteredCount: filtered.length,
      grandTotal,
      priorPeriodTotal,
      priorPeriodCount,
      currentPeriodTotal,
      currentPeriodCount,
      futurePeriodTotal,
      futurePeriodCount,
      bankGroups: Array.from(bankGroupsMap.values()).sort((a, b) => b.totalDebit - a.totalDebit),
      categoriesSummary: Array.from(catMap.values()).sort((a, b) => b.total - a.total),
      paymentMethodsSummary: Array.from(methodMap.entries()).map(([method, v]) => ({
        method,
        ...v,
      })),
    };
  }, [
    transactions,
    selectedCategoryId,
    selectedCategory,
    selectedCashboxIds,
    basisMode,
    dateRangeMode,
    selectedYear,
    selectedMonths,
    fromDate,
    toDate,
  ]);

  const fileName = useMemo(() => {
    const cleanCat = (selectedCategory?.name_ar || 'شامل').replace(/[^\u0621-\u064A\w-]/g, '_').slice(0, 20);
    const cleanPeriod = periodLabel.replace(/[^\u0621-\u064A\w-]/g, '_').slice(0, 25);
    const levelSlug = viewLevel === 'SUMMARY_ONLY' ? 'مجموع' : 'تفصيلي';
    return `قيد-الفترة-${cleanCat}-${levelSlug}-${cleanPeriod}-${new Date().toISOString().slice(0, 10)}`;
  }, [selectedCategory, periodLabel, viewLevel]);

  // Generate Report JSX for PDF Renderer
  const generatePdfElement = useCallback(async () => {
    const { PeriodJournalExecutivePDF } = await import('./PeriodJournalExecutivePDF');
    return (
      <PeriodJournalExecutivePDF
        titleAr={customTitle.trim() || 'قيد الفترة المحاسبي المعتمد'}
        subtitleAr={`${periodLabel} · ${categoryLabel} · ${basisLabel}`}
        documentTitle={`${BRAND.name} - قيد الفترة - ${periodLabel}`}
        periodLabel={periodLabel}
        categoryLabel={categoryLabel}
        basisLabel={basisLabel}
        viewLevel={viewLevel}
        grandTotal={processedData.grandTotal}
        totalEntries={processedData.filteredCount}
        priorPeriodTotal={processedData.priorPeriodTotal}
        priorPeriodCount={processedData.priorPeriodCount}
        currentPeriodTotal={processedData.currentPeriodTotal}
        currentPeriodCount={processedData.currentPeriodCount}
        futurePeriodTotal={processedData.futurePeriodTotal}
        futurePeriodCount={processedData.futurePeriodCount}
        bankGroups={processedData.bankGroups}
        categoriesSummary={processedData.categoriesSummary}
        paymentMethodsSummary={processedData.paymentMethodsSummary}
      />
    );
  }, [
    customTitle,
    periodLabel,
    categoryLabel,
    basisLabel,
    viewLevel,
    processedData,
  ]);

  // Handlers for PDF Open / Download / Share
  const handleOpenPdf = async () => {
    if (openBusy || processedData.filteredCount === 0) return;
    setOpenBusy(true);
    const id = toast.loading('جاري توليد تقرير قيد الفترة المخصص…');
    try {
      const blob = await renderPdfBlob(generatePdfElement);

      if (!shouldUseInAppPdfViewer()) {
        const popupUrl = URL.createObjectURL(blob);
        const tab = window.open(popupUrl, '_blank', 'noopener,noreferrer');
        if (tab) {
          toast.success('تم فتح PDF في نافذة جديدة', { id });
          setTimeout(() => URL.revokeObjectURL(popupUrl), 120_000);
          return;
        }
        URL.revokeObjectURL(popupUrl);
      }

      revokePreviewUrl();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPreviewOpen(true);
      toast.success('تم تجهيز التقرير للمعاينة', { id });
    } catch (e) {
      console.error(e);
      toast.error('تعذّر توليد تقرير PDF', {
        id,
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setOpenBusy(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (downloadBusy || processedData.filteredCount === 0) return;
    setDownloadBusy(true);
    const id = toast.loading('جاري تجهيز وتنزيل ملف PDF…');
    try {
      const blob = await renderPdfBlob(generatePdfElement);
      const mode = await savePdfBlob(blob, fileName, {
        title: customTitle.trim() || 'قيد الفترة المحاسبي',
        text: `${periodLabel} - ${categoryLabel}`,
      });
      toast.success(
        mode === 'share' ? 'اختر «حفظ في الملفات» من قائمة المشاركة' : 'تم تنزيل الملف بنجاح',
        { id }
      );
    } catch (e) {
      console.error(e);
      toast.error('تعذّر تنزيل ملف PDF', {
        id,
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setDownloadBusy(false);
    }
  };

  const handleSharePdf = async () => {
    if (shareBusy || processedData.filteredCount === 0) return;
    setShareBusy(true);
    try {
      const blob = await renderPdfBlob(generatePdfElement);
      await savePdfBlob(blob, fileName, {
        title: customTitle.trim() || 'قيد الفترة المحاسبي',
        text: `${periodLabel} - ${categoryLabel}`,
      });
    } catch (e) {
      console.error(e);
      if (!(e instanceof Error && e.name === 'AbortError')) {
        toast.error('تعذّر مشاركة الملف');
      }
    } finally {
      setShareBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-3xl w-[calc(100%-1.5rem)] p-0 overflow-hidden rounded-2xl border bg-card shadow-lift"
          dir="rtl"
        >
          {/* Header */}
          <div className="border-b border-border bg-canvas-sunken/60 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-soft text-success-ink">
                <SlidersHorizontal className="h-5 w-5 stroke-[1.8]" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  تخصيص وتصدير تقرير قيد الفترة المحاسبي (PDF)
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  اختر مستوى العرض (مجموع فقط vs تفصيلي)، والأساس المحاسبي، والبند، وفصل البنوك والخزائن.
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="max-h-[calc(80vh-140px)] overflow-y-auto p-5 space-y-4">
            {/* 1. Level of Detail Option (مجموع البند فقط vs تفصيلي) */}
            <div className="rounded-xl border border-border/80 bg-canvas p-3.5 space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-success-ink" />
                  <span className="text-xs font-bold text-foreground">
                    1. مستوى عرض القيد (المجموع فقط vs التفصيلي)
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-canvas-sunken p-0.5 rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setViewLevel('SUMMARY_ONLY')}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                      viewLevel === 'SUMMARY_ONLY'
                        ? 'bg-card text-foreground font-bold text-success-ink'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    مجموع البند فقط (لكل مصرف)
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewLevel('DETAILED')}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                      viewLevel === 'DETAILED'
                        ? 'bg-card text-foreground font-bold text-success-ink'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    📝 تفصيلي بكافة القيود والحركات
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {viewLevel === 'SUMMARY_ONLY'
                  ? 'يظهر ملخص حركة البند في قيد مزدوج متوازن بالمجموع، مع جدول مستقل لكل خزينة نقدية ولكل مصرف، بدون تفصيل مئات القيود الفردية.'
                  : 'يظهر جدول تفصيلي كامل بجميع القيود الفردية لكل مستأجر مع تاريخ التسجيل وشهر الاستحقاق والبيان والمبالغ.'}
              </p>
            </div>

            {/* 2. Accounting Basis & Calculation Logic */}
            <div className="rounded-xl border border-border/80 bg-canvas p-3.5 space-y-2.5">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-success-ink" />
                <span className="text-xs font-bold text-foreground">
                  2. الأساس وطريقة الفرز المحاسبي
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setBasisMode('CASH_COLLECTED_IN_MONTH')}
                  className={cn(
                    'p-3 rounded-lg border text-start space-y-1 transition-all',
                    basisMode === 'CASH_COLLECTED_IN_MONTH'
                      ? 'bg-success-soft border-success text-success-ink'
                      : 'bg-card border-border hover:bg-canvas-sunken text-muted-foreground'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">
                      💵 التحصيل الفعلي في الشهر
                    </span>
                    {basisMode === 'CASH_COLLECTED_IN_MONTH' && (
                      <Check className="h-3.5 w-3.5 text-success-ink" />
                    )}
                  </div>
                  <p className="text-[11.5px] text-muted-foreground">
                    كل ما قُبض وسُجل في الشهر (مثلاً يوليو)، مع كشف متأخرات الشهور السابقة (مثل إيجار مايو).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setBasisMode('RENT_MONTH_TARGET')}
                  className={cn(
                    'p-3 rounded-lg border text-start space-y-1 transition-all',
                    basisMode === 'RENT_MONTH_TARGET'
                      ? 'bg-success-soft border-success text-success-ink'
                      : 'bg-card border-border hover:bg-canvas-sunken text-muted-foreground'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">
                      شهر الاستحقاق المستهدف
                    </span>
                    {basisMode === 'RENT_MONTH_TARGET' && (
                      <Check className="h-3.5 w-3.5 text-success-ink" />
                    )}
                  </div>
                  <p className="text-[11.5px] text-muted-foreground">
                    مجموع ما دُفع خصيصاً لشهر الاستحقاق المختار، حتى وإن دُفع في أوقات سابقة أو لاحقة.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setBasisMode('GENERAL_ACCRUAL')}
                  className={cn(
                    'p-3 rounded-lg border text-start space-y-1 transition-all',
                    basisMode === 'GENERAL_ACCRUAL'
                      ? 'bg-success-soft border-success text-success-ink'
                      : 'bg-card border-border hover:bg-canvas-sunken text-muted-foreground'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">
                      ⚖️ قيد اليومية المزدوج
                    </span>
                    {basisMode === 'GENERAL_ACCRUAL' && (
                      <Check className="h-3.5 w-3.5 text-success-ink" />
                    )}
                  </div>
                  <p className="text-[11.5px] text-muted-foreground">
                    القيد المحاسبي المزدوج بالمدين والدائن الشامل لحركات دفتر اليومية.
                  </p>
                </button>
              </div>
            </div>

            {/* 3. Category Selection */}
            <div className="rounded-xl border border-border/80 bg-canvas p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-success-ink" />
                  <span className="text-xs font-bold text-foreground">
                    3. اختيار البند المحاسبي
                  </span>
                </div>
                <Badge variant="outline" className="text-[11px]">
                  {selectedCategory ? selectedCategory.name_ar : 'كافة البنود'}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                    البند المحاسبي
                  </label>
                  <select
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-card px-2.5 text-xs font-semibold outline-hidden"
                  >
                    <option value="ALL">جميع البنود المحاسبية</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name_ar} ({c.type === 'REVENUE' ? 'إيراد' : 'مصروف'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                    عنوان مخصص للتقرير (اختياري)
                  </label>
                  <Input
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="مثال: كشف قيد إيجارات المحلات المعتمد"
                    className="h-9 text-xs bg-card"
                  />
                </div>
              </div>
            </div>

            {/* 4. Period Selection */}
            <div className="rounded-xl border border-border/80 bg-canvas p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-success-ink" />
                  <span className="text-xs font-bold text-foreground">
                    4. تحديد الفترة الزمنية
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => selectQuarter(1)}
                    className="h-6 px-1.5 text-[11px]"
                  >
                    الربع 1
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => selectQuarter(2)}
                    className="h-6 px-1.5 text-[11px]"
                  >
                    الربع 2
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => selectQuarter(3)}
                    className="h-6 px-1.5 text-[11px]"
                  >
                    الربع 3
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => selectQuarter(4)}
                    className="h-6 px-1.5 text-[11px]"
                  >
                    الربع 4
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 pt-1">
                {MONTH_NAMES_AR.map((mName, idx) => {
                  const mNum = idx + 1;
                  const isSelected = selectedMonths.includes(mNum);
                  return (
                    <button
                      key={mNum}
                      type="button"
                      onClick={() => toggleMonth(mNum)}
                      className={cn(
                        'py-1.5 px-2 rounded-md text-xs font-medium border text-center transition-all',
                        isSelected
                          ? 'bg-success text-white border-success'
                          : 'bg-card text-muted-foreground border-border hover:bg-canvas-sunken hover:text-foreground'
                      )}
                    >
                      {mName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Filter Summary Box */}
            <div className="rounded-xl border border-success-line bg-success-soft/70 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <PieChart className="h-4 w-4 text-success-ink shrink-0" />
                  <span className="text-xs font-bold text-success-ink">
                    النتائج المطابقة: {processedData.filteredCount} قيداً عبر {processedData.bankGroups.length} حسابات
                  </span>
                </div>
                {processedData.priorPeriodTotal > 0 && (
                  <p className="text-[11px] text-warning-ink">
                    ⏳ يشمل {processedData.priorPeriodTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} د.ل مستحقات عن شهور سابقة.
                  </p>
                )}
              </div>
              <div className="text-left">
                <span className="text-[11px] text-muted-foreground block">إجمالي المبلغ المحسوب:</span>
                <span className="font-mono text-base font-bold text-success-ink">
                  {processedData.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} د.ل
                </span>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="border-t border-border bg-canvas-sunken px-5 py-3.5 flex items-center justify-between flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              إغلاق
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                disabled={downloadBusy || openBusy || processedData.filteredCount === 0}
                className="gap-1.5 text-xs h-9 font-medium"
              >
                {downloadBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                تحميل PDF
              </Button>

              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleOpenPdf}
                disabled={openBusy || downloadBusy || processedData.filteredCount === 0}
                className="gap-1.5 text-xs h-9 font-semibold bg-success hover:bg-success-ink text-white"
              >
                {openBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                معاينة وعرض PDF
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF In-App Preview Modal */}
      <PdfPreviewDialog
        open={previewOpen}
        onOpenChange={closePreview}
        url={previewUrl}
        fileName={`${fileName}.pdf`}
        displayTitle={customTitle.trim() || 'قيد الفترة المحاسبي المعتمد'}
        onDownload={handleDownloadPdf}
        downloadBusy={downloadBusy}
        canShare={canShareFiles}
        onShare={handleSharePdf}
        shareBusy={shareBusy}
      />
    </>
  );
}
