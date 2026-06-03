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
import {
  RentRevenueMonthsBlock,
  parseRentPartialAmount,
  type RentLinkMode,
} from '@/components/rent/rent-revenue-months-block';
import { useCashboxes, useRecordRentPayment, type TenantRentSummary } from '@/lib/db/queries';
import { useTenantChargesForTenant } from '@/lib/db/mall-queries';
import { rentChargesByMonth, sumRentMonthsRemaining } from '@/lib/rent-journal-link';
import { areConsecutiveMonths, formatMonthsLabelAr } from '@/lib/rent-months';
import { PAYMENT_METHODS } from '@/lib/constants';
import type { PaymentMethod } from '@/lib/db/types';
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
  const { data: charges = [] } = useTenantChargesForTenant(tenant?.id ?? '');

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [cashboxId, setCashboxId] = useState('');
  const [description, setDescription] = useState('تحصيل إيجار');
  const [rentMonths, setRentMonths] = useState<string[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [linkMode, setLinkMode] = useState<RentLinkMode>('full');
  const [partialAmount, setPartialAmount] = useState('');

  const rent = Number(tenant?.monthly_rent) || 0;
  const selectedCashbox = cashboxes.find((c) => c.id === cashboxId);

  const chargesByMonth = useMemo(
    () => (tenant ? rentChargesByMonth(charges, tenant.id) : new Map()),
    [charges, tenant],
  );

  const { totalRemaining } = useMemo(
    () =>
      tenant
        ? sumRentMonthsRemaining(chargesByMonth, rentMonths, rent)
        : { totalRemaining: 0, totalAmount: 0, totalPaid: 0 },
    [chargesByMonth, rentMonths, rent, tenant],
  );

  useEffect(() => {
    if (open && tenant) {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      setRentMonths([currentMonth]);
      setPaymentDate(now.toISOString().slice(0, 10));
      setDescription('تحصيل إيجار');
      setLinkMode('full');
      setPartialAmount('');
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
    if (rentMonths.length === 0 || linkMode === 'partial') return;
    const suggested =
      totalRemaining > 0 ? totalRemaining : rentMonths.length * rent;
    if (suggested > 0) setPaymentAmount(String(suggested));
  }, [rentMonths, totalRemaining, rent, linkMode]);

  async function handleSubmit() {
    if (!tenant) return;
    if (rentMonths.length === 0) {
      toast.error('اختر شهر إيجار واحداً على الأقل');
      return;
    }
    if (!areConsecutiveMonths(rentMonths)) {
      toast.error('اختر أشهراً متتالية');
      return;
    }

    let amount: number;
    if (linkMode === 'partial') {
      const partial = parseRentPartialAmount(partialAmount);
      if (partial == null) {
        toast.error('أدخل مبلغ الجزء');
        return;
      }
      if (partial > totalRemaining + 0.001) {
        toast.error(`المبلغ أكبر من المتبقي (${formatMoney(totalRemaining, 'LYD')})`);
        return;
      }
      amount = partial;
    } else {
      amount = Number(paymentAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error('أدخل مبلغ الإيراد');
        return;
      }
    }

    try {
      const result = await recordPayment.mutateAsync({
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
      const journalHint =
        result?.journal_entry_id != null
          ? ' وربطها بقيد اليومية'
          : '';
      toast.success(
        `تم تسجيل الإيراد${journalHint} — ${formatMonthsLabelAr(rentMonths)} في التقويم`,
      );
      onOpenChange(false);
      setPaymentAmount('');
      onSuccess?.();
    } catch (err) {
      console.error('[rent-payment]', err);
      toast.error(
        err instanceof Error ? err.message : 'فشل تسجيل الإيراد',
      );
    }
  }

  if (!tenant) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg w-[calc(100%-1.5rem)] max-h-[90dvh] overflow-y-auto rounded-2xl p-0 gap-0"
        dir="rtl"
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle>تسجيل إيراد إيجار</DialogTitle>
          <p className="text-sm text-ink-mute text-start leading-relaxed pt-1">
            يُسجَّل الإيراد في الخزينة واليومية، ويُحدَّث تقويم المستأجر تلقائياً
            (بدون تخصيص مطالبات يدوي).
          </p>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4">
          <div className="rounded-lg bg-sage-50 p-3">
            <p className="font-medium">{tenant.name}</p>
            <p className="text-sm text-ink-mute">
              محل {tenant.shop_number || '—'} · إيجار شهري{' '}
              {rent > 0 ? formatMoney(rent, 'LYD') : '—'}
            </p>
          </div>

          <RentRevenueMonthsBlock
            tenantId={tenant.id}
            monthlyRent={rent}
            charges={charges}
            selected={rentMonths}
            onSelectedChange={setRentMonths}
            linkMode={linkMode}
            onLinkModeChange={setLinkMode}
            partialAmount={partialAmount}
            onPartialAmountChange={setPartialAmount}
          />

          <div>
            <Label>مبلغ الإيراد (الخزينة)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="text-lg h-11 tabular-nums"
              disabled={linkMode === 'partial'}
            />
            {linkMode === 'partial' && (
              <p className="text-[11px] text-ink-mute mt-1">
                في وضع الجزء يُستخدم مبلغ الجزء أعلاه كمبلغ الإيراد.
              </p>
            )}
          </div>

          <div>
            <Label>تاريخ الإيراد</Label>
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
          </div>

          <div>
            <Label>البيان</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4 bg-canvas-sunken/30">
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
              recordPayment.isPending ||
              rent === 0 ||
              rentMonths.length === 0
            }
          >
            {recordPayment.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'تسجيل الإيراد وربط الشهور'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
