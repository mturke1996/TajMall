/**
 * Domain constants modelled from the legacy
 * "منظومة الإيرادات والمصروفات" Excel workbook.
 *
 * These are seed defaults — every organization owns its own
 * editable copy in the database.
 */

export const APP = {
  name: 'Fluxen',
  nameAr: 'فلاكسن',
  tagline: 'منصة إدارة الإيرادات والمصروفات الذكية',
  defaultCurrency: 'LYD',
  defaultLocale: 'ar' as const,
};

type TxKind = 'REVENUE' | 'EXPENSE' | 'TRANSFER' | 'OPENING' | 'ADJUSTMENT';
type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
type CashboxKind = 'CASH' | 'BANK' | 'CARD' | 'OTHER';
type PaymentMethod = 'CASH' | 'CHEQUE' | 'TRANSFER' | 'CARD';

/**
 * Default chart of accounts (categories / البنود)
 * Lifted from the source Excel "Source" sheet.
 * Use as a seeding template — fully editable per organization.
 */
export const DEFAULT_CATEGORIES: Array<{
  code: string;
  name: string;
  nameAr: string;
  kind: TxKind;
  type: AccountType;
  color: string;
}> = [
  // Revenue
  { code: 'REV-GEN', nameAr: 'إيرادات عامة',     name: 'General revenue',       kind: 'REVENUE', type: 'REVENUE', color: '#3E4D34' },
  { code: 'REV-SUP', nameAr: 'دعم الخزينة',      name: 'Treasury support',      kind: 'REVENUE', type: 'REVENUE', color: '#536647' },
  { code: 'REV-AST', nameAr: 'بيع أصول ثابتة',   name: 'Sale of fixed assets',  kind: 'REVENUE', type: 'REVENUE', color: '#74866A' },
  { code: 'REV-OTH', nameAr: 'إيرادات أخرى',     name: 'Other revenue',         kind: 'REVENUE', type: 'REVENUE', color: '#9CAB91' },

  // Expense — admin / general
  { code: 'EXP-AST',  nameAr: 'م.أصول ثابتة',        name: 'Fixed assets',          kind: 'EXPENSE', type: 'EXPENSE', color: '#8A2F2D' },
  { code: 'EXP-SAL',  nameAr: 'م.مرتبات',             name: 'Salaries',              kind: 'EXPENSE', type: 'EXPENSE', color: '#7A5C0F' },
  { code: 'EXP-FST',  nameAr: 'م.مهرجانات',           name: 'Festivals',             kind: 'EXPENSE', type: 'EXPENSE', color: '#5E3A66' },
  { code: 'EXP-MNT',  nameAr: 'م.صيانة وقطع غيار',   name: 'Maintenance',           kind: 'EXPENSE', type: 'EXPENSE', color: '#1F4F73' },
  { code: 'EXP-CLN',  nameAr: 'م.نظافة',              name: 'Cleaning',              kind: 'EXPENSE', type: 'EXPENSE', color: '#0F6B7A' },
  { code: 'EXP-CON',  nameAr: 'م.مواد مستهلكة',      name: 'Consumables',           kind: 'EXPENSE', type: 'EXPENSE', color: '#7A3E5C' },
  { code: 'EXP-MAT',  nameAr: 'م.مواد ومهمات',       name: 'Materials',             kind: 'EXPENSE', type: 'EXPENSE', color: '#9F2F2D' },
  { code: 'EXP-LBR',  nameAr: 'م.عمالة عارضة',       name: 'Casual labor',          kind: 'EXPENSE', type: 'EXPENSE', color: '#A85E66' },
  { code: 'EXP-RNT',  nameAr: 'م.مصاريف إيجارات',   name: 'Rent expenses',         kind: 'EXPENSE', type: 'EXPENSE', color: '#8B5A1E' },
  { code: 'EXP-CAF',  nameAr: 'م.مقهى وضيافة',       name: 'Café & hospitality',    kind: 'EXPENSE', type: 'EXPENSE', color: '#956400' },
  { code: 'EXP-WTR',  nameAr: 'م.مياه',                name: 'Water',                 kind: 'EXPENSE', type: 'EXPENSE', color: '#1F6C9F' },
  { code: 'EXP-ELC',  nameAr: 'م.كهرباء',              name: 'Electricity',           kind: 'EXPENSE', type: 'EXPENSE', color: '#A47A0D' },
  { code: 'EXP-EQP',  nameAr: 'م.تجهيزات',             name: 'Equipment',             kind: 'EXPENSE', type: 'EXPENSE', color: '#586B5A' },
  { code: 'EXP-BNK',  nameAr: 'م.عمولة مصرفية',       name: 'Bank fees',             kind: 'EXPENSE', type: 'EXPENSE', color: '#4F4E7A' },
  { code: 'EXP-OTH',  nameAr: 'م.أخرى',                name: 'Other',                 kind: 'EXPENSE', type: 'EXPENSE', color: '#6E7470' },
];

/**
 * Default cashboxes — one cash drawer + three Libyan banks
 * (as seen in the legacy workbook). Pure template.
 */
export const DEFAULT_CASHBOXES: Array<{
  code: string;
  name: string;
  nameAr: string;
  kind: CashboxKind;
  bankName?: string;
  color: string;
}> = [
  { code: 'CASH',     nameAr: 'الخزينة النقدية',         name: 'Main cashbox',          kind: 'CASH', color: '#3E4D34' },
  { code: 'BNK-JUM',  nameAr: 'مصرف الجمهورية',          name: 'Jumhouria Bank',        kind: 'BANK', bankName: 'Jumhouria',     color: '#1F4F73' },
  { code: 'BNK-WHA',  nameAr: 'مصرف الواحة',              name: 'Wahda Bank',            kind: 'BANK', bankName: 'Wahda',          color: '#7A5C0F' },
  { code: 'BNK-LIB',  nameAr: 'مصرف الليبي الإسلامي',   name: 'Libyan Islamic Bank',   kind: 'BANK', bankName: 'Libyan Islamic', color: '#5E3A66' },
];

export const PAYMENT_METHODS: Array<{
  value: PaymentMethod;
  label: string;
  labelAr: string;
}> = [
  { value: 'CASH',     label: 'Cash',     labelAr: 'نقدي' },
  { value: 'CHEQUE',   label: 'Cheque',   labelAr: 'صك' },
  { value: 'TRANSFER', label: 'Transfer', labelAr: 'حوالة' },
  { value: 'CARD',     label: 'Card',     labelAr: 'بطاقة' },
];

export const SYSTEM_ROLES = [
  { name: 'owner',       nameAr: 'المالك' },
  { name: 'admin',       nameAr: 'مدير النظام' },
  { name: 'accountant',  nameAr: 'محاسب' },
  { name: 'cashier',     nameAr: 'أمين خزينة' },
  { name: 'viewer',      nameAr: 'مشاهد' },
];

export const PERMISSION_KEYS = [
  // dashboard
  'dashboard.view',
  // revenue
  'revenue.view', 'revenue.create', 'revenue.update', 'revenue.delete', 'revenue.post',
  // expense
  'expense.view', 'expense.create', 'expense.update', 'expense.delete', 'expense.post',
  // cashbox
  'cashbox.view', 'cashbox.manage',
  // accounts
  'account.view', 'account.manage',
  // journal
  'journal.view', 'journal.create', 'journal.post', 'journal.reverse',
  // voucher
  'voucher.view', 'voucher.create', 'voucher.approve', 'voucher.post', 'voucher.cancel',
  // reports
  'report.view', 'report.export',
  // org
  'org.settings', 'org.branches', 'org.users', 'org.roles', 'org.audit',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
