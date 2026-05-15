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

export type NavItem = {
  href: string;
  labelAr: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  badge?: { text: string; tone?: 'default' | 'success' | 'warning' | 'danger' };
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
      },
      {
        href: '/activity',
        labelAr: 'النشاط المباشر',
        label: 'Activity',
        icon: Activity,
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
      },
      {
        href: '/revenues',
        labelAr: 'الإيرادات',
        label: 'Revenues',
        icon: ArrowDownToLine,
        shortcut: '⌘R',
      },
      {
        href: '/expenses',
        labelAr: 'المصروفات',
        label: 'Expenses',
        icon: ArrowUpFromLine,
        shortcut: '⌘E',
      },
      {
        href: '/cashboxes',
        labelAr: 'الخزائن والمصارف',
        label: 'Cashboxes',
        icon: Wallet,
      },
      {
        href: '/vouchers',
        labelAr: 'إذونات الصرف',
        label: 'Vouchers',
        icon: Receipt,
      },
      {
        href: '/journals',
        labelAr: 'دفتر اليومية',
        label: 'Journals',
        icon: BookOpen,
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
      },
      {
        href: '/tenants',
        labelAr: 'المستأجرين والإيجارات',
        label: 'Tenants & Rent',
        icon: Building2,
      },
      {
        href: '/employees',
        labelAr: 'الموظفين',
        label: 'Employees',
        icon: Briefcase,
      },
      {
        href: '/vendors',
        labelAr: 'الموردين',
        label: 'Vendors',
        icon: Landmark,
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
      },
      {
        href: '/users',
        labelAr: 'المستخدمون والصلاحيات',
        label: 'Users & Roles',
        icon: Shield,
      },
      {
        href: '/branches',
        labelAr: 'الفروع',
        label: 'Branches',
        icon: GitBranch,
      },
      {
        href: '/notifications',
        labelAr: 'الإشعارات',
        label: 'Notifications',
        icon: Bell,
      },
      {
        href: '/settings',
        labelAr: 'الإعدادات',
        label: 'Settings',
        icon: Settings,
      },
    ],
  },
];
