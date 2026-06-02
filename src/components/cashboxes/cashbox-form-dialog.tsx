'use client';

import { useState } from 'react';
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
import { useCreateCashbox } from '@/lib/db/queries';
import type { CashboxKind } from '@/lib/db/types';

export function CashboxFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateCashbox();
  const [code, setCode] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [kind, setKind] = useState<CashboxKind>('CASH');
  const [currency, setCurrency] = useState('LYD');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  const pending = create.isPending;

  const resetForm = () => {
    setCode('');
    setNameAr('');
    setKind('CASH');
    setCurrency('LYD');
    setOpeningBalance('0');
    setBankName('');
    setAccountNumber('');
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !nameAr.trim()) return;

    await create.mutateAsync({
      code,
      name_ar: nameAr,
      kind,
      currency,
      opening_balance: Number(openingBalance || '0'),
      bank_name: kind === 'CASH' ? null : bankName,
      account_number: kind === 'CASH' ? null : accountNumber,
    });
    resetForm();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافة خزينة جديدة</DialogTitle>
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
                <SelectTrigger>
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

          {kind !== 'CASH' && (
            <div className="grid gap-4 sm:grid-cols-2">
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
                  placeholder="123456789"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={pending} className="gap-2">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              إضافة الخزينة
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
