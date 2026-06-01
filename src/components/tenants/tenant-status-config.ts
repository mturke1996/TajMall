import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  type LucideIcon,
} from 'lucide-react';

export type TenantRentStatusKey =
  | 'paid_full'
  | 'paid_partial'
  | 'unpaid'
  | 'no_rent_set';

export const TENANT_STATUS_CONFIG: Record<
  TenantRentStatusKey,
  {
    label: string;
    icon: LucideIcon;
    color: string;
    bg: string;
    border: string;
  }
> = {
  paid_full: {
    label: 'مسدد بالكامل',
    icon: CheckCircle2,
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
  },
  paid_partial: {
    label: 'مسدد جزئياً',
    icon: Clock,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
  },
  unpaid: {
    label: 'غير مسدد',
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
  no_rent_set: {
    label: 'لم يُحدد الإيجار',
    icon: AlertCircle,
    color: 'text-gray-500',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
  },
};

export function getTenantStatus(key: string | undefined) {
  return (
    TENANT_STATUS_CONFIG[key as TenantRentStatusKey] ?? TENANT_STATUS_CONFIG.no_rent_set
  );
}
