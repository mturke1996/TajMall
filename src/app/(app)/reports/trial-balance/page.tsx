'use client';

import { useState, useMemo } from 'react';
import { Scale, CheckCircle, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useTrialBalance } from '@/lib/db/mall-queries';
import { AccountingBackfillBanner } from '@/components/accounting/accounting-backfill-banner';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { AccountingYearPicker } from '@/components/accounting/accounting-year-picker';
import { AccountingFilterCard } from '@/components/accounting/accounting-filter-card';
import {
  AccountingEmpty,
  AccountingError,
  AccountingLoading,
} from '@/components/accounting/accounting-states';
import {
  TrialBalanceDesktopTable,
  TrialBalanceMobileList,
  type TrialBalanceRowView,
} from '@/components/accounting/trial-balance-mobile-list';

export default function TrialBalancePage() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const { data: rawBalanceData, isLoading, isError, error } = useTrialBalance(selectedYear);

  const balanceData = useMemo((): TrialBalanceRowView[] => {
    const list = (rawBalanceData as { rows?: unknown[] })?.rows || [];
    return list.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        category_id: r.category_id as string,
        code: r.category_code as string,
        name_ar: r.category_name as string,
        type: r.category_type as string,
        total_debit: Number(r.period_debit || 0),
        total_credit: Number(r.period_credit || 0),
        balance: Number(r.closing_balance || 0),
      };
    });
  }, [rawBalanceData]);

  const { totalDebits, totalCredits, difference } = useMemo(() => {
    let debits = 0;
    let credits = 0;
    balanceData.forEach((row) => {
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
    <>
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="ميزان المراجعة"
        description="ملخص الأرصدة المدينة والدائنة للتحقق من توازن الدفاتر"
        actions={
          <TajMallPdfToolbar
            fileName={`ميزان-المراجعة-${selectedYear}`}
            disabled={balanceData.length === 0}
            render={async () => {
              const { TrialBalanceReportPDF } = await import(
                '@/features/pdf/TrialBalanceReportPDF'
              );
              return (
                <TrialBalanceReportPDF year={selectedYear} rows={balanceData} />
              );
            }}
          />
        }
      />

      <AccountingPageBody>
        <AccountingFilterCard>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <AccountingYearPicker
              value={selectedYear}
              onChange={setSelectedYear}
              className="flex-1 min-w-0"
            />
            {!isLoading && !isError && balanceData.length > 0 && (
              <div
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold shrink-0',
                  isBalanced
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-red-50 border-red-200 text-red-800',
                )}
              >
                {isBalanced ? (
                  <>
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    <span>الميزان متوازن</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 shrink-0" />
                    <span className="break-words">
                      غير متوازن — فارق {formatMoney(difference, 'LYD')}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </AccountingFilterCard>

        {!isLoading && !isError && balanceData.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:hidden">
            <Card className="p-3">
              <p className="text-[10px] text-muted-foreground">إجمالي مدين</p>
              <p className="font-mono text-sm font-bold text-emerald-800 mt-0.5">
                {formatMoney(totalDebits, 'LYD')}
              </p>
            </Card>
            <Card className="p-3">
              <p className="text-[10px] text-muted-foreground">إجمالي دائن</p>
              <p className="font-mono text-sm font-bold text-red-700 mt-0.5">
                {formatMoney(totalCredits, 'LYD')}
              </p>
            </Card>
            <Card className="p-3 col-span-2 sm:col-span-1">
              <p className="text-[10px] text-muted-foreground">الحالة</p>
              <p
                className={cn(
                  'text-sm font-bold mt-0.5',
                  isBalanced ? 'text-emerald-700' : 'text-red-700',
                )}
              >
                {isBalanced ? 'متوازن' : 'غير متوازن'}
              </p>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold sm:text-lg">
              حسابات السنة {selectedYear}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2 pb-4 sm:pb-5">
            {isLoading ? (
              <AccountingLoading />
            ) : isError ? (
              <AccountingError
                title="فشل تحميل ميزان المراجعة"
                message={(error as Error)?.message}
              />
            ) : balanceData.length === 0 ? (
              <div className="space-y-4">
                <AccountingEmpty
                  icon={Scale}
                  title={`لا توجد حركات مرحّلة لعام ${selectedYear}`}
                  description="بعد ترحيل القيود من دفتر اليومية يظهر الميزان تلقائياً."
                />
                <AccountingBackfillBanner />
              </div>
            ) : (
              <>
                <TrialBalanceMobileList rows={balanceData} year={selectedYear} />
                <TrialBalanceDesktopTable
                  rows={balanceData}
                  year={selectedYear}
                  totalDebits={totalDebits}
                  totalCredits={totalCredits}
                  isBalanced={isBalanced}
                  difference={difference}
                />
              </>
            )}
          </CardContent>
        </Card>
      </AccountingPageBody>
    </>
  );
}
