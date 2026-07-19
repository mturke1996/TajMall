'use client';

import { useState } from 'react';
import {
  CalendarRange,
  Plus,
  Lock,
  Unlock,
  Loader2,
  RefreshCw,
  SearchCheck,
} from 'lucide-react';
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
import {
  AccountingEmpty,
  AccountingError,
  AccountingLoading,
} from '@/components/accounting/accounting-states';

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

  const handleTogglePeriod = async (id: string, currentlyClosed: boolean) => {
    const action = currentlyClosed ? 'فتح' : 'إغلاق';
    if (!confirm(`هل أنت متأكد من ${action} هذه الفترة المالية؟`)) return;
    await toggleClosePeriod.mutateAsync({ id, closed: !currentlyClosed });
  };

  const handleBackfill = async () => {
    if (
      !confirm(
        'هل تريد ترحيل كافة المعاملات القديمة غير المرحّلة إلى دفتر اليومية؟ قد يستغرق بضع ثوانٍ.',
      )
    )
      return;
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
    if (
      !confirm(
        `تأكيد إقفال سنة ${year}؟\n\nسيُنشأ قيد إقفال ينقل الصافي إلى «أرباح محتجزة».\nهذا الإجراء يدوي ولا يتكرر لنفس السنة.${
          alsoClosePeriods ? '\nسيتم أيضاً إغلاق كل فترات السنة.' : '\nفترات السنة لن تُغلق تلقائياً — أغلقها يدوياً بزر «إغلاق الفترة».'
        }`,
      )
    ) {
      return;
    }
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
            className="gap-2 w-full sm:w-auto min-h-11 touch-manipulation border-sage-200 text-sage-800"
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
        <Card className="border-sage-200/80 bg-sage-50/40">
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
              <div className="space-y-2 w-full sm:max-w-[10rem]">
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
                className="gap-2 min-h-11 touch-manipulation w-full sm:w-auto border-sage-300"
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
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                      مُقفلة مسبقاً
                    </Badge>
                  ) : yearPreview.can_close ? (
                    <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                      جاهزة للإقفال
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                      لا أرصدة للإقفال
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-ink-mute">الإيرادات</p>
                    <p className="num mt-0.5 font-semibold text-emerald-800">
                      {formatMoney(yearPreview.total_revenue, 'LYD')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-ink-mute">المصروفات</p>
                    <p className="num mt-0.5 font-semibold text-rose-800">
                      {formatMoney(yearPreview.total_expense, 'LYD')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-ink-mute">الصافي</p>
                    <p
                      className={cn(
                        'num mt-0.5 font-bold',
                        yearPreview.net_income >= 0 ? 'text-emerald-800' : 'text-rose-800',
                      )}
                    >
                      {formatMoney(yearPreview.net_income, 'LYD')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-ink-mute">الفترات</p>
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
          <Card className="h-fit lg:sticky lg:top-[3.5rem]">
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
                  className="w-full gap-2 min-h-11 touch-manipulation bg-sage-700 hover:bg-sage-800"
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
                  <AccountingLoading className="min-h-[8rem]" />
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
                        className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold">{period.name}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-xs',
                                period.is_closed
                                  ? 'border-red-200 bg-red-50 text-red-700'
                                  : 'border-green-200 bg-green-50 text-green-700',
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
                            <p className="text-[10px] text-muted-foreground">
                              أُغلقت {formatDate(period.closed_at)}
                            </p>
                          )}
                        </div>
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
