'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RentMonthPicker } from '@/components/rent/rent-month-picker';
import { RentAllocationPreview } from '@/components/rent/rent-allocation-preview';
import { buildRentCalendarFromCharges } from '@/lib/rent-calendar-from-charges';
import { useTenantRentExemptMonths } from '@/lib/db/rent-queries';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { currentMonthKey, currentYear, formatMonthLabelAr, yearMonthsAll } from '@/lib/rent-months';
import { roundLyd, type RentAllocation, type RentMonthBasis } from '@/lib/rent-allocation';
import type { TenantChargeWithRelations } from '@/lib/db/types';
import type { RentCalendarMonth } from '@/lib/rent-months';
import { formatMoney } from '@/lib/utils';

type Props = {
  tenantId: string;
  /** used only to colour months that have no charge yet */
  monthlyRent: number;
  charges: TenantChargeWithRelations[];
  years?: number[];
  selected: string[];
  onSelectedChange: (months: string[]) => void;
  /** from useRentPaymentPlan */
  plan: RentAllocation;
  basis: RentMonthBasis[];
  basisFor: (month: string) => RentMonthBasis;
  onAmountChange: (amount: number) => void;
  /** charges and prices have loaded: months can be suggested and the amount filled in */
  ready: boolean;
  /** pick the oldest month still owing when nothing is selected */
  autoSelectFirstDue?: boolean;
  maxMonths?: number;
  claimStart?: string | null;
};

const nextMonthKey = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

