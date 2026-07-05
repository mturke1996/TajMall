'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useCashboxBalances } from '@/lib/db/queries';
import { useRecordCashboxTransfer } from '@/lib/db/cashbox-queries';
import { formatMoney } from '@/lib/utils';

function sanitizeAmount(raw: string) {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 2) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('')}`;
}

export function CashboxTransferDialog({
  open,
  onOpenChange,
  defaultFromId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFromId?: string;
}) {
  const { data: balances = [] } = useCashboxBalances();
  const transfer = useRecordCashboxTransfer();

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  const options = useMemo(
    () => balances.map((b) => ({ id: b.id, label: b.name_ar, balance: Number(b.balance), currency: b.currency || 'LYD' })),
    [balances],
  );

  const fromBox = options.find((o) => o.id === fromId);
  const toBox = options.find((o) => o.id === toId);
  const amountVal = Number(amount) || 0;

  useEffect(() => {
    if (!open) return;
    if (defaultFromId) setFromId(defaultFromId);
    setDate(new Date().toISOString().slice(0, 10));
  }, [open, defaultFromId]);

  function reset() {
    setFromId(defaultFromId ?? '');
    setToId('');
    setAmount('');
    setDescription('');
    setNotes('');
    setDate(new Date().toISOString().slice(0, 10));
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function submit() {
    if (!fromId || !toId) {
      toast.error('اختر الخزينة المصدر والوجهة');
      return;
    }
    if (fromId === toId) {
      toast.error('لا يمكن التحويل لنفس الخزينة');
      return;
    }
    if (amountVal <= 0) {
      toast.error('أدخل مبلغاً أكبر من صفر');
      return;
    }
    if (fromBox && amountVal > fromBox.balance + 0.001) {
      toast.error('رصيد الخزينة المصدر لا يكفي');
      return;
    }

    try {
      const res = await transfer.mutateAsync({
        from_cashbox_id: fromId,
        to_cashbox_id: toId,
        amount: amountVal,
        transfer_date: date,
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(`تم التحويل — ${res.reference}`);
      handleOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تنفيذ التحويل');
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تحويل بين الخزائن</DialogTitle>
          <DialogDescription>
            نقل مبلغ من خزينة أو حساب مصرفي إلى آخر — يُسجّل في سجل كل طرف.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>من خزينة</Label>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر المصدر" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fromBox ? (
              <p className="text-[11.5px] text-ink-mute">
                الرصيد المتاح:{' '}
                <span className="num font-semibold text-foreground">
                  {formatMoney(fromBox.balance, fromBox.currency)}
                </span>
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>إلى خزينة</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الوجهة" />
              </SelectTrigger>
              <SelectContent>
                {options.filter((o) => o.id !== fromId).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {toBox ? (
              <p className="text-[11.5px] text-ink-mute">
                رصيد الوجهة:{' '}
                <span className="num font-semibold text-foreground">
                  {formatMoney(toBox.balance, toBox.currency)}
                </span>
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>المبلغ</Label>
              <Input
                type="text"
                inputMode="decimal"
                dir="ltr"
                value={amount}
                onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>التاريخ</Label>
              <Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>البيان</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="سبب التحويل (اختياري)"
            />
          </div>
          <div className="space-y-1.5">
            <Label>ملاحظات داخلية</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري" />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={submit}
            disabled={transfer.isPending || !fromId || !toId || amountVal <= 0}
            className="gap-1.5"
          >
            {transfer.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowLeftRight className="h-4 w-4" />
            )}
            تنفيذ التحويل
          </Button>
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
