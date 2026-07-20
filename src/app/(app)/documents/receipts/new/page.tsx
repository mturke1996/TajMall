'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Plus, Save, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
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
import { useCreateReceiptVoucher } from '@/lib/db/document-queries';
import { useCashboxes, useCategories } from '@/lib/db/queries';
import { receiptUiMethodToPaymentMethod } from '@/lib/receipt-voucher-db';
import {
  formatDocumentPdfExportNames,
  formatSuggestedDocNumber,
} from '@/lib/document-pdf-export';
import { toast } from 'sonner';

const METHODS: ReceiptVoucherPdfModel['method'][] = ['نقدي', 'صك', 'حوالة'];

export default function NewReceiptPage() {
  const router = useRouter();
  const createReceipt = useCreateReceiptVoucher();
  const { data: cashboxes = [] } = useCashboxes();
  const { data: revenueCategories = [] } = useCategories('REVENUE');

  const [number, setNumber] = useState(() => formatSuggestedDocNumber('RCV', 1));
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payer, setPayer] = useState('');
  const [cashboxId, setCashboxId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [method, setMethod] = useState<ReceiptVoucherPdfModel['method']>('نقدي');
  const [bank, setBank] = useState('');
  const [account, setAccount] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([{ description: '', amount: '' }]);

  useEffect(() => {
    if (cashboxes.length && !cashboxId) setCashboxId(cashboxes[0]!.id);
    if (revenueCategories.length && !categoryId) setCategoryId(revenueCategories[0]!.id);
  }, [cashboxes, revenueCategories, cashboxId, categoryId]);

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
      receiptDate: `${receiptDate}T12:00:00.000Z`,
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
    [number, receiptDate, payer, bank, account, method, lines, totalAmount, notes],
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
    await createReceipt.mutateAsync({
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
    router.push('/documents/receipts');
  }

  return (
    <>
      <PageHeader
        eyebrow="مركز الوثائق"
        title="إيصال قبض جديد"
        description="معاينة PDF مباشرة — ثم الحفظ في قاعدة البيانات"
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
            <Button
              size="sm"
              className="bg-sage-700 hover:bg-sage-800"
              disabled={createReceipt.isPending}
              onClick={() => void handleSave()}
            >
              <Save className="h-4 w-4 ml-1" />
              حفظ الإيصال
            </Button>
          </>
        }
      />

      <AccountingPageBody>
        <Card className="p-4 sm:p-6 space-y-5 max-w-3xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="num">رقم الإيصال</Label>
              <Input id="num" value={number} onChange={(e) => setNumber(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">التاريخ</Label>
              <Input
                id="date"
                type="date"
                dir="ltr"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="payer">استلمنا من</Label>
              <Input id="payer" value={payer} onChange={(e) => setPayer(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>الخزينة</Label>
              <Select value={cashboxId} onValueChange={setCashboxId}>
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
              <Select value={categoryId} onValueChange={setCategoryId}>
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
              <Select value={method} onValueChange={(v) => setMethod(v as ReceiptVoucherPdfModel['method'])}>
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
              <Input id="bank" value={bank} onChange={(e) => setBank(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>بنود الإيصال</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLines((prev) => [...prev, { description: '', amount: '' }])}
              >
                <Plus className="h-3.5 w-3.5 ml-1" />
                بند
              </Button>
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
                  />
                </div>
                {lines.length > 1 ? (
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
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </Card>
      </AccountingPageBody>
    </>
  );
}
