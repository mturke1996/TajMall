'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Loader2, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { RentRevenueMonthsBlock } from '@/components/rent/rent-revenue-months-block';
import { useRentPaymentPlan } from '@/components/rent/use-rent-payment-plan';
import { useCashboxes, useRecordRentPayment, type TenantRentSummary } from '@/lib/db/queries';
import { useTenantChargesForTenant } from '@/lib/db/mall-queries';
import { describeRentIssue, resolveRentAmount } from '@/lib/rent-allocation';
import { currentMonthKey, formatMonthLabelAr, formatMonthsLabelAr } from '@/lib/rent-months';
import { PAYMENT_METHODS } from '@/lib/constants';
import type { PaymentMethod } from '@/lib/db/types';
import { cn, formatMoney, parseAmountInput, preferredCashboxId, todayISODate } from '@/lib/utils';
import { useTenantRentAccount } from '@/components/tenants/use-tenant-rent-account';
import { RentAccountFailed } from '@/components/tenants/rent-account-failed';
import { PaymentReceiptSuccess, type PendingReceipt } from '@/components/receipts/payment-receipt-success';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/user-messages';

export type RentPaymentTenant = Pick<
  TenantRentSummary,
  'id' | 'name' | 'shop_number' | 'monthly_rent' | 'current_month_paid' | 'rent_claim_start'
> &
  // the tenant's number, when the row has it: the receipt message opens WhatsApp on it
  Partial<Pick<TenantRentSummary, 'phone'>>;

type RecordRentPaymentDialogProps = {
  tenant: RentPaymentTenant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** called as soon as the payment is saved; the dialog stays open on the receipt until the person taps «تم» */
  onSuccess?: () => void;
  /** months to start with (e.g. the month tapped in the calendar); otherwise the oldest owing month */
  initialMonths?: string[];
};

/** Default description: names the months, and says when the last one is only partly paid. */
function describePayment(months: string[], lastPartial: boolean) {
  if (months.length === 0) return 'تحصيل إيجار';
  const sorted = [...months].sort();
  if (!lastPartial) return `تحصيل إيجار: ${formatMonthsLabelAr(sorted)}`;
  const last = sorted[sorted.length - 1];
  const full = sorted.slice(0, -1);
  return full.length
    ? `تحصيل إيجار: ${formatMonthsLabelAr(full)} وجزء من ${formatMonthLabelAr(last)}`
    : `تحصيل إيجار: جزء من ${formatMonthLabelAr(last)}`;
}

