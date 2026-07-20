'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Loader2, Receipt, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import {
  useDeleteReceiptVoucher,
  useReceiptVouchers,
} from '@/lib/db/document-queries';
import { receiptRowToPdfModel } from '@/lib/receipt-voucher-db';
import { formatDocumentPdfExportNames } from '@/lib/document-pdf-export';
import { formatMoney } from '@/lib/utils';
import { usePermission } from '@/lib/supabase/use-permission';

export default function ReceiptsPage() {
  const { can } = usePermission();
  const canEdit = can('document.update');
  const canDelete = can('document.delete');
  const { data: receipts = [], isLoading, isError } = useReceiptVouchers();
  const deleteReceipt = useDeleteReceiptVoucher();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const deleteTarget = receipts.find((r) => r.id === deleteId);

  async function confirmDelete() {
    if (!deleteId) return;
    await deleteReceipt.mutateAsync(deleteId);
    setDeleteId(null);
  }

  return (
    <>
      <PageHeader
        eyebrow="مركز الوثائق"
        title="إيصالات القبض"
        description="إنشاء وتعديل وحذف إيصالات القبض — PDF جاهز للطباعة"
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/documents">العودة للمركز</Link>
            </Button>
            <Button size="sm" asChild className="bg-sage-700 hover:bg-sage-800">
              <Link href="/documents/receipts/new">
                <Plus className="h-4 w-4 ml-1" />
                إيصال جديد
              </Link>
            </Button>
          </>
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
              تعذّر التحميل. طبّق هجرة 058 على Supabase.
            </CardContent>
          </Card>
        ) : receipts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-muted-foreground">
              <Receipt className="h-10 w-10 opacity-40" />
              <p className="text-sm">لا توجد إيصالات قبض</p>
              <Button asChild size="sm">
                <Link href="/documents/receipts/new">إنشاء أول إيصال</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {receipts.map((row) => {
              const model = receiptRowToPdfModel(row);
              const pdfExport = formatDocumentPdfExportNames({
                docKindAr: 'إيصال قبض',
                docKindEn: 'receipt-voucher',
                docNumber: row.receipt_number,
                docDate: row.receipt_date,
                recipientOrParty: row.payer_name,
              });
              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/documents/receipts/${row.id}`}
                      className="font-bold text-sm hover:text-sage-800 hover:underline"
                    >
                      {row.payer_name}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {row.receipt_number} · {row.receipt_date} ·{' '}
                      <span className="font-mono font-semibold text-emerald-700">
                        {formatMoney(Number(row.total_amount), 'LYD')}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {canEdit ? (
                      <Button variant="outline" size="sm" asChild className="touch-manipulation">
                        <Link href={`/documents/receipts/${row.id}`}>
                          <Pencil className="h-3.5 w-3.5 ml-1" />
                          تعديل
                        </Link>
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="touch-manipulation text-red-600 hover:bg-red-50 hover:text-red-700"
                        disabled={deleteReceipt.isPending}
                        onClick={() => setDeleteId(row.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 ml-1" />
                        حذف
                      </Button>
                    ) : null}
                    <TajMallPdfToolbar
                      fileName={pdfExport.fileName}
                      shareTitle={pdfExport.shareTitle}
                      shareText={pdfExport.shareText}
                      render={async () => {
                        const { ReceiptVoucherPDF } = await import(
                          '@/features/pdf/ReceiptVoucherPDF'
                        );
                        return (
                          <ReceiptVoucherPDF
                            voucher={{ ...model, documentTitle: pdfExport.documentTitle }}
                          />
                        );
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AccountingPageBody>

      <Dialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف إيصال القبض</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف إيصال «{deleteTarget?.receipt_number}» من{' '}
              {deleteTarget?.payer_name}؟ لا يمكن التراجع.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={deleteReceipt.isPending}
              onClick={() => void confirmDelete()}
            >
              {deleteReceipt.isPending ? 'جاري الحذف…' : 'حذف نهائي'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
