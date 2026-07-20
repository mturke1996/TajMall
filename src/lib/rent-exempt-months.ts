import { monthKey, parseMonthKey, type RentCalendarMonth, type RentMonthStatus } from '@/lib/rent-months';

export type TenantRentExemptMonthRow = {
  id: string;
  tenant_id: string;
  month_key: string;
  source: 'manual' | 'auto';
  notes: string | null;
  created_at: string;
};

/** YYYY-MM من تاريخ بداية العقد / المطالبة */
export function rentClaimStartMonthKey(
  claimStart: string | null | undefined,
): string | null {
  if (!claimStart?.trim()) return null;
  const d = claimStart.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return d.slice(0, 7);
}

export function isRentMonthBeforeClaimStart(
  monthKeyStr: string,
  claimStartMonthKeyStr: string | null,
): boolean {
  if (!claimStartMonthKeyStr) return false;
  return monthKeyStr < claimStartMonthKeyStr;
}

export function isRentMonthManuallyExempt(
  monthKeyStr: string,
  manualExemptMonths: ReadonlySet<string> | string[],
): boolean {
  const set =
    manualExemptMonths instanceof Set
      ? manualExemptMonths
      : new Set(manualExemptMonths);
  return set.has(monthKeyStr);
}

export function isRentMonthExempt(
  monthKeyStr: string,
  options: {
    claimStart?: string | null;
    manualExemptMonths?: ReadonlySet<string> | string[];
  },
): boolean {
  const claimKey = rentClaimStartMonthKey(options.claimStart);
  if (isRentMonthBeforeClaimStart(monthKeyStr, claimKey)) return true;
  if (
    options.manualExemptMonths &&
    isRentMonthManuallyExempt(monthKeyStr, options.manualExemptMonths)
  ) {
    return true;
  }
  return false;
}

/** أشهر معفاة تلقائياً قبل بداية المطالبة لسنة محددة */
export function autoExemptMonthsForYear(
  year: number,
  claimStart: string | null | undefined,
): string[] {
  const claimKey = rentClaimStartMonthKey(claimStart);
  if (!claimKey) return [];
  const { year: claimYear, month: claimMonth } = parseMonthKey(claimKey);
  if (claimYear !== year) return [];
  if (claimMonth <= 1) return [];
  return Array.from({ length: claimMonth - 1 }, (_, i) => monthKey(year, i + 1));
}

export function collectExemptMonthKeys(input: {
  claimStart?: string | null;
  manualExemptMonths?: ReadonlySet<string> | string[];
  year?: number;
}): Set<string> {
  const out = new Set<string>(
    input.manualExemptMonths instanceof Set
      ? input.manualExemptMonths
      : input.manualExemptMonths ?? [],
  );
  if (input.year != null) {
    for (const m of autoExemptMonthsForYear(input.year, input.claimStart)) {
      out.add(m);
    }
  }
  return out;
}

/** يطبّق حالة exempt على خلايا التقويم (ما لم تكن مدفوعة) */
export function applyExemptOverlayToCalendarMonths(
  months: RentCalendarMonth[],
  options: {
    claimStart?: string | null;
    manualExemptMonths?: ReadonlySet<string> | string[];
  },
): RentCalendarMonth[] {
  return months.map((m) => {
    if (m.status === 'paid' || m.status === 'partial') return m;
    if (!isRentMonthExempt(m.month, options)) return m;
    return {
      ...m,
      status: 'exempt' as RentMonthStatus,
      amount: m.amount > 0 ? m.amount : 0,
      paid: 0,
      charge_id: m.status === 'unpaid' ? null : m.charge_id,
    };
  });
}

export function isCalendarMonthActionable(m: RentCalendarMonth): boolean {
  return m.status !== 'exempt' && m.status !== 'na';
}

export function isCalendarMonthOutstanding(m: RentCalendarMonth): boolean {
  return (
    m.status === 'unpaid' || m.status === 'partial' || m.status === 'no_charge'
  );
}
