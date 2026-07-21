'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, Plus, Save, Trash2 } from 'lucide-react';
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
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { VoucherPDF, type VoucherPdfModel } from '@/features/pdf/VoucherPDF';
import {
  clearVoucherDraft,
  loadVoucherDraft,
  saveVoucherDraft,
} from '@/lib/voucher-draft';
import { voucherUiMethodToPaymentMethod } from '@/lib/voucher-db';
import {
  useCreateDisbursementVoucher,
  useCashboxes,
  useCategories,
  useContacts,
} from '@/lib/db/queries';
import { toast } from 'sonner';
import { usePermission } from '@/lib/supabase/use-permission';

const METHODS: VoucherPdfModel['method'][] = ['نقدي', 'صك', 'حوالة'];
const METHOD_SET = new Set<string>(METHODS);

export default function NewVoucherPage() {
  const router = useRouter();
  const { can, loading: permLoading } = usePermission();
  const createDisbursementVoucher = useCreateDisbursementVoucher();
  const { data: cashboxes = [] } = useCashboxes();
  const { data: expenseCategories = [] } = useCategories('EXPENSE');
  const { data: vendors = [] } = useContacts('VENDOR');
  const { data: employees = [] } = useContacts('EMPLOYEE');
  const payeeContacts = useMemo(
    () => [
      ...vendors.map((c) => ({ ...c, group: 'مورد' as const })),
      ...employees.map((c) => ({ ...c, group: 'موظف' as const })),
    ],
    [vendors, employees],
  );
  const [cashboxId, setCashboxId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [number, setNumber] = useState('');
  const [voucherDate, setVoucherDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [payee, setPayee] = useState('');
  const [contactId, setContactId] = useState('');
  const [bank, setBank] = useState('');
  const [account, setAccount] = useState('');
  const [method, setMethod] = useState<VoucherPdfModel['method']>('نقدي');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<{ description: string; amount: string }[]>([
    { description: '', amount: '' },
  ]);

  /** تحميل آخر مسودة محفوظة فور فتح الصفحة. */
  useEffect(() => {
    const d = loadVoucherDraft();
    if (!d) return;
    setNumber(d.number);
    if (d.voucherDate) setVoucherDate(d.voucherDate);
    setPayee(d.payee);
    setContactId(d.contactId ?? '');
    setBank(d.bank);
    setAccount(d.account);
    setMethod(METHOD_SET.has(d.method) ? (d.method as VoucherPdfModel['method']) : 'نقدي');
    setNotes(d.notes);
    setLines(d.lines.length ? d.lines : [{ description: '', amount: '' }]);
  }, []);

  useEffect(() => {
    if (cashboxes.length && !cashboxId) setCashboxId(cashboxes[0]!.id);
    if (expenseCategories.length && !categoryId) setCategoryId(expenseCategories[0]!.id);
  }, [cashboxes, expenseCategories, cashboxId, categoryId]);

  const datePreview = useMemo(() => {
    if (!voucherDate) return null;
    const d = new Date(`${voucherDate}T12:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    try {
      const day = new Intl.DateTimeFormat('ar-LY-u-ca-gregory-nu-latn', {
        day: 'numeric',
      }).format(d);
      const weekday = new Intl.DateTimeFormat('ar-LY-u-ca-gregory', {
        weekday: 'long',
      }).format(d);
      const monthYear = new Intl.DateTimeFormat('ar-LY-u-ca-gregory-nu-latn', {
        month: 'long',
        year: 'numeric',
      }).format(d);
      return { day, weekday, monthYear, iso: voucherDate };
    } catch {
      return null;
    }
  }, [voucherDate]);

  const totalAmount = useMemo(
    () =>
      lines.reduce((s, l) => {
        const n = Number(l.amount);
        return s + (Number.isFinite(n) ? n : 0);
      }, 0),
    [lines],
  );

  function handleSaveLocalDraft() {
    const ok = saveVoucherDraft({
      number,
      voucherDate,
      payee,
      contactId: contactId || undefined,
      bank,
      account,
      method,
      notes,
      lines,
    });
    if (!ok) {
      toast.error('تعذّر الحفظ المحلي', {
        description:
          'تحقق من إعدادات المتصفح أو التخزين المحلي (قد يكون ملف تعريف خاص أو مساحة ممتلئة).',
      });
      return;
    }
    toast.success('تم حفظ مسودة على هذا الجهاز', {
      description: 'الزر الأخضر يحفظ في قاعدة البيانات للفريق.',
    });
  }

  async function handlePersistVoucher() {
    const num = number.trim();
    if (!num) {
      toast.error('أدخل رقم الإذن');
      return;
    }
    if (!payee.trim()) {
      toast.error('أدخل اسم المستفيد');
      return;
    }

    const normalizedLines = lines
      .map((l) => ({
        description: l.description.trim(),
        amount: Number(l.amount) || 0,
      }))
      .filter((l) => l.description.length > 0 || l.amount > 0);

    const sum = normalizedLines.reduce((s, l) => s + l.amount, 0);
    if (sum <= 0) {
      toast.error('أضف بنداً بمبلغ أكبر من صفر');
      return;
    }

    try {
      await createDisbursementVoucher.mutateAsync({
        voucher_number: num,
        voucher_date: voucherDate,
        payee: payee.trim(),
        contact_id: contactId || null,
        bank_name: bank.trim() || null,
        account_number: account.trim() || null,
        method: voucherUiMethodToPaymentMethod(method),
        notes: notes.trim() || null,
        cashbox_id: cashboxId || null,
        category_id: categoryId || null,
        lines: normalizedLines.map((l) => ({
          description: l.description || '—',
          amount: l.amount,
        })),
      });
      clearVoucherDraft();
      toast.success('تم حفظ إذن الصرف في قاعدة البيانات');
      router.push('/vouchers');
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      const msg = typeof err?.message === 'string' ? err.message : '';
      if (err?.code === '23505' || msg.includes('duplicate key')) {
        toast.error('رقم الإذن مستخدم بالفعل لهذا التاريخ');
        return;
      }
      toast.error('تعذّر الحفظ في قاعدة البيانات', {
        description: err?.message ?? 'تحقق من الاتصال وتشغيل ترحيل قاعدة البيانات.',
      });
    }
  }

  function handleClearDraft() {
    clearVoucherDraft();
    setNumber('');
    setVoucherDate(new Date().toISOString().slice(0, 10));
    setPayee('');
    setContactId('');
    setBank('');
    setAccount('');
    setMethod('نقدي');
    setNotes('');
    setLines([{ description: '', amount: '' }]);
    toast.message('تم مسح المسودة المحفوظة');
  }

  const voucherModel = useMemo((): VoucherPdfModel => {
    const parsedLines = lines
      .map((l) => ({
        description: l.description.trim() || '—',
        amount: Number(l.amount) || 0,
      }))
      .filter((l) => l.description !== '—' || l.amount > 0);

    const safeLines =
      parsedLines.length > 0 ? parsedLines : [{ description: 'بند', amount: 0 }];

    const total = safeLines.reduce((s, l) => s + l.amount, 0);

    return {
      number: number.trim() || 'مسودة',
      voucherDate: voucherDate
        ? `${voucherDate}T12:00:00.000Z`
        : new Date().toISOString(),
      payee: payee.trim() || 'المستفيد',
      bank: bank.trim() || undefined,
      account: account.trim() || undefined,
      method,
      lines: safeLines,
      total,
      notes: notes.trim() || undefined,
    };
  }, [number, voucherDate, payee, bank, account, method, lines, notes]);

  function addLine() {
    setLines((prev) => [...prev, { description: '', amount: '' }]);
  }

  function removeLine(i: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  const moneyFmt = useMemo(() => new Intl.NumberFormat('en-US'), []);

  if (!permLoading && !can('voucher.create')) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <p className="text-lg font-semibold">صلاحية القراءة فقط</p>
        <p className="max-w-sm text-sm text-ink-mute">لا يمكنك إنشاء أذونات صرف.</p>
        <Button variant="outline" asChild>
          <Link href="/vouchers">العودة للإذونات</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="إذونات الصرف"
        title="إنشاء إذن صرف"
        description="عبّئ البيانات ثم احفظ الإذن في قاعدة البيانات أو صدّره PDF. تُحمَّل آخر مسودة محلية من المتصفح تلقائياً عند فتح الصفحة."
        actions={
          <div className="flex w-full flex-wrap items-stretch gap-2 sm:w-auto sm:items-center">
            <Button
              type="button"
              size="sm"
              className="min-h-11 flex-1 gap-1.5 touch-manipulation bg-emerald-700 text-white shadow-sm hover:bg-emerald-800 sm:min-h-9 sm:flex-none"
              disabled={createDisbursementVoucher.isPending}
              onClick={handlePersistVoucher}
            >
              <Save className="h-4 w-4 shrink-0 stroke-[1.8]" />
              {createDisbursementVoucher.isPending ? 'جاري الحفظ…' : 'حفظ في النظام'}
            </Button>
            <TajMallPdfToolbar
              className="flex w-full basis-full flex-wrap gap-2 sm:w-auto sm:basis-auto"
              fileName={`إذن-صرف-${voucherModel.number}-${voucherDate}`}
              render={async () => <VoucherPDF voucher={voucherModel} />}
            />
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 flex-1 touch-manipulation sm:min-h-9 sm:flex-none"
              asChild
            >
              <Link href="/vouchers" className="gap-1.5">
                <ArrowRight className="h-4 w-4 shrink-0 rotate-180 stroke-[1.6]" />
                العودة للقائمة
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-3 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] sm:px-5 sm:py-7 sm:pb-10 md:px-8 md:py-10">
        <Card className="space-y-5 overflow-hidden p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="v-num">رقم الإذن</Label>
              <Input
                id="v-num"
                dir="ltr"
                placeholder="مثال: 0042"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-date">التاريخ</Label>
              <Input
                id="v-date"
                type="date"
                dir="ltr"
                value={voucherDate}
                onChange={(e) => setVoucherDate(e.target.value)}
              />
            </div>
          </div>

          {datePreview ? (
            <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 via-white to-stone-50 p-5 shadow-[0_1px_0_0_rgba(0,0,0,0.02),inset_0_1px_0_0_rgba(255,255,255,0.6)]">
              <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-emerald-700/90">
                تاريخ الإذن — معاينة الوثيقة
              </p>
              <div className="flex items-end gap-4" dir="rtl">
                <span className="text-4xl font-bold leading-none tabular-nums text-ink sm:text-5xl">
                  {datePreview.day}
                </span>
                <div className="pb-1">
                  <p className="text-base font-semibold leading-snug text-ink">
                    {datePreview.monthYear}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-emerald-700">
                    {datePreview.weekday}
                  </p>
                </div>
              </div>
              <p className="mt-3 border-t border-emerald-200/60 pt-2 text-[11px] font-medium tracking-wider text-ink-mute">
                ميلادي · <span dir="ltr">{datePreview.iso}</span>
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>الخزينة / المصرف (للترحيل المحاسبي)</Label>
              <Select value={cashboxId} onValueChange={setCashboxId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الخزينة" />
                </SelectTrigger>
                <SelectContent>
                  {cashboxes.map((cb) => (
                    <SelectItem key={cb.id} value={cb.id}>
                      {cb.name_ar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>بند المصروف (للترحيل المحاسبي)</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر البند" />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name_ar} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>المستفيد من الدليل (مورد / موظف)</Label>
            <Select
              value={contactId || '__none__'}
              onValueChange={(v) => {
                if (v === '__none__') {
                  setContactId('');
                  return;
                }
                setContactId(v);
                const party = payeeContacts.find((c) => c.id === v);
                if (party?.name) setPayee(party.name);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر مورداً أو موظفاً" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— بدون ربط بجهة —</SelectItem>
                {payeeContacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.group}: {c.name}
                    {c.phone ? ` · ${c.phone}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-ink-mute">
              الاختيار يملأ اسم المستفيد تلقائياً ويُحفظ الربط في النظام (راتب أو صرف لمورد).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="v-payee">يصرف إلى (المستفيد)</Label>
            <Input
              id="v-payee"
              placeholder="اسم المستفيد"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>نوع السداد</Label>
              <Select
                value={method}
                onValueChange={(v) => setMethod(v as VoucherPdfModel['method'])}
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
              <Label htmlFor="v-bank">المصرف (اختياري)</Label>
              <Input
                id="v-bank"
                placeholder="اسم المصرف"
                value={bank}
                onChange={(e) => setBank(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="v-acc">رقم الحساب (اختياري)</Label>
            <Input
              id="v-acc"
              dir="ltr"
              placeholder="IBAN أو رقم الحساب"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>بنود الصرف</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={addLine}
              >
                <Plus className="h-4 w-4" />
                سطر
              </Button>
            </div>
            <div className="space-y-3">
              {lines.map((line, i) => (
                <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <span className="text-xs text-ink-mute">البيان</span>
                    <Input
                      placeholder="وصف البند"
                      value={line.description}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, j) =>
                            j === i ? { ...l, description: e.target.value } : l,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="w-full space-y-1.5 sm:w-36">
                    <span className="text-xs text-ink-mute">المبلغ (د.ل)</span>
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      placeholder="0"
                      value={line.amount}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, j) =>
                            j === i ? { ...l, amount: e.target.value } : l,
                          ),
                        )
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                    disabled={lines.length <= 1}
                    onClick={() => removeLine(i)}
                    aria-label="حذف السطر"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="v-notes">ملاحظات</Label>
            <Input
              id="v-notes"
              placeholder="ملاحظات إضافية تظهر في أسفل الإذن"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* شريط الإجمالي + زر الحفظ كنداء فعل أساسي داخل الكرت */}
          <div className="-mx-4 -mb-4 mt-2 flex flex-col gap-3 border-t border-border bg-muted/30 px-4 py-4 sm:-mx-5 sm:-mb-5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-baseline gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-mute">
                إجمالي الإذن
              </span>
              <span className="text-2xl font-bold tabular-nums text-ink">
                {moneyFmt.format(Math.round(totalAmount))}
              </span>
              <span className="text-sm font-semibold text-ink-mute">د.ل</span>
            </div>
            <div className="flex w-full flex-wrap items-stretch gap-2 sm:w-auto sm:flex-nowrap sm:items-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearDraft}
                className="min-h-11 touch-manipulation text-ink-mute hover:text-red-600 sm:min-h-9"
              >
                مسح المحفوظ محلياً
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 touch-manipulation sm:min-h-9"
                onClick={handleSaveLocalDraft}
              >
                مسودة محلية
              </Button>
              <Button
                type="button"
                size="default"
                className="min-h-11 flex-1 touch-manipulation gap-1.5 bg-emerald-700 text-white shadow-sm hover:bg-emerald-800 sm:min-h-10 sm:flex-none"
                disabled={createDisbursementVoucher.isPending}
                onClick={handlePersistVoucher}
              >
                <CheckCircle2 className="h-4 w-4 stroke-[1.8]" />
                {createDisbursementVoucher.isPending ? 'جاري الحفظ…' : 'حفظ إذن الصرف'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
