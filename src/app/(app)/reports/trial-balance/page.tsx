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
import { ExportCsvButton } from '@/components/data/export-csv-button';
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
  type TrialBalanceSummary,
} from '@/components/accounting/trial-balance-mobile-list';

const EMPTY_SUMMARY: TrialBalanceSummary = {
  total_opening_debit: 0,
  total_opening_credit: 0,
  total_period_debit: 0,
  total_period_credit: 0,
  total_closing_debit: 0,
  total_closing_credit: 0,
};

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
        opening_debit: Number(r.opening_debit || 0),
        opening_credit: Number(r.opening_credit || 0),
        period_debit: Number(r.period_debit || 0),
        period_credit: Number(r.period_credit || 0),
        // closing_debit / closing_credit become the trial-balance debit/credit
        // columns so the balance check uses closing balances, not period moves.
        total_debit: Number(r.closing_debit || 0),
        total_credit: Number(r.closing_credit || 0),
        balance: Number(r.closing_balance || 0),
      };
    });
  }, [rawBalanceData]);

  const summary = useMemo((): TrialBalanceSummary => {
    const s = (rawBalanceData as { summary?: Record<string, unknown> })?.summary;
    if (s) {
      return {
        total_opening_debit: Number(s.total_opening_debit || 0),
        total_opening_credit: Number(s.total_opening_credit || 0),
        total_period_debit: Number(s.total_period_debit || 0),
        total_period_credit: Number(s.total_period_credit || 0),
        total_closing_debit: Number(s.total_closing_debit || 0),
        total_closing_credit: Number(s.total_closing_credit || 0),
      };
    }
    // Fallback: derive totals from the rows themselves (zero rows contribute 0,
    // so summing the filtered set equals summing all categories).
    return balanceData.reduce(
      (acc, r) => ({
        total_opening_debit: acc.total_opening_debit + r.opening_debit,
        total_opening_credit: acc.total_opening_credit + r.opening_credit,
        total_period_debit: acc.total_period_debit + r.period_debit,
        total_period_credit: acc.total_period_credit + r.period_credit,
        total_closing_debit: acc.total_closing_debit + r.total_debit,
        total_closing_credit: acc.total_closing_credit + r.total_credit,
      }),
      EMPTY_SUMMARY,
    );
  }, [rawBalanceData, balanceData]);

  // The trial balance is balanced when closing debits equal closing credits.
  // Checking on period movements alone is meaningless (double-entry always
  // balances within a period), so we verify the cumulative closing position.
  const difference = useMemo(
    () => Math.abs(summary.total_closing_debit - summary.total_closing_credit),
    [summary],
  );
  const isBalanced = difference < 0.01;

  return (
    <>
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="ميزان المراجعة"
        description="ملخص الأرصدة المدينة والدائنة للتحقق من توازن الدفاتر"
        actions={
          <>
            <ExportCsvButton
              fileName={`ميزان-المراجعة-${selectedYear}`}
              disabled={balanceData.length === 0}
              headers={[
                'الكود',
                'البند',
                'النوع',
                'افتتاحي مدين',
                'افتتاحي دائن',
                'حركة مدين',
                'حركة دائن',
                'ختامي مدين',
                'ختامي دائن',
                'الرصيد',
              ]}
              rows={balanceData.map((r) => [
                r.code,
                r.name_ar,
                r.type,
                r.opening_debit,
                r.opening_credit,
                r.period_debit,
                r.period_credit,
                r.total_debit,
                r.total_credit,
                r.balance,
              ])}
            />
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
          </>
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
              <p className="text-[10px] text-muted-foreground">إجمالي افتتاحي مدين</p>
              <p className="font-mono text-sm font-bold text-emerald-800 mt-0.5">
                {formatMoney(summary.total_opening_debit, 'LYD')}
              </p>
            </Card>
            <Card className="p-3">
              <p className="text-[10px] text-muted-foreground">إجمالي افتتاحي دائن</p>
              <p className="font-mono text-sm font-bold text-red-700 mt-0.5">
                {formatMoney(summary.total_opening_credit, 'LYD')}
              </p>
            </Card>
            <Card className="p-3 col-span-2 sm:col-span-1">
              <p className="text-[10px] text-muted-foreground">حركة الفترة (مدين / دائن)</p>
              <p className="font-mono text-sm font-bold mt-0.5">
                <span className="text-emerald-800">{formatMoney(summary.total_period_debit, '')}</span>
                {' / '}
                <span className="text-red-700">{formatMoney(summary.total_period_credit, '')}</span>
              </p>
            </Card>
            <Card className="p-3">
              <p className="text-[10px] text-muted-foreground">إجمالي ختامي مدين</p>
              <p className="font-mono text-sm font-bold text-emerald-800 mt-0.5">
                {formatMoney(summary.total_closing_debit, 'LYD')}
              </p>
            </Card>
            <Card className="p-3">
              <p className="text-[10px] text-muted-foreground">إجمالي ختامي دائن</p>
              <p className="font-mono text-sm font-bold text-red-700 mt-0.5">
                {formatMoney(summary.total_closing_credit, 'LYD')}
              </p>
            </Card>
            <Card className="p-3 col-span-2 sm:col-span-1">
              <p className="text-[10px] text-muted-foreground">الحالة (ختامي)</p>
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
                  summary={summary}
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
