'use client';

import { useState, useMemo } from 'react';
import {
  Wallet,
  ArrowRightLeft,
  Loader2,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatMoney } from '@/lib/utils';
import { useCashFlow } from '@/lib/db/mall-queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';

export default function CashFlowPage() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const { data: rawCashFlow, isLoading, isError, error } = useCashFlow(selectedYear);

  const cashFlowData = useMemo(() => {
    if (!rawCashFlow) return null;
    const data = rawCashFlow as any;

    const parseNum = (val: any) => Number(val || 0);

    return {
      operating: (data.operating || []).map((item: any) => ({
        category: item.category,
        description: item.description,
        amount: parseNum(item.amount),
        isPositive: item.is_positive,
      })),
      investing: (data.investing || []).map((item: any) => ({
        category: item.category,
        description: item.description,
        amount: parseNum(item.amount),
        isPositive: item.is_positive,
      })),
      financing: (data.financing || []).map((item: any) => ({
        category: item.category,
        description: item.description,
        amount: parseNum(item.amount),
        isPositive: item.is_positive,
      })),
      summary: {
        openingBalance: parseNum(data.summary?.opening_balance),
        closingBalance: parseNum(data.summary?.closing_balance),
        operatingInflow: parseNum(data.summary?.operating_inflow),
        operatingOutflow: parseNum(data.summary?.operating_outflow),
        netOperating: parseNum(data.summary?.net_operating),
        investingInflow: parseNum(data.summary?.investing_inflow),
        investingOutflow: parseNum(data.summary?.investing_outflow),
        netInvesting: parseNum(data.summary?.net_investing),
        financingInflow: parseNum(data.summary?.financing_inflow),
        financingOutflow: parseNum(data.summary?.financing_outflow),
        netFinancing: parseNum(data.summary?.net_financing),
        netChange: parseNum(data.summary?.net_change),
      }
    };
  }, [rawCashFlow]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="قائمة التدفقات النقدية"
        description="توضيح مصادر المقبوضات النقدية واستخدامات المدفوعات مقسمة إلى أنشطة تشغيلية، استثمارية وتمويلية"
        actions={
          <TajMallPdfToolbar
            fileName={`التدفقات-النقدية-${selectedYear}`}
            disabled={!cashFlowData}
            render={async () => {
              const { CashFlowReportPDF } = await import('@/features/pdf/CashFlowReportPDF');
              return (
                <CashFlowReportPDF
                  year={selectedYear}
                  data={cashFlowData!}
                />
              );
            }}
          />
        }
      />

      {/* Toolbar */}
      <Card>
        <CardContent className="pt-6">
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
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : isError ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-red-600 bg-red-50 rounded-lg p-4">
          <AlertTriangle className="h-8 w-8" />
          <p className="font-semibold">فشل تحميل قائمة التدفقات النقدية</p>
          <p className="text-sm text-red-500">{(error as any)?.message}</p>
        </div>
      ) : !cashFlowData ? (
        <div className="text-center py-12 text-slate-400">
          لا تتوفر بيانات للتدفقات النقدية في السنة المالية {selectedYear}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Balance Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="py-4">
                <span className="text-xs text-slate-500 font-medium">الرصيد النقدي الافتتاحي</span>
                <CardTitle className="text-2xl font-mono font-bold text-slate-700 mt-1">
                  {formatMoney(cashFlowData.summary.openingBalance, 'LYD')}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="py-4">
                <span className="text-xs text-slate-500 font-medium">صافي التغير النقدي</span>
                <CardTitle className={`text-2xl font-mono font-bold mt-1 ${
                  cashFlowData.summary.netChange >= 0 ? 'text-emerald-700' : 'text-red-600'
                }`}>
                  {cashFlowData.summary.netChange >= 0 ? '+' : ''}
                  {formatMoney(cashFlowData.summary.netChange, 'LYD')}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card className="border-emerald-100 bg-emerald-50/20">
              <CardHeader className="py-4">
                <span className="text-xs text-emerald-800 font-medium">الرصيد النقدي الختامي</span>
                <CardTitle className="text-2xl font-mono font-bold text-emerald-950 mt-1">
                  {formatMoney(cashFlowData.summary.closingBalance, 'LYD')}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Activities Breakdown */}
          <div className="grid gap-6 md:grid-cols-3">
            {/* Operating Activities */}
            <Card className="flex flex-col h-full">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-md font-bold text-slate-900">أنشطة التشغيل</CardTitle>
                <CardDescription>التدفقات النقدية الناتجة عن المبيعات والمصاريف المعتادة</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 flex-grow flex flex-col justify-between">
                <div className="space-y-4">
                  {cashFlowData.operating.map((item: { category: string; description: string; amount: number; isPositive: boolean }, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-sm">
                      <div>
                        <p className="font-bold text-slate-900">{item.category}</p>
                        <p className="text-xs text-slate-400">{item.description}</p>
                      </div>
                      <span className={`font-mono font-semibold ${item.isPositive ? 'text-emerald-700' : 'text-red-600'}`}>
                        {item.isPositive ? '+' : '-'}
                        {formatMoney(item.amount, '')}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center font-bold text-slate-800 text-sm">
                  <span>صافي نقد أنشطة التشغيل</span>
                  <span className={cashFlowData.summary.netOperating >= 0 ? 'text-emerald-700 font-mono' : 'text-red-600 font-mono'}>
                    {formatMoney(cashFlowData.summary.netOperating, 'LYD')}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Investing Activities */}
            <Card className="flex flex-col h-full">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-md font-bold text-slate-900">أنشطة الاستثمار</CardTitle>
                <CardDescription>تدفقات ناتجة عن شراء أو تصريف الأصول غير المتداولة</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 flex-grow flex flex-col justify-between">
                <div className="space-y-4">
                  {cashFlowData.investing.map((item: { category: string; description: string; amount: number; isPositive: boolean }, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-sm">
                      <div>
                        <p className="font-bold text-slate-900">{item.category}</p>
                        <p className="text-xs text-slate-400">{item.description}</p>
                      </div>
                      <span className={`font-mono font-semibold ${item.isPositive ? 'text-emerald-700' : 'text-red-600'}`}>
                        {item.isPositive ? '+' : '-'}
                        {formatMoney(item.amount, '')}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center font-bold text-slate-800 text-sm">
                  <span>صافي نقد أنشطة الاستثمار</span>
                  <span className={cashFlowData.summary.netInvesting >= 0 ? 'text-emerald-700 font-mono' : 'text-red-600 font-mono'}>
                    {formatMoney(cashFlowData.summary.netInvesting, 'LYD')}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Financing Activities */}
            <Card className="flex flex-col h-full">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-md font-bold text-slate-900">أنشطة التمويل</CardTitle>
                <CardDescription>تدفقات ناتجة عن رأس المال وتأمين العقود والتزامات الملاك</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 flex-grow flex flex-col justify-between">
                <div className="space-y-4">
                  {cashFlowData.financing.map((item: { category: string; description: string; amount: number; isPositive: boolean }, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-sm">
                      <div>
                        <p className="font-bold text-slate-900">{item.category}</p>
                        <p className="text-xs text-slate-400">{item.description}</p>
                      </div>
                      <span className={`font-mono font-semibold ${item.isPositive ? 'text-emerald-700' : 'text-red-600'}`}>
                        {item.isPositive ? '+' : '-'}
                        {formatMoney(item.amount, '')}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center font-bold text-slate-800 text-sm">
                  <span>صافي نقد أنشطة التمويل</span>
                  <span className={cashFlowData.summary.netFinancing >= 0 ? 'text-emerald-700 font-mono' : 'text-red-600 font-mono'}>
                    {formatMoney(cashFlowData.summary.netFinancing, 'LYD')}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
