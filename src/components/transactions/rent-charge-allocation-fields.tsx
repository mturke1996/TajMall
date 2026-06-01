'use client';

import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn, formatMoney } from '@/lib/utils';
import { useTenantCharges } from '@/lib/db/mall-queries';
import type { ChargeAllocationInput } from '@/lib/db/types';

type Props = {
  tenantId: string;
  paymentAmount: number;
  mode: 'AUTO' | 'MANUAL';
  onModeChange: (mode: 'AUTO' | 'MANUAL') => void;
  allocations: ChargeAllocationInput[];
  onAllocationsChange: (rows: ChargeAllocationInput[]) => void;
};

export function RentChargeAllocationFields({
  tenantId,
  paymentAmount,
  mode,
  onModeChange,
  allocations,
  onAllocationsChange,
}: Props) {
  const { data: charges = [], isLoading } = useTenantCharges();

  const unpaid = useMemo(() => {
    return charges.filter((c) => {
      if (c.status === 'PAID') return false;
      const tenantMatch = c.contract?.tenant?.id === tenantId;
      if (!tenantMatch) return false;
      return Number(c.amount) > Number(c.total_paid);
    });
  }, [charges, tenantId]);

  const allocatedTotal = allocations.reduce((s, a) => s + a.amount, 0);

  function toggleCharge(chargeId: string, maxAmount: number) {
    const exists = allocations.find((a) => a.charge_id === chargeId);
    if (exists) {
      onAllocationsChange(allocations.filter((a) => a.charge_id !== chargeId));
      return;
    }
    onAllocationsChange([
      ...allocations,
      { charge_id: chargeId, amount: Math.min(maxAmount, paymentAmount - allocatedTotal) || maxAmount },
    ]);
  }

  function setAmount(chargeId: string, raw: string) {
    const n = Number(raw) || 0;
    onAllocationsChange(
      allocations.map((a) => (a.charge_id === chargeId ? { ...a, amount: n } : a)),
    );
  }

  return (
    <div className="rounded-lg border border-sage-200 bg-sage-50/50 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-semibold text-sage-900">تخصيص على المطالبات</Label>
        <div className="flex rounded-lg border border-border bg-card p-0.5 text-xs">
          {(['AUTO', 'MANUAL'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                onModeChange(m);
                if (m === 'AUTO') onAllocationsChange([]);
              }}
              className={cn(
                'rounded-md px-2.5 py-1.5 font-medium touch-manipulation',
                mode === m ? 'bg-sage-700 text-white' : 'text-muted-foreground',
              )}
            >
              {m === 'AUTO' ? 'تلقائي (FIFO)' : 'يدوي'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'AUTO' ? (
        <p className="text-xs text-sage-800 leading-relaxed">
          يُوزَّع المبلغ تلقائياً على أقدم المطالبات غير المسددة للمستأجر.
        </p>
      ) : isLoading ? (
        <p className="text-xs text-muted-foreground">جاري تحميل المطالبات…</p>
      ) : unpaid.length === 0 ? (
        <p className="text-xs text-amber-800">لا توجد مطالبات مفتوحة لهذا المستأجر.</p>
      ) : (
        <ul className="space-y-2 max-h-40 overflow-y-auto">
          {unpaid.map((c) => {
            const remaining = Number(c.amount) - Number(c.total_paid);
            const selected = allocations.find((a) => a.charge_id === c.id);
            return (
              <li
                key={c.id}
                className={cn(
                  'rounded-md border p-2 text-xs',
                  selected ? 'border-sage-400 bg-white' : 'border-border bg-card/80',
                )}
              >
                <label className="flex items-start gap-2 cursor-pointer touch-manipulation">
                  <input
                    type="checkbox"
                    checked={!!selected}
                    onChange={() => toggleCharge(c.id, remaining)}
                    className="mt-0.5"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="font-semibold block truncate">{c.description}</span>
                    <span className="text-muted-foreground">
                      متبقي {formatMoney(remaining, 'LYD')} · استحقاق {c.due_date}
                    </span>
                  </span>
                </label>
                {selected ? (
                  <div className="mt-2 flex items-center gap-2">
                    <Label className="shrink-0 text-[11px]">المبلغ</Label>
                    <Input
                      type="number"
                      min={0}
                      max={remaining}
                      step="0.001"
                      dir="ltr"
                      value={selected.amount || ''}
                      onChange={(e) => setAmount(c.id, e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {mode === 'MANUAL' && allocations.length > 0 && (
        <p className="text-[11px] text-sage-800">
          مجمّع التخصيص: {formatMoney(allocatedTotal, 'LYD')}
          {paymentAmount > 0 && allocatedTotal > paymentAmount && (
            <span className="text-red-600 font-semibold"> — يتجاوز مبلغ التحصيل</span>
          )}
        </p>
      )}
    </div>
  );
}
