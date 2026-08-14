/**
 * منظومة أدوار وتصنيفات جهات الاتصال الموسعة — تاج مول
 * Extended Contact Business Roles & Landlord/Supplier Architecture
 */

import {
  Building2,
  Building,
  Zap,
  Droplets,
  Package,
  Wrench,
  Briefcase,
  User,
  Store,
  type LucideIcon,
} from 'lucide-react';
import type { ContactRow, TransactionWithRelations, ContactKind } from '@/lib/db/types';
import { extractTargetRentMonth } from '@/lib/period-journal-entry';

export type ContactBusinessRole =
  | 'TENANT'               // مستأجر محل بالمول
  | 'LANDLORD'             // مؤجر للمول (المول مستأجر منه عقار/أرض)
  | 'SUPPLIER_ELECTRICITY' // مورد كهرباء وطاقة / مولدات ومحروقات
  | 'SUPPLIER_WATER'       // مورد مياه وصرف صحي / صهاريج
  | 'SUPPLIER_GOODS'       // مورد بضاعة ومواد تشغيلية
  | 'SERVICE_PROVIDER'     // مقدم خدمات وصيانة ومقاولات
  | 'EMPLOYEE'             // موظف / كادر إداري
  | 'CUSTOMER'             // عميل عام / مستفيد
  | 'OTHER';               // جهة أخرى

export type ContactRoleMeta = {
  role: ContactBusinessRole;
  label: string;
  labelEn: string;
  badge: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  borderColor: string;
  dbKind: ContactKind;
  categoryCode?: string;
  isPayable: boolean;     // هل هو دائن/مصروفات تدفع له (مثل المؤجر والموردين)
  isReceivable: boolean;  // هل هو مدين/إيرادات تقبض منه (مثل المستأجرين والعملاء)
};

export const CONTACT_ROLES: Record<ContactBusinessRole, ContactRoleMeta> = {
  TENANT: {
    role: 'TENANT',
    label: 'مستأجر محل بالمول',
    labelEn: 'Mall Tenant',
    badge: 'مستأجر محل',
    description: 'يستأجر مساحة أو محلاً تجارياً داخل المول ويدفع إيجاراً شهرياً.',
    icon: Building2,
    color: 'text-emerald-700 dark:text-emerald-300',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    dbKind: 'TENANT',
    categoryCode: 'REV-RNT',
    isPayable: false,
    isReceivable: true,
  },
  LANDLORD: {
    role: 'LANDLORD',
    label: 'مؤجر للمول (المول مستأجر منه)',
    labelEn: 'Mall Landlord',
    badge: 'مؤجر للمول',
    description: 'يؤجر للمول عقاراً أو أرضاً (أرضية مولدات، مخازن، مواقف) ويستحق إيجاراً دورياً.',
    icon: Building,
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-50 dark:bg-amber-950/40',
    borderColor: 'border-amber-200 dark:border-amber-800',
    dbKind: 'VENDOR',
    categoryCode: 'EXP-RNT',
    isPayable: true,
    isReceivable: false,
  },
  SUPPLIER_ELECTRICITY: {
    role: 'SUPPLIER_ELECTRICITY',
    label: 'مورّد كهرباء وطاقة ومحروقات',
    labelEn: 'Electricity & Fuel Supplier',
    badge: 'توريد كهرباء وطاقة',
    description: 'تزويد الطاقة والكهرباء، وقود الديزل للمولدات، وقطع غيار المحطات الكهربائية.',
    icon: Zap,
    color: 'text-yellow-700 dark:text-yellow-300',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/40',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    dbKind: 'VENDOR',
    categoryCode: 'EXP-UTL',
    isPayable: true,
    isReceivable: false,
  },
  SUPPLIER_WATER: {
    role: 'SUPPLIER_WATER',
    label: 'مورّد مياه وصرف صحي',
    labelEn: 'Water & Sanitation Supplier',
    badge: 'توريد مياه',
    description: 'تزويد مياه الشرب والصهاريج، شبكات الصرف، وصيانة خزانات المياه.',
    icon: Droplets,
    color: 'text-sky-700 dark:text-sky-300',
    bgColor: 'bg-sky-50 dark:bg-sky-950/40',
    borderColor: 'border-sky-200 dark:border-sky-800',
    dbKind: 'VENDOR',
    categoryCode: 'EXP-WTR',
    isPayable: true,
    isReceivable: false,
  },
  SUPPLIER_GOODS: {
    role: 'SUPPLIER_GOODS',
    label: 'مورّد بضاعة ومواد تشغيل',
    labelEn: 'Goods & Materials Supplier',
    badge: 'توريد بضاعة ومواد',
    description: 'توريد المواد الاستهلاكية، قطع الغيار، ومواد التشغيل للمول.',
    icon: Package,
    color: 'text-indigo-700 dark:text-indigo-300',
    bgColor: 'bg-indigo-50 dark:bg-indigo-950/40',
    borderColor: 'border-indigo-200 dark:border-indigo-800',
    dbKind: 'VENDOR',
    categoryCode: 'EXP-MAT',
    isPayable: true,
    isReceivable: false,
  },
  SERVICE_PROVIDER: {
    role: 'SERVICE_PROVIDER',
    label: 'مقدّم خدمات ومقاولات وصيانة',
    labelEn: 'Service Contractor',
    badge: 'خدمات ومقاولات',
    description: 'شركات النظافة، الحراسة والأمن، صيانة المصاعد والتكييف، والأنظمة البرمجية.',
    icon: Wrench,
    color: 'text-cyan-700 dark:text-cyan-300',
    bgColor: 'bg-cyan-50 dark:bg-cyan-950/40',
    borderColor: 'border-cyan-200 dark:border-cyan-800',
    dbKind: 'VENDOR',
    categoryCode: 'EXP-MNT',
    isPayable: true,
    isReceivable: false,
  },
  EMPLOYEE: {
    role: 'EMPLOYEE',
    label: 'موظف / كادر إداري',
    labelEn: 'Employee',
    badge: 'موظف',
    description: 'موظف في الكادر الإداري أو الفني للمول يستحق مرتباً شهرياً.',
    icon: Briefcase,
    color: 'text-purple-700 dark:text-purple-300',
    bgColor: 'bg-purple-50 dark:bg-purple-950/40',
    borderColor: 'border-purple-200 dark:border-purple-800',
    dbKind: 'EMPLOYEE',
    categoryCode: 'EXP-SAL',
    isPayable: true,
    isReceivable: false,
  },
  CUSTOMER: {
    role: 'CUSTOMER',
    label: 'عميل عام / مستفيد',
    labelEn: 'General Customer',
    badge: 'عميل عام',
    description: 'عملاء الإعلانات، المواقف، الفعاليات، أو الخدمات العامة.',
    icon: User,
    color: 'text-teal-700 dark:text-teal-300',
    bgColor: 'bg-teal-50 dark:bg-teal-950/40',
    borderColor: 'border-teal-200 dark:border-teal-800',
    dbKind: 'CUSTOMER',
    categoryCode: 'REV-SVC',
    isPayable: false,
    isReceivable: true,
  },
  OTHER: {
    role: 'OTHER',
    label: 'جهة أخرى',
    labelEn: 'Other Party',
    badge: 'جهة أخرى',
    description: 'جهات حكومية، بنوك، أو جهات غير مصنفة.',
    icon: Store,
    color: 'text-slate-700 dark:text-slate-300',
    bgColor: 'bg-slate-50 dark:bg-slate-950/40',
    borderColor: 'border-slate-200 dark:border-slate-800',
    dbKind: 'OTHER',
    isPayable: false,
    isReceivable: false,
  },
};

