'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Banknote, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  useSetTenantRentPriceBands,
  useTenantRentPriceBands,
} from '@/lib/db/rent-queries';
import {
  draftFromBand,
  emptyBandDraft,
  formatBandLabelAr,
  validateBandDrafts,
  type RentPriceBandDraft,
} from '@/lib/rent-price-schedule';
import { currentYear, formatMonthLabelAr } from '@/lib/rent-months';
import { formatMoney } from '@/lib/utils';
import { toast } from 'sonner';

const AR_MONTH_OPTIONS = [
  { value: 1, label: 'يناير' },
  { value: 2, label: 'فبراير' },
  { value: 3, label: 'مارس' },
  { value: 4, label: 'أبريل' },
  { value: 5, label: 'مايو' },
  { value: 6, label: 'يونيو' },
  { value: 7, label: 'يوليو' },
  { value: 8, label: 'أغسطس' },
  { value: 9, label: 'سبتمبر' },
  { value: 10, label: 'أكتوبر' },
  { value: 11, label: 'نوفمبر' },
  { value: 12, label: 'ديسمبر' },
] as const;

type Props = {
  tenantId: string;
  tenantName: string;
  monthlyRent: number;
  years: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function YearMonthSelects({
  year,
  month,
  years,
  onYear,
  onMonth,
  idPrefix,
}: {
  year: number;
  month: number;
  years: number[];
  onYear: (y: number) => void;
  onMonth: (m: number) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Select value={String(year)} onValueChange={(v) => onYear(Number(v))}>
        <SelectTrigger id={`${idPrefix}-year`} className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(month)} onValueChange={(v) => onMonth(Number(v))}>
        <SelectTrigger id={`${idPrefix}-month`} className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AR_MONTH_OPTIONS.map((m) => (
            <SelectItem key={m.value} value={String(m.value)}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function SetRentPriceScheduleDialog({
  tenantId,
  tenantName,
  monthlyRent,
  years,
  open,
  onOpenChange,
}: Props) {
  const formId = useId();
  const { data: savedBands = [], isLoading } = useTenantRentPriceBands(tenantId);
  const saveBands = useSetTenantRentPriceBands();
  const yearOptions = useMemo(() => {
    const base = years.length > 0 ? years : [currentYear()];
    const y = currentYear();
    return [...new Set([...base, y - 1, y, y + 1])].sort((a, b) => a - b);
  }, [years]);

  const [drafts, setDrafts] = useState<RentPriceBandDraft[]>([]);

  useEffect(() => {
    if (!open) return;
    if (savedBands.length > 0) {
      setDrafts(savedBands.map((b, i) => draftFromBand({
        id: b.id,
        from_month: b.from_month,
        to_month: b.to_month,
        amount: Number(b.amount),
        notes: b.notes,
      }, `b-${i}`)));
    } else {
      const y = yearOptions[0] ?? currentYear();
      setDrafts([
        {
          ...emptyBandDraft(y, 'b-0'),
          fromMonth: 1,
          toMonth: 3,
          amount: monthlyRent > 0 ? String(monthlyRent) : '1000',
        },
        {
          ...emptyBandDraft(y, 'b-1'),
          fromMonth: 4,
          toMonth: 12,
          amount: monthlyRent > 0 ? String(Math.round(monthlyRent * 1.2)) : '1500',
        },
      ]);
    }
  }, [open, savedBands, monthlyRent, yearOptions]);

  const validation = useMemo(() => validateBandDrafts(drafts), [drafts]);

  const preview = useMemo(() => {
    if (!validation.ok) return [];
    return validation.bands.map((b) => ({
      label: formatBandLabelAr(b),
      fromLabel: formatMonthLabelAr(b.from_month),
      toLabel: formatMonthLabelAr(b.to_month),
      amount: b.amount,
    }));
  }, [validation]);

  const updateDraft = (key: string, patch: Partial<RentPriceBandDraft>) => {
    setDrafts((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    );
  };

  const addBand = () => {
    const y = yearOptions[yearOptions.length - 1] ?? currentYear();
    setDrafts((prev) => [
      ...prev,
      emptyBandDraft(y, `b-${Date.now()}`),
    ]);
  };

  const removeBand = (key: string) => {
    setDrafts((prev) => (prev.length <= 1 ? prev : prev.filter((d) => d.key !== key)));
  };

  const onSave = async () => {
    const result = validateBandDrafts(drafts);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    try {
      const data = await saveBands.mutateAsync({
        tenantId,
        bands: result.bands,
      });
      const sync = data?.sync;
      const paidN = sync?.marked_paid ?? 0;
      const amountN = sync?.amount_changed ?? data?.unpaid_charges_updated ?? 0;
      const parts: string[] = ['تم حفظ جدول الأسعار'];
      if (amountN > 0) parts.push(`تحديث مبلغ ${amountN} شهر`);
      if (paidN > 0) {
        parts.push(
          `${paidN} ${paidN === 1 ? 'شهر أصبح/بقي مدفوعاً' : 'أشهر أصبحت/بقيت مدفوعة'} بعد مطابقة السعر الجديد`,
        );
      }
      toast.success(parts.join(' · '));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر حفظ الجدول');
    }
  };

  const onClear = async () => {
    try {
      await saveBands.mutateAsync({ tenantId, bands: [] });
      toast.success('أُزيل جدول الأسعار — يُستخدم الإيجار الشهري الافتراضي');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر المسح');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right">
            <Banknote className="h-5 w-5 text-sage-700" />
            جدول أسعار الإيجار
          </DialogTitle>
          <DialogDescription className="text-right leading-relaxed">
            حدّد سعراً مختلفاً لكل فترة شهور لـ «{tenantName}».
            مثال: أول ثلاثة أشهر 1000 د.ل ثم يرتفع أو ينخفض لاحقاً.
            السعر الافتراضي الحالي:{' '}
            {monthlyRent > 0 ? formatMoney(monthlyRent, 'LYD') : 'غير محدد'}.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {drafts.map((d, idx) => (
              <div
                key={d.key}
                className="rounded-xl border border-border bg-secondary/30 p-3 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-sage-900">
                    نطاق {idx + 1}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-red-700 hover:text-red-800"
                    disabled={drafts.length <= 1 || saveBands.isPending}
                    onClick={() => removeBand(d.key)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${formId}-${d.key}-from`}>من شهر</Label>
                    <YearMonthSelects
                      idPrefix={`${formId}-${d.key}-from`}
                      year={d.fromYear}
                      month={d.fromMonth}
                      years={yearOptions}
                      onYear={(y) => updateDraft(d.key, { fromYear: y })}
                      onMonth={(m) => updateDraft(d.key, { fromMonth: m })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${formId}-${d.key}-to`}>إلى شهر</Label>
                    <YearMonthSelects
                      idPrefix={`${formId}-${d.key}-to`}
                      year={d.toYear}
                      month={d.toMonth}
                      years={yearOptions}
                      onYear={(y) => updateDraft(d.key, { toYear: y })}
                      onMonth={(m) => updateDraft(d.key, { toMonth: m })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${formId}-${d.key}-amount`}>المبلغ (د.ل)</Label>
                  <Input
                    id={`${formId}-${d.key}-amount`}
                    type="number"
                    min={0}
                    step="0.001"
                    inputMode="decimal"
                    value={d.amount}
                    onChange={(e) => updateDraft(d.key, { amount: e.target.value })}
                    placeholder="1000"
                    className="font-mono"
                  />
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={addBand}
              disabled={saveBands.isPending}
            >
              <Plus className="h-4 w-4" />
              إضافة نطاق سعر
            </Button>

            {preview.length > 0 && (
              <div className="rounded-lg border border-sage-200 bg-sage-50/60 p-3 text-sm space-y-1.5">
                <p className="font-semibold text-sage-900 text-xs">معاينة</p>
                {preview.map((p) => (
                  <div
                    key={p.label}
                    className="flex justify-between gap-2 text-[13px]"
                  >
                    <span className="text-muted-foreground">
                      {p.fromLabel}
                      {p.fromLabel !== p.toLabel ? ` → ${p.toLabel}` : ''}
                    </span>
                    <span className="font-mono font-semibold tabular-nums">
                      {formatMoney(p.amount, 'LYD')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {!validation.ok && drafts.length > 0 && (
              <p className="text-xs text-red-700">{validation.error}</p>
            )}

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              عند الحفظ تُحدَّث مبالغ الشهور حسب الجدول. إذا كان المدفوع يغطي
              السعر الجديد يُعلَّم الشهر مدفوعاً؛ وإن نقص يصبح جزئياً. خارج
              النطاقات يُستخدم الإيجار الشهري الافتراضي.
            </p>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            disabled={saveBands.isPending || savedBands.length === 0}
            onClick={() => void onClear()}
          >
            إزالة الجدول
          </Button>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => onOpenChange(false)}
              disabled={saveBands.isPending}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              className="flex-1 sm:flex-none"
              disabled={saveBands.isPending || !validation.ok}
              onClick={() => void onSave()}
            >
              {saveBands.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'حفظ الجدول'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