export function RentRevenueMonthsBlock({
  tenantId,
  monthlyRent,
  charges,
  years: yearsProp,
  selected,
  onSelectedChange,
  plan,
  basis,
  basisFor,
  onAmountChange,
  ready,
  autoSelectFirstDue = false,
  maxMonths,
  claimStart = null,
}: Props) {
  const defaultYear = yearsProp?.[0] ?? currentYear();
  const [year, setYear] = useState(defaultYear);
  const { data: exemptRows = [] } = useTenantRentExemptMonths(tenantId);
  const { data: contactClaim } = useQuery({
    queryKey: ['tenant-claim-start', tenantId],
    enabled: !!tenantId && claimStart == null,
    queryFn: async () => {
      const sb = createSupabaseBrowserClient();
      const { data, error } = await sb
        .from('contacts')
        .select('contract_start')
        .eq('id', tenantId)
        .single();
      if (error) throw error;
      return data?.contract_start ?? null;
    },
  });
  const resolvedClaimStart = claimStart ?? contactClaim ?? null;
  const years = yearsProp ?? [currentYear(), currentYear() - 1];

  const calendarMonths: RentCalendarMonth[] = useMemo(
    () =>
      buildRentCalendarFromCharges(tenantId, year, monthlyRent, charges, {
        claimStart: resolvedClaimStart,
        manualExemptMonths: exemptRows.map((r) => r.month_key),
      }).months,
    [tenantId, year, monthlyRent, charges, resolvedClaimStart, exemptRows],
  );

  // Months the database would mishandle cannot be picked; partly paid months show their progress.
  const monthHints = useMemo(() => {
    const hints = new Map<string, { disabledReason?: string; progress?: string }>();
    const statusByMonth = new Map(calendarMonths.map((m) => [m.month, m.status]));
    for (const key of yearMonthsAll(year)) {
      const status = statusByMonth.get(key);
      if (status === 'exempt') continue;
      const b = basisFor(key);
      if (b.amount <= 0) {
        hints.set(key, { disabledReason: 'لا يوجد سعر إيجار لهذا الشهر' });
      } else if (b.remaining <= 0) {
        hints.set(key, {
          disabledReason: status === 'paid' ? 'مُسدَّد بالكامل' : 'مسجَّل مسدداً في المطالبة بينما الربط ناقص — راجع المطالبة',
        });
      } else if (status === 'paid') {
        hints.set(key, { disabledReason: 'يظهر مسدداً بينما المطالبة تُظهر متبقياً — راجع المطالبة قبل التحصيل' });
      } else if (b.paid > 0) {
        hints.set(key, {
          progress: `${formatMoney(b.paid, '')} من ${formatMoney(b.amount, '')}`,
        });
      }
    }
    return hints;
  }, [calendarMonths, year, basisFor]);

  // Suggest the oldest month still owing (this year, up to now), else the first owing month after it.
  const autoSelected = useRef(false);
  useEffect(() => {
    if (!autoSelectFirstDue || !ready || autoSelected.current || selected.length > 0) return;
    autoSelected.current = true;
    const now = currentMonthKey(currentYear());
    const owing = calendarMonths
      .filter((m) => m.status !== 'exempt' && !monthHints.get(m.month)?.disabledReason)
      .map((m) => m.month)
      .filter((m) => basisFor(m).remaining > 0);
    const first = owing.find((m) => m <= now) ?? owing.find((m) => m > now);
    if (first) onSelectedChange([first]);
  }, [autoSelectFirstDue, ready, selected.length, calendarMonths, monthHints, basisFor, onSelectedChange]);

  // A new selection fills in what those months still owe; the user can then change it.
  const selectedKey = selected.join(',');
  const owedForSelection = roundLyd(basis.reduce((s, b) => s + b.remaining, 0));
  useEffect(() => {
    if (!selectedKey || !ready) return;
    onAmountChange(owedForSelection);
  }, [selectedKey, owedForSelection, ready, onAmountChange]);

  // Drop months that turned out to be exempt (no claim for them).
  useEffect(() => {
    const exemptSet = new Set(calendarMonths.filter((m) => m.status === 'exempt').map((m) => m.month));
    if (!exemptSet.size || !selected.some((m) => exemptSet.has(m))) return;
    onSelectedChange(selected.filter((m) => !exemptSet.has(m)));
  }, [calendarMonths, selected, onSelectedChange]);

  const sorted = [...selected].sort();
  const last = sorted[sorted.length - 1];
  const lastBasis = basis.find((b) => b.month === last);
  const owedBeforeLast = roundLyd(basis.filter((b) => b.month !== last).reduce((s, b) => s + b.remaining, 0));
  const halfOfLast = lastBasis && lastBasis.remaining > 0 ? roundLyd(owedBeforeLast + lastBasis.remaining / 2) : null;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-ink">الأشهر التي تُسدّدها الدفعة</Label>
          <Select
            value={String(year)}
            onValueChange={(v) => {
              setYear(Number(v));
              onSelectedChange([]);
            }}
          >
            <SelectTrigger className="h-9 w-28" aria-label="السنة">
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
        </div>
        <RentMonthPicker
          year={year}
          selected={selected}
          onChange={onSelectedChange}
          calendarMonths={calendarMonths}
          monthHints={monthHints}
          fullYear
          maxMonths={maxMonths}
          showStatus
        />
      </div>

      {selected.length > 0 && ready && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="مبالغ جاهزة">
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => onAmountChange(owedForSelection)}>
            كامل المستحق · {formatMoney(owedForSelection, 'LYD')}
          </Button>
          {halfOfLast != null && (
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => onAmountChange(halfOfLast)}>
              {selected.length === 1 ? 'نصف الشهر' : `مع نصف ${formatMonthLabelAr(last)}`} · {formatMoney(halfOfLast, 'LYD')}
            </Button>
          )}
        </div>
      )}

      {selected.length > 0 && ready && (
        <RentAllocationPreview
          plan={plan}
          basis={basis}
          onRemoveMonth={(month, andLater) =>
            onSelectedChange(selected.filter((m) => (andLater ? m < month : m !== month)))
          }
          onAddNextMonth={() => last && onSelectedChange([...selected, nextMonthKey(last)])}
          onSetAmount={onAmountChange}
        />
      )}
    </div>
  );
}
