'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Landmark, Loader2, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoney } from '@/lib/utils';
import { useBalanceSheet } from '@/lib/db/mall-queries';
import { ledgerUrl } from '@/lib/accounting-nav';
import { AccountingBackfillBanner } from '@/components/accounting/accounting-backfill-banner';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { ExportCsvButton } from '@/components/data/export-csv-button';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { formatAccountingReportExportNames } from '@/lib/report-pdf-export';
import { friendlyError } from '@/lib/user-messages';

type BsRow = {
  category_id: string;
  category_code: string;
  category_name: string;
  balance: number;
  is_net_income?: boolean;
};

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const { data: raw, isLoading, isError, error } = useBalanceSheet(asOf);

  const { assets, liabilities, equity, summary, isBalanced } = useMemo(() => {
    const d = raw as Record<string, unknown> | null;
    const s = (d?.summary ?? {}) as Record<string, number>;
    const totalAssets = Number(s.total_assets ?? 0);
    const totalLiab = Number(s.total_liabilities ?? 0);
    const totalEquity = Number(s.total_equity ?? 0);
    const diff = Math.abs(totalAssets - (totalLiab + totalEquity));
    return {
      assets: ((d?.assets ?? []) as BsRow[]) || [],
      liabilities: ((d?.liabilities ?? []) as BsRow[]) || [],
      equity: ((d?.equity ?? []) as BsRow[]) || [],
      summary: { totalAssets, totalLiab, totalEquity },
      isBalanced: diff < 0.01,
    };
  }, [raw]);

  const hasData = assets.length + liabilities.length + equity.length > 0;

  const pdfExport = useMemo(
    () =>
      formatAccountingReportExportNames({
        reportKindAr: 'الميزانية العمومية',
        reportKindEn: 'balance-sheet',
        periodLabel: `حتى ${asOf}`,
        periodSlugEn: `as-of-${asOf}`,
        statsLine: `${assets.length + liabilities.length + equity.length} بند.`,
        balanced: isBalanced,
      }),
    [asOf, assets.length, liabilities.length, equity.length, isBalanced],
  );

  // Called as a function, not rendered as <SectionTable>: a component declared inside the page is a
  // new type on every render and would remount its rows each time.
  function renderSectionTable(title: string, rows: BsRow[], tone: 'emerald' | 'amber' | 'violet') {
    const total = rows.reduce((s, r) => s + Number(r.balance), 0);
    const color =
      tone === 'emerald' ? 'text-success-ink' : tone === 'amber' ? 'text-warning-ink' : 'text-plum-ink';

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">لا توجد أرصدة</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row.category_id} className="hover:bg-canvas-sunken/50">
                      <td className="py-2 font-mono text-xs text-muted-foreground">{row.category_code}</td>
                      <td className="py-2 font-medium">
                        {row.is_net_income || row.category_code === 'NI-CY' ? (
                          <span>{row.category_name}</span>
                        ) : (
                          <Link
                            href={ledgerUrl(row.category_id)}
                            className="hover:text-success-ink hover:underline touch-manipulation"
                          >
                            {row.category_name}
                          </Link>
                        )}
                      </td>
                      <td className={`py-2 text-end font-mono font-semibold ${color}`}>
                        {formatMoney(row.balance, 'LYD')}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 font-bold bg-canvas-sunken/70">
                    <td colSpan={2} className="py-3 ps-2">الإجمالي</td>
                    <td className={`py-3 text-end font-mono ${color}`}>{formatMoney(total, 'LYD')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="الميزانية العمومية"
        description="موقف مالي يُظهر الأصول مقابل الخصوم وحقوق الملكية في تاريخ محدد"
        actions={
          <>
            <ExportCsvButton
              fileName={pdfExport.fileName}
              disabled={!hasData}
              headers={['التصنيف', 'الكود', 'البند', 'الرصيد']}
              rows={[
                ...assets.map((r) => ['أصول', r.category_code, r.category_name, r.balance]),
                ...liabilities.map((r) => ['خصوم', r.category_code, r.category_name, r.balance]),
                ...equity.map((r) => ['حقوق ملكية', r.category_code, r.category_name, r.balance]),
                ['—', '—', 'إجمالي الأصول', summary.totalAssets],
                ['—', '—', 'إجمالي الخصوم', summary.totalLiab],
                ['—', '—', 'إجمالي حقوق الملكية', summary.totalEquity],
              ]}
            />
            <TajMallPdfToolbar
              fileName={pdfExport.fileName}
              shareTitle={pdfExport.shareTitle}
              shareText={pdfExport.shareText}
              disabled={!hasData}
              render={async () => {
                const { BalanceSheetReportPDF } = await import('@/features/pdf/BalanceSheetReportPDF');
                return (
                  <BalanceSheetReportPDF
                    asOf={asOf}
                    assets={assets.map((r) => ({
                      category_code: r.category_code,
                      category_name: r.category_name,
                      balance: r.balance,
                    }))}
                    liabilities={liabilities.map((r) => ({
                      category_code: r.category_code,
                      category_name: r.category_name,
                      balance: r.balance,
                    }))}
                    equity={equity.map((r) => ({
                      category_code: r.category_code,
                      category_name: r.category_name,
                      balance: r.balance,
                    }))}
                    summary={summary}
                    documentTitle={pdfExport.documentTitle}
                  />
                );
              }}
            />
          </>
        }
      />

      <AccountingPageBody>
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-4 justify-between">
          <div className="space-y-2">
            <Label htmlFor="bs-date">التاريخ (حتى)</Label>
            <Input
              id="bs-date"
              type="date"
              dir="ltr"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="w-44"
            />
          </div>
          {!isLoading && hasData && (
            <div
              className={`flex items-start gap-2 px-3 py-1.5 rounded-2xl border text-xs font-semibold ${
                isBalanced
                  ? 'bg-success-soft border-success-line text-success-ink'
                  : 'bg-warning-soft border-warning-line text-warning-ink'
              }`}
            >
              {isBalanced ? (
                <>
                  <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="text-start leading-snug">
                    المعادلة محققة: الأصول = الخصوم + حقوق الملكية
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="text-start leading-snug">
                    فارق في المعادلة — راجع القيود المرحّلة
                  </span>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 text-danger bg-danger-soft rounded-lg p-6">
          <AlertTriangle className="h-8 w-8" />
          <p className="font-semibold">فشل تحميل الميزانية</p>
          <p className="text-sm">{friendlyError(error)}</p>
        </div>
      ) : !hasData ? (
        <div className="px-4">
          <Landmark className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
          <AccountingBackfillBanner title="لا توجد أرصدة للميزانية" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-success-soft/40 border-success-line">
              <CardContent className="pt-5">
                <p className="text-xs text-success-ink">إجمالي الأصول</p>
                <p className="text-2xl font-mono font-bold text-success-ink">
                  {formatMoney(summary.totalAssets, 'LYD')}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-warning-soft/40 border-warning-line">
              <CardContent className="pt-5">
                <p className="text-xs text-warning-ink">إجمالي الخصوم</p>
                <p className="text-2xl font-mono font-bold text-warning-ink">
                  {formatMoney(summary.totalLiab, 'LYD')}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-plum-soft/40 border-plum-line">
              <CardContent className="pt-5">
                <p className="text-xs text-plum-ink">حقوق الملكية</p>
                <p className="text-2xl font-mono font-bold text-plum-ink">
                  {formatMoney(summary.totalEquity, 'LYD')}
                </p>
              </CardContent>
            </Card>
          </div>
          {renderSectionTable('الأصول', assets, 'emerald')}
          {renderSectionTable('الخصوم', liabilities, 'amber')}
          {renderSectionTable('حقوق الملكية', equity, 'violet')}
        </>
      )}
      </AccountingPageBody>
    </>
  );
}
