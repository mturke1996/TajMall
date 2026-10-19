'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Loader2, X, User, Building2, Briefcase, Plus, FileStack, Trash2, Landmark, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTxDialog, type TxKind } from '@/stores/transaction-dialog';
import { PAYMENT_METHODS } from '@/lib/constants';
import { cn, parseAmountInput, preferredCashboxId, todayISODate } from '@/lib/utils';
import { useCategories, useCashboxes, useCreateTransaction, useContacts, useCreateContact, useTransactionFormDrafts, useSaveTransactionFormDraft, useDeleteTransactionFormDraft, useRecordRentPayment } from '@/lib/db/queries';
import type { TransactionFormDraftRow, PaymentMethod } from '@/lib/db/types';
import { RentRevenueMonthsBlock } from '@/components/rent/rent-revenue-months-block';
import { useRentPaymentPlan } from '@/components/rent/use-rent-payment-plan';
import { describeRentIssue } from '@/lib/rent-allocation';
import { isRentCategoryCode } from '@/lib/charge-invoice';
import {
  contactKindLabelAr,
  isCustomerServiceRevenueCode,
  isEmployeeSalaryCode,
  isVendorServiceExpenseCode,
  suggestedContactKindForTx,
  type PartyContactFilter,
} from '@/lib/party-contacts';
import { useTenantChargesForTenant } from '@/lib/db/mall-queries';
import { formatMonthLabelAr, formatMonthsLabelAr } from '@/lib/rent-months';
import { toast } from 'sonner';
import { usePermission } from '@/lib/supabase/use-permission';
import { formatContactSaveError } from '@/lib/contacts/form-utils';
import { NEEDS_DB_UPDATE, friendlyError } from '@/lib/user-messages';

/** يُرجع رسالة خطأ مفيدة من خطأ Supabase/Postgres بدل رسالة عامة. */
function extractSaveError(err: unknown): string {
  const e = err as { message?: string; code?: string } | null;
  const raw = e?.message?.trim() ?? '';
  if (e?.code === '42804' || (raw.includes('payment_method') && raw.includes('type text'))) {
    return `لم تُحفظ المعاملة: ${NEEDS_DB_UPDATE}`;
  }
  if (e?.code === '23502') return 'لم تُحفظ المعاملة: إعداد الحسابات غير مكتمل (حساب الخزينة غير مربوط) — أبلغ مسؤول النظام.';
  if (e?.code === '23503') return 'لم تُحفظ المعاملة: أحد الاختيارات (البند أو الخزينة أو الجهة) لم يعد موجوداً — أعد اختياره.';
  return `لم تُحفظ المعاملة: ${friendlyError(err, 'تعذّر الحفظ، حاول مجدداً.')}`;
}

