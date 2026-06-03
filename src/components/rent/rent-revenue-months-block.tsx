'use client';

import { useEffect, useMemo, useState } from 'react';
import { PieChart } from 'lucide-react';
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
import { RentMonthPicker } from '@/components/rent/rent-month-picker';
import { buildRentCalendarFromCharges } from '@/lib/rent-calendar-from-charges';
import { rentChargesByMonth, sumRentMonthsRemaining } from '@/lib/rent-journal-link';
import {
  areConsecutiveMonths,
  currentYear,
  formatMonthLabelAr,
  formatMonthsLabelAr,
} from '@/lib/rent-months';
import type { TenantChargeWithRelations } from '@/lib/db/types';
import type { RentCalendarMonth } from '@/lib/rent-months';
import { formatMoney } from '@/lib/utils';

export type RentLinkMode = 'full' | 'partial';

type Props = {
  tenantId: string;
  monthlyRent: number;
  charges: TenantChargeWithRelations[];
  years?: number[];
  selected: string[];
  onSelectedChange: (months: string[]) => void;
  linkMode: RentLinkMode;
  onLinkModeChange: (mode: RentLinkMode) => void;
  partialAmount: string;
  onPartialAmountChange: (value: string) => void;
  maxMonths?: number;
};

export function RentRevenueMonthsBlock({
  tenantId,
  monthlyRent,
  charges,
  years: yearsProp,
  selected,
  onSelectedChange,
  linkMode,
  onLinkModeChange,
  partialAmount,
  onPartialAmountChange,
  maxMonths,
}: Props) {
  const defaultYear = yearsProp?.[0] ?? currentYear();
  const [year, setYear] = useState(defaultYear);

  const years = yearsProp ?? [currentYear(), currentYear() - 1];

  const chargesByMonth = useMemo(
    () => rentChargesByMonth(charges, tenantId),
    [charges, tenantId],
  );

  const { totalRemaining, totalAmount, totalPaid } = useMemo(
    () => sumRentMonthsRemaining(chargesByMonth, selected, monthlyRent),
    [chargesByMonth, selected, monthlyRent],
  );

  const multiMonth = selected.length > 1;

  const calendarMonths: RentCalendarMonth[] = useMemo(
    () =>
      buildRentCalendarFromCharges(tenantId, year, monthlyRent, charges).months,
    [tenantId, year, monthlyRent, charges],
  );

  useEffect(() => {
    if (multiMonth && linkMode === 'partial') {
      onLinkModeChange('full');
    }
  }, [multiMonth, linkMode, onLinkModeChange]);

  useEffect(() => {
    if (selected.length === 0) return;
    onPartialAmountChange(totalRemaining > 0 ? String(totalRemaining) : '');
  }, [selected.join(','), totalRemaining, onPartialAmountChange]);

  const suggestedFull = useMemo(() => {
    if (selected.length === 0) return 0;
    return totalRemaining > 0 ? totalRemaining : selected.length * monthlyRent;
  }, [selected.length, totalRemaining, monthlyRent]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-ink">شهور الإيجار</Label>
        <Select
          value={String(year)}
          onValueChange={(v) => {
            setYear(Number(v));
            onSelectedChange([]);
          }}
        >
          <SelectTrigger className="h-10">
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
        <RentMonthPicker
          year={year}
          selected={selected}
          onChange={onSelectedChange}
          calendarMonths={calendarMonths}
          fullYear
          maxMonths={maxMonths}
          showStatus
        />
        {selected.length > 0 && !areConsecutiveMonths(selected) && (
          <p className="text-xs text-red-700">اختر أشهراً متتالية فقط</p>
        )}
      </div>

      {selected.length > 0 && (
        <div className="rounded-xl border border-sage-200/80 bg-sage-50/50 px-3 py-2.5 text-sm space-y-1">
          <p className="font-medium text-sage-900">
            {multiMonth ? 'مجموع الأشهر' : formatMonthLabelAr(selected[0])}:{' '}
            {formatMoney(totalAmount, 'LYD')}
          </p>
          <p className="text-sage-800/90 tabular-nums text-[13px]">
            متبقي للربط:{' '}
            <span className="font-semibold">
              {formatMoney(totalRemaining, 'LYD')}
            </span>
            {totalPaid > 0 && (
              <span className="text-ink-mute mr-2">
                · مدفوع سابقاً {formatMoney(totalPaid, 'LYD')}
              </span>
            )}
          </p>
          <p className="text-xs text-ink-mute pt-1 border-t border-sage-200/60">
            بعد التسجيل يظهر {formatMonthsLabelAr(selected)} في تقويم المستأجر
            <strong> مدفوعاً </strong>
            ومربوطاً بقيد الإيراد في اليومية.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-ink">نوع التحصيل</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={linkMode === 'full' ? 'default' : 'outline'}
            className="h-10 touch-manipulation"
            onClick={() => onLinkModeChange('full')}
          >
            شهر كامل
            <span className="block text-[10px] font-normal opacity-90">
              {suggestedFull > 0
                ? formatMoney(suggestedFull, 'LYD')
                : '—'}
            </span>
          </Button>
          <Button
            type="button"
            variant={linkMode === 'partial' ? 'default' : 'outline'}
            className="h-10 gap-1 touch-manipulation"
            onClick={() => onLinkModeChange('partial')}
            disabled={selected.length === 0 || multiMonth}
          >
            <PieChart className="h-4 w-4 shrink-0" />
            جزء من شهر
          </Button>
        </div>
        {multiMonth && (
          <p className="text-[11px] text-ink-mute">
            عدة أشهر: يُوزَّع مبلغ الإيراد على الشهور بالترتيب حتى ينفد المبلغ.
          </p>
        )}
      </div>

      {linkMode === 'partial' && selected.length === 1 && totalRemaining > 0 && (
        <div className="space-y-2">
          <Label htmlFor="rent-partial-amount">مبلغ هذا الجزء</Label>
          <Input
            id="rent-partial-amount"
            type="number"
            min={0}
            step="0.001"
            inputMode="decimal"
            value={partialAmount}
            onChange={(e) => onPartialAmountChange(e.target.value)}
            className="h-10 tabular-nums"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() =>
                onPartialAmountChange(
                  String(Math.round(totalRemaining * 50) / 100),
                )
              }
            >
              نصف المتبقي
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => onPartialAmountChange(String(totalRemaining))}
            >
              كل المتبقي
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function parseRentPartialAmount(value: string): number | null {
  const n = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
