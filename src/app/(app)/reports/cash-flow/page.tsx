'use client';

import { useState, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatMoney } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useCashFlow } from '@/lib/db/mall-queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { ExportCsvButton } from '@/components/data/export-csv-button';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { AccountingYearPicker } from '@/components/accounting/accounting-year-picker';
import { AccountingFilterCard } from '@/components/accounting/accounting-filter-card';
import { AccountingSummaryGrid } from '@/components/accounting/accounting-summary-grid';
import {
  AccountingEmpty,
  AccountingError,
  AccountingLoading,
} from '@/components/accounting/accounting-states';
import { formatAccountingReportExportNames } from '@/lib/report-pdf-export';

type CashFlowItem = {
  category: string;
  description: string;
  amount: number;
  isPositive: boolean;
};

function ActivityCard({
  title,
  description,
  items,
  netAmount,
}: {
  title: string;
  description: string;
  items: CashFlowItem[];
  netAmount: number;
}) {
  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3 border-b border-border">
        <CardTitle className="text-base font-bold">{title}</CardTitle>
        <CardDescription className="text-xs leading-relaxed">{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 flex flex-col flex-1 justify-between gap-4">
        <ul className="space-y-3">
          {items.length === 0 ? (
            <li className="text-sm text-muted-foreground text-center py-4">لا توجد بنود</li>
          ) : (
            items.map((item, idx) => (
              <li key={idx} className="flex justify-between items-start gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{item.category}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  )}
                </div>
                <span
                  className={cn(
                    'shrink-0 font-mono font-semibold tabular-nums text-sm',
                    item.isPositive ? 'text-emerald-700' : 'text-red-600',
                  )}
                >
                  {item.isPositive ? '+' : '−'}
                  {formatMoney(item.amount, '')}
                </span>
              </li>
            ))
          )}
        </ul>
        <div className="pt-3 border-t border-border flex justify-between items-center gap-2 text-sm font-bold">
          <span className="text-muted-foreground">الصافي</span>
          <span
            className={cn(
              'font-mono tabular-nums',
              netAmount >= 0 ? 'text-emerald-700' : 'text-red-600',
            )}
          >
            {formatMoney(netAmount, 'LYD')}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CashFlowPage() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const { data: rawCashFlow, isLoading, isError, error } = useCashFlow(selectedYear);

  const cashFlowData = useMemo(() => {
    if (!rawCashFlow) return null;
    const data = rawCashFlow as Record<string, unknown>;
    const parseNum = (val: unknown) => Number(val || 0);
    const mapItems = (list: unknown) =>
      ((list as unknown[]) || []).map((item) => {
        const row = item as Record<string, unknown>;
        return {
          category: row.category as string,
          description: row.description as string,
          amount: parseNum(row.amount),
          isPositive: Boolean(row.is_positive),
        };
      });

    const summary = data.summary as Record<string, unknown> | undefined;

    return {
      operating: mapItems(data.operating),
      investing: mapItems(data.investing),
      financing: mapItems(data.financing),
      summary: {
        openingBalance: parseNum(summary?.opening_balance),
        closingBalance: parseNum(summary?.closing_balance),
        netOperating: parseNum(summary?.net_operating),
        netInvesting: parseNum(summary?.net_investing),
        netFinancing: parseNum(summary?.net_financing),
        netChange: parseNum(summary?.net_change),
      },
    };
  }, [rawCashFlow]);

  const pdfExport = useMemo(
    () =>
      formatAccountingReportExportNames({
        reportKindAr: 'التدفقات النقدية',
        reportKindEn: 'cash-flow',
        periodLabel: `عام ${selectedYear}`,
        periodSlugEn: `fy-${selectedYear}`,
        statsLine: cashFlowData
          ? `صافي التغير ${cashFlowData.summary.netChange >= 0 ? '+' : ''}${cashFlowData.summary.netChange.toLocaleString('ar-LY')} د.ل.`
          : undefined,
      }),
    [selectedYear, cashFlowData],
  );

  return (
    <>
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="قائمة التدفقات النقدية"
        description="مصادر المقبوضات واستخدامات المدفوعات — تشغيلية، استثمارية، وتمويلية"
        actions={
          <>
            <ExportCsvButton
              fileName={pdfExport.fileName}
              disabled={!cashFlowData}
              headers={['النشاط', 'البند', 'الوصف', 'المبلغ']}
              rows={
                cashFlowData
                  ? [
                      ...cashFlowData.operating.map((i) => ['تشغيلي', i.category, i.description, i.isPositive ? i.amount : -i.amount]),
                      ...cashFlowData.investing.map((i) => ['استثماري', i.category, i.description, i.isPositive ? i.amount : -i.amount]),
                      ...cashFlowData.financing.map((i) => ['تمويلي', i.category, i.description, i.isPositive ? i.amount : -i.amount]),
                      ['—', 'الرصيد الافتتاحي', '', cashFlowData.summary.openingBalance],
                      ['—', 'صافي التغير', '', cashFlowData.summary.netChange],
                      ['—', 'الرصيد الختامي', '', cashFlowData.summary.closingBalance],
                    ]
                  : []
              }
            />
            <TajMallPdfToolbar
              fileName={pdfExport.fileName}
              shareTitle={pdfExport.shareTitle}
              shareText={pdfExport.shareText}
              disabled={!cashFlowData}
              render={async () => {
                const { CashFlowReportPDF } = await import('@/features/pdf/CashFlowReportPDF');
                return (
                  <CashFlowReportPDF
                    year={selectedYear}
                    data={cashFlowData!}
                    documentTitle={pdfExport.documentTitle}
                  />
                );
              }}
            />
          </>
        }
      />

      <AccountingPageBody>
        <AccountingFilterCard>
          <AccountingYearPicker value={selectedYear} onChange={setSelectedYear} />
        </AccountingFilterCard>

        {isLoading && <AccountingLoading />}

        {isError && (
          <AccountingError
            title="فشل تحميل التدفقات النقدية"
            message={(error as Error)?.message}
          />
        )}

        {!isLoading && !isError && !cashFlowData && (
          <AccountingEmpty
            icon={TrendingUp}
            title={`لا توجد بيانات لعام ${selectedYear}`}
            description="تظهر التدفقات بعد تسجيل وترحيل المعاملات النقدية."
          />
        )}

        {!isLoading && !isError && cashFlowData && (
          <>
            <AccountingSummaryGrid
              stats={[
                { label: 'الرصيد الافتتاحي', value: cashFlowData.summary.openingBalance },
                {
                  label: 'صافي التغير',
                  value: cashFlowData.summary.netChange,
                  tone: cashFlowData.summary.netChange >= 0 ? 'positive' : 'negative',
                },
                {
                  label: 'الرصيد الختامي',
                  value: cashFlowData.summary.closingBalance,
                  tone: 'positive',
                },
              ]}
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <ActivityCard
                title="أنشطة التشغيل"
                description="المبيعات والمصاريف التشغيلية اليومية"
                items={cashFlowData.operating}
                netAmount={cashFlowData.summary.netOperating}
              />
              <ActivityCard
                title="أنشطة الاستثمار"
                description="شراء أو بيع الأصول طويلة الأجل"
                items={cashFlowData.investing}
                netAmount={cashFlowData.summary.netInvesting}
              />
              <ActivityCard
                title="أنشطة التمويل"
                description="رأس المال والتزامات الملاك"
                items={cashFlowData.financing}
                netAmount={cashFlowData.summary.netFinancing}
              />
            </div>
          </>
        )}
      </AccountingPageBody>
    </>
  );
}
