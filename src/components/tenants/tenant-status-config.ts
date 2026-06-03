import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { currentMonthNameAr } from '@/lib/rent-months';

export type TenantRentStatusKey =
  | 'paid_full'
  | 'paid_partial'
  | 'unpaid'
  | 'no_rent_set';

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
};

export { currentMonthNameAr };

export function getTenantStatus(key: string | undefined) {
  return (
    TENANT_STATUS_CONFIG[key as TenantRentStatusKey] ?? TENANT_STATUS_CONFIG.no_rent_set
  );
}

export function getTenantRentStatusPresentation(key: string | undefined) {
  return getTenantStatus(key);
}

/** مثال: يونيو · غير مدفوع */
export function formatTenantCurrentMonthLine(key: string | undefined): string {
  return `${currentMonthNameAr()} · ${getTenantStatus(key).shortLabel}`;
}
