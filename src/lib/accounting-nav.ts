import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  FolderTree,
  BookMarked,
  Scale,
  CalendarRange,
  TrendingUp,
  Wallet,
  Landmark,
  Users,
  FileText,
  FileSpreadsheet,
  Store,
  Briefcase,
} from 'lucide-react';
import type { PermissionKey } from '@/lib/constants';

export type AccountingNavItem = {
  href: string;
  labelAr: string;
  description: string;
  icon: LucideIcon;
  permission: PermissionKey;
  step: number;
};

export const ACCOUNTING_NAV_ITEMS: AccountingNavItem[] = [
  {
    href: '/reports',
    labelAr: 'التقارير',
    description: 'مركز التقارير والفترة',
    icon: FileText,
    permission: 'journal.view',
    step: 0,
  },
  {
    href: '/journals',
    labelAr: 'دفتر اليومية',
    description: 'إنشاء وترحيل القيود المزدوجة',
    icon: BookOpen,
    permission: 'journal.view',
    step: 1,
  },
  {
    href: '/accounts',
    labelAr: 'البنود المحاسبية',
    description: 'دليل الحسابات والأكواد',
    icon: FolderTree,
    permission: 'account.view',
    step: 2,
  },
  {
    href: '/reports/journal-month',
    labelAr: 'قيد الفترة',
    description: 'قيد ملخّص: إجمالي كل بند',
    icon: FileSpreadsheet,
    permission: 'journal.view',
    step: 3,
  },
  {
    href: '/reports/ledger',
    labelAr: 'دفتر الأستاذ',
    description: 'كشف حساب تفصيلي لكل بند',
    icon: BookMarked,
    permission: 'journal.view',
    step: 4,
  },
  {
    href: '/reports/trial-balance',
    labelAr: 'ميزان المراجعة',
    description: 'توازن المدين والدائن',
    icon: Scale,
    permission: 'journal.view',
    step: 5,
  },
  {
    href: '/reports/balance-sheet',
    labelAr: 'الميزانية العمومية',
    description: 'الأصول والخصوم وحقوق الملكية',
    icon: Landmark,
    permission: 'journal.view',
    step: 6,
  },
  {
    href: '/reports/profit-loss',
    labelAr: 'الأرباح والخسائر',
    description: 'الإيرادات مقابل المصروفات',
    icon: TrendingUp,
    permission: 'journal.view',
    step: 7,
  },
  {
    href: '/reports/cash-flow',
    labelAr: 'التدفقات النقدية',
    description: 'حركة النقد',
    icon: Wallet,
    permission: 'journal.view',
    step: 8,
  },
  {
    href: '/reports/ar-aging',
    labelAr: 'أعمار الذمم',
    description: 'متأخرات المستأجرين',
    icon: Users,
    permission: 'journal.view',
    step: 9,
  },
  {
    href: '/reports/vendor-spend',
    labelAr: 'إنفاق الموردين',
    description: 'مصروفات حسب المورد',
    icon: Landmark,
    permission: 'journal.view',
    step: 10,
  },
  {
    href: '/reports/customer-revenue',
    labelAr: 'إيراد العملاء',
    description: 'إيرادات حسب العميل',
    icon: Store,
    permission: 'journal.view',
    step: 11,
  },
  {
    href: '/reports/employee-spend',
    labelAr: 'إنفاق الموظفين',
    description: 'مرتبات حسب الموظف',
    icon: Briefcase,
    permission: 'journal.view',
    step: 12,
  },
  {
    href: '/reports/periods',
    labelAr: 'الفترات المالية',
    description: 'إغلاق الفترات والترحيل',
    icon: CalendarRange,
    permission: 'journal.view',
    step: 13,
  },
];

export function ledgerUrl(categoryId?: string, year?: number) {
  const params = new URLSearchParams();
  if (categoryId) params.set('category', categoryId);
  if (year) params.set('year', String(year));
  const q = params.toString();
  return q ? `/reports/ledger?${q}` : '/reports/ledger';
}

export function toProfitLossRpcPeriod(
  ui: 'YEAR' | 'QUARTER' | 'MONTH',
): 'year' | 'quarter' | 'month' {
  if (ui === 'QUARTER') return 'quarter';
  if (ui === 'MONTH') return 'month';
  return 'year';
}

export type AccountTab = 'ALL' | 'REVENUE' | 'EXPENSE' | 'BALANCE';

export function categoryMatchesTab(
  type: string,
  tab: AccountTab,
): boolean {
  if (tab === 'ALL') return true;
  if (tab === 'REVENUE') return type === 'REVENUE';
  if (tab === 'EXPENSE') return type === 'EXPENSE';
  return ['ASSET', 'LIABILITY', 'EQUITY'].includes(type);
}
