import {
  LayoutDashboard,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  BookOpen,
  Receipt,
  FileBarChart,
  Building2,
  Users,
  Shield,
  Settings,
  Activity,
  FolderTree,
  Bell,
  Coins,
  Landmark,
  ArrowLeftRight,
  Crown,
  UserCircle,
  Briefcase,
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

export const NAV: NavSection[] = [
  {
    titleAr: 'نظرة عامة',
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
        href: '/transactions',
        labelAr: 'المعاملات',
        label: 'Transactions',
        icon: ArrowLeftRight,
        shortcut: '⌘T',
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
    title: 'Master Data',
    items: [
      {
        href: '/accounts',
        labelAr: 'البنود',
        label: 'Accounts',
        icon: FolderTree,
      },
      {
        href: '/customers',
        labelAr: 'العملاء',
        label: 'Customers',
        icon: Coins,
      },
      {
        href: '/vendors',
        labelAr: 'الموردون',
        label: 'Vendors',
        icon: Landmark,
      },
    ],
  },
  {
    titleAr: 'التقارير',
    title: 'Reports',
    items: [
      {
        href: '/reports/trial-balance',
        labelAr: 'ميزان المراجعة',
        label: 'Trial Balance',
        icon: FileBarChart,
      },
      {
        href: '/reports/profit-loss',
        labelAr: 'الأرباح والخسائر',
        label: 'P & L',
        icon: FileBarChart,
      },
      {
        href: '/reports/cash-flow',
        labelAr: 'التدفقات النقدية',
        label: 'Cash Flow',
        icon: FileBarChart,
      },
    ],
  },
  {
    titleAr: 'دليل العملاء',
    title: 'Contacts',
    items: [
      {
        href: '/contacts',
        labelAr: 'العملاء والمستأجرين',
        label: 'Contacts',
        icon: Users,
      },
      {
        href: '/tenants',
        labelAr: 'المحلات والإيجارات',
        label: 'Tenants & Rent',
        icon: Building2,
      },
      {
        href: '/employees',
        labelAr: 'الموظفين والرواتب',
        label: 'Employees & Payroll',
        icon: Briefcase,
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
        href: '/profile',
        labelAr: 'ملفي الشخصي',
        label: 'My Profile',
        icon: UserCircle,
      },
      {
        href: '/branches',
        labelAr: 'الفروع',
        label: 'Branches',
        icon: Building2,
      },
      {
        href: '/users',
        labelAr: 'المستخدمون',
        label: 'Users',
        icon: Users,
      },
      {
        href: '/roles',
        labelAr: 'الصلاحيات',
        label: 'Roles',
        icon: Shield,
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
