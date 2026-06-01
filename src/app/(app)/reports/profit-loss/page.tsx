'use client';

import { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Loader2,
  AlertTriangle,
  FileSpreadsheet
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
import { formatMoney } from '@/lib/utils';
import { useProfitLoss, useBackfillTransactions } from '@/lib/db/mall-queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';

export default function ProfitLossPage() {
  const backfillTx = useBackfillTransactions();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [periodType, setPeriodType] = useState<'YEAR' | 'QUARTER' | 'MONTH'>('YEAR');
  const [selectedQuarter, setSelectedQuarter] = useState<number>(1);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);

  const { data: rawProfitLossData, isLoading, isError, error } = useProfitLoss(
    selectedYear,
    periodType,
    periodType === 'QUARTER' ? selectedQuarter : null,
    periodType === 'MONTH' ? selectedMonth : null
  );

  const { revenues, expenses, totalRevenues, totalExpenses, netIncome } = useMemo(() => {
    const data = rawProfitLossData as any;
    
    const revs = (data?.revenue || []).map((row: any) => ({
      name_ar: row.category_name || 'بند غير معروف',
      code: row.category_code,
      amount: Number(row.amount || 0),
    }));

    const exps = (data?.expenses || []).map((row: any) => ({
      name_ar: row.category_name || 'بند غير معروف',
      code: row.category_code,
      amount: Number(row.amount || 0),
    }));

    const totRev = Number(data?.summary?.total_revenue || 0);
    const totExp = Number(data?.summary?.total_expense || 0);
    const net = Number(data?.summary?.net_profit || 0);

    return {
      revenues: revs,
      expenses: exps,
      totalRevenues: totRev,
      totalExpenses: totExp,
      netIncome: net,
    };
  }, [rawProfitLossData]);

  const quarters = [
    { value: 1, label: 'الربع الأول (Q1)' },
    { value: 2, label: 'الربع الثاني (Q2)' },
    { value: 3, label: 'الربع الثالث (Q3)' },
    { value: 4, label: 'الربع الرابع (Q4)' },
  ];

  const months = [
    { value: 1, label: 'يناير' },
    { value: 2, label: 'فبراير' },
    { value: 3, label: 'مارس' },
    { value: 4, label: 'أبريل' },
    { value: 5, label: 'مايو' },
    { value: 6, label: 'يونيو' },
    { value: 7, label: 'يوليو' },
    { value: 8, label: 'أغسطس' },
    { value: 9, label: 'سبتمبر' },
    { value: 10, label: 'أكتوبر' },
    { value: 11, label: 'نوفمبر' },
    { value: 12, label: 'ديسمبر' },
  ];

  const periodText = useMemo(() => {
    if (periodType === 'YEAR') return `عام ${selectedYear}`;
    if (periodType === 'QUARTER') return `الربع ${selectedQuarter} لعام ${selectedYear}`;
    if (periodType === 'MONTH') {
      const monthNames = [
        'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
      ];
      return `شهر ${monthNames[selectedMonth - 1]} لعام ${selectedYear}`;
    }
    return '';
  }, [periodType, selectedYear, selectedQuarter, selectedMonth]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="قائمة الأرباح والخسائر"
        description="تقرير مالي يقيس ربحية التشغيل عن طريق مطابقة إجمالي الإيرادات بالمصروفات"
        actions={
          <TajMallPdfToolbar
            fileName={`الأرباح-والخسائر-${selectedYear}-${periodType}`}
            disabled={revenues.length === 0 && expenses.length === 0}
            render={async () => {
              const { ProfitLossReportPDF } = await import('@/features/pdf/ProfitLossReportPDF');
              return (
                <ProfitLossReportPDF
                  year={selectedYear}
                  periodText={periodText}
                  revenues={revenues}
                  expenses={expenses}
                />
              );
            }}
          />
        }
      />

      {/* Toolbar / Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <div className="space-y-1">
                <span className="text-xs text-slate-500 block mb-1">السنة</span>
                <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(Number(val))}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-slate-500 block mb-1">نوع الفترة</span>
                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <Button
                    variant={periodType === 'YEAR' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="text-xs px-3"
                    onClick={() => setPeriodType('YEAR')}
                  >
                    سنوي
                  </Button>
                  <Button
                    variant={periodType === 'QUARTER' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="text-xs px-3"
                    onClick={() => setPeriodType('QUARTER')}
                  >
                    ربع سنوي
                  </Button>
                  <Button
                    variant={periodType === 'MONTH' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="text-xs px-3"
                    onClick={() => setPeriodType('MONTH')}
                  >
                    شهري
                  </Button>
                </div>
              </div>

              {periodType === 'QUARTER' && (
                <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                  <span className="text-xs text-slate-500 block mb-1">الربع</span>
                  <Select value={selectedQuarter.toString()} onValueChange={(val) => setSelectedQuarter(Number(val))}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {quarters.map((q) => (
                        <SelectItem key={q.value} value={q.value.toString()}>
                          {q.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {periodType === 'MONTH' && (
                <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                  <span className="text-xs text-slate-500 block mb-1">الشهر</span>
                  <Select value={selectedMonth.toString()} onValueChange={(val) => setSelectedMonth(Number(val))}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((m) => (
                        <SelectItem key={m.value} value={m.value.toString()}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cumulative Backfill Helper for Empty Reports */}
      {!isLoading && !isError && revenues.length === 0 && expenses.length === 0 && (
        <Card className="border-amber-100 bg-amber-50/20 p-6 flex flex-col items-center justify-center text-center gap-2">
          <TrendingUp className="h-10 w-10 text-amber-500 stroke-[1.5] mb-1" />
          <p className="font-bold text-amber-900">لا توجد بيانات للأرباح والخسائر خلال الفترة المحددة</p>
          <p className="text-xs text-amber-700 max-w-md">إذا كان لديك معاملات مسجلة مسبقاً، قد تحتاج لتشغيل الترحيل التراكمي لإنشاء القيود اليومية وعرضها بالتقارير.</p>
          <Button
            onClick={() => backfillTx.mutate()}
            disabled={backfillTx.isPending}
            className="mt-3 bg-amber-700 hover:bg-amber-800 text-white font-bold gap-2"
          >
            {backfillTx.isPending ? 'جاري الترحيل...' : 'تشغيل الترحيل التراكمي وتحديث التقارير'}
          </Button>
        </Card>
      )}

      {/* Net Income Overview Card */}
      {!isLoading && !isError && (revenues.length > 0 || expenses.length > 0) && (
        <Card className={netIncome >= 0 ? "border-emerald-100 bg-emerald-50/20" : "border-red-100 bg-red-50/20"}>
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-sm font-medium text-slate-500">
                {netIncome >= 0 ? 'صافي الأرباح التشغيلية' : 'صافي الخسائر التشغيلية'}
              </span>
              <p className={`text-3xl font-mono font-bold ${netIncome >= 0 ? 'text-emerald-800' : 'text-red-700'}`}>
                {formatMoney(netIncome, 'LYD')}
              </p>
            </div>
            <div className={`p-3 rounded-full ${netIncome >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
              {netIncome >= 0 ? <TrendingUp className="h-8 w-8" /> : <TrendingDown className="h-8 w-8" />}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revenues and Expenses Columns */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Revenues Card */}
        <Card>
          <CardHeader className="border-b border-slate-100 flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-bold text-slate-800">الإيرادات (Revenues)</CardTitle>
            <span className="font-mono text-emerald-800 font-bold bg-emerald-50 px-2.5 py-1 rounded text-sm">
              +{formatMoney(totalRevenues, 'LYD')}
            </span>
          </CardHeader>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : isError ? (
              <p className="text-sm text-red-500">خطأ في التحميل</p>
            ) : revenues.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-6">لا توجد إيرادات مسجلة لهذه الفترة</p>
            ) : (
              <div className="space-y-3">
                {revenues.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center py-1">
                    <div className="space-y-0.5">
                      <p className="font-bold text-slate-900">{item.name_ar}</p>
                      <p className="text-xs text-slate-400 font-mono">{item.code}</p>
                    </div>
                    <span className="font-mono font-bold text-emerald-700">
                      +{formatMoney(item.amount, '')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expenses Card */}
        <Card>
          <CardHeader className="border-b border-slate-100 flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-bold text-slate-800">المصروفات (Expenses)</CardTitle>
            <span className="font-mono text-red-700 font-bold bg-red-50 px-2.5 py-1 rounded text-sm">
              -{formatMoney(totalExpenses, 'LYD')}
            </span>
          </CardHeader>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : isError ? (
              <p className="text-sm text-red-500">خطأ في التحميل</p>
            ) : expenses.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-6">لا توجد مصروفات مسجلة لهذه الفترة</p>
            ) : (
              <div className="space-y-3">
                {expenses.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center py-1">
                    <div className="space-y-0.5">
                      <p className="font-bold text-slate-900">{item.name_ar}</p>
                      <p className="text-xs text-slate-400 font-mono">{item.code}</p>
                    </div>
                    <span className="font-mono font-bold text-red-600">
                      -{formatMoney(item.amount, '')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
