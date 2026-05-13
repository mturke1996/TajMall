'use client';

import { useEffect, useState, useMemo } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Loader2, X, User, Building2, Briefcase, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTxDialog, type TxKind } from '@/stores/transaction-dialog';
import { PAYMENT_METHODS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useCategories, useCashboxes, useCreateTransaction, useContacts, useCreateContact } from '@/lib/db/queries';
import { toast } from 'sonner';

export function NewTransactionDialog() {
  const { isOpen, defaultKind, close } = useTxDialog();
  
  const [kind, setKind] = useState<TxKind>(defaultKind);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [cashboxId, setCashboxId] = useState('');
  const [method, setMethod] = useState<'CASH' | 'CHEQUE' | 'TRANSFER' | 'CARD'>('CASH');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [contactId, setContactId] = useState('');
  const [contactKind, setContactKind] = useState<'ALL' | 'TENANT' | 'EMPLOYEE' | 'CUSTOMER' | 'VENDOR'>('ALL');
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: categoriesAll = [], isLoading: catsLoading } = useCategories();
  const { data: cashboxes = [], isLoading: boxLoading } = useCashboxes();
  const { data: contactsAll = [], isLoading: contactsLoading } = useContacts();
  const createTx = useCreateTransaction();
  const createContact = useCreateContact();

  const categories = categoriesAll.filter((c) => c.kind === kind);
  const isRevenue = kind === 'REVENUE';

  // Filter contacts by kind
  const contacts = useMemo(() => {
    if (contactKind === 'ALL') return contactsAll;
    return contactsAll.filter(c => c.kind === contactKind);
  }, [contactsAll, contactKind]);

  useEffect(() => {
    if (isOpen) {
      setKind(defaultKind);
      setAmount('');
      setCategoryId('');
      setCashboxId(cashboxes[0]?.id ?? '');
      setMethod('CASH');
      setDate(new Date().toISOString().slice(0, 10));
      setDescription('');
      setContactId('');
      setContactKind('ALL');
      setShowNewContact(false);
      setNewContactName('');
      setError(null);
    }
  }, [isOpen, defaultKind, cashboxes]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amountNum = Number(amount.replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError('أدخل مبلغ صحيح');
      return;
    }
    if (!categoryId) {
      setError('اختر البند');
      return;
    }
    if (!cashboxId) {
      setError('اختر الخزينة');
      return;
    }

    try {
      await createTx.mutateAsync({
        kind,
        amount: amountNum,
        method,
        category_id: categoryId,
        cashbox_id: cashboxId,
        tx_date: date,
        description: description || undefined,
        contact_id: contactId || undefined,
        contact_type: contactId ? (isRevenue ? 'PAYER' : 'BENEFICIARY') : undefined,
      });
      toast.success(isRevenue ? 'تم الإيراد' : 'تم الصرف');
      close();
    } catch {
      setError('فشل الحفظ');
    }
  }

  async function handleCreateContact(e: React.FormEvent) {
    e.preventDefault();
    if (!newContactName.trim()) return;
    
    try {
      const newContact = await createContact.mutateAsync({
        name: newContactName.trim(),
        kind: (contactKind === 'ALL' ? 'CUSTOMER' : contactKind) as any,
        code: null,
        name_en: null,
        phone: null,
        phone2: null,
        email: null,
        address: null,
        id_number: null,
        tax_number: null,
        shop_number: null,
        floor: null,
        area_sqm: null,
        contract_start: null,
        contract_end: null,
        monthly_rent: null,
        job_title: null,
        department: null,
        hire_date: null,
        salary: null,
        is_active: true,
        notes: null,
      });
      setContactId(newContact.id);
      setShowNewContact(false);
      setNewContactName('');
      toast.success('تم إضافة العميل');
    } catch {
      toast.error('فشل إضافة العميل');
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" dir="rtl">
      <div className="absolute inset-0 bg-black/30" onClick={close} />
      <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-lg rounded-t-2xl bg-card sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl border shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b p-4">
          <div className={cn(
            'grid h-9 w-9 place-items-center rounded',
            isRevenue ? 'bg-pastel-green text-pastel-greenInk' : 'bg-pastel-red text-pastel-redInk'
          )}>
            {isRevenue ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
          </div>
          <h2 className="font-semibold">{isRevenue ? 'إيراد جديد' : 'مصروف جديد'}</h2>
          <button onClick={close} className="mr-auto rounded p-1 hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {/* النوع */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setKind('REVENUE'); setCategoryId(''); }}
              className={cn(
                'rounded-md py-2 text-sm font-medium',
                kind === 'REVENUE' ? 'bg-pastel-green text-pastel-greenInk' : 'bg-canvas-sunken'
              )}
            >
              إيراد
            </button>
            <button
              type="button"
              onClick={() => { setKind('EXPENSE'); setCategoryId(''); }}
              className={cn(
                'rounded-md py-2 text-sm font-medium',
                kind === 'EXPENSE' ? 'bg-pastel-red text-pastel-redInk' : 'bg-canvas-sunken'
              )}
            >
              مصروف
            </button>
          </div>

          {/* المبلغ */}
          <div>
            <Label>المبلغ (د.ل)</Label>
            <Input
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
              <Label>البند</Label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
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
              <Label>الخزينة</Label>
              <select
                value={cashboxId}
                onChange={(e) => setCashboxId(e.target.value)}
                className="h-10 w-full rounded border px-2 text-sm"
                disabled={boxLoading}
              >
                <option value="">اختر</option>
                {cashboxes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name_ar}</option>
                ))}
              </select>
            </div>
          </div>

          {/* طريقة الدفع والتاريخ */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>الطريقة</Label>
              <select
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
              <Label>التاريخ</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {/* البيان */}
          <div>
            <Label>البيان (اختياري)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="وصف المعاملة"
            />
          </div>

          {/* العميل / المستأجر / الموظف */}
          <div className="border rounded-md p-3 space-y-2 bg-canvas-sunken/30">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-ink-mute" />
                {isRevenue ? 'المسدد' : 'المستفيد'} (اختياري)
              </Label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setContactKind('ALL')}
                  className={cn(
                    'px-2 py-0.5 text-[10px] rounded',
                    contactKind === 'ALL' ? 'bg-sage-100 text-sage-700' : 'text-ink-mute'
                  )}
                >
                  الكل
                </button>
                <button
                  type="button"
                  onClick={() => setContactKind('TENANT')}
                  className={cn(
                    'px-2 py-0.5 text-[10px] rounded',
                    contactKind === 'TENANT' ? 'bg-sage-100 text-sage-700' : 'text-ink-mute'
                  )}
                >
                  <Building2 className="h-3 w-3 inline" />
                </button>
                <button
                  type="button"
                  onClick={() => setContactKind('EMPLOYEE')}
                  className={cn(
                    'px-2 py-0.5 text-[10px] rounded',
                    contactKind === 'EMPLOYEE' ? 'bg-sage-100 text-sage-700' : 'text-ink-mute'
                  )}
                >
                  <Briefcase className="h-3 w-3 inline" />
                </button>
              </div>
            </div>

            {showNewContact ? (
              <form onSubmit={handleCreateContact} className="flex gap-2">
                <Input
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="اسم جديد..."
                  className="flex-1 h-9"
                />
                <Button type="submit" size="sm" className="h-9 px-2">
                  <Plus className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-9 px-2" onClick={() => setShowNewContact(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </form>
            ) : (
              <div className="flex gap-2">
                <select
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
                  onClick={() => setShowNewContact(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Buttons */}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={close} className="flex-1">
              إلغاء
            </Button>
            <Button type="submit" disabled={createTx.isPending} className="flex-1">
              {createTx.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'حفظ'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
