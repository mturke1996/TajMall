import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  CalendarOff,
  Layers,
  type LucideIcon,
} from 'lucide-react';
import { currentMonthNameAr } from '@/lib/rent-months';

export type TenantRentStatusKey =
  | 'paid_full'
  | 'paid_partial'
  | 'unpaid'
  | 'no_rent_set'
  | 'exempt';

/** فلتر مركّب: جزئي أو غير مدفوع */
export const PARTIAL_UNPAID_FILTER_KEY = 'partial_unpaid' as const;

export type TenantStatusFilterKey =
  | 'ALL'
  | TenantRentStatusKey
  | typeof PARTIAL_UNPAID_FILTER_KEY;

export const TENANT_STATUS_CONFIG: Record<
  TenantRentStatusKey,
  {
    label: string;
    shortLabel: string;
    icon: LucideIcon;
    color: string;
    bg: string;
    border: string;
  }
> = {
  paid_full: {
    label: 'مدفوع',
    shortLabel: 'مدفوع',
    icon: CheckCircle2,
    color: 'text-emerald-800',
    bg: 'bg-emerald-50',
    border: 'border-emerald-300',
  },
  paid_partial: {
    label: 'جزئي',
    shortLabel: 'جزئي',
    icon: Clock,
    color: 'text-amber-900',
    bg: 'bg-amber-50',
    border: 'border-amber-300',
  },
  unpaid: {
    label: 'غير مدفوع',
    shortLabel: 'غير مدفوع',
    icon: XCircle,
    color: 'text-red-800',
    bg: 'bg-red-50',
    border: 'border-red-300',
  },
  no_rent_set: {
    label: 'بلا إيجار',
    shortLabel: 'بلا إيجار',
    icon: AlertCircle,
    color: 'text-slate-600',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
  },
  exempt: {
    label: 'بدون مطالبة',
    shortLabel: 'بدون مطالبة',
    icon: CalendarOff,
    color: 'text-slate-500',
    bg: 'bg-slate-50/80',
    border: 'border-dashed border-slate-300',
  },
};

export const PARTIAL_UNPAID_FILTER_CONFIG = {
  key: PARTIAL_UNPAID_FILTER_KEY,
  label: 'جزئي + غير مدفوع',
  shortLabel: 'جزئي + غير مدفوع',
  statuses: ['paid_partial', 'unpaid'] as TenantRentStatusKey[],
  icon: Layers,
  color: 'text-orange-900',
  bg: 'bg-orange-50',
  border: 'border-orange-300',
};

export { currentMonthNameAr };

/** يحوّل فلتر الواجهة إلى حالات شهرية قابلة للمقارنة */
export function resolveStatusFilterKeys(
  filter: string,
): TenantRentStatusKey[] | 'ALL' {
  if (!filter || filter === 'ALL') return 'ALL';
  if (filter === PARTIAL_UNPAID_FILTER_KEY) {
    return [...PARTIAL_UNPAID_FILTER_CONFIG.statuses];
  }
  if (filter in TENANT_STATUS_CONFIG) {
    return [filter as TenantRentStatusKey];
  }
  return 'ALL';
}

export function statusMatchesFilter(
  status: string | undefined,
  filter: string,
): boolean {
  const keys = resolveStatusFilterKeys(filter);
  if (keys === 'ALL') return true;
  return keys.includes(status as TenantRentStatusKey);
}

export function getStatusFilterLabel(filter: string): string {
  if (!filter || filter === 'ALL') return 'الكل';
  if (filter === PARTIAL_UNPAID_FILTER_KEY) {
    return PARTIAL_UNPAID_FILTER_CONFIG.shortLabel;
  }
  return getTenantStatus(filter).shortLabel;
}

export function getTenantStatus(key: string | undefined) {
  if (key === PARTIAL_UNPAID_FILTER_KEY) {
    return {
      label: PARTIAL_UNPAID_FILTER_CONFIG.label,
      shortLabel: PARTIAL_UNPAID_FILTER_CONFIG.shortLabel,
      icon: PARTIAL_UNPAID_FILTER_CONFIG.icon,
      color: PARTIAL_UNPAID_FILTER_CONFIG.color,
      bg: PARTIAL_UNPAID_FILTER_CONFIG.bg,
      border: PARTIAL_UNPAID_FILTER_CONFIG.border,
    };
  }
  return (
    TENANT_STATUS_CONFIG[key as TenantRentStatusKey] ??
    TENANT_STATUS_CONFIG.no_rent_set
  );
}

export function getTenantRentStatusPresentation(key: string | undefined) {
  return getTenantStatus(key);
}

/** مثال: يونيو · غير مدفوع */
export function formatTenantCurrentMonthLine(key: string | undefined): string {
  return `${currentMonthNameAr()} · ${getTenantStatus(key).shortLabel}`;
}
