'use client';

import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  FileText,
  FileDown,
  Calendar,
  Layers,
  CheckSquare,
  Square,
  SlidersHorizontal,
  Search,
  Check,
  CreditCard,
  Building2,
  PieChart,
  Loader2,
  Share2,
  TrendingUp,
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
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { renderPdfBlob, savePdfBlob, shouldUseInAppPdfViewer } from './pdf-blob-utils';
import { PdfPreviewDialog } from './pdf-preview-dialog';
import type { CategoryRow, TransactionWithRelations } from '@/lib/db/types';

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
  transactions: TransactionWithRelations[];
  defaultCategoryId?: string;
};

export function RevenuesPdfDialog({
  open,
  onOpenChange,
  categories,
  transactions,
  defaultCategoryId = 'ALL',
}: Props) {
  // Category Selection state
  const [categoryMode, setCategoryMode] = useState<'ALL' | 'CUSTOM'>(
    defaultCategoryId !== 'ALL' ? 'CUSTOM' : 'ALL'
  );
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(() =>
    defaultCategoryId !== 'ALL' ? [defaultCategoryId] : []
  );
  const [categorySearch, setCategorySearch] = useState('');

  // Date Selection state
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [dateMode, setDateMode] = useState<'ALL' | 'MONTHS' | 'RANGE'>('ALL');
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([currentMonth]);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // PDF Layout Options
  const [groupByMethod, setGroupByMethod] = useState(true);
  const [includeSummaries, setIncludeSummaries] = useState(true);
  const [customTitle, setCustomTitle] = useState('');

  // Execution / Preview States
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

  // Available Years from transactions
  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear, currentYear - 1]);
    for (const t of transactions) {
      if (t.tx_date) {
        const y = new Date(t.tx_date).getFullYear();
        if (!isNaN(y)) years.add(y);
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions, currentYear]);

  // Categories filtered by search
  const filteredCategoriesList = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    const q = categorySearch.toLowerCase().trim();
    return categories.filter(
      (c) =>
        (c.name_ar && c.name_ar.toLowerCase().includes(q)) ||
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.code && c.code.toLowerCase().includes(q))
    );
  }, [categories, categorySearch]);

  // Toggle Category selection
  const toggleCategory = (id: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllCategories = () => {
    setSelectedCategoryIds(categories.map((c) => c.id));
  };

  const deselectAllCategories = () => {
    setSelectedCategoryIds([]);
  };

  // Toggle Month selection
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

  const selectAllMonths = () => {
    setSelectedMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  };

  // Quick Date Range Presets
  const applyRangePreset = (preset: 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_3_MONTHS' | 'THIS_YEAR') => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    if (preset === 'THIS_MONTH') {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      setFromDate(start.toISOString().slice(0, 10));
      setToDate(end.toISOString().slice(0, 10));
    } else if (preset === 'LAST_MONTH') {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      setFromDate(start.toISOString().slice(0, 10));
      setToDate(end.toISOString().slice(0, 10));
    } else if (preset === 'LAST_3_MONTHS') {
      const start = new Date(y, m - 2, 1);
      const end = new Date(y, m + 1, 0);
      setFromDate(start.toISOString().slice(0, 10));
      setToDate(end.toISOString().slice(0, 10));
    } else if (preset === 'THIS_YEAR') {
      setFromDate(`${y}-01-01`);
      setToDate(`${y}-12-31`);
    }
  };

  // Filter Transactions based on selected options
  const matchingTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // 1. Category Filter
      if (categoryMode === 'CUSTOM') {
        if (selectedCategoryIds.length === 0) return false;
        if (!tx.category_id || !selectedCategoryIds.includes(tx.category_id)) {
          return false;
        }
      }

      // 2. Date Filter
      if (dateMode === 'MONTHS') {
        if (!tx.tx_date) return false;
        const d = new Date(tx.tx_date);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        if (y !== selectedYear || !selectedMonths.includes(m)) {
          return false;
        }
      } else if (dateMode === 'RANGE') {
        if (!tx.tx_date) return false;
        const txDate = tx.tx_date.slice(0, 10);
        if (fromDate && txDate < fromDate) return false;
        if (toDate && txDate > toDate) return false;
      }

      return true;
    });
  }, [
    transactions,
    categoryMode,
    selectedCategoryIds,
    dateMode,
    selectedYear,
    selectedMonths,
    fromDate,
    toDate,
  ]);

  // Statistics
  const totalAmount = useMemo(() => {
    return matchingTransactions.reduce((acc, r) => acc + Number(r.amount || 0), 0);
  }, [matchingTransactions]);

  // Period label for report subtitle
  const periodLabel = useMemo(() => {
    if (dateMode === 'ALL') return'كامل المدة المسجلة';
    if (dateMode === 'MONTHS') {
      if (selectedMonths.length === 12) return `كامل عام ${selectedYear}`;
      const monthsStr = selectedMonths
        .map((m) => MONTH_NAMES_AR[m - 1].split(' ')[0])
        .join('، ');
      return `شهور: ${monthsStr} (${selectedYear})`;
    }
    if (dateMode === 'RANGE') {
      if (fromDate && toDate) return `من ${fromDate} إلى ${toDate}`;
      if (fromDate) return `من تاريخ ${fromDate}`;
      if (toDate) return `حتى تاريخ ${toDate}`;
      return 'نطاق تواريخ مخصص';
    }
    return '';
  }, [dateMode, selectedYear, selectedMonths, fromDate, toDate]);

  // Categories label for report subtitle
  const categoriesLabel = useMemo(() => {
    if (categoryMode === 'ALL') return'كافة بنود الإيرادات';
    if (selectedCategoryIds.length === 1) {
      const cat = categories.find((c) => c.id === selectedCategoryIds[0]);
      return cat?.name_ar || 'بند محدد';
    }
    if (selectedCategoryIds.length <= 3) {
      return selectedCategoryIds
        .map((id) => categories.find((c) => c.id === id)?.name_ar)
        .filter(Boolean)
        .join('، ');
    }
    return `${selectedCategoryIds.length} بنود مختارة`;
  }, [categoryMode, selectedCategoryIds, categories]);

  // Generated File Name
  const fileName = useMemo(() => {
    const cleanPeriod = periodLabel.replace(/[^\u0621-\u064A\w-]/g, '_').slice(0, 30);
    const cleanCat = categoriesLabel.replace(/[^\u0621-\u064A\w-]/g, '_').slice(0, 25);
    return `تقرير-إيرادات-${cleanCat}-${cleanPeriod}-${new Date().toISOString().slice(0, 10)}`;
  }, [periodLabel, categoriesLabel]);

  // Generate Report JSX for PDF renderer
  const generatePdfElement = useCallback(async () => {
    const { RevenuesReportPDF } = await import('./RevenuesReportPDF');
    return (
      <RevenuesReportPDF
        titleAr={customTitle.trim() || 'كشف الإيرادات التفصيلي'}
        subtitleAr={`${periodLabel} · ${categoriesLabel}`}
        rows={matchingTransactions}
        groupByPaymentMethod={groupByMethod}
        includeSummaries={includeSummaries}
        periodLabel={periodLabel}
        categoriesLabel={categoriesLabel}
      />
    );
  }, [
    customTitle,
    periodLabel,
    categoriesLabel,
    matchingTransactions,
    groupByMethod,
    includeSummaries,
  ]);

  // Handlers for PDF Open / Download / Share
  const handleOpenPdf = async () => {
    if (openBusy || matchingTransactions.length === 0) return;
    setOpenBusy(true);
    const id = toast.loading('جاري توليد ملف PDF المخصص للإيرادات…');
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
    if (downloadBusy || matchingTransactions.length === 0) return;
    setDownloadBusy(true);
    const id = toast.loading('جاري تجهيز وتنزيل ملف PDF…');
    try {
      const blob = await renderPdfBlob(generatePdfElement);
      const mode = await savePdfBlob(blob, fileName, {
        title: customTitle.trim() || 'كشف الإيرادات',
        text: `${periodLabel} - ${categoriesLabel}`,
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
    if (shareBusy || matchingTransactions.length === 0) return;
    setShareBusy(true);
    try {
      const blob = await renderPdfBlob(generatePdfElement);
      await savePdfBlob(blob, fileName, {
        title: customTitle.trim() || 'كشف الإيرادات',
        text: `${periodLabel} - ${categoriesLabel}`,
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
          className="max-w-2xl w-[calc(100%-1.5rem)] p-0 overflow-hidden rounded-2xl border bg-card shadow-lift"
          dir="rtl"
        >
          {/* Header */}
          <div className="border-b border-border bg-canvas-sunken/60 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-soft text-success-ink">
                <TrendingUp className="h-5 w-5 stroke-[1.8]" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  تخصيص وتصدير تقرير الإيرادات (PDF)
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  حدد البنود والفترة الزمنية وطريقة فصل الجداول وإجماليات البنوك والخزائن.
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="max-h-[calc(80vh-140px)] overflow-y-auto p-5 space-y-5">
            {/* 1. Category Selection Section */}
            <div className="space-y-2.5 rounded-xl border border-border/80 bg-canvas p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-success-ink" />
                  <span className="text-xs font-bold text-foreground">
                    1. اختيار بنود الإيرادات
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-canvas-sunken p-0.5 rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setCategoryMode('ALL')}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                      categoryMode === 'ALL'
                        ? 'bg-card text-foreground font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    كافة البنود
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryMode('CUSTOM')}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                      categoryMode === 'CUSTOM'
                        ? 'bg-card text-foreground font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    تحديد بنود معينة
                  </button>
                </div>
              </div>

              {categoryMode === 'CUSTOM' && (
                <div className="mt-2 space-y-2 pt-1 border-t border-border/60">
                  <div className="flex items-center justify-between gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute inset-e-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={categorySearch}
                        onChange={(e) => setCategorySearch(e.target.value)}
                        placeholder="ابحث عن بند إيراد…"
                        className="h-8 pe-8 text-xs bg-card"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={selectAllCategories}
                        className="h-8 px-2 text-[11px] text-success-ink hover:text-success-ink"
                      >
                        <CheckSquare className="h-3.5 w-3.5 me-1" />
                        تحديد الكل
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={deselectAllCategories}
                        className="h-8 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        <Square className="h-3.5 w-3.5 me-1" />
                        إلغاء الكل
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-1 border rounded-lg bg-card">
                    {filteredCategoriesList.length === 0 ? (
                      <p className="col-span-2 text-center text-xs text-muted-foreground py-3">
                        لا توجد بنود إيراد مطابقة للبحث
                      </p>
                    ) : (
                      filteredCategoriesList.map((cat) => {
                        const isSelected = selectedCategoryIds.includes(cat.id);
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => toggleCategory(cat.id)}
                            className={cn(
                              'flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors text-start border',
                              isSelected
                                ? 'bg-success-soft border-success-line text-success-ink font-medium'
                                : 'bg-canvas-sunken/40 border-transparent hover:bg-canvas-sunken text-muted-foreground'
                            )}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: cat.color || '#166534' }}
                              />
                              <span className="truncate">{cat.name_ar}</span>
                            </div>
                            <div
                              className={cn(
                                'h-4 w-4 rounded border flex items-center justify-center shrink-0 ms-1.5',
                                isSelected
                                  ? 'bg-success border-success text-white'
                                  : 'border-muted-foreground/40 bg-card'
                              )}
                            >
                              {isSelected && <Check className="h-3 w-3 stroke-3" />}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    تم اختيار {selectedCategoryIds.length} من أصل {categories.length} بند
                  </p>
                </div>
              )}
            </div>

            {/* 2. Date Selection Section */}
            <div className="space-y-2.5 rounded-xl border border-border/80 bg-canvas p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-success-ink" />
                  <span className="text-xs font-bold text-foreground">
                    2. اختيار الفترة الزمنية
                  </span>
                </div>
                <div className="flex items-center gap-1 bg-canvas-sunken p-0.5 rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setDateMode('ALL')}
                    className={cn(
                      'px-2 py-1 text-xs font-medium rounded-md transition-colors',
                      dateMode === 'ALL'
                        ? 'bg-card text-foreground font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    كامل المدة
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateMode('MONTHS')}
                    className={cn(
                      'px-2 py-1 text-xs font-medium rounded-md transition-colors',
                      dateMode === 'MONTHS'
                        ? 'bg-card text-foreground font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    تحديد أشهر
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateMode('RANGE')}
                    className={cn(
                      'px-2 py-1 text-xs font-medium rounded-md transition-colors',
                      dateMode === 'RANGE'
                        ? 'bg-card text-foreground font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    نطاق تاريخ (من - إلى)
                  </button>
                </div>
              </div>

              {/* Specific Months Picker */}
              {dateMode === 'MONTHS' && (
                <div className="mt-2 space-y-2 pt-1 border-t border-border/60">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">السنة:</span>
                      <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                        className="h-8 rounded-md border border-border bg-card px-2 text-xs font-semibold outline-hidden"
                      >
                        {availableYears.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1 flex-wrap">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => selectQuarter(1)}
                        className="h-7 px-1.5 text-[11px]"
                      >
                        الربع 1
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => selectQuarter(2)}
                        className="h-7 px-1.5 text-[11px]"
                      >
                        الربع 2
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => selectQuarter(3)}
                        className="h-7 px-1.5 text-[11px]"
                      >
                        الربع 3
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => selectQuarter(4)}
                        className="h-7 px-1.5 text-[11px]"
                      >
                        الربع 4
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={selectAllMonths}
                        className="h-7 px-1.5 text-[11px] font-semibold text-success-ink"
                      >
                        كل السنة
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
              )}

              {/* Custom Date Range Picker */}
              {dateMode === 'RANGE' && (
                <div className="mt-2 space-y-2.5 pt-1 border-t border-border/60">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyRangePreset('THIS_MONTH')}
                      className="h-7 text-[11px]"
                    >
                      هذا الشهر
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyRangePreset('LAST_MONTH')}
                      className="h-7 text-[11px]"
                    >
                      الشهر الماضي
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyRangePreset('LAST_3_MONTHS')}
                      className="h-7 text-[11px]"
                    >
                      آخر 3 أشهر
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyRangePreset('THIS_YEAR')}
                      className="h-7 text-[11px]"
                    >
                      العام الحالي
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                        من تاريخ
                      </label>
                      <Input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="h-8 text-xs bg-card"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                        إلى تاريخ
                      </label>
                      <Input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="h-8 text-xs bg-card"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 3. PDF Display & Grouping Options */}
            <div className="space-y-3 rounded-xl border border-border/80 bg-canvas p-3.5">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-success-ink" />
                <span className="text-xs font-bold text-foreground">
                  3. خيارات العرض والتقسيم في الـ PDF
                </span>
              </div>

              <div className="space-y-2">
                {/* Group by Payment Method Toggle */}
                <label className="flex items-center justify-between p-2 rounded-lg border border-border bg-card cursor-pointer hover:bg-canvas-sunken/60 transition-colors">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-foreground block">
                      فصل الجداول حسب طريقة ونوع الدفع
                    </span>
                    <span className="text-[11px] text-muted-foreground block">
                      عرض جدول مستقل لكل طريقة (نقدي، بطاقة، حوالة، صك) مع مجاميعها ومصارفها.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={groupByMethod}
                    onChange={(e) => setGroupByMethod(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-success-ink focus:ring-success ms-3 accent-success cursor-pointer"
                  />
                </label>

                {/* Summaries Toggle */}
                <label className="flex items-center justify-between p-2 rounded-lg border border-border bg-card cursor-pointer hover:bg-canvas-sunken/60 transition-colors">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-foreground block">
                      تضمين جداول الملخص الإحصائي (البنود، البنوك، طرق الدفع)
                    </span>
                    <span className="text-[11px] text-muted-foreground block">
                      إدراج ملخص توزيع طرق الدفع ومجموع كل بند ومجموع المصارف والخزائن بأعلى التقرير.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={includeSummaries}
                    onChange={(e) => setIncludeSummaries(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-success-ink focus:ring-success ms-3 accent-success cursor-pointer"
                  />
                </label>
              </div>

              {/* Optional Custom Title */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  عنوان مخصص للتقرير (اختياري)
                </label>
                <Input
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="مثال: كشف الإيرادات التشغيلية لتاج مول"
                  className="h-8 text-xs bg-card"
                />
              </div>
            </div>

            {/* Live Filter Summary Bar */}
            <div className="rounded-xl border border-success-line bg-success-soft/70 p-3 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <PieChart className="h-4 w-4 text-success-ink shrink-0" />
                <span className="text-xs font-medium text-success-ink">
                  النتائج المطابقة:{' '}
                  <strong className="font-bold">{matchingTransactions.length} قيداً</strong>
                </span>
              </div>
              <div className="text-xs font-bold text-success-ink">
                الإجمالي:{' '}
                <span className="font-mono text-[13px]">
                  {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} د.ل
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
                disabled={downloadBusy || openBusy || matchingTransactions.length === 0}
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
                disabled={openBusy || downloadBusy || matchingTransactions.length === 0}
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
        displayTitle={customTitle.trim() || 'كشف الإيرادات التفصيلي'}
        onDownload={handleDownloadPdf}
        downloadBusy={downloadBusy}
        canShare={canShareFiles}
        onShare={handleSharePdf}
        shareBusy={shareBusy}
      />
    </>
  );
}