/**
 * استخراج دور العميل من بيانات السجل بدقة فائقة
 */
export function extractContactBusinessRole(contact: Partial<ContactRow> | null | undefined): ContactBusinessRole {
  if (!contact) return 'OTHER';

  const notesText = (contact.notes || '').toLowerCase();

  // 1. الأولوية المطلقة للوسم الصريح المسجل في ملاحظات السجل
  if (notesText.includes('role:landlord')) return 'LANDLORD';
  if (notesText.includes('role:supplier_electricity')) return 'SUPPLIER_ELECTRICITY';
  if (notesText.includes('role:supplier_water')) return 'SUPPLIER_WATER';
  if (notesText.includes('role:supplier_goods')) return 'SUPPLIER_GOODS';
  if (notesText.includes('role:service_provider')) return 'SERVICE_PROVIDER';
  if (notesText.includes('role:tenant')) return 'TENANT';
  if (notesText.includes('role:employee')) return 'EMPLOYEE';
  if (notesText.includes('role:customer')) return 'CUSTOMER';

  // 2. فحص النوع الأساسي في قاعدة البيانات
  if (contact.kind === 'TENANT') return 'TENANT';
  if (contact.kind === 'EMPLOYEE') return 'EMPLOYEE';
  if (contact.kind === 'CUSTOMER') return 'CUSTOMER';

  const jobTitle = (contact.job_title || '').trim();
  const department = (contact.department || '').trim();

  // 3. فحص الكلمات الدلالية في المسمى والقسم
  if (jobTitle.includes('مؤجر') || department.includes('مؤجر')) {
    return 'LANDLORD';
  }
  if (jobTitle.includes('كهرباء') || department.includes('كهرباء') || department.includes('طاقة') || department.includes('مولد')) {
    return 'SUPPLIER_ELECTRICITY';
  }
  if (jobTitle.includes('مياه') || department.includes('مياه') || department.includes('صرف') || department.includes('صهريج')) {
    return 'SUPPLIER_WATER';
  }
  if (jobTitle.includes('بضاعة') || department.includes('بضاعة') || department.includes('مواد') || department.includes('تجهيز')) {
    return 'SUPPLIER_GOODS';
  }
  if (jobTitle.includes('صيانة') || jobTitle.includes('خدمات') || department.includes('صيانة') || department.includes('نظافة') || department.includes('أمن')) {
    return 'SERVICE_PROVIDER';
  }

  // 4. إذا كان مورد عام وله قيمة إيجار شهري مسجلة
  if (contact.kind === 'VENDOR') {
    if (contact.monthly_rent && Number(contact.monthly_rent) > 0) {
      return 'LANDLORD';
    }
    return 'SUPPLIER_GOODS';
  }

  return 'OTHER';
}

