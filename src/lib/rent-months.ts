/** مفاتيح شهر بصيغة YYYY-MM */

export type RentMonthStatus =
  | 'paid'
  | 'partial'
  | 'unpaid'
  | 'no_charge'
  | 'exempt'
  | 'na';

export type RentMonthJournalLink = {
  journal_entry_id: string;
  journal_number: number | null;
  amount: number;
};

export type RentCalendarMonth = {
  month: string;
  status: RentMonthStatus;
  amount: number;
  paid: number;
  charge_id: string | null;
  description: string | null;
  journal_entry_id?: string | null;
  journal_number?: number | null;
  journal_links?: RentMonthJournalLink[];
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

export function currentCalendarMonthIndex(): number {
  return new Date().getMonth() + 1;
}

export function currentMonthKey(year = currentYear()): string {
  return monthKey(year, currentCalendarMonthIndex());
}

export function currentMonthNameAr(): string {
  return monthNameAr(currentMonthKey());
}

export function monthKey(year: number, monthIndex1to12: number): string {
  return `${year}-${String(monthIndex1to12).padStart(2, '0')}`;
}

export function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m };
}

export function monthNameAr(monthKeyStr: string): string {
  const { month } = parseMonthKey(monthKeyStr);
  return AR_MONTHS[month - 1] ?? monthKeyStr;
}

/** اسم الشهر وسنة منفصلان للعرض بألوان مختلفة */
export function splitMonthLabelAr(monthKeyStr: string): {
  name: string;
  year: string;
} {
  const { year } = parseMonthKey(monthKeyStr);
  return { name: monthNameAr(monthKeyStr), year: String(year) };
}

export function formatMonthLabelAr(monthKeyStr: string): string {
  const { name, year } = splitMonthLabelAr(monthKeyStr);
  return `${name} ${year}`;
}

/** لون نص اسم الشهر — محايد (ليس أخضر/أحمر الحالة) */
export const RENT_MONTH_NAME_CLASS = 'text-sage-900';
export const RENT_MONTH_YEAR_CLASS = 'text-sage-600';

export const RENT_MONTH_STATUS_TEXT_CLASS: Record<RentMonthStatus, string> = {
  paid: 'text-emerald-700',
  partial: 'text-amber-700',
  unpaid: 'text-red-700',
  no_charge: 'text-slate-600',
  exempt: 'text-slate-500',
  na: 'text-ink-mute',
};

export function formatMonthsLabelAr(months: string[]): string {
  return months.map(formatMonthLabelAr).join('، ');
}

export function formatRentMonthPartialProgress(paid: number, amount: number): string {
  if (amount <= 0) return '';
  return `${paid.toLocaleString('ar-LY')} / ${amount.toLocaleString('ar-LY')} د.ل`;
}

/** كل شهور سنة (١–١٢) */
export function yearMonthsAll(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => monthKey(year, i + 1));
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

/** اختيار أشهر متتالية مع حد أقصى (مثلاً شهرين) — كتسجيل الإيراد */
export function toggleMonthInSelectionCapped(
  selected: string[],
  month: string,
  maxMonths: number,
): string[] {
  let next = toggleMonthInSelection(selected, month);
  if (maxMonths > 0 && next.length > maxMonths) {
    next = [...next].sort().slice(-maxMonths);
  }
  return next;
}

export const RENT_MONTH_STATUS_LABEL: Record<RentMonthStatus, string> = {
  paid: 'مدفوع',
  partial: 'جزئي',
  unpaid: 'غير مدفوع',
  no_charge: 'بلا مطالبة',
  exempt: 'بدون مطالبة',
  na: '—',
};

/** إطار الخلية فقط — نص الشهر يُلوَّن عبر RENT_MONTH_NAME_CLASS */
export const RENT_MONTH_STATUS_CLASS: Record<RentMonthStatus, string> = {
  paid: 'bg-white border-2 border-emerald-400/80',
  partial: 'bg-white border-2 border-amber-400/80',
  unpaid: 'bg-white border-2 border-red-400/80',
  no_charge: 'bg-white border-2 border-slate-300',
  exempt: 'bg-slate-50 border-2 border-dashed border-slate-300',
  na: 'bg-canvas-sunken border border-border',
};

export const RENT_MONTH_CELL_FRAME: Record<RentMonthStatus, string> = {
  paid: 'bg-white border-2 border-emerald-500 shadow-sm',
  partial: 'bg-white border-2 border-amber-500 shadow-sm',
  unpaid: 'bg-white border-2 border-red-500 shadow-sm',
  no_charge: 'bg-white border-2 border-slate-400',
  exempt: 'bg-slate-50/90 border-2 border-dashed border-slate-400',
  na: 'bg-canvas-sunken border border-border',
};

/** مربع صغير في وسيلة الإيضاح */
export const RENT_MONTH_LEGEND_SWATCH: Record<
  Exclude<RentMonthStatus, 'na'>,
  string
> = {
  paid: 'bg-white border-2 border-emerald-500',
  partial: 'bg-white border-2 border-amber-500',
  unpaid: 'bg-white border-2 border-red-500',
  no_charge: 'bg-white border-2 border-slate-400',
  exempt: 'bg-slate-50 border-2 border-dashed border-slate-400',
};
