'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
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
import { useCashboxes, useRecordRentPayment, type TenantRentSummary } from '@/lib/db/queries';
import { formatMoney } from '@/lib/utils';
import { toast } from 'sonner';

export type RentPaymentTenant = Pick<
  TenantRentSummary,
  'id' | 'name' | 'shop_number' | 'monthly_rent' | 'current_month_paid'
>;

type RecordRentPaymentDialogProps = {
  tenant: RentPaymentTenant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export function RecordRentPaymentDialog({
  tenant,
  open,
  onOpenChange,
  onSuccess,
}: RecordRentPaymentDialogProps) {
  const { data: cashboxes = [] } = useCashboxes();
  const recordPayment = useRecordRentPayment();
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [cashboxId, setCashboxId] = useState('');
  const [description, setDescription] = useState('إيجار');

  const rent = Number(tenant?.monthly_rent) || 0;
  const paid = Number(tenant?.current_month_paid) || 0;
  const remaining = Math.max(0, rent - paid);

  useEffect(() => {
    if (open && tenant) {
      setPaymentAmount(remaining > 0 ? String(remaining) : '');
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setDescription('إيجار');
      setCashboxId(cashboxes[0]?.id ?? '');
    }
  }, [open, tenant, remaining, cashboxes]);

  async function handleSubmit() {
    if (!tenant || !paymentAmount) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('أدخل مبلغاً صحيحاً');
      return;
    }
    try {
      await recordPayment.mutateAsync({
        tenant_id: tenant.id,
        amount,
        payment_date: paymentDate,
        cashbox_id: cashboxId || undefined,
        description: description.trim() || 'إيجار',
      });
      toast.success('تم تسجيل الدفع بنجاح');
      onOpenChange(false);
      setPaymentAmount('');
      onSuccess?.();
    } catch (err) {
      console.error('[rent-payment]', err);
      toast.error(
        err instanceof Error ? err.message : 'فشل تسجيل الدفع — تحقق من الإيجار والخزينة',
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md w-[calc(100%-1.5rem)] max-h-[90dvh] overflow-y-auto rounded-2xl"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>تسجيل دفع إيجار</DialogTitle>
        </DialogHeader>
        {tenant && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-sage-50 p-3">
              <p className="font-medium">{tenant.name}</p>
              <p className="text-sm text-ink-mute">
                محل {tenant.shop_number || '—'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-canvas-sunken p-2">
                <p className="text-ink-mute">الإيجار الشهري</p>
                <p className="font-semibold">
                  {rent > 0 ? formatMoney(rent, 'LYD') : '—'}
                </p>
              </div>
              <div className="rounded-lg bg-canvas-sunken p-2">
                <p className="text-ink-mute">المسدد هذا الشهر</p>
                <p className="font-semibold">{formatMoney(paid, 'LYD')}</p>
              </div>
            </div>

            {remaining > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setPaymentAmount(String(remaining))}
              >
                تعبئة المتبقي ({formatMoney(remaining, 'LYD')})
              </Button>
            )}

            <div>
              <Label>المبلغ</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="text-lg h-11"
                autoFocus
              />
            </div>

            <div>
              <Label>تاريخ الدفع</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="h-11"
              />
            </div>

            {cashboxes.length > 0 && (
              <div>
                <Label>الخزينة</Label>
                <Select value={cashboxId} onValueChange={setCashboxId}>
                  <SelectTrigger className="h-11">
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
            )}

            <div>
              <Label>البيان (اختياري)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="إيجار"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-11"
                onClick={() => onOpenChange(false)}
              >
                إلغاء
              </Button>
              <Button
                type="button"
                className="flex-1 h-11"
                onClick={handleSubmit}
                disabled={!paymentAmount || recordPayment.isPending || rent === 0}
              >
                {recordPayment.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'تسجيل الدفع'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
