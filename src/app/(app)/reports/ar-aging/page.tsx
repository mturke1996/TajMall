'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Users, Loader2, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/utils';
import { useTenantArAging } from '@/lib/db/mall-queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { useSyncOverdueChargeReminders } from '@/lib/db/notification-queries';

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
    <div className="space-y-6 pb-8">
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
            <div className="overflow-x-auto">
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
