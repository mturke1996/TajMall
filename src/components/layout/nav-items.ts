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
  LayoutGrid,
  ScrollText,
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
 * Sidebar and mobile menu: the destinations people open every day, grouped by job.
 * Individual reports live in the reports hub and in the command palette (REPORT_LINKS),
 * so the sidebar stays short enough to scan without scrolling.
 */
export const NAV: NavSection[] = [
  {
    titleAr: 'الرئيسية',
    title: 'Overview',
    items: [
      { href: '/dashboard', labelAr: 'لوحة التحكم', label: 'Dashboard', icon: LayoutDashboard, shortcut: '⌘D', permission: 'dashboard.view' },
      { href: '/activity', labelAr: 'النشاط المباشر', label: 'Activity', icon: Activity, permission: 'dashboard.view' },
      { href: '/notifications', labelAr: 'التنبيهات', label: 'Notifications', icon: Bell, permission: 'dashboard.view' },
    ],
  },
  {
    titleAr: 'الإيجار والتحصيل',
    title: 'Rent & Collection',
    items: [
      { href: '/mall?tab=tenants', labelAr: 'المستأجرون والتحصيل', label: 'Tenants', icon: Building2, permission: 'revenue.view' },
      { href: '/mall?tab=charges', labelAr: 'المطالبات والرسوم', label: 'Charges', icon: Coins, permission: 'revenue.view' },
      { href: '/mall?tab=contracts', labelAr: 'عقود الإيجار', label: 'Contracts', icon: FileText, permission: 'revenue.view' },
      { href: '/mall', labelAr: 'نظرة عامة على المول', label: 'Mall overview', icon: LayoutGrid, permission: 'revenue.view' },
    ],
  },
  {
    titleAr: 'الخزينة',
    title: 'Treasury',
    items: [
      { href: '/transactions', labelAr: 'المعاملات', label: 'Transactions', icon: ArrowLeftRight, shortcut: '⌘T', permission: 'revenue.view' },
      { href: '/revenues', labelAr: 'الإيرادات', label: 'Revenues', icon: ArrowDownToLine, shortcut: '⌘R', permission: 'revenue.view' },
      { href: '/expenses', labelAr: 'المصروفات', label: 'Expenses', icon: ArrowUpFromLine, shortcut: '⌘E', permission: 'expense.view' },
      { href: '/cashboxes', labelAr: 'الخزائن والمصارف', label: 'Cashboxes', icon: Wallet, permission: 'cashbox.view' },
      { href: '/vouchers', labelAr: 'إذونات الصرف', label: 'Vouchers', icon: Receipt, permission: 'voucher.view' },
    ],
  },
  {
    titleAr: 'الجهات',
    title: 'Parties',
    items: [
      { href: '/mall?tab=people', labelAr: 'الدليل الشامل', label: 'Directory', icon: Users, permission: 'revenue.view' },
      { href: '/mall?tab=people&segment=EMPLOYEE', labelAr: 'الموظفون', label: 'Employees', icon: Briefcase, permission: 'expense.view' },
      { href: '/mall?tab=people&segment=VENDOR', labelAr: 'الموردون', label: 'Vendors', icon: Landmark, permission: 'expense.view' },
      { href: '/mall?tab=people&segment=CUSTOMER', labelAr: 'العملاء', label: 'Customers', icon: Store, permission: 'revenue.view' },
    ],
  },
  {
    titleAr: 'المحاسبة',
    title: 'Accounting',
    items: [
      { href: '/reports', labelAr: 'مركز التقارير', label: 'Reports', icon: PieChart, permission: 'journal.view' },
      { href: '/reports/journal-month', labelAr: 'قيد الفترة', label: 'Period journal entry', icon: FileSpreadsheet, permission: 'journal.view' },
      { href: '/journals', labelAr: 'دفتر اليومية', label: 'Journals', icon: BookOpen, permission: 'journal.view' },
      { href: '/accounts', labelAr: 'دليل الحسابات', label: 'Chart of accounts', icon: FolderTree, permission: 'account.view' },
    ],
  },
  {
    titleAr: 'الإدارة',
    title: 'Administration',
    items: [
      { href: '/documents', labelAr: 'الوثائق والمراسلات', label: 'Documents', icon: Stamp, permission: 'document.view' },
      { href: '/users', labelAr: 'المستخدمون والصلاحيات', label: 'Users & Roles', icon: Shield, permission: 'org.users' },
      { href: '/audit-log', labelAr: 'سجل الرقابة', label: 'Audit Log', icon: ScrollText, permission: 'org.audit' },
      { href: '/branches', labelAr: 'الفروع', label: 'Branches', icon: GitBranch, permission: 'org.branches' },
      { href: '/settings', labelAr: 'الإعدادات', label: 'Settings', icon: Settings, permission: 'org.settings' },
    ],
  },
];

/** Every report, for the command palette and the reports hub. */
export const REPORT_LINKS: NavItem[] = [
  { href: '/reports/ledger', labelAr: 'دفتر الأستاذ العام', label: 'General Ledger', icon: BookMarked, permission: 'journal.view' },
  { href: '/reports/trial-balance', labelAr: 'ميزان المراجعة', label: 'Trial Balance', icon: Scale, permission: 'journal.view' },
  { href: '/reports/balance-sheet', labelAr: 'الميزانية العمومية', label: 'Balance Sheet', icon: Landmark, permission: 'journal.view' },
  { href: '/reports/profit-loss', labelAr: 'الأرباح والخسائر', label: 'Profit & Loss', icon: TrendingUp, permission: 'journal.view' },
  { href: '/reports/cash-flow', labelAr: 'التدفقات النقدية', label: 'Cash Flow', icon: Wallet, permission: 'journal.view' },
  { href: '/reports/ar-aging', labelAr: 'أعمار ذمم المستأجرين', label: 'AR Aging', icon: Users, permission: 'journal.view' },
  { href: '/reports/vendor-spend', labelAr: 'إنفاق الموردين', label: 'Vendor Spend', icon: Landmark, permission: 'journal.view' },
  { href: '/reports/customer-revenue', labelAr: 'إيراد العملاء', label: 'Customer Revenue', icon: Store, permission: 'journal.view' },
  { href: '/reports/employee-spend', labelAr: 'إنفاق الموظفين', label: 'Employee Spend', icon: Briefcase, permission: 'journal.view' },
  { href: '/reports/budget', labelAr: 'الموازنة مقابل الفعلي', label: 'Budget vs Actual', icon: Coins, permission: 'budget.view' },
  { href: '/reports/periods', labelAr: 'الفترات المالية', label: 'Fiscal Periods', icon: CalendarRange, permission: 'journal.view' },
];

/** Command palette: the sidebar destinations plus every report. */
export const PALETTE_SECTIONS: NavSection[] = [
  ...NAV,
  { titleAr: 'التقارير', title: 'Reports', items: REPORT_LINKS },
];
