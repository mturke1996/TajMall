'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Users, Loader2, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { formatMoney, cn } from '@/lib/utils';
import { useTenantArAging } from '@/lib/db/mall-queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { ExportCsvButton } from '@/components/data/export-csv-button';
import { useSyncOverdueChargeReminders } from '@/lib/db/notification-queries';
import { WhatsAppReminderButton } from '@/components/tenants/whatsapp-reminder-button';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';

type AgingRow = {
  tenant_id: string;
  tenant_name: string;
  shop_number: string | null;
  phone: string | null;
  total_outstanding: number;
  bucket_current: number;
  bucket_30: number;
  bucket_60: number;
  bucket_90_plus: number;
};

export default function TenantArAgingPage() {
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const { data: raw, isLoading, isError, error } = useTenantArAging(asOf);
  const syncReminders = useSyncOverdueChargeReminders();

  const { rows, totalOutstanding, tenantCount } = useMemo(() => {
    const d = raw as Record<string, unknown> | null;
    const list = ((d?.rows ?? []) as Record<string, unknown>[]).map((r) => ({
      tenant_id: r.tenant_id as string,
      tenant_name: r.tenant_name as string,
      shop_number: (r.shop_number as string) ?? null,
      phone: (r.phone as string) ?? null,
      total_outstanding: Number(r.total_outstanding ?? 0),
      bucket_current: Number(r.bucket_current ?? 0),
      bucket_30: Number(r.bucket_30 ?? 0),
      bucket_60: Number(r.bucket_60 ?? 0),
      bucket_90_plus: Number(r.bucket_90_plus ?? 0),
    }));
    const s = (d?.summary ?? {}) as Record<string, number>;
    return {
      rows: list,
      totalOutstanding: Number(s.total_outstanding ?? 0),
      tenantCount: Number(s.tenant_count ?? 0),
    };
  }, [raw]);

  return (
    <>
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="أعمار ذمم المستأجرين"
        description="تقرير متأخرات الإيجار والخدمات حسب فترات الاستحقاق — مرتبط بمطالبات المول والتحصيل"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={syncReminders.isPending}
              onClick={() => syncReminders.mutate()}
              className="touch-manipulation"
            >
              {syncReminders.isPending ? 'جاري…' : 'إنشاء تذكيرات'}
            </Button>
            <Button variant="outline" size="sm" asChild className="touch-manipulation">
              <Link href="/notifications">مركز الإشعارات</Link>
            </Button>
            <ExportCsvButton
              fileName={`اعمار-الذمم-${asOf}`}
              disabled={rows.length === 0}
              headers={['المستأجر', 'رقم المحل', 'الهاتف', 'إجمالي المتأخر', 'حالي', '30 يوم', '60 يوم', '90+ يوم']}
              rows={rows.map((r) => [
                r.tenant_name,
                r.shop_number ?? '',
                r.phone ?? '',
                r.total_outstanding,
                r.bucket_current,
                r.bucket_30,
                r.bucket_60,
                r.bucket_90_plus,
              ])}
            />
            <TajMallPdfToolbar
              fileName={`اعمار-الذمم-${asOf}`}
              disabled={rows.length === 0}
              render={async () => {
                const { TenantArAgingReportPDF } = await import('@/features/pdf/TenantArAgingReportPDF');
                return (
                  <TenantArAgingReportPDF
                    asOf={asOf}
                    rows={rows}
                    summary={{ totalOutstanding, tenantCount }}
                  />
                );
              }}
            />
          </>
        }
      />

      <AccountingPageBody>
      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="ar-date">تاريخ التقرير</Label>
            <Input
              id="ar-date"
              type="date"
              dir="ltr"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="w-44"
            />
          </div>
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{tenantCount}</span> مستأجر · إجمالي{' '}
            <span className="font-mono font-bold text-red-700">
              {formatMoney(totalOutstanding, 'LYD')}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">تفصيل المتأخرات</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-2 text-red-600 py-8">
              <AlertTriangle className="h-8 w-8" />
              <p>{(error as Error)?.message}</p>
              <p className="text-xs">طبّق هجرة 018 على Supabase</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-slate-500 gap-2">
              <Users className="h-10 w-10 opacity-50" />
              <p>لا توجد ذمم مستحقة — ممتاز!</p>
            </div>
          ) : (
            <>
            {/* Mobile: card list */}
            <ul className="flex flex-col gap-3 md:hidden">
              {rows.map((row: AgingRow) => (
                <li
                  key={row.tenant_id}
                  className="rounded-xl border border-border bg-card p-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/contacts/${row.tenant_id}`}
                        className="block truncate font-semibold hover:text-emerald-800 hover:underline touch-manipulation"
                      >
                        {row.tenant_name}
                      </Link>
                      <p className="text-[12px] text-slate-500">
                        {row.shop_number ? `محل ${row.shop_number}` : '—'}
                        {row.phone && (
                          <span dir="ltr" className="mr-1">· {row.phone}</span>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-left">
                      <p className="text-[10px] text-slate-500">إجمالي المتأخر</p>
                      <p className="font-mono text-base font-bold text-red-700">
                        {formatMoney(row.total_outstanding, 'LYD')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
                    <BucketCell label="جاري" value={row.bucket_current} className="text-slate-700" />
                    <BucketCell label="1–30" value={row.bucket_30} className="text-amber-700" />
                    <BucketCell label="31–60" value={row.bucket_60} className="text-orange-700" />
                    <BucketCell label="+60" value={row.bucket_90_plus} className="text-red-700" />
                  </div>

                  <div className="mt-3">
                    <WhatsAppReminderButton
                      tenantName={row.tenant_name}
                      phone={row.phone}
                      amountOutstanding={row.total_outstanding}
                      shopNumber={row.shop_number}
                      asOf={asOf}
                      size="sm"
                      className="h-11 w-full touch-manipulation gap-1.5 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                    />
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-right text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b text-slate-500 font-semibold">
                    <th className="pb-3 pr-2 text-right">المستأجر</th>
                    <th className="pb-3 text-right">المحل</th>
                    <th className="pb-3 text-left">جاري</th>
                    <th className="pb-3 text-left">1–30</th>
                    <th className="pb-3 text-left">31–60</th>
                    <th className="pb-3 text-left">+60</th>
                    <th className="pb-3 pl-2 text-left">الإجمالي</th>
                    <th className="pb-3 text-left">تذكير</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row: AgingRow) => (
                    <tr key={row.tenant_id} className="hover:bg-slate-50/50">
                      <td className="py-3 pr-2 font-medium">
                        <Link
                          href={`/contacts/${row.tenant_id}`}
                          className="hover:text-emerald-800 hover:underline touch-manipulation"
                        >
                          {row.tenant_name}
                        </Link>
                      </td>
                      <td className="py-3 text-slate-600">{row.shop_number ?? '—'}</td>
                      <td className="py-3 text-left font-mono text-slate-700">
                        {row.bucket_current > 0 ? formatMoney(row.bucket_current, '') : '—'}
                      </td>
                      <td className="py-3 text-left font-mono text-amber-700">
                        {row.bucket_30 > 0 ? formatMoney(row.bucket_30, '') : '—'}
                      </td>
                      <td className="py-3 text-left font-mono text-orange-700">
                        {row.bucket_60 > 0 ? formatMoney(row.bucket_60, '') : '—'}
                      </td>
                      <td className="py-3 text-left font-mono text-red-700 font-semibold">
                        {row.bucket_90_plus > 0 ? formatMoney(row.bucket_90_plus, '') : '—'}
                      </td>
                      <td className="py-3 pl-2 text-left font-mono font-bold">
                        {formatMoney(row.total_outstanding, 'LYD')}
                      </td>
                      <td className="py-3 text-left">
                        <WhatsAppReminderButton
                          tenantName={row.tenant_name}
                          phone={row.phone}
                          amountOutstanding={row.total_outstanding}
                          shopNumber={row.shop_number}
                          asOf={asOf}
                          size="icon-sm"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
      </AccountingPageBody>
    </>
  );
}

function BucketCell({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className="rounded-lg bg-canvas-sunken/60 px-1 py-1.5">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={cn('font-mono text-[12px] font-semibold', className)}>
        {value > 0 ? formatMoney(value, '') : '—'}
      </p>
    </div>
  );
}
