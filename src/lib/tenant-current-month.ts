import type { TenantRentSummary } from '@/lib/db/queries';
import type { TenantRentStatusKey } from '@/components/tenants/tenant-status-config';
import {
  currentMonthNameAr,
  formatRentMonthPartialProgress,
} from '@/lib/rent-months';
import { formatMoney } from '@/lib/utils';

export type TenantMonthTone = 'emerald' | 'amber' | 'rose' | 'neutral';

export type TenantCurrentMonthPresentation = {
  status: TenantRentStatusKey;
  monthName: string;
  amount: number;
  paid: number;
  remaining: number;
  percentPaid: number;
  headline: string;
  subtitle: string;
  badgeLabel: string;
  badgeDetail: string;
  tone: TenantMonthTone;
  progressLabel: string;
};

export function getTenantCurrentMonthPresentation(
  rent: Pick<
    TenantRentSummary,
    | 'current_month_status'
    | 'current_month_paid'
    | 'current_month_amount'
    | 'monthly_rent'
  >,
  monthlyRentFallback = 0,
): TenantCurrentMonthPresentation {
  const status = (rent.current_month_status ??
    'no_rent_set') as TenantRentStatusKey;
  const amount =
    Number(rent.current_month_amount) ||
    Number(rent.monthly_rent) ||
    monthlyRentFallback ||
    0;
  const paid = Number(rent.current_month_paid) || 0;
  const remaining = Math.max(0, amount - paid);
  const percentPaid =
    amount > 0 ? Math.min(100, Math.round((paid / amount) * 100)) : paid > 0 ? 100 : 0;
  const monthName = currentMonthNameAr();
  const progressLabel = formatRentMonthPartialProgress(paid, amount);

  const base = {
    status,
    monthName,
    amount,
    paid,
    remaining,
    percentPaid,
    progressLabel,
  };

  switch (status) {
    case 'paid_full':
      return {
        ...base,
        headline: 'مدفوع بالكامل',
        subtitle:
          amount > 0
            ? `${monthName} · ${formatMoney(paid, 'LYD', { compact: true })} من ${formatMoney(amount, 'LYD', { compact: true })}`
            : `${monthName} · تم تسديد الإيجار`,
        badgeLabel: 'مدفوع بالكامل',
        badgeDetail:
          amount > 0 ? formatMoney(amount, 'LYD', { compact: true }) : monthName,
        tone: 'emerald',
      };
    case 'paid_partial': {
      const halfMonth = percentPaid >= 45 && percentPaid <= 55;
      const headline = halfMonth
        ? 'نصف إيجار الشهر'
        : percentPaid > 0
          ? `دُفع ${percentPaid}% من الإيجار`
          : 'دفع جزئي';
      const badgeLabel = halfMonth ? 'نصف الإيجار' : `دفع جزئي (${percentPaid}%)`;
      return {
        ...base,
        headline,
        subtitle:
          remaining > 0
            ? `مسدّد ${formatMoney(paid, 'LYD', { compact: true })} · متبقي ${formatMoney(remaining, 'LYD', { compact: true })}`
            : progressLabel || `مسدّد ${formatMoney(paid, 'LYD', { compact: true })}`,
        badgeLabel,
        badgeDetail:
          remaining > 0
            ? `متبقي ${formatMoney(remaining, 'LYD', { compact: true })}`
            : progressLabel,
        tone: 'amber',
      };
    }
    case 'unpaid':
      return {
        ...base,
        headline: 'غير مدفوع',
        subtitle:
          amount > 0
            ? `${monthName} · مستحق ${formatMoney(amount, 'LYD', { compact: true })}`
            : monthName,
        badgeLabel: 'غير مدفوع',
        badgeDetail:
          amount > 0
            ? `مستحق ${formatMoney(amount, 'LYD', { compact: true })}`
            : '',
        tone: 'rose',
      };
    default:
      return {
        ...base,
        headline: 'بلا إيجار',
        subtitle: 'لم يُحدد إيجار شهري للشهر الحالي',
        badgeLabel: 'بلا إيجار',
        badgeDetail: '',
        tone: 'neutral',
      };
  }
}

export const TENANT_MONTH_TONE_STYLES: Record<
  TenantMonthTone,
  { hero: string; tile: 'emerald' | 'amber' | 'rose' | 'neutral' | 'sage' }
> = {
  emerald: {
    hero: 'bg-emerald-500/30 ring-1 ring-emerald-200/50 text-white',
    tile: 'emerald',
  },
  amber: {
    hero: 'bg-amber-400/35 ring-1 ring-amber-100/60 text-white',
    tile: 'amber',
  },
  rose: {
    hero: 'bg-rose-500/30 ring-1 ring-rose-200/40 text-white',
    tile: 'rose',
  },
  neutral: {
    hero: 'bg-white/15 ring-1 ring-white/25 text-white',
    tile: 'neutral',
  },
};