/**
 * تجهيز وسم الدور للتخزين في الملاحظات والمسمى مع تنظيف الوسوم السابقة
 */
export function encodeContactRoleFields(role: ContactBusinessRole, existingNotes?: string | null): {
  kind: ContactKind;
  roleTag: string;
  updatedNotes: string;
} {
  const roleMeta = CONTACT_ROLES[role];
  const cleanNotes = (existingNotes || '')
    .replace(/\[\s*role:[a-z_]+\s*\]/gi, '')
    .replace(/role:[a-z_]+/gi, '')
    .trim();

  const roleTag = `role:${role.toLowerCase()}`;
  const updatedNotes = cleanNotes ? `${cleanNotes}\n[${roleTag}]` : `[${roleTag}]`;

  return {
    kind: roleMeta.dbKind,
    roleTag,
    updatedNotes,
  };
}


// -------------------------------------------------------------
// جدول إيجار المؤجر للمول (Landlord Rent Month Matrix & Schedule)
// -------------------------------------------------------------

export type LandlordRentMonth = {
  monthKey: string;     // e.g. "2026-07"
  monthNum: number;     // 1 - 12
  monthNameAr: string;  // "يوليو"
  year: number;         // 2026
  expectedAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'paid_full' | 'paid_partial' | 'unpaid';
  paymentsCount: number;
  paymentTransactions: TransactionWithRelations[];
};

export type LandlordRentSchedule = {
  year: number;
  monthlyRent: number;
  totalExpected: number;
  totalPaid: number;
  totalOutstanding: number;
  paidMonthsCount: number;
  partialMonthsCount: number;
  unpaidMonthsCount: number;
  months: LandlordRentMonth[];
};

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

/**
 * بناء جدول استحقاقات وسداد إيجار المؤجر للمول (شهراً بشهر)
 */
export function buildLandlordRentSchedule(
  contact: ContactRow,
  transactions: TransactionWithRelations[],
  targetYear = new Date().getFullYear()
): LandlordRentSchedule {
  const monthlyRent = Number(contact.monthly_rent || 0);

  // تصفية معاملات المصروفات التابعة لهذا المؤجر
  const expenseTxs = transactions.filter(
    (t) =>
      (t.contact?.id === contact.id || (t as unknown as { contact_id?: string }).contact_id === contact.id) &&
      (t.kind === 'EXPENSE' || t.kind == null)
  );


  const months: LandlordRentMonth[] = [];
  let totalExpected = 0;
  let totalPaid = 0;
  let paidMonthsCount = 0;
  let partialMonthsCount = 0;
  let unpaidMonthsCount = 0;

  for (let m = 1; m <= 12; m++) {
    const monthKey = `${targetYear}-${String(m).padStart(2, '0')}`;
    const monthNameAr = ARABIC_MONTHS[m - 1];

    // البحث عن المعاملات المسددة لهذا الشهر
    const matchedPayments = expenseTxs.filter((tx) => {
      const { target_rent_month_key } = extractTargetRentMonth(tx.description, tx.tx_date);
      if (target_rent_month_key) {
        return target_rent_month_key === monthKey;
      }
      // إذا لم يُذكر في البيان فيطابق تاريخ الصرف
      return tx.tx_date && tx.tx_date.startsWith(monthKey);
    });

    const paidForMonth = matchedPayments.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const expected = monthlyRent;
    const remaining = Math.max(0, expected - paidForMonth);

    let status: 'paid_full' | 'paid_partial' | 'unpaid' = 'unpaid';
    if (paidForMonth >= expected && expected > 0) {
      status = 'paid_full';
      paidMonthsCount++;
    } else if (paidForMonth > 0) {
      status = 'paid_partial';
      partialMonthsCount++;
    } else {
      unpaidMonthsCount++;
    }

    totalExpected += expected;
    totalPaid += paidForMonth;

    months.push({
      monthKey,
      monthNum: m,
      monthNameAr,
      year: targetYear,
      expectedAmount: expected,
      paidAmount: paidForMonth,
      remainingAmount: remaining,
      status,
      paymentsCount: matchedPayments.length,
      paymentTransactions: matchedPayments,
    });
  }

  return {
    year: targetYear,
    monthlyRent,
    totalExpected,
    totalPaid,
    totalOutstanding: Math.max(0, totalExpected - totalPaid),
    paidMonthsCount,
    partialMonthsCount,
    unpaidMonthsCount,
    months,
  };
}
