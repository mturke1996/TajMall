'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateCashbox, useUpdateCashbox } from '@/lib/db/queries';
import type { CashboxKind, CashboxRow } from '@/lib/db/types';

function emptyForm() {
  return {
    code: '',
    nameAr: '',
    kind: 'CASH' as CashboxKind,
    currency: 'LYD',
    openingBalance: '0',
    bankName: '',
    accountNumber: '',
    iban: '',
  };
}

export function CashboxFormDialog({
  open,
  onOpenChange,
  editRow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editRow?: CashboxRow | null;
}) {
  const create = useCreateCashbox();
  const update = useUpdateCashbox();
  const isEdit = !!editRow;

  const [code, setCode] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [kind, setKind] = useState<CashboxKind>('CASH');
  const [currency, setCurrency] = useState('LYD');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [iban, setIban] = useState('');

  const pending = create.isPending || update.isPending;
  const showBankFields = kind !== 'CASH';

  useEffect(() => {
    if (!open) return;
    if (editRow) {
      setCode(editRow.code);
      setNameAr(editRow.name_ar);
      setKind(editRow.kind);
      setCurrency(editRow.currency || 'LYD');
      setOpeningBalance(String(editRow.opening_balance ?? '0'));
      setBankName(editRow.bank_name ?? '');
      setAccountNumber(editRow.account_number ?? '');
      setIban(editRow.iban ?? '');
    } else {
      const f = emptyForm();
      setCode(f.code);
      setNameAr(f.nameAr);
      setKind(f.kind);
      setCurrency(f.currency);
      setOpeningBalance(f.openingBalance);
      setBankName(f.bankName);
      setAccountNumber(f.accountNumber);
      setIban(f.iban);
    }
  }, [open, editRow]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !nameAr.trim()) return;

    const bankPayload = {
      bank_name: showBankFields ? bankName.trim() || null : null,
      account_number: showBankFields ? accountNumber.trim() || null : null,
      iban: showBankFields ? iban.trim().replace(/\s/g, '').toUpperCase() || null : null,
    };

    if (isEdit && editRow) {
      await update.mutateAsync({
        id: editRow.id,
        code,
        name_ar: nameAr,
        kind,
        currency,
        opening_balance: Number(openingBalance || '0'),
        ...bankPayload,
      });
    } else {
      await create.mutateAsync({
        code,
        name_ar: nameAr,
        kind,
        currency,
        opening_balance: Number(openingBalance || '0'),
        ...bankPayload,
      });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'تعديل الخزينة' : 'إضافة خزينة جديدة'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cashbox-code">الرمز</Label>
              <Input
                id="cashbox-code"
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="CASH-MAIN"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>النوع</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as CashboxKind)}>
                <SelectTrigger className="min-h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">خزينة نقدية</SelectItem>
                  <SelectItem value="BANK">حساب مصرفي</SelectItem>
                  <SelectItem value="CARD">بطاقة / POS</SelectItem>
                  <SelectItem value="OTHER">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cashbox-name-ar">الاسم بالعربية</Label>
            <Input
              id="cashbox-name-ar"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              placeholder="الخزينة الرئيسية"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cashbox-currency">العملة</Label>
              <Input
                id="cashbox-currency"
                dir="ltr"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="LYD"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cashbox-opening">الرصيد الافتتاحي</Label>
              <Input
                id="cashbox-opening"
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </div>
          </div>

          {showBankFields && (
            <div className="space-y-4 rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">بيانات الحساب المصرفي</p>
              <div className="space-y-2">
                <Label htmlFor="cashbox-bank-name">اسم المصرف</Label>
                <Input
                  id="cashbox-bank-name"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="مصرف الصحاري"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cashbox-account-number">رقم الحساب</Label>
                <Input
                  id="cashbox-account-number"
                  dir="ltr"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="1234567890"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cashbox-iban">رقم الآيبان (IBAN)</Label>
                <Input
                  id="cashbox-iban"
                  dir="ltr"
                  value={iban}
                  onChange={(e) => setIban(e.target.value.toUpperCase())}
                  placeholder="LY82001001000000000000"
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={pending} className="gap-2 min-h-10 touch-manipulation">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'حفظ التعديلات' : 'إضافة الخزينة'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
