'use client';

import { useState } from 'react';
import { CalendarRange, Plus, Lock, Unlock, Loader2, RefreshCw, SearchCheck, ListChecks } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate, formatMoney } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  useFiscalPeriods,
  useCreateFiscalPeriod,
  useCloseFiscalPeriod,
  useCloseFiscalYear,
  usePreviewFiscalYearClose,
  useBackfillTransactions,
  type YearClosePreview,
} from '@/lib/db/mall-queries';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  AccountingEmpty,
  AccountingError,
  AccountingLoading,
} from '@/components/accounting/accounting-states';
import { PeriodReviewPanel } from '@/components/accounting/period-review-panel';

export default function FiscalPeriodsPage() {
  const { data: periods = [], isLoading, isError, error } = useFiscalPeriods();
  const createPeriod = useCreateFiscalPeriod();
  const toggleClosePeriod = useCloseFiscalPeriod();
  const previewYear = usePreviewFiscalYearClose();
  const closeYear = useCloseFiscalYear();
  const backfillTx = useBackfillTransactions();

  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [closeYearInput, setCloseYearInput] = useState(() =>
    String(new Date().getFullYear() - 1),
  );
  const [yearPreview, setYearPreview] = useState<YearClosePreview | null>(null);
  const [alsoClosePeriods, setAlsoClosePeriods] = useState(false);
  // the open period whose pre-close checklist is shown
  const [reviewId, setReviewId] = useState<string | null>(null);

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newStart || !newEnd) return;
    setIsSubmitting(true);
    try {
      await createPeriod.mutateAsync({
        name: newName,
        start_date: newStart,
        end_date: newEnd,
        is_closed: false,
      });
      setNewName('');
      setNewStart('');
      setNewEnd('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirm = useConfirm();

  const handleTogglePeriod = async (id: string, currentlyClosed: boolean) => {
    const ok = await confirm({
      title: currentlyClosed ? 'فتح الفترة المالية' : 'إغلاق الفترة المالية',
      description: currentlyClosed
        ? 'تصبح الفترة قابلة للتعديل: يمكن تسجيل أو حذف حركات بتواريخها.'
        : 'لا تُسجَّل بعدها حركة ولا يُحذف قيد بتاريخ داخل الفترة؛ التحصيل المتأخر يُسجَّل بتاريخ اليوم. راجع «مراجعة قبل الإقفال» أولاً.',
      confirmLabel: currentlyClosed ? 'افتح الفترة' : 'أغلق الفترة',
      tone: currentlyClosed ? 'danger' : 'default',
    });
    if (!ok) return;
    await toggleClosePeriod.mutateAsync({ id, closed: !currentlyClosed });
  };

  const handleBackfill = async () => {
    const ok = await confirm({
      title: 'ترحيل المعاملات القديمة',
      description: 'تُنشأ قيود يومية لكل معاملة قديمة ليس لها قيد. قد يستغرق ذلك بضع ثوانٍ.',
      confirmLabel: 'رحّل المعاملات',
      tone: 'default',
    });
    if (!ok) return;
    await backfillTx.mutateAsync();
  };

  const handlePreviewYear = async () => {
    const year = Number(closeYearInput);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) return;
    setYearPreview(null);
    const preview = await previewYear.mutateAsync(year);
    setYearPreview(preview);
  };

  const handleConfirmCloseYear = async () => {
    if (!yearPreview || !yearPreview.can_close || yearPreview.already_closed) return;
    const year = yearPreview.year;
    const ok = await confirm({
      title: `إقفال سنة ${year}`,
      description: 'يُنشأ قيد إقفال ينقل صافي السنة إلى «أرباح محتجزة». يُنفَّذ مرة واحدة لكل سنة.',
      details: [
        { label: 'السنة', value: <bdi>{year}</bdi> },
        { label: 'فترات السنة', value: alsoClosePeriods ? 'تُغلق كلها' : 'تبقى مفتوحة (أغلقها يدوياً)' },
      ],
      confirmLabel: 'أقفل السنة',
    });
    if (!ok) return;
    await closeYear.mutateAsync({ year, closePeriods: alsoClosePeriods });
    setYearPreview(null);
    setAlsoClosePeriods(false);
  };

  return (
    <>
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="الفترات المالية"
        description="إدارة وإغلاق الفترات، وإقفال السنة بنقل النتائج إلى الأرباح المحتجزة"
        actions={
          <Button
            variant="outline"
            className="gap-2 w-full sm:w-auto min-h-11 touch-manipulation border-border text-foreground"
            onClick={handleBackfill}
            disabled={backfillTx.isPending}
          >
            {backfillTx.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="truncate">ترحيل المعاملات السابقة</span>
          </Button>
        }
      />

      <AccountingPageBody>
        <Card className="border-border/80 bg-canvas-sunken/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold sm:text-lg">
              إقفال السنة المالية
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              خطوتان يدوياً: 1) تحقق من الأرقام 2) اضغط زر الإقفال. لا يحدث أي إقفال تلقائي.
              القيد ينقل الصافي إلى «أرباح محتجزة» (EQ-RE). إغلاق الفترات اختياري ومنفصل.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-2 w-full sm:max-w-40">
                <Label htmlFor="close-year">السنة</Label>
                <Input
                  id="close-year"
                  type="number"
                  dir="ltr"
                  min={2000}
                  max={2100}
                  value={closeYearInput}
                  onChange={(e) => {
                    setCloseYearInput(e.target.value);
                    setYearPreview(null);
                  }}
                  className="min-h-11"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="gap-2 min-h-11 touch-manipulation w-full sm:w-auto border-border"
                onClick={handlePreviewYear}
                disabled={previewYear.isPending}
              >
                {previewYear.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SearchCheck className="h-4 w-4" />
                )}
                تحقق من الأرقام
              </Button>
            </div>

            {yearPreview && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">نتيجة التحقق — سنة {yearPreview.year}</p>
                  {yearPreview.already_closed ? (
                    <Badge variant="outline" className="border-warning-line bg-warning-soft text-warning-ink">
                      مُقفلة مسبقاً
                    </Badge>
                  ) : yearPreview.can_close ? (
                    <Badge variant="outline" className="border-success-line bg-success-soft text-success-ink">
                      جاهزة للإقفال
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-border bg-canvas-sunken text-ink-soft">
                      لا أرصدة للإقفال
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                  <div>
                    <p className="text-[11px] text-ink-mute">الإيرادات</p>
                    <p className="num mt-0.5 font-semibold text-success-ink">
                      {formatMoney(yearPreview.total_revenue, 'LYD')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-ink-mute">المصروفات</p>
                    <p className="num mt-0.5 font-semibold text-danger-ink">
                      {formatMoney(yearPreview.total_expense, 'LYD')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-ink-mute">الصافي</p>
                    <p
                      className={cn(
                        'num mt-0.5 font-bold',
                        yearPreview.net_income >= 0 ? 'text-success-ink' : 'text-danger-ink',
                      )}
                    >
                      {formatMoney(yearPreview.net_income, 'LYD')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-ink-mute">الفترات</p>
                    <p className="mt-0.5 text-[13px] font-medium">
                      {yearPreview.open_periods} مفتوحة · {yearPreview.closed_periods} مغلقة
                    </p>
                  </div>
                </div>

                <label className="flex items-start gap-2 text-[12.5px] text-ink-main cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border"
                    checked={alsoClosePeriods}
                    onChange={(e) => setAlsoClosePeriods(e.target.checked)}
                    disabled={yearPreview.already_closed || !yearPreview.can_close}
                  />
                  <span>
                    عند التأكيد: أغلق أيضاً كل فترات هذه السنة (اختياري — يمكنك إغلاق كل فترة
                    يدوياً بزر «إغلاق الفترة» أدناه)
                  </span>
                </label>

                <Button
                  type="button"
                  variant="destructive"
                  className="gap-2 min-h-11 touch-manipulation w-full sm:w-auto"
                  onClick={handleConfirmCloseYear}
                  disabled={
                    closeYear.isPending ||
                    yearPreview.already_closed ||
                    !yearPreview.can_close
                  }
                >
                  {closeYear.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  إغلاق السنة ونقل النتائج
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
          <Card className="h-fit lg:sticky lg:top-14">
            <CardHeader>
              <CardTitle className="text-base font-bold sm:text-lg">
                فترة مالية جديدة
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                حدّد الاسم وتواريخ البدء والانتهاء
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreatePeriod} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="period-name">اسم الفترة</Label>
                  <Input
                    id="period-name"
                    placeholder="2026-06"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="min-h-11"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="start-date">تاريخ البدء</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={newStart}
                    onChange={(e) => setNewStart(e.target.value)}
                    className="min-h-11 touch-manipulation"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">تاريخ الانتهاء</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={newEnd}
                    onChange={(e) => setNewEnd(e.target.value)}
                    className="min-h-11 touch-manipulation"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full gap-2 min-h-11 touch-manipulation bg-foreground hover:bg-foreground"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  إنشاء الفترة
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold sm:text-lg">
                  الفترات الحالية
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  الفترة المغلقة تمنع إضافة أو تعديل معاملات ضمن تواريخها.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <AccountingLoading className="min-h-32" />
                ) : isError ? (
                  <AccountingError
                    title="فشل تحميل الفترات"
                    message={(error as Error)?.message}
                  />
                ) : periods.length === 0 ? (
                  <AccountingEmpty
                    icon={CalendarRange}
                    title="لا توجد فترات مسجلة"
                    description="أنشئ فترة مالية جديدة من النموذج."
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {periods.map((period) => (
                      <li
                        key={period.id}
                        className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold">{period.name}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-xs',
                                period.is_closed
                                  ? 'border-danger-line bg-danger-soft text-danger-ink'
                                  : 'border-success-line bg-success-soft text-success-ink',
                              )}
                            >
                              {period.is_closed ? 'مغلقة' : 'مفتوحة'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            من {formatDate(period.start_date)} إلى{' '}
                            {formatDate(period.end_date)}
                          </p>
                          {period.is_closed && period.closed_at && (
                            <p className="text-[11px] text-muted-foreground">
                              أُغلقت {formatDate(period.closed_at)}
                            </p>
                          )}
                        </div>
                        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
                        {!period.is_closed && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full sm:w-auto gap-1.5 min-h-10 touch-manipulation"
                            aria-expanded={reviewId === period.id}
                            onClick={() => setReviewId((id) => (id === period.id ? null : period.id))}
                          >
                            <ListChecks className="h-3.5 w-3.5" />
                            {reviewId === period.id ? 'إخفاء المراجعة' : 'مراجعة قبل الإقفال'}
                          </Button>
                        )}
                        <Button
                          variant={period.is_closed ? 'outline' : 'destructive'}
                          size="sm"
                          className="w-full sm:w-auto gap-1.5 min-h-10 touch-manipulation shrink-0"
                          onClick={() => handleTogglePeriod(period.id, period.is_closed)}
                          disabled={toggleClosePeriod.isPending}
                        >
                          {period.is_closed ? (
                            <>
                              <Unlock className="h-3.5 w-3.5" />
                              إعادة فتح الفترة
                            </>
                          ) : (
                            <>
                              <Lock className="h-3.5 w-3.5" />
                              إغلاق الفترة
                            </>
                          )}
                        </Button>
                        </div>
                        {reviewId === period.id && !period.is_closed && (
                          <div className="w-full sm:basis-full">
                            <PeriodReviewPanel startDate={period.start_date} endDate={period.end_date} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </AccountingPageBody>
    </>
  );
}
