'use client';

import { useState } from 'react';
import {
  CalendarRange,
  Plus,
  Lock,
  Unlock,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/lib/utils';
import {
  useFiscalPeriods,
  useCreateFiscalPeriod,
  useCloseFiscalPeriod,
  useBackfillTransactions
} from '@/lib/db/mall-queries';

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
    } catch (err) {
      // toast is already handled by hook
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
    if (!confirm('هل تريد ترحيل كافة المعاملات القديمة التي لم يتم ترحيلها بعد بالكامل إلى دفتر اليومية؟ قد يستغرق هذا الإجراء بضع ثوانٍ.')) return;
    await backfillTx.mutateAsync();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="الفترات المالية"
        description="إدارة وإغلاق الفترات المحاسبية الشهرية أو السنوية لمنع التعديلات التاريخية"
        actions={
          <Button
            variant="outline"
            className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            onClick={handleBackfill}
            disabled={backfillTx.isPending}
          >
            {backfillTx.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            الترحيل التراكمي للمعاملات السابقة
          </Button>
        }
      />

      <div className="grid gap-6 md:grid-cols-3">
        {/* New Period Form */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-lg font-bold">إنشاء فترة مالية جديدة</CardTitle>
            <CardDescription>
              تحديد التواريخ واسم الفترة لبدء الترحيل المحاسبي
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreatePeriod} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="period-name">اسم الفترة (مثال: 2026-06)</Label>
                <Input
                  id="period-name"
                  placeholder="2026-06"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
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
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800 text-white"
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

        {/* Periods List */}
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-bold">الفترات المالية الحالية</CardTitle>
              <CardDescription>
                الفترة المغلقة تمنع أي إضافات أو تعديلات على المعاملات أو الفواتير الواقعة ضمن تواريخها.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                </div>
              ) : isError ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 text-red-600 bg-red-50 rounded-lg p-4">
                  <AlertTriangle className="h-8 w-8" />
                  <p className="font-semibold">فشل تحميل الفترات المالية</p>
                  <p className="text-sm text-red-500">{(error as any)?.message}</p>
                </div>
              ) : periods.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center text-slate-400">
                  <CalendarRange className="h-10 w-10 mb-2 opacity-50" />
                  <p>لا توجد فترات مالية مسجلة بعد</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {periods.map((period) => (
                    <div
                      key={period.id}
                      className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{period.name}</span>
                          {period.is_closed ? (
                            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 font-medium">
                              مغلقة
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 font-medium">
                              مفتوحة نشطة
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          من {formatDate(period.start_date)} إلى {formatDate(period.end_date)}
                        </p>
                        {period.is_closed && period.closed_at && (
                          <p className="text-[10px] text-slate-400">
                            أغلقت في {formatDate(period.closed_at)}
                          </p>
                        )}
                      </div>
                      <Button
                        variant={period.is_closed ? 'outline' : 'destructive'}
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleTogglePeriod(period.id, period.is_closed)}
                        disabled={toggleClosePeriod.isPending}
                      >
                        {period.is_closed ? (
                          <>
                            <Unlock className="h-3.5 w-3.5" />
                            إعادة فتح الفتح
                          </>
                        ) : (
                          <>
                            <Lock className="h-3.5 w-3.5" />
                            إغلاق الفترة
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
