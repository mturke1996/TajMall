/** مفاتيح شهر بصيغة YYYY-MM */

export type RentMonthStatus =
  | 'paid'
  | 'partial'
  | 'unpaid'
  | 'no_charge'
  | 'na';

export type RentCalendarMonth = {
  month: string;
  status: RentMonthStatus;
  amount: number;
  paid: number;
  charge_id: string | null;
  description: string | null;
};

export type TenantRentCalendar = {
  year: number;
  tenant_id: string;
  monthly_rent: number;
  contract_id: string | null;
  months: RentCalendarMonth[];
};

const AR_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

export function currentYear(): number {
  return new Date().getFullYear();
}

export function monthKey(year: number, monthIndex1to12: number): string {
  return `${year}-${String(monthIndex1to12).padStart(2, '0')}`;
}

export function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m };
}

export function formatMonthLabelAr(monthKeyStr: string): string {
  const { year, month } = parseMonthKey(monthKeyStr);
  const name = AR_MONTHS[month - 1] ?? monthKeyStr;
  return `${name} ${year}`;
}

export function formatMonthsLabelAr(months: string[]): string {
  return months.map(formatMonthLabelAr).join('، ');
}

/** شهور السنة الحالية حتى الشهر الجاري */
export function yearMonthsThroughCurrent(year = currentYear()): string[] {
  const now = new Date();
  const end =
    year < now.getFullYear() ? 12 : year === now.getFullYear() ? now.getMonth() + 1 : 0;
  return Array.from({ length: end }, (_, i) => monthKey(year, i + 1));
}

export function areConsecutiveMonths(months: string[]): boolean {
  if (months.length <= 1) return true;
  const sorted = [...months].sort();
  for (let i = 1; i < sorted.length; i++) {
    const prev = parseMonthKey(sorted[i - 1]);
    const cur = parseMonthKey(sorted[i]);
    const prevDate = new Date(prev.year, prev.month - 1, 1);
    prevDate.setMonth(prevDate.getMonth() + 1);
    if (prevDate.getFullYear() !== cur.year || prevDate.getMonth() + 1 !== cur.month) {
      return false;
    }
  }
  return true;
}

export function toggleMonthInSelection(selected: string[], month: string): string[] {
  if (selected.includes(month)) {
    return selected.filter((m) => m !== month);
  }
  const next = [...selected, month].sort();
  if (!areConsecutiveMonths(next)) {
    return [month];
  }
  return next;
}

export const RENT_MONTH_STATUS_LABEL: Record<RentMonthStatus, string> = {
  paid: 'مدفوع',
  partial: 'جزئي',
  unpaid: 'غير مدفوع',
  no_charge: 'بلا مطالبة',
  na: '—',
};

export const RENT_MONTH_STATUS_CLASS: Record<RentMonthStatus, string> = {
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  partial: 'bg-amber-100 text-amber-900 border-amber-200',
  unpaid: 'bg-red-50 text-red-800 border-red-200',
  no_charge: 'bg-slate-100 text-slate-700 border-slate-200',
  na: 'bg-canvas-sunken text-ink-mute border-border',
};
