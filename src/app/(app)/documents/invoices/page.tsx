'use client';

import Link from 'next/link';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { useTenantCharges } from '@/lib/db/mall-queries';
import { chargeToInvoiceModel } from '@/lib/charge-invoice';
import { formatDocumentPdfExportNames } from '@/lib/document-pdf-export';
import { formatMoney } from '@/lib/utils';

const STATUS_AR: Record<string, string> = {
  UNPAID: 'مستحق',
  PARTIAL: 'جزئي',
  PAID: 'مسدد',
};

export default function InvoicesPage() {
  const { data: charges = [], isLoading, isError } = useTenantCharges();

  return (
    <>
      <PageHeader
        eyebrow="مركز الوثائق"
        title="الفواتير والمطالبات"
        description="فواتير إيجار ورسوم المستأجرين — PDF احترافي بأسماء ملفات واضحة"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/documents">العودة للمركز</Link>
          </Button>
        }
      />

      <AccountingPageBody>
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-red-600">
              تعذّر تحميل المطالبات
            </CardContent>
          </Card>
        ) : charges.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-muted-foreground">
              <FileSpreadsheet className="h-10 w-10 opacity-40" />
              <p className="text-sm">لا توجد فواتير أو مطالبات</p>
              <Button asChild size="sm" variant="outline">
                <Link href="/mall?tab=charges">إدارة المطالبات</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {charges.map((charge) => {
              const tenant = charge.contract?.tenant?.name ?? 'مستأجر';
              const shop = charge.contract?.unit?.unit_number;
              const invoiceModel = chargeToInvoiceModel(charge);
              const pdfExport = formatDocumentPdfExportNames({
                docKindAr: 'فاتورة',
                docKindEn: 'tenant-invoice',
                docNumber: charge.id.slice(0, 8),
                docDate: charge.due_date,
                recipientOrParty: tenant,
              });
              return (
                <li
                  key={charge.id}
                  className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-bold text-sm truncate">{charge.description}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {STATUS_AR[charge.status] ?? charge.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tenant}
                      {shop ? ` · محل ${shop}` : ''} · استحقاق {charge.due_date} ·{' '}
                      <span className="font-mono font-semibold">
                        {formatMoney(Number(charge.amount), 'LYD')}
                      </span>
                    </p>
                  </div>
                  <TajMallPdfToolbar
                    fileName={pdfExport.fileName}
                    shareTitle={pdfExport.shareTitle}
                    shareText={pdfExport.shareText}
                    render={async () => {
                      const { TenantChargeInvoicePDF } = await import(
                        '@/features/pdf/TenantChargeInvoicePDF'
                      );
                      return <TenantChargeInvoicePDF charge={invoiceModel} />;
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </AccountingPageBody>
    </>
  );
}
