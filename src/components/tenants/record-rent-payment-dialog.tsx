'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { RentMonthPicker } from '@/components/rent/rent-month-picker';
import { useCashboxes, useRecordRentPayment, type TenantRentSummary } from '@/lib/db/queries';
import { useTenantRentCalendar } from '@/lib/db/rent-queries';
import { formatMoney } from '@/lib/utils';
import { formatMonthsLabelAr, currentYear } from '@/lib/rent-months';
import { PAYMENT_METHODS } from '@/lib/constants';
import type { PaymentMethod } from '@/lib/db/types';
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
  const year = currentYear();
  const { data: calendar } = useTenantRentCalendar(tenant?.id ?? '', year);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [cashboxId, setCashboxId] = useState('');
  const [description, setDescription] = useState('تحصيل إيجار');
  const [rentMonths, setRentMonths] = useState<string[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('CASH');

  const rent = Number(tenant?.monthly_rent) || 0;
  const selectedCashbox = cashboxes.find((c) => c.id === cashboxId);

  const suggestedAmount = useMemo(() => {
    if (rentMonths.length === 0) return 0;
    return rentMonths.length * rent;
  }, [rentMonths.length, rent]);

  useEffect(() => {
    if (open && tenant) {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      setRentMonths([currentMonth]);
      setPaymentDate(now.toISOString().slice(0, 10));
      setDescription('تحصيل إيجار');
      const first = cashboxes[0];
      setCashboxId(first?.id ?? '');
      setMethod(first?.kind === 'BANK' ? 'TRANSFER' : 'CASH');
    }
  }, [open, tenant, cashboxes]);

  useEffect(() => {
    if (selectedCashbox?.kind === 'BANK') {
      setMethod('TRANSFER');
    }
  }, [selectedCashbox?.kind, selectedCashbox?.id]);

  useEffect(() => {
    if (suggestedAmount > 0 && rentMonths.length > 0) {
      setPaymentAmount(String(suggestedAmount));
    }
  }, [suggestedAmount, rentMonths.length]);

  async function handleSubmit() {
    if (!tenant || !paymentAmount) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('أدخل مبلغاً صحيحاً');
      return;
    }
    if (rentMonths.length === 0) {
      toast.error('اختر شهراً واحداً على الأقل');
      return;
    }
    try {
      await recordPayment.mutateAsync({
        tenant_id: tenant.id,
        amount,
        payment_date: paymentDate,
        cashbox_id: cashboxId || undefined,
        description:
          description.trim() ||
          `تحصيل إيجار: ${formatMonthsLabelAr(rentMonths)}`,
        rent_months: rentMonths,
        payment_method: method,
      });
      toast.success('تم تسجيل الدفع وتخصيصه على الشهور المحددة');
      onOpenChange(false);
      setPaymentAmount('');
      onSuccess?.();
    } catch (err) {
      console.error('[rent-payment]', err);
      toast.error(
        err instanceof Error ? err.message : 'فشل تسجيل الدفع — تحقق من العقد والمطالبات',
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg w-[calc(100%-1.5rem)] max-h-[90dvh] overflow-y-auto rounded-2xl"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>تسجيل تحصيل إيجار</DialogTitle>
        </DialogHeader>
        {tenant && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-sage-50 p-3">
              <p className="font-medium">{tenant.name}</p>
              <p className="text-sm text-ink-mute">
                محل {tenant.shop_number || '—'} · شهري{' '}
                {rent > 0 ? formatMoney(rent, 'LYD') : '—'}
              </p>
            </div>

            <div>
              <Label className="mb-2 block">شهور الإيجار</Label>
              <RentMonthPicker
                year={year}
                selected={rentMonths}
                onChange={setRentMonths}
                calendarMonths={calendar?.months}
                showStatus
              />
            </div>

            <div>
              <Label>المبلغ</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="text-lg h-11"
              />
              {suggestedAmount > 0 && (
                <p className="text-[11px] text-ink-mute mt-1">
                  مقترح ({rentMonths.length} شهر): {formatMoney(suggestedAmount, 'LYD')}
                </p>
              )}
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
                        {cb.bank_name ? ` · ${cb.bank_name}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>نوع الدفع</Label>
              <Select
                value={method}
                onValueChange={(v) => setMethod(v as PaymentMethod)}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.labelAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {method === 'TRANSFER' && selectedCashbox?.bank_name && (
                <p className="text-[11px] text-ink-mute mt-1">
                  المصرف: {selectedCashbox.bank_name}
                </p>
              )}
            </div>

            <div>
              <Label>البيان</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
                disabled={
                  !paymentAmount || recordPayment.isPending || rent === 0
                }
              >
                {recordPayment.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'تسجيل التحصيل'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
