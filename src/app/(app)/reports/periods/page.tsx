'use client';

import { useState } from 'react';
import {
  CalendarRange,
  Plus,
  Lock,
  Unlock,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  useFiscalPeriods,
  useCreateFiscalPeriod,
  useCloseFiscalPeriod,
  useBackfillTransactions,
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
  const backfillTx = useBackfillTransactions();

  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  return (
    <>
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="الفترات المالية"
        description="إدارة وإغلاق الفترات لمنع التعديل على السجلات التاريخية"
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
