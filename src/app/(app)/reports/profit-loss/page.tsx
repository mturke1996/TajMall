'use client';

import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { useProfitLoss } from '@/lib/db/mall-queries';
import { toProfitLossRpcPeriod } from '@/lib/accounting-nav';
import { AccountingBackfillBanner } from '@/components/accounting/accounting-backfill-banner';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { AccountingYearPicker } from '@/components/accounting/accounting-year-picker';
import { AccountingFilterCard } from '@/components/accounting/accounting-filter-card';
import {
  AccountingError,
  AccountingLoading,
} from '@/components/accounting/accounting-states';

type LineItem = { name_ar: string; code: string; amount: number };

function PnLLineList({
  items,
  tone,
}: {
  items: LineItem[];
  tone: 'revenue' | 'expense';
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        لا توجد بنود لهذه الفترة
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((item, idx) => (
        <li
          key={`${item.code}-${idx}`}
          className="flex items-start justify-between gap-3 py-3 first:pt-0"
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm leading-snug">{item.name_ar}</p>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{item.code}</p>
          </div>
          <span
            className={cn(
              'shrink-0 font-mono text-sm font-bold tabular-nums',
              tone === 'revenue' ? 'text-emerald-700' : 'text-red-600',
            )}
          >
            {tone === 'revenue' ? '+' : '−'}
            {formatMoney(item.amount, '')}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function ProfitLossPage() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [periodType, setPeriodType] = useState<'YEAR' | 'QUARTER' | 'MONTH'>('YEAR');
  const [selectedQuarter, setSelectedQuarter] = useState<number>(1);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);

  const rpcPeriod = toProfitLossRpcPeriod(periodType);

  const { data: rawProfitLossData, isLoading, isError, error } = useProfitLoss(
    selectedYear,
    rpcPeriod,
    periodType === 'QUARTER' ? selectedQuarter : null,
    periodType === 'MONTH' ? selectedMonth : null,
  );

  const { revenues, expenses, totalRevenues, totalExpenses, netIncome, periodText } =
    useMemo(() => {
      const data = rawProfitLossData as {
        revenue?: Array<Record<string, unknown>>;
        expenses?: Array<Record<string, unknown>>;
        summary?: Record<string, unknown>;
      };

      const revs: LineItem[] = (data?.revenue || []).map((row) => ({
        name_ar: (row.category_name as string) || 'بند غير معروف',
        code: row.category_code as string,
        amount: Number(row.amount || 0),
      }));

      const exps: LineItem[] = (data?.expenses || []).map((row) => ({
        name_ar: (row.category_name as string) || 'بند غير معروف',
        code: row.category_code as string,
        amount: Number(row.amount || 0),
      }));

      const totRev = Number(data?.summary?.total_revenue || 0);
      const totExp = Number(data?.summary?.total_expense || 0);
      const net = Number(data?.summary?.net_profit || 0);

      let pText = `عام ${selectedYear}`;
      if (periodType === 'QUARTER') pText = `الربع ${selectedQuarter} — ${selectedYear}`;
      if (periodType === 'MONTH') {
        const monthNames = [
          'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
          'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
        ];
        pText = `${monthNames[selectedMonth - 1]} ${selectedYear}`;
      }

      return {
        revenues: revs,
        expenses: exps,
        totalRevenues: totRev,
        totalExpenses: totExp,
        netIncome: net,
        periodText: pText,
      };
    }, [rawProfitLossData, periodType, selectedYear, selectedQuarter, selectedMonth]);

  const quarters = [
    { value: 1, label: 'الربع الأول' },
    { value: 2, label: 'الربع الثاني' },
    { value: 3, label: 'الربع الثالث' },
    { value: 4, label: 'الربع الرابع' },
  ];

  const months = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ].map((label, i) => ({ value: i + 1, label }));

  const hasData = revenues.length > 0 || expenses.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="قائمة الأرباح والخسائر"
        description="مطابقة الإيرادات بالمصروفات لقياس الربحية التشغيلية"
        actions={
          <TajMallPdfToolbar
            fileName={`الأرباح-والخسائر-${selectedYear}-${periodType}`}
            disabled={!hasData}
            render={async () => {
              const { ProfitLossReportPDF } = await import(
                '@/features/pdf/ProfitLossReportPDF'
              );
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

      <AccountingPageBody>
        <AccountingFilterCard>
          <div className="space-y-4">
            <AccountingYearPicker value={selectedYear} onChange={setSelectedYear} />

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">نوع الفترة</p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['YEAR', 'سنوي'],
                    ['QUARTER', 'ربع سنوي'],
                    ['MONTH', 'شهري'],
                  ] as const
                ).map(([key, label]) => (
                  <Button
                    key={key}
                    type="button"
                    variant={periodType === key ? 'default' : 'outline'}
                    size="sm"
                    className={cn(
                      'min-h-10 touch-manipulation',
                      periodType === key && 'bg-sage-700 hover:bg-sage-800',
                    )}
                    onClick={() => setPeriodType(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {periodType === 'QUARTER' && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">الربع</p>
                <Select
                  value={selectedQuarter.toString()}
                  onValueChange={(v) => setSelectedQuarter(Number(v))}
                >
                  <SelectTrigger className="w-full min-h-11">
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
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">الشهر</p>
                <Select
                  value={selectedMonth.toString()}
                  onValueChange={(v) => setSelectedMonth(Number(v))}
                >
                  <SelectTrigger className="w-full min-h-11">
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
        </AccountingFilterCard>

        {isLoading && <AccountingLoading />}

        {isError && (
          <AccountingError
            title="فشل تحميل الأرباح والخسائر"
            message={(error as Error)?.message}
          />
        )}

        {!isLoading && !isError && !hasData && (
          <AccountingBackfillBanner
            title="لا توجد بيانات للفترة المحددة"
            description="بعد ترحيل المعاملات إلى دفتر اليومية تُحدَّث القائمة تلقائياً."
          />
        )}

        {!isLoading && !isError && hasData && (
          <>
            <Card
              className={cn(
                netIncome >= 0
                  ? 'border-emerald-200/80 bg-emerald-50/30'
                  : 'border-red-200/80 bg-red-50/30',
              )}
            >
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{periodText}</p>
                  <p className="text-sm font-medium text-muted-foreground mt-1">
                    {netIncome >= 0 ? 'صافي الأرباح' : 'صافي الخسائر'}
                  </p>
                  <p
                    className={cn(
                      'text-2xl sm:text-3xl font-mono font-bold tabular-nums mt-0.5',
                      netIncome >= 0 ? 'text-emerald-800' : 'text-red-700',
                    )}
                  >
                    {formatMoney(netIncome, 'LYD')}
                  </p>
                </div>
                <div
                  className={cn(
                    'self-start rounded-full p-3',
                    netIncome >= 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-red-100 text-red-700',
                  )}
                >
                  {netIncome >= 0 ? (
                    <TrendingUp className="h-7 w-7" />
                  ) : (
                    <TrendingDown className="h-7 w-7" />
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="flex flex-col gap-2 border-b border-border sm:flex-row sm:items-center sm:justify-between py-4">
                  <CardTitle className="text-base font-bold">الإيرادات</CardTitle>
                  <span className="font-mono text-sm font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md w-fit">
                    +{formatMoney(totalRevenues, 'LYD')}
                  </span>
                </CardHeader>
                <CardContent className="pt-4 pb-5">
                  <PnLLineList items={revenues} tone="revenue" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-col gap-2 border-b border-border sm:flex-row sm:items-center sm:justify-between py-4">
                  <CardTitle className="text-base font-bold">المصروفات</CardTitle>
                  <span className="font-mono text-sm font-bold text-red-700 bg-red-50 px-2.5 py-1 rounded-md w-fit">
                    −{formatMoney(totalExpenses, 'LYD')}
                  </span>
                </CardHeader>
                <CardContent className="pt-4 pb-5">
                  <PnLLineList items={expenses} tone="expense" />
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </AccountingPageBody>
    </>
  );
}