export function NewTransactionDialog() {
  const {
    isOpen,
    openedAt,
    defaultKind,
    prefillContactId,
    prefillContactKind,
    prefillDescription,
    prefillAmount,
    close,
  } = useTxDialog();
  const { can, loading: permLoading } = usePermission();
  
  const [kind, setKind] = useState<TxKind>(defaultKind);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [cashboxId, setCashboxId] = useState('');
  const [method, setMethod] = useState<'CASH' | 'CHEQUE' | 'TRANSFER' | 'CARD'>('CASH');
  const [date, setDate] = useState(() => todayISODate());
  const [description, setDescription] = useState('');
  const [contactId, setContactId] = useState('');
  const [contactKind, setContactKind] = useState<PartyContactFilter>('ALL');
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [rentMonths, setRentMonths] = useState<string[]>([]);
  // the whole save, including removing a used draft: the button stays disabled until it ends
  const [submitting, setSubmitting] = useState(false);

  const { data: drafts = [], isLoading: draftsLoading } = useTransactionFormDrafts(kind, isOpen);
  const saveDraft = useSaveTransactionFormDraft();
  const deleteDraft = useDeleteTransactionFormDraft();

  const { data: categoriesAll = [], isLoading: catsLoading } = useCategories();
  const { data: cashboxData, isLoading: boxLoading } = useCashboxes();
  const cashboxes = useMemo(() => cashboxData ?? [], [cashboxData]);
  const { data: contactsAll = [], isLoading: contactsLoading } = useContacts();
  const createTx = useCreateTransaction();
  const recordRentPayment = useRecordRentPayment();
  const createContact = useCreateContact();

  const categories = categoriesAll.filter(
    (c) => c.kind === kind && c.code !== 'EXP-TEST',
  );
  const isRevenue = kind === 'REVENUE';

  // Filter contacts by kind
  const contacts = useMemo(() => {
    if (contactKind === 'ALL') return contactsAll;
    return contactsAll.filter(c => c.kind === contactKind);
  }, [contactsAll, contactKind]);

  // Reset the form each time the dialog is opened (also when a new request arrives while it is open,
  // e.g. "new expense" from the command palette) — not on every re-render, or typing would be wiped
  // while the cashboxes load.
  const resetFor = useRef(0);
  useEffect(() => {
    const opening = isOpen && resetFor.current !== openedAt;
    if (opening) {
      resetFor.current = openedAt;
      setKind(defaultKind);
      setAmount(prefillAmount ? String(prefillAmount) : '');
      setCategoryId('');
      setCashboxId(preferredCashboxId(cashboxes));
      setMethod('CASH');
      setDate(todayISODate());
      setDescription(prefillDescription ?? '');
      const prefKind =
        prefillContactKind &&
        (prefillContactKind === 'ALL' ||
          prefillContactKind === 'TENANT' ||
          prefillContactKind === 'EMPLOYEE' ||
          prefillContactKind === 'CUSTOMER' ||
          prefillContactKind === 'VENDOR')
          ? prefillContactKind
          : suggestedContactKindForTx(defaultKind, null);
      setContactKind(prefKind);
      setContactId(prefillContactId ?? '');
      setShowNewContact(false);
      setNewContactName('');
      setError(null);
      setEditingDraftId(null);
      setRentMonths([]);
      setSubmitting(false);
    }
  }, [isOpen, openedAt, defaultKind, cashboxes, prefillContactId, prefillContactKind, prefillDescription, prefillAmount]);

  // no choice yet means the preferred box, also when the cashboxes arrive after the dialog opened
  const effectiveCashboxId = cashboxId || preferredCashboxId(cashboxes);

  const createPerm = kind === 'REVENUE' ? 'revenue.create' : 'expense.create';
  const canRevenue = !permLoading && can('revenue.create');
  const canExpense = !permLoading && can('expense.create');

  // Opened for a kind this user may not record: switch to the other kind, or close if neither.
  useEffect(() => {
    if (!isOpen || permLoading) return;
    if (can(createPerm)) return;
    const other: TxKind = kind === 'REVENUE' ? 'EXPENSE' : 'REVENUE';
    if (can(other === 'REVENUE' ? 'revenue.create' : 'expense.create')) {
      setKind(other);
      setCategoryId('');
      // the party filter followed the kind it was opened for (customers for a revenue)
      if (!prefillContactKind) setContactKind(suggestedContactKindForTx(other, null));
      return;
    }
    close();
    toast.error('صلاحية القراءة فقط — لا يمكن إضافة معاملات');
  }, [isOpen, permLoading, createPerm, can, close, kind, prefillContactKind]);

  // Escape closes it like every other dialog in the app.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  const selectedCategory = categoriesAll.find((c) => c.id === categoryId);
  const selectedContact = contactsAll.find((c) => c.id === contactId);
  const showRentAllocation =
    isRevenue &&
    !!contactId &&
    selectedContact?.kind === 'TENANT' &&
    isRentCategoryCode(selectedCategory?.code);

  const tenantChargesQuery = useTenantChargesForTenant(showRentAllocation ? contactId : '');
  const tenantCharges = useMemo(() => tenantChargesQuery.data ?? [], [tenantChargesQuery.data]);
  const tenantMonthlyRent = Number(selectedContact?.monthly_rent) || 0;
  const amountNumber = parseAmountInput(amount) || 0;
  // The rent split is the same one the tenant payment dialog shows (src/lib/rent-allocation.ts).
  const rentPlan = useRentPaymentPlan({
    tenantId: showRentAllocation ? contactId : '',
    contactRent: tenantMonthlyRent,
    charges: tenantCharges,
    months: rentMonths,
    amount: amountNumber,
  });
  const rentReady = showRentAllocation && !rentPlan.loading && tenantChargesQuery.isFetched;
  const setRentAmount = useCallback((n: number) => setAmount(n > 0 ? String(n) : ''), []);

  useEffect(() => {
    if (!showRentAllocation || rentMonths.length === 0) return;
    setDescription(`تحصيل إيجار: ${formatMonthsLabelAr([...rentMonths].sort())}`);
  }, [rentMonths, showRentAllocation]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!can(createPerm)) {
      setError('ليس لديك صلاحية إضافة هذه المعاملة');
      return;
    }

    const amountNum = parseAmountInput(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError('أدخل مبلغاً صحيحاً أكبر من صفر، بثلاث خانات عشرية على الأكثر.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('حدّد تاريخ العملية');
      return;
    }
    if (!categoryId) {
      setError('اختر البند');
      return;
    }
    if (!effectiveCashboxId) {
      setError('اختر الخزينة');
      return;
    }

    if (showRentAllocation) {
      if (!rentReady) {
        setError('انتظر تحميل أشهر المستأجر');
        return;
      }
      if (!rentPlan.plan.ok) {
        setError(describeRentIssue(rentPlan.plan.issues[0], formatMonthLabelAr));
        return;
      }
    }

    setSubmitting(true);
    try {
      /** مسار إيجار ذرّي: معاملة + قيد + ربط في RPC واحد */
      if (showRentAllocation && contactId && rentMonths.length > 0) {
        await recordRentPayment.mutateAsync({
          tenant_id: contactId,
          amount: amountNum,
          payment_date: date,
          cashbox_id: effectiveCashboxId,
          description:
            description.trim() ||
            `تحصيل إيجار: ${formatMonthsLabelAr(rentMonths)}`,
          rent_months: [...rentMonths].sort(),
          payment_method: method,
        });
        // the mutation already refreshes every money query, the tenant's rent calendar included
      } else {
        await createTx.mutateAsync({
          kind,
          amount: amountNum,
          method,
          category_id: categoryId,
          cashbox_id: effectiveCashboxId,
          tx_date: date,
          description: description || undefined,
          contact_id: contactId || undefined,
          contact_type: contactId
            ? isRevenue
              ? 'PAYER'
              : 'BENEFICIARY'
            : undefined,
          auto_allocate_charges: false,
        });
      }
      if (editingDraftId) {
        try {
          await deleteDraft.mutateAsync({ id: editingDraftId, kind });
        } catch {
          /* ignore */
        }
        setEditingDraftId(null);
      }
      toast.success(
        showRentAllocation && rentMonths.length > 0
          ? `تم الإيراد وربط ${formatMonthsLabelAr(rentMonths)} بالقيد`
          : isRevenue
            ? 'تم الإيراد'
            : 'تم الصرف',
      );
      close();
    } catch (err) {
      console.error('فشل حفظ المعاملة:', err);
      const msg = extractSaveError(err);
      setError(msg);
      // dismissed while the save was running: the form is gone, so the failure would go unseen
      if (!useTxDialog.getState().isOpen) toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateContact() {
    if (!newContactName.trim() || createContact.isPending) return;

    const createKind =
      contactKind === 'ALL' ? (isRevenue ? 'CUSTOMER' : 'VENDOR') : contactKind;
    const label = contactKindLabelAr(createKind);

    try {
      const newContact = await createContact.mutateAsync({
        name: newContactName.trim(),
        kind: createKind,
        is_active: true,
      });
      setContactId(newContact.id);
      setContactKind(createKind);
      setShowNewContact(false);
      setNewContactName('');
      toast.success(`تم إضافة ${label}`);
    } catch (err) {
      toast.error(formatContactSaveError(err));
    }
  }

  function applyDraft(row: TransactionFormDraftRow) {
    setEditingDraftId(row.id);
    const p = row.payload;
    setAmount(p.amount ?? '');
    setCategoryId(p.category_id ?? '');
    setCashboxId(p.cashbox_id ?? preferredCashboxId(cashboxes));
    setMethod((p.method as PaymentMethod) ?? 'CASH');
    setDate(p.tx_date ?? todayISODate());
    setDescription(p.description ?? '');
    setContactId(p.contact_id ?? '');
    const ck = p.contact_kind ?? 'ALL';
    if (ck === 'ALL' || ck === 'TENANT' || ck === 'EMPLOYEE' || ck === 'CUSTOMER' || ck === 'VENDOR') {
      setContactKind(ck);
    } else {
      setContactKind('ALL');
    }
    setError(null);
    toast.success('تم تحميل المسودة', { description: row.label ?? undefined });
  }

  async function handleSaveDraft() {
    try {
      const auto =
        amount.trim() !== ''
          ? `${kind === 'REVENUE' ? 'إيراد' : 'مصروف'} ${amount} د.ل`
          : kind === 'REVENUE'
            ? 'مسودة إيراد'
            : 'مسودة مصروف';
      const row = await saveDraft.mutateAsync({
        id: editingDraftId ?? undefined,
        kind,
        label: `${auto} · ${new Date().toLocaleString('ar-LY')}`,
        payload: {
          amount,
          category_id: categoryId || undefined,
          cashbox_id: effectiveCashboxId || undefined,
          method,
          tx_date: date,
          description: description || undefined,
          contact_id: contactId || undefined,
          contact_kind: contactKind,
        },
      });
      setEditingDraftId(row.id);
      toast.success('تم حفظ المسودة');
    } catch {
      toast.error('تعذّر حفظ المسودة — تأكد من تسجيل الدخول وتطبيق ترحيل قاعدة البيانات');
    }
  }

  if (!isOpen) return null;

  // a stray tap beside the sheet must not throw away a half-typed entry; X, إلغاء and Escape still leave
  const dirty = amount.trim() !== '' || description.trim() !== '' || categoryId !== '' || contactId !== '';

  return (
    <div className="fixed inset-0 z-50" dir="rtl">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={() => {
          if (!dirty) close();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-tx-title"
        className="absolute bottom-0 inset-e-0 inset-s-0 mx-auto max-w-lg rounded-t-2xl bg-card sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl border shadow-lift"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b p-4">
          <div className={cn(
            'grid h-9 w-9 place-items-center rounded',
            isRevenue ? 'bg-pastel-green text-pastel-greenInk' : 'bg-pastel-red text-pastel-redInk'
          )}>
            {isRevenue ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
          </div>
          <h2 id="new-tx-title" className="font-semibold">{isRevenue ? 'إيراد جديد' : 'مصروف جديد'}</h2>
          {editingDraftId ? (
            <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
              مسودة محفوظة
            </span>
          ) : null}
          <button type="button" aria-label="إغلاق" onClick={close} className="ms-auto rounded p-1 hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {(draftsLoading || drafts.length > 0) && (
            <div className="rounded-lg border border-border bg-muted/25 p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                  <FileStack className="h-3.5 w-3.5" />
                  مسوداتك المحفوظة
                </span>
                {draftsLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <span className="text-[11px] text-muted-foreground">{drafts.length}</span>
                )}
              </div>
              {!draftsLoading &&
                drafts.map((d) => (
                  <div
                    key={d.id}
                    className={cn(
                      'flex items-stretch gap-1 rounded-md border border-transparent bg-card/80',
                      editingDraftId === d.id && 'ring-1 ring-primary/30 border-border',
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-2 py-2 text-start text-xs hover:bg-muted/40 rounded-md transition-colors"
                      onClick={() => applyDraft(d)}
                    >
                      <span className="font-medium leading-snug line-clamp-2">{d.label || 'مسودة بدون عنوان'}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(d.updated_at).toLocaleString('ar-LY')}
                      </span>
                    </button>
                    <Button aria-label="حذف المسودة"
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-auto shrink-0 rounded-md text-muted-foreground hover:text-destructive"
                      disabled={deleteDraft.isPending}
                      onClick={() =>
                        deleteDraft.mutate(
                          { id: d.id, kind },
                          {
                            onSuccess: () => {
                              toast.success('تم حذف المسودة');
                              if (editingDraftId === d.id) setEditingDraftId(null);
                            },
                            onError: () => toast.error('تعذّر حذف المسودة'),
                          },
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
            </div>
          )}

          {/* النوع */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={kind === 'REVENUE'}
              disabled={!canRevenue}
              title={canRevenue ? undefined : 'لا تملك صلاحية تسجيل إيراد'}
              onClick={() => {
                setKind('REVENUE');
                setCategoryId('');
                setContactKind(suggestedContactKindForTx('REVENUE', null));
              }}
              className={cn(
                'rounded-md py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50',
                kind === 'REVENUE' ? 'bg-pastel-green text-pastel-greenInk' : 'bg-canvas-sunken'
              )}
            >
              إيراد
            </button>
            <button
              type="button"
              aria-pressed={kind === 'EXPENSE'}
              disabled={!canExpense}
              title={canExpense ? undefined : 'لا تملك صلاحية تسجيل مصروف'}
              onClick={() => {
                setKind('EXPENSE');
                setCategoryId('');
                setContactKind(suggestedContactKindForTx('EXPENSE', null));
              }}
              className={cn(
                'rounded-md py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50',
                kind === 'EXPENSE' ? 'bg-pastel-red text-pastel-redInk' : 'bg-canvas-sunken'
              )}
            >
              مصروف
            </button>
          </div>

          {/* المبلغ */}
          <div>
            <Label htmlFor="tx-amount">المبلغ (د.ل)</Label>
            <Input
              id="tx-amount"
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-lg"
              autoFocus
            />
          </div>

          {/* البند والخزينة */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="tx-category">البند</Label>
              <select
                id="tx-category"
                value={categoryId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setCategoryId(nextId);
                  const code = categoriesAll.find((c) => c.id === nextId)?.code;
                  setContactKind(suggestedContactKindForTx(kind, code));
                }}
                className="h-10 w-full rounded border px-2 text-sm"
                disabled={catsLoading}
              >
                <option value="">اختر</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name_ar}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="tx-cashbox">الخزينة</Label>
              <select
                id="tx-cashbox"
                value={effectiveCashboxId}
                onChange={(e) => setCashboxId(e.target.value)}
                className="h-10 w-full rounded border px-2 text-sm"
                disabled={boxLoading}
              >
                <option value="">اختر</option>
                {cashboxes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name_ar}</option>
                ))}
              </select>
              {!boxLoading && cashboxes.length === 0 && (
                <p className="mt-1 text-[11px] text-danger">
                  لا توجد خزينة نشطة — أضف خزينة من صفحة الخزائن أولاً.
                </p>
              )}
            </div>
          </div>

          {/* طريقة الدفع والتاريخ */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="tx-method">الطريقة</Label>
              <select
                id="tx-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as any)}
                className="h-10 w-full rounded border px-2 text-sm"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.labelAr}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="tx-date">تاريخ العملية</Label>
              <Input
                id="tx-date"
                type="date"
                required
                value={date}
                max={todayISODate()}
                min="2020-01-01"
                onChange={(e) => setDate(e.target.value)}
              />
              <p className="mt-1 text-[11px] leading-snug text-ink-mute">
                للمول القائم: يمكن اختيار تاريخ سابق (مثلاً من بداية السنة) لتسجيل حركات رجعية.
              </p>
            </div>
          </div>

          {/* البيان */}
          <div>
            <Label htmlFor="tx-description">البيان (اختياري)</Label>
            <Input
              id="tx-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="وصف المعاملة"
            />
          </div>

          {/* الجهة: عميل / مورد / مستأجر / موظف */}
          <div className="border rounded-md p-3 space-y-2 bg-canvas-sunken/30">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="tx-contact" className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-ink-mute" />
                {isRevenue ? 'المسدد' : 'المستفيد'} (اختياري)
              </Label>
              <div className="flex flex-wrap justify-end gap-1">
                {(
                  [
                    { id: 'ALL' as const, label: 'الكل', icon: null },
                    { id: 'CUSTOMER' as const, label: 'عميل', icon: Store },
                    { id: 'VENDOR' as const, label: 'مورد', icon: Landmark },
                    { id: 'TENANT' as const, label: 'مستأجر', icon: Building2 },
                    { id: 'EMPLOYEE' as const, label: 'موظف', icon: Briefcase },
                  ] as const
                ).map((chip) => {
                  const Icon = chip.icon;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      title={chip.label}
                      onClick={() => setContactKind(chip.id)}
                      className={cn(
                        'inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] rounded',
                        contactKind === chip.id
                          ? 'bg-muted text-foreground'
                          : 'text-ink-mute hover:bg-secondary',
                      )}
                    >
                      {Icon ? <Icon className="h-3 w-3" /> : null}
                      <span>{chip.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {selectedCategory &&
            isCustomerServiceRevenueCode(selectedCategory.code) &&
            isRevenue ? (
              <p className="text-[11px] leading-snug text-ink-mute">
                إيراد خدمة/مواقف — يمكن ربطه بعميل مباشرة دون عقد إيجار.
              </p>
            ) : null}
            {selectedCategory &&
            isVendorServiceExpenseCode(selectedCategory.code) &&
            !isRevenue ? (
              <p className="text-[11px] leading-snug text-ink-mute">
                مصروف تشغيلي — يُفضَّل ربطه بمورد لتتبع الإنفاق.
              </p>
            ) : null}
            {selectedCategory &&
            isEmployeeSalaryCode(selectedCategory.code) &&
            !isRevenue ? (
              <p className="text-[11px] leading-snug text-ink-mute">
                مصروف مرتبات — يُفضَّل ربطه بموظف.
              </p>
            ) : null}
            {isRevenue && selectedCategory?.code === 'REV-RNT' && selectedContact?.kind !== 'TENANT' ? (
              <p className="text-[11px] leading-snug text-warning-ink">
                إيجار محل دون مستأجر: لن يُربط التحصيل بأي شهر ولن يُخصم من مستحقات أحد. اختر المستأجر من القائمة.
              </p>
            ) : null}

            {showNewContact ? (
              // not a nested <form>: its submit would post the transaction itself
              <div className="flex gap-2">
                <Input
                  id="tx-contact"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleCreateContact();
                    }
                  }}
                  placeholder="اسم الجهة الجديدة"
                  aria-label="اسم الجهة الجديدة"
                  className="flex-1 h-9"
                  autoFocus
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9 px-2"
                  aria-label="إضافة الجهة"
                  disabled={!newContactName.trim() || createContact.isPending}
                  onClick={() => void handleCreateContact()}
                >
                  {createContact.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-9 px-2" aria-label="إلغاء إضافة جهة" onClick={() => setShowNewContact(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  id="tx-contact"
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  className="h-9 flex-1 rounded border px-2 text-sm bg-card"
                  disabled={contactsLoading}
                >
                  <option value="">-- اختر --</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.shop_number ? `(محل ${c.shop_number})` : ''} {c.job_title ? `- ${c.job_title}` : ''}
                    </option>
                  ))}
                </select>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  className="h-9 px-2"
                  aria-label="إضافة جهة جديدة"
                  onClick={() => setShowNewContact(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {showRentAllocation && contactId && (
            rentReady ? (
              <RentRevenueMonthsBlock
                tenantId={contactId}
                monthlyRent={tenantMonthlyRent}
                charges={tenantCharges}
                selected={rentMonths}
                onSelectedChange={setRentMonths}
                plan={rentPlan.plan}
                basis={rentPlan.basis}
                basisFor={rentPlan.basisFor}
                onAmountChange={setRentAmount}
                ready={rentReady}
                autoSelectFirstDue
              />
            ) : (
              <p className="py-3 text-center text-sm text-ink-mute">جارٍ تحميل أشهر المستأجر وأسعاره…</p>
            )
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          {/* Buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={close} className="min-w-[96px] flex-1">
              إلغاء
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleSaveDraft()}
              disabled={saveDraft.isPending}
              className="min-w-[96px] flex-1"
            >
              {saveDraft.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'حفظ مسودة'}
            </Button>
            <Button type="submit" disabled={submitting} className="min-w-[96px] flex-1">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-label="جارٍ الترحيل" /> : 'ترحيل الآن'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
