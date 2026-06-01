'use client';

import { useState, useMemo } from 'react';
import {
  Scale,
  Calendar,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/utils';
import { useTrialBalance, useBackfillTransactions } from '@/lib/db/mall-queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';

export default function TrialBalancePage() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const { data: rawBalanceData, isLoading, isError, error } = useTrialBalance(selectedYear);
  const backfillTx = useBackfillTransactions();

  // Parse and cast balances
  const balanceData = useMemo(() => {
    const list = (rawBalanceData as any)?.rows || [];
    return list.map((row: any) => ({
      code: row.category_code,
      name_ar: row.category_name,
      type: row.category_type,
      total_debit: Number(row.period_debit || 0),
      total_credit: Number(row.period_credit || 0),
      balance: Number(row.closing_balance || 0),
    }));
  }, [rawBalanceData]);

  // Compute total sums
  const { totalDebits, totalCredits, difference } = useMemo(() => {
    let debits = 0;
    let credits = 0;

    balanceData.forEach((row: any) => {
      debits += row.total_debit;
      credits += row.total_credit;
    });

    return {
      totalDebits: debits,
      totalCredits: credits,
      difference: Math.abs(debits - credits),
    };
  }, [balanceData]);

  const isBalanced = difference < 0.01;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="ميزان المراجعة"
        description="تقرير إجمالي يلخص كافة الأرصدة المدينة والدائنة للحسابات للتأكد من توازن الدفاتر"
        actions={
          <TajMallPdfToolbar
            fileName={`ميزان-المراجعة-${selectedYear}`}
            disabled={balanceData.length === 0}
            render={async () => {
              const { TrialBalanceReportPDF } = await import('@/features/pdf/TrialBalanceReportPDF');
              return (
                <TrialBalanceReportPDF
                  year={selectedYear}
                  rows={balanceData}
                />
              );
            }}
          />
        }
      />

      {/* Toolbar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-600">عرض السنة المالية:</span>
              <div className="flex gap-1.5">
                {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((year) => (
                  <Button
                    key={year}
                    variant={selectedYear === year ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedYear(year)}
                    className={selectedYear === year ? 'bg-emerald-700 hover:bg-emerald-800 text-white' : ''}
                  >
                    {year}
                  </Button>
                ))}
              </div>
            </div>

            {/* Balancing Status Badge */}
            {!isLoading && !isError && balanceData.length > 0 && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${
                isBalanced
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                {isBalanced ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    الميزان متوازن بنجاح
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-red-600" />
                    الميزان غير متوازن! الفارق: {formatMoney(difference, 'LYD')}
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Trial Balance Table Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">حالة الحسابات للسنة المالية {selectedYear}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : isError ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-red-600 bg-red-50 rounded-lg p-4">
              <AlertTriangle className="h-8 w-8" />
              <p className="font-semibold">فشل تحميل ميزان المراجعة</p>
              <p className="text-sm text-red-500">{(error as any)?.message}</p>
            </div>
          ) : balanceData.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-slate-400 gap-2">
              <Scale className="h-12 w-12 mb-1 opacity-50 text-slate-400" />
              <p className="font-medium text-slate-600 text-center">لا توجد حركات محاسبية مرحلة للسنة المالية {selectedYear}</p>
              <p className="text-xs text-slate-400 text-center">قد تحتاج إلى تشغيل الترحيل التراكمي لجلب المعاملات القديمة إلى دفتر اليومية.</p>
              <Button
                onClick={() => backfillTx.mutate()}
                disabled={backfillTx.isPending}
                className="mt-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold gap-2"
              >
                {backfillTx.isPending ? 'جاري الترحيل...' : 'تشغيل الترحيل التراكمي وتحديث التقارير'}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-slate-200 pb-3 text-slate-500 font-semibold">
                    <th className="pb-3 pr-2 text-right">رمز الحساب</th>
                    <th className="pb-3 text-right">اسم الحساب</th>
                    <th className="pb-3 text-right">نوع الحساب</th>
                    <th className="pb-3 text-left">مجموع المدين (Debit)</th>
                    <th className="pb-3 text-left">مجموع الدائن (Credit)</th>
                    <th className="pb-3 pl-2 text-left">صافي الرصيد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {balanceData.map((row: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 pr-2 font-mono text-slate-600 font-medium">{row.code}</td>
                      <td className="py-3 text-slate-900 font-bold">{row.name_ar}</td>
                      <td className="py-3 text-slate-500 font-medium">{row.type}</td>
                      <td className="py-3 text-left font-mono font-medium text-emerald-700">
                        {row.total_debit > 0 ? formatMoney(row.total_debit, '') : '-'}
                      </td>
                      <td className="py-3 text-left font-mono font-medium text-red-600">
                        {row.total_credit > 0 ? formatMoney(row.total_credit, '') : '-'}
                      </td>
                      <td className="py-3 pl-2 text-left font-mono font-bold text-slate-800">
                        {formatMoney(row.balance, 'LYD')}
                      </td>
                    </tr>
                  ))}

                  {/* Totals Summary Row */}
                  <tr className="border-t-2 border-slate-200 bg-slate-50/70 font-bold text-slate-900">
                    <td colSpan={3} className="py-4 pr-2 text-right">الإجمالي العام للدفاتر</td>
                    <td className="py-4 text-left font-mono text-emerald-800">
                      {formatMoney(totalDebits, 'LYD')}
                    </td>
                    <td className="py-4 text-left font-mono text-red-700">
                      {formatMoney(totalCredits, 'LYD')}
                    </td>
                    <td className={`py-4 pl-2 text-left font-mono ${isBalanced ? 'text-green-700' : 'text-red-700'}`}>
                      {isBalanced ? 'متوازن' : `فارق: ${formatMoney(difference, '')}`}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
