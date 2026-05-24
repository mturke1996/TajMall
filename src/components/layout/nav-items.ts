import {
  LayoutDashboard,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  BookOpen,
  Receipt,
  Building2,
  Users,
  Shield,
  Settings,
  Activity,
  FolderTree,
  Bell,
  Landmark,
  ArrowLeftRight,
  Crown,
  Briefcase,
  GitBranch,
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
        href: '/journals',
        labelAr: 'دفتر اليومية',
        label: 'Journals',
        icon: BookOpen,
        permission: 'journal.view',
      },
    ],
  },
  {
    titleAr: 'دليل الحسابات',
    title: 'Chart of Accounts',
    items: [
      {
        href: '/accounts',
        labelAr: 'البنود المحاسبية',
        label: 'Account Categories',
        icon: FolderTree,
        permission: 'account.view',
      },
    ],
  },
  {
    titleAr: 'العلاقات التجارية',
    title: 'Relationships',
    items: [
      {
        href: '/contacts',
        labelAr: 'الدليل الشامل',
        label: 'All Contacts',
        icon: Users,
        permission: 'revenue.view',
      },
      {
        href: '/tenants',
        labelAr: 'المستأجرين والإيجارات',
        label: 'Tenants & Rent',
        icon: Building2,
        permission: 'revenue.view',
      },
      {
        href: '/employees',
        labelAr: 'الموظفين',
        label: 'Employees',
        icon: Briefcase,
        permission: 'expense.view',
      },
      {
        href: '/vendors',
        labelAr: 'الموردين',
        label: 'Vendors',
        icon: Landmark,
        permission: 'expense.view',
      },
    ],
  },
  {
    titleAr: 'الإدارة',
    title: 'Administration',
    items: [
      {
        href: '/boss',
        labelAr: 'لوحة المدير',
        label: 'Boss Dashboard',
        icon: Crown,
        permission: 'org.settings',
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
