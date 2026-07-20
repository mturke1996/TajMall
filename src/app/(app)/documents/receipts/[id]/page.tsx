'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import {
  ReceiptVoucherPDF,
  type ReceiptVoucherPdfModel,
} from '@/features/pdf/ReceiptVoucherPDF';
import {
  useDeleteReceiptVoucher,
  useReceiptVoucher,
  useUpdateReceiptVoucher,
} from '@/lib/db/document-queries';
import { useCashboxes, useCategories } from '@/lib/db/queries';
import {
  receiptUiMethodToPaymentMethod,
} from '@/lib/receipt-voucher-db';
import { paymentMethodToUiMethod } from '@/lib/voucher-db';
import { formatDocumentPdfExportNames } from '@/lib/document-pdf-export';
import { toast } from 'sonner';
import { usePermission } from '@/lib/supabase/use-permission';

const METHODS: ReceiptVoucherPdfModel['method'][] = ['نقدي', 'صك', 'حوالة'];

export default function EditReceiptPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const { can } = usePermission();
  const canEdit = can('document.update');
  const canDelete = can('document.delete');

  const { data: row, isLoading, isError } = useReceiptVoucher(id);
  const updateReceipt = useUpdateReceiptVoucher();
  const deleteReceipt = useDeleteReceiptVoucher();
  const { data: cashboxes = [] } = useCashboxes();
  const { data: revenueCategories = [] } = useCategories('REVENUE');

  const [number, setNumber] = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [payer, setPayer] = useState('');
  const [cashboxId, setCashboxId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [method, setMethod] = useState<ReceiptVoucherPdfModel['method']>('نقدي');
  const [bank, setBank] = useState('');
  const [account, setAccount] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([{ description: '', amount: '' }]);
  const [hydrated, setHydrated] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!row || hydrated) return;
    setNumber(row.receipt_number);
    setReceiptDate(row.receipt_date);
    setPayer(row.payer_name);
    setCashboxId(row.cashbox_id ?? '');
    setCategoryId(row.category_id ?? '');
    setMethod(paymentMethodToUiMethod(row.method));
    setBank(row.bank_name ?? '');
    setAccount(row.account_number ?? '');
    setNotes(row.notes ?? '');
    const sorted = [...(row.receipt_voucher_lines ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    setLines(
      sorted.length
        ? sorted.map((l) => ({ description: l.description, amount: String(l.amount) }))
        : [{ description: '', amount: '' }],
    );
    setHydrated(true);
  }, [row, hydrated]);

  const totalAmount = useMemo(
    () =>
      lines.reduce((s, l) => {
        const n = Number(l.amount);
        return s + (Number.isFinite(n) ? n : 0);
      }, 0),
    [lines],
  );

  const previewModel: ReceiptVoucherPdfModel = useMemo(
    () => ({
      number: number || '—',
      receiptDate: `${receiptDate || row?.receipt_date}T12:00:00.000Z`,
      payer: payer || '—',
      bank: bank || undefined,
      account: account || undefined,
      method,
      lines: lines.map((l) => ({
        description: l.description || '—',
        amount: Number(l.amount) || 0,
      })),
      total: totalAmount,
      notes: notes || undefined,
    }),
    [number, receiptDate, payer, bank, account, method, lines, totalAmount, notes, row?.receipt_date],
  );

  const pdfExport = useMemo(
    () =>
      formatDocumentPdfExportNames({
        docKindAr: 'إيصال قبض',
        docKindEn: 'receipt-voucher',
        docNumber: number || 'draft',
        docDate: receiptDate,
        recipientOrParty: payer,
      }),
    [number, receiptDate, payer],
  );

  async function handleSave() {
    if (!id || !canEdit) return;
    if (!number.trim() || !payer.trim()) {
      toast.error('أدخل رقم الإيصال واسم الدافع');
      return;
    }
    const normalizedLines = lines
      .map((l) => ({
        description: l.description.trim(),
        amount: Number(l.amount) || 0,
      }))
      .filter((l) => l.description || l.amount > 0);
    if (normalizedLines.reduce((s, l) => s + l.amount, 0) <= 0) {
      toast.error('أضف بنداً بمبلغ أكبر من صفر');
      return;
    }
    await updateReceipt.mutateAsync({
      id,
      receipt_number: number,
      receipt_date: receiptDate,
      payer_name: payer,
      cashbox_id: cashboxId || undefined,
      category_id: categoryId || undefined,
      method: receiptUiMethodToPaymentMethod(method),
      bank_name: bank,
      account_number: account,
      notes,
      lines: normalizedLines,
    });
  }

  async function handleDelete() {
    if (!id || !canDelete) return;
    await deleteReceipt.mutateAsync(id);
    setConfirmDelete(false);
    router.push('/documents/receipts');
  }

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !row) {
    return (
      <AccountingPageBody>
        <Card className="p-8 text-center text-sm text-red-600">
          لم يُعثر على الإيصال أو تعذّر التحميل.
          <Button variant="link" asChild className="block mx-auto mt-2">
            <Link href="/documents/receipts">العودة للقائمة</Link>
          </Button>
        </Card>
      </AccountingPageBody>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="مركز الوثائق"
        title={`تعديل إيصال ${row.receipt_number}`}
        description={`${row.payer_name} · ${row.receipt_date}`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/documents/receipts">
                <ArrowRight className="h-4 w-4 ml-1" />
                رجوع
              </Link>
            </Button>
            <TajMallPdfToolbar
              fileName={pdfExport.fileName}
              shareTitle={pdfExport.shareTitle}
              shareText={pdfExport.shareText}
              render={async () => (
                <ReceiptVoucherPDF
                  voucher={{ ...previewModel, documentTitle: pdfExport.documentTitle }}
                />
              )}
            />
            {canDelete ? (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={deleteReceipt.isPending}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4 ml-1" />
                حذف
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                size="sm"
                className="bg-sage-700 hover:bg-sage-800"
                disabled={updateReceipt.isPending}
                onClick={() => void handleSave()}
              >
                <Save className="h-4 w-4 ml-1" />
                حفظ التعديلات
              </Button>
            ) : null}
          </>
        }
      />

      <AccountingPageBody>
        <Card className="p-4 sm:p-6 space-y-5 max-w-3xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="num">رقم الإيصال</Label>
              <Input
                id="num"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                dir="ltr"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">التاريخ</Label>
              <Input
                id="date"
                type="date"
                dir="ltr"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="payer">استلمنا من</Label>
              <Input
                id="payer"
                value={payer}
                onChange={(e) => setPayer(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label>الخزينة</Label>
              <Select value={cashboxId} onValueChange={setCashboxId} disabled={!canEdit}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الخزينة" />
                </SelectTrigger>
                <SelectContent>
                  {cashboxes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name_ar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>بند الإيراد</Label>
              <Select value={categoryId} onValueChange={setCategoryId} disabled={!canEdit}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر البند" />
                </SelectTrigger>
                <SelectContent>
                  {revenueCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name_ar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>طريقة التحصيل</Label>
              <Select
                value={method}
                onValueChange={(v) => setMethod(v as ReceiptVoucherPdfModel['method'])}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank">المصرف</Label>
              <Input
                id="bank"
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account">رقم الحساب</Label>
              <Input
                id="account"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                dir="ltr"
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>بنود الإيصال</Label>
              {canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLines((prev) => [...prev, { description: '', amount: '' }])}
                >
                  <Plus className="h-3.5 w-3.5 ml-1" />
                  بند
                </Button>
              ) : null}
            </div>
            {lines.map((line, idx) => (
              <div key={idx} className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">البيان</Label>
                  <Input
                    value={line.description}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) =>
                          i === idx ? { ...l, description: e.target.value } : l,
                        ),
                      )
                    }
                    disabled={!canEdit}
                  />
                </div>
                <div className="w-32 space-y-1">
                  <Label className="text-xs">المبلغ</Label>
                  <Input
                    type="number"
                    min={0}
                    dir="ltr"
                    value={line.amount}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, amount: e.target.value } : l)),
                      )
                    }
                    disabled={!canEdit}
                  />
                </div>
                {canEdit && lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-red-600"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            ))}
            <p className="text-sm font-mono font-semibold text-emerald-700">
              الإجمالي: {totalAmount.toLocaleString('ar-LY')} د.ل
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">ملاحظات</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </Card>
      </AccountingPageBody>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف إيصال القبض</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف إيصال «{number || row.receipt_number}»؟ لا يمكن التراجع.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={deleteReceipt.isPending}
              onClick={() => void handleDelete()}
            >
              {deleteReceipt.isPending ? 'جاري الحذف…' : 'حذف نهائي'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
