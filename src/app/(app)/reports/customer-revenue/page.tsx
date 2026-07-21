'use client';

import { Suspense, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Store, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { AccountingFilterCard } from '@/components/accounting/accounting-filter-card';
import { ReportPeriodFilter } from '@/components/accounting/report-period-filter';
import { ExportCsvButton } from '@/components/data/export-csv-button';
import { ContactPhoneActions } from '@/components/contacts/contact-phone-actions';
import { useCustomerRevenueReport } from '@/lib/db/party-report-queries';
import {
  formatReportPeriodLabelAr,
  parseReportPeriod,
  reportPeriodToSearchParams,
  type ReportPeriod,
} from '@/lib/report-period';
import { formatMoney } from '@/lib/utils';

function CustomerRevenueContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = useMemo(() => parseReportPeriod(searchParams), [searchParams]);

  const setPeriod = useCallback(
    (next: ReportPeriod) => {
      const params = reportPeriodToSearchParams(next);
      router.replace(`/reports/customer-revenue?${params.toString()}`, {
        scroll: false,
      });
    },
    [router],
  );

  const { data: rows = [], isLoading, isError, error } =
    useCustomerRevenueReport(period);
  const total = useMemo(() => rows.reduce((s, r) => s + r.total, 0), [rows]);

  return (
    <>
      <PageHeader
        eyebrow="التقارير"
        title="إيراد العملاء"
        description={`تجميع إيرادات مربوطة بعملاء (خدمات/مواقف/…) — ${formatReportPeriodLabelAr(period)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportCsvButton
              fileName={`إيراد-عملاء-${period.year}`}
              headers={['العميل', 'الهاتف', 'الإجمالي', 'عدد المعاملات']}
              rows={rows.map((r) => [
                r.contactName,
                r.phone ?? '',
                r.total,
                r.txCount,
              ])}
            />
            <Button variant="outline" size="sm" asChild>
              <Link href="/mall?tab=people&segment=CUSTOMER">دليل العملاء</Link>
            </Button>
          </div>
        }
      />

      <AccountingPageBody>
        <AccountingFilterCard>
          <ReportPeriodFilter value={period} onChange={setPeriod} />
        </AccountingFilterCard>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-ink-mute">إجمالي الإيراد</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-bold text-emerald-700">
              {formatMoney(total, 'LYD')}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-ink-mute">عدد العملاء</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-bold">{rows.length}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-ink-mute">المعاملات المرتبطة</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-bold">
              {rows.reduce((s, r) => s + r.txCount, 0)}
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-sage-600" />
          </div>
        ) : isError ? (
          <p className="text-sm text-red-700 py-8 text-center">
            {(error as Error)?.message ?? 'تعذّر تحميل التقرير'}
          </p>
        ) : rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-ink-mute">
            لا توجد إيرادات مربوطة بعملاء في هذه الفترة. عند تسجيل إيراد خدمة/مواقف اختر عميلاً من الدليل.
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-ink-mute text-right">
                    <th className="px-4 py-3 font-medium">العميل</th>
                    <th className="px-4 py-3 font-medium">تواصل</th>
                    <th className="px-4 py-3 font-medium">المعاملات</th>
                    <th className="px-4 py-3 font-medium text-left">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.contactId} className="border-b border-border/60">
                      <td className="px-4 py-3">
                        <Link
                          href={`/contacts/${row.contactId}`}
                          className="font-medium text-sage-800 hover:underline inline-flex items-center gap-1.5"
                        >
                          <Store className="h-3.5 w-3.5 text-ink-mute" />
                          {row.contactName}
                        </Link>
                        {row.byCategory.length > 0 ? (
                          <p className="text-[11px] text-ink-mute mt-0.5">
                            {row.byCategory
                              .slice(0, 3)
                              .map((c) => c.nameAr)
                              .join(' · ')}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <ContactPhoneActions
                          name={row.contactName}
                          phone={row.phone}
                          kind="CUSTOMER"
                          compact
                        />
                      </td>
                      <td className="px-4 py-3 tabular-nums">{row.txCount}</td>
                      <td className="px-4 py-3 text-left font-semibold tabular-nums text-emerald-700">
                        {formatMoney(row.total, 'LYD')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </AccountingPageBody>
    </>
  );
}

export default function CustomerRevenuePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="h-7 w-7 animate-spin text-sage-600" />
        </div>
      }
    >
      <CustomerRevenueContent />
    </Suspense>
  );
}
