import type { AccountType } from '@/lib/db/types';

const ACCOUNT_TYPE_AR: Record<AccountType, string> = {
  ASSET: 'أصول',
  LIABILITY: 'خصوم',
  EQUITY: 'حقوق ملكية',
  REVENUE: 'إيراد',
  EXPENSE: 'مصروف',
};

export function accountTypeLabelAr(type: string | null | undefined): string {
  if (!type) return '—';
  return ACCOUNT_TYPE_AR[type as AccountType] ?? type;
}
