import {
  LayoutDashboard,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  BookOpen,
  Receipt,
  Building2,
  Shield,
  Settings,
  Activity,
  FolderTree,
  Bell,
  Landmark,
  ArrowLeftRight,
  Briefcase,
  GitBranch,
  Users,
  Coins,
  FileText,
  FileSpreadsheet,
  Store,
  BookMarked,
  Scale,
  CalendarRange,
  TrendingUp,
  PieChart,
  Stamp,
  type LucideIcon,
} from 'lucide-react';
import type { PermissionKey } from '@/lib/constants';

export type NavItem = {
  href: string;
  labelAr: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  badge?: { text: string; tone?: 'default' | 'success' | 'warning' | 'danger' };
  permission?: PermissionKey;
};

export type NavSection = {
  titleAr: string;
  title: string;
  items: NavItem[];
};

/**
 * Fluxen Navigation Structure - Professional SaaS Accounting System
 * Redesigned for clarity, removing duplicates and grouping logically
 */
export const NAV: NavSection[] = [
  {
    titleAr: 'الرئيسية',
    title: 'Overview',
    items: [
      {
        href: '/dashboard',
        labelAr: 'لوحة التحكم',
        label: 'Dashboard',
        icon: LayoutDashboard,
        shortcut: '⌘D',
        permission: 'dashboard.view',
      },
      {
        href: '/activity',
        labelAr: 'النشاط المباشر',
        label: 'Activity',
        icon: Activity,
        permission: 'dashboard.view',
      },
    ],
  },
  {
    titleAr: 'العمليات المالية',
    title: 'Finance',
    items: [
      {
        href: '/transactions',
        labelAr: 'المعاملات',
        label: 'Transactions',
        icon: ArrowLeftRight,
        shortcut: '⌘T',
        permission: 'revenue.view',
      },
      {
        href: '/revenues',
        labelAr: 'الإيرادات',
        label: 'Revenues',
        icon: ArrowDownToLine,
        shortcut: '⌘R',
        permission: 'revenue.view',
      },
      {
        href: '/expenses',
        labelAr: 'المصروفات',
        label: 'Expenses',
        icon: ArrowUpFromLine,
        shortcut: '⌘E',
        permission: 'expense.view',
      },
      {
        href: '/cashboxes',
        labelAr: 'الخزائن والمصارف',
        label: 'Cashboxes',
        icon: Wallet,
        permission: 'cashbox.view',
      },
      {
        href: '/vouchers',
        labelAr: 'إذونات الصرف',
        label: 'Vouchers',
        icon: Receipt,
        permission: 'voucher.view',
      },
      {
        href: '/documents',
        labelAr: 'الوثائق والمراسلات',
        label: 'Documents',
        icon: Stamp,
        permission: 'document.view',
      },
    ],
  },
  {
    titleAr: 'إدارة المول',
    title: 'Mall Management',
    items: [
      {
        href: '/mall',
        labelAr: 'نظرة عامة',
        label: 'Overview',
        icon: LayoutDashboard,
        permission: 'revenue.view',
      },
      {
        href: '/mall?tab=tenants',
        labelAr: 'المستأجرين والتحصيل',
        label: 'Tenants',
        icon: Building2,
        permission: 'revenue.view',
      },
      {
        href: '/mall?tab=contracts',
        labelAr: 'عقود الإيجار',
        label: 'Contracts',
        icon: FileText,
        permission: 'revenue.view',
      },
      {
        href: '/mall?tab=charges',
        labelAr: 'المطالبات والرسوم',
        label: 'Charges',
        icon: Coins,
        permission: 'revenue.view',
      },
      {
        href: '/mall?tab=people',
        labelAr: 'الدليل الشامل',
        label: 'Directory',
        icon: Users,
        permission: 'revenue.view',
      },
      {
        href: '/mall?tab=people&segment=EMPLOYEE',
        labelAr: 'الموظفين',
        label: 'Employees',
        icon: Briefcase,
        permission: 'expense.view',
      },
      {
        href: '/mall?tab=people&segment=VENDOR',
        labelAr: 'الموردين',
        label: 'Vendors',
        icon: Landmark,
        permission: 'expense.view',
      },
      {
        href: '/mall?tab=people&segment=CUSTOMER',
        labelAr: 'العملاء',
        label: 'Customers',
        icon: Store,
        permission: 'revenue.view',
      },
    ],
  },
  {
    titleAr: 'المحاسبة والتقارير',
    title: 'Accounting & Reports',
    items: [
      {
        href: '/reports',
        labelAr: 'التقارير',
        label: 'Reports',
        icon: FileText,
        permission: 'journal.view',
      },
      {
        href: '/journals',
        labelAr: 'دفتر اليومية',
        label: 'Journals',
        icon: BookOpen,
        permission: 'journal.view',
      },
      {
        href: '/accounts',
        labelAr: 'البنود المحاسبية',
        label: 'Account Categories',
        icon: FolderTree,
        permission: 'account.view',
      },
      {
        href: '/reports/journal-month',
        labelAr: 'قيد الفترة',
        label: 'Period Journal Entry',
        icon: FileSpreadsheet,
        permission: 'journal.view',
      },
      {
        href: '/reports/ledger',
        labelAr: 'دفتر الأستاذ العام',
        label: 'General Ledger',
        icon: BookMarked,
        permission: 'journal.view',
      },
      {
        href: '/reports/trial-balance',
        labelAr: 'ميزان المراجعة',
        label: 'Trial Balance',
        icon: Scale,
        permission: 'journal.view',
      },
      {
        href: '/reports/balance-sheet',
        labelAr: 'الميزانية العمومية',
        label: 'Balance Sheet',
        icon: PieChart,
        permission: 'journal.view',
      },
      {
        href: '/reports/profit-loss',
        labelAr: 'الأرباح والخسائر',
        label: 'Profit & Loss',
        icon: TrendingUp,
        permission: 'journal.view',
      },
      {
        href: '/reports/cash-flow',
        labelAr: 'التدفقات النقدية',
        label: 'Cash Flow',
        icon: Wallet,
        permission: 'journal.view',
      },
      {
        href: '/reports/ar-aging',
        labelAr: 'أعمار ذمم المستأجرين',
        label: 'AR Aging',
        icon: Users,
        permission: 'journal.view',
      },
      {
        href: '/reports/vendor-spend',
        labelAr: 'إنفاق الموردين',
        label: 'Vendor Spend',
        icon: Landmark,
        permission: 'journal.view',
      },
      {
        href: '/reports/customer-revenue',
        labelAr: 'إيراد العملاء',
        label: 'Customer Revenue',
        icon: Store,
        permission: 'journal.view',
      },
      {
        href: '/reports/employee-spend',
        labelAr: 'إنفاق الموظفين',
        label: 'Employee Spend',
        icon: Briefcase,
        permission: 'journal.view',
      },
      {
        href: '/reports/budget',
        labelAr: 'الموازنة مقابل الفعلي',
        label: 'Budget vs Actual',
        icon: Coins,
        permission: 'budget.view',
      },
      {
        href: '/reports/periods',
        labelAr: 'الفترات المالية',
        label: 'Fiscal Periods',
        icon: CalendarRange,
        permission: 'journal.view',
      },
    ],
  },
  {
    titleAr: 'الإدارة',
    title: 'Administration',
    items: [
      {
        href: '/audit-log',
        labelAr: 'سجل الرقابة',
        label: 'Audit Log',
        icon: Shield,
        permission: 'org.audit',
      },
      {
        href: '/users',
        labelAr: 'المستخدمون والصلاحيات',
        label: 'Users & Roles',
        icon: Shield,
        permission: 'org.users',
      },
      {
        href: '/branches',
        labelAr: 'الفروع',
        label: 'Branches',
        icon: GitBranch,
        permission: 'org.branches',
      },
      {
        href: '/notifications',
        labelAr: 'الإشعارات',
        label: 'Notifications',
        icon: Bell,
        permission: 'dashboard.view',
      },
      {
        href: '/settings',
        labelAr: 'الإعدادات',
        label: 'Settings',
        icon: Settings,
        permission: 'org.settings',
      },
    ],
  },
];
