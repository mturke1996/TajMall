'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FileSpreadsheet, Loader2, Search } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { useTenantCharges } from '@/lib/db/mall-queries';
import { chargeToInvoiceModel } from '@/lib/charge-invoice';
import { formatDocumentPdfExportNames } from '@/lib/document-pdf-export';
import { matchesSearch } from '@/lib/arabic-search';
import { arabicCount, formatMoney } from '@/lib/utils';

const STATUS_AR: Record<string, string> = {
  UNPAID: 'مستحق',
  PARTIAL: 'جزئي',
  PAID: 'مسدد',
};

// every card carries its own PDF toolbar and preview dialog, so the list is shown a page at a time
const PAGE_SIZE = 50;

export default function InvoicesPage() {
  const { data: charges = [], isLoading, isError } = useTenantCharges();
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);

  const filtered = useMemo(
    () =>
      charges.filter((c) =>
        matchesSearch(search, [
          c.contract?.tenant?.name,
          c.contract?.unit?.unit_number,
          c.description,
          STATUS_AR[c.status],
        ]),
      ),
    [charges, search],
  );
  // the search box and "show more" belong to the loaded list, not to the loading, error or empty states
  const listReady = !isLoading && !isError && charges.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="مركز الوثائق"
        title="الفواتير والمطالبات"
        description="فواتير الإيجار والرسوم لكل مستأجر، للطباعة أو الإرسال."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/documents">العودة للمركز</Link>
          </Button>
        }
      />

      <AccountingPageBody>
        {listReady && (
          <div className="relative mb-4 max-w-md">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShown(PAGE_SIZE);
              }}
              placeholder="بحث باسم المستأجر أو رقم المحل أو البيان…"
              aria-label="بحث في الفواتير"
              className="h-10 ps-9"
            />
          </div>
        )}
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-danger">
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
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">لا نتائج مطابقة لبحثك.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {filtered.slice(0, shown).map((charge) => {
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
                      <Badge variant="outline" className="text-[11px]">
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
        {listReady && filtered.length > shown && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={() => setShown((n) => n + PAGE_SIZE)}>
              عرض المزيد ({arabicCount(filtered.length - shown, ['مطالبة واحدة', 'مطالبتان', 'مطالبات', 'مطالبة'])})
            </Button>
          </div>
        )}
      </AccountingPageBody>
    </>
  );
}