export function RecordRentPaymentDialog({
  tenant,
  open,
  onOpenChange,
  onSuccess,
  initialMonths,
}: RecordRentPaymentDialogProps) {
  const { data: cashboxes = [] } = useCashboxes();
  const recordPayment = useRecordRentPayment();
  const tenantId = tenant?.id ?? '';
  const chargesQuery = useTenantChargesForTenant(tenantId);
  const charges = useMemo(() => chargesQuery.data ?? [], [chargesQuery.data]);

  const [amountText, setAmountText] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => todayISODate());
  const [cashboxId, setCashboxId] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionEdited, setDescriptionEdited] = useState(false);
  const [rentMonths, setRentMonths] = useState<string[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  // set once the payment is saved: the dialog then shows the receipt instead of the form
  const [done, setDone] = useState<PendingReceipt | null>(null);

  const parsedAmount = parseAmountInput(amountText);
  const amount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
  const { plan, basis, basisFor, pricing, loading: pricingLoading } = useRentPaymentPlan({
    tenantId: tenant?.id ?? '',
    contactRent: Number(tenant?.monthly_rent) || 0,
    charges,
    months: rentMonths,
    amount,
  });
  const ready = Boolean(tenant) && !pricingLoading && chargesQuery.isFetched;
  const thisMonthRent = resolveRentAmount(currentMonthKey(), pricing);
  // No choice yet means the preferred box (cash first); a bank box switches the method to transfer below.
  const effectiveCashboxId = cashboxId || preferredCashboxId(cashboxes);
  const selectedCashbox = cashboxes.find((c) => c.id === effectiveCashboxId);
  const lastPartial = plan.lines.length > 0 && plan.lines[plan.lines.length - 1].status === 'partial';

  // The oldest month owed across all years (the same account as the profile), used when the dialog is
  // opened without months: last year's debt comes before this year's.
  const claimStart = tenant?.rent_claim_start ?? null;
  const { account, loading: accountLoading, failed: accountFailed, retry: retryAccount } = useTenantRentAccount({
    tenantId,
    contactRent: Number(tenant?.monthly_rent) || 0,
    claimStart,
    contractStartYear: claimStart ? Number(claimStart.slice(0, 4)) || null : null,
  });
  const oldestOwing = account.owingMonths[0] ?? null;
  const picked = useRef(false);

  // Fresh form each time the dialog opens (not when cashboxes or the tenant row refetch mid-entry).
  const initialKey = (initialMonths ?? []).join(',');
  useEffect(() => {
    if (!open || !tenantId) return;
    picked.current = Boolean(initialKey);
    setRentMonths(initialKey ? initialKey.split(',') : []);
    setAmountText('');
    setPaymentDate(todayISODate());
    setDescription('');
    setDescriptionEdited(false);
    setCashboxId('');
    setMethod('CASH');
    setDone(null);
  }, [open, tenantId, initialKey]);

  useEffect(() => {
    if (!open || picked.current || accountLoading || !ready) return;
    picked.current = true;
    if (oldestOwing) setRentMonths([oldestOwing]);
  }, [open, accountLoading, ready, oldestOwing]);

  useEffect(() => {
    if (selectedCashbox?.kind === 'BANK') setMethod('TRANSFER');
  }, [selectedCashbox?.kind, selectedCashbox?.id]);

  useEffect(() => {
    if (!descriptionEdited) setDescription(describePayment(rentMonths, lastPartial));
  }, [rentMonths, lastPartial, descriptionEdited]);

  const setAmount = useCallback((n: number) => setAmountText(n > 0 ? String(n) : ''), []);

  async function handleSubmit() {
    if (!tenant) return;
    if (!plan.ok) {
      toast.error(describeRentIssue(plan.issues[0], formatMonthLabelAr));
      return;
    }
    try {
      const saved = await recordPayment.mutateAsync({
        tenant_id: tenant.id,
        amount,
        payment_date: paymentDate,
        cashbox_id: effectiveCashboxId || undefined,
        description: description.trim() || describePayment(rentMonths, lastPartial),
        rent_months: [...rentMonths].sort(),
        payment_method: method,
      });
      if (saved.transaction_id) {
        // Months owed outside this payment, as the account stood before it; left out when the account was
        // still loading, because a half-read account would name months that are not owed.
        const otherOwing =
          accountLoading || accountFailed
            ? null
            : account.years.flatMap((y) => y.months).filter((m) => m.owedNow > 0).map((m) => ({ month: m.month, amount: m.owedNow }));
        setDone({
          kind: 'rent',
          transactionId: saved.transaction_id,
          amount,
          tenant: { name: tenant.name, shopNumber: tenant.shop_number, phone: tenant.phone ?? null },
          lines: plan.lines,
          otherOwing,
        });
      } else {
        // no id to read the receipt back with: confirm as before
        toast.success('سُجّلت الدفعة', {
          description: plan.lines
            .map((l) => `${formatMonthLabelAr(l.month)}: ${l.status === 'paid' ? 'مُسدَّد' : `جزئي ${formatMoney(l.paidAfter, 'LYD')} من ${formatMoney(l.amount, 'LYD')}`}`)
            .join(' · '),
        });
        onOpenChange(false);
      }
      onSuccess?.();
    } catch (err) {
      console.error('[rent-payment]', err);
      toast.error(friendlyError(err, 'تعذّر تسجيل الدفعة'));
    }
  }

  if (!tenant) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl w-[calc(100%-1.5rem)] max-h-[92dvh] overflow-y-auto rounded-2xl p-0 gap-0"
        dir="rtl"
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border text-start">
          <DialogTitle>تحصيل إيجار</DialogTitle>
          <DialogDescription className={cn('text-[13px] leading-relaxed', done && 'sr-only')}>
            {done
              ? 'نتيجة تسجيل الدفعة وإيصالها.'
              : 'تُسجَّل الدفعة في الخزينة واليومية وتُربط بالأشهر المحددة في قيد واحد. يظهر التوزيع قبل الحفظ.'}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <PaymentReceiptSuccess pending={done} onDone={() => onOpenChange(false)} />
        ) : (
          <>
            <div className="px-5 py-4 space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-canvas-sunken/60 p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-ink-mute">
                  <Store className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{tenant.name}</p>
                  <p className="text-[12.5px] text-ink-mute">
                    محل {tenant.shop_number || '—'} · إيجار {formatMonthLabelAr(currentMonthKey())}{' '}
                    <span className="tabular-nums text-foreground">{thisMonthRent > 0 ? formatMoney(thisMonthRent, 'LYD') : '—'}</span>
                  </p>
                </div>
              </div>

              {accountFailed ? (
                // the months and what is owed come from lists that did not load: recording against them would pick the wrong months
                <RentAccountFailed onRetry={retryAccount} />
              ) : !ready ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-ink-mute">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> جارٍ تحميل أشهر المستأجر وأسعاره…
                </div>
              ) : (
                <RentRevenueMonthsBlock
                  tenantId={tenant.id}
                  monthlyRent={thisMonthRent}
                  charges={charges}
                  selected={rentMonths}
                  onSelectedChange={setRentMonths}
                  plan={plan}
                  basis={basis}
                  basisFor={basisFor}
                  onAmountChange={setAmount}
                  ready={ready}
                  // the same claim start the database applies when it records the payment
                  claimStart={tenant.rent_claim_start ?? null}
                  // nothing owed now: suggest the next month due
                  autoSelectFirstDue={!accountLoading && !oldestOwing}
                />
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="rent-amount">مبلغ الدفعة (د.ل)</Label>
                  <Input
                    id="rent-amount"
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    value={amountText}
                    onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,]/g, ''))}
                    className="mt-1.5 h-12 text-lg font-semibold tabular-nums text-end"
                    aria-describedby="rent-amount-hint"
                  />
                  <p id="rent-amount-hint" className="mt-1 text-[12px] text-ink-mute">
                    يُوزَّع على الأشهر بالترتيب: الأقدم أولاً، والأخير قد يُسدَّد جزئياً.
                  </p>
                </div>
                <div>
                  <Label htmlFor="rent-date">تاريخ الدفعة</Label>
                  <Input id="rent-date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-1.5 h-11" />
                </div>
                {cashboxes.length > 0 && (
                  <div>
                    <Label>الخزينة</Label>
                    <Select value={effectiveCashboxId} onValueChange={setCashboxId}>
                      <SelectTrigger className="mt-1.5 h-11">
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
                  <Label>طريقة الدفع</Label>
                  <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                    <SelectTrigger className="mt-1.5 h-11">
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
                <div className="sm:col-span-2">
                  <Label htmlFor="rent-desc">البيان</Label>
                  <Input
                    id="rent-desc"
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setDescriptionEdited(true);
                    }}
                    className="mt-1.5"
                  />
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t border-border bg-card px-5 py-3.5">
              <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => onOpenChange(false)}>
                إلغاء
              </Button>
              <Button
                type="button"
                className="h-11 flex-[2]"
                onClick={handleSubmit}
                disabled={recordPayment.isPending || !ready || accountFailed || !plan.ok}
              >
                {recordPayment.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : plan.ok ? (
                  <>تسجيل الدفعة · <span className="tabular-nums">{formatMoney(amount, 'LYD')}</span></>
                ) : (
                  'راجع التوزيع أعلاه'
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
