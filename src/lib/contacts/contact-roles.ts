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
import { getCountedContactTransactions } from '@/lib/contacts/contact-transactions';
import { composeNotes, readTags, visibleNotes } from '@/lib/contacts/contact-tags';
import { todayISODate } from '@/lib/utils';

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
    color: 'text-success-ink',
    bgColor: 'bg-success-soft',
    borderColor: 'border-success-line',
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
    color: 'text-warning-ink',
    bgColor: 'bg-warning-soft',
    borderColor: 'border-warning-line',
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
    color: 'text-warning-ink',
    bgColor: 'bg-warning-soft',
    borderColor: 'border-warning-line',
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
    color: 'text-info-ink',
    bgColor: 'bg-info-soft',
    borderColor: 'border-info-line',
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
    color: 'text-info-ink',
    bgColor: 'bg-info-soft',
    borderColor: 'border-info-line',
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
    color: 'text-info-ink',
    bgColor: 'bg-info-soft',
    borderColor: 'border-info-line',
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
    color: 'text-plum-ink',
    bgColor: 'bg-plum-soft',
    borderColor: 'border-plum-line',
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
    color: 'text-success-ink',
    bgColor: 'bg-success-soft',
    borderColor: 'border-success-line',
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
    color: 'text-ink-soft',
    bgColor: 'bg-canvas-sunken',
    borderColor: 'border-border',
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

  // 1. الأولوية المطلقة للوسم الصريح المسجل في ملاحظات السجل (القراءة في contact-tags.ts)
  const tagged = readTags(contact.notes).role;
  if (tagged && tagged !== 'OTHER') return tagged;

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

/** Notes as the user wrote them: without any stored tag (role, tracking start). Empty string when nothing is left. */
export function visibleContactNotes(notes: string | null | undefined): string {
  return visibleNotes(notes);
}

/**
 * تجهيز وسم الدور للتخزين في الملاحظات والمسمى مع تنظيف الوسوم السابقة
 *
 * The tracking-start tag `[since:YYYY-MM]` is kept as it is unless `options.since` says otherwise
 * (a month sets it, null removes it): the edit form shows `visibleContactNotes`, which hides the tag, so
 * the tag has to survive the round trip here.
 */
export function encodeContactRoleFields(
  role: ContactBusinessRole,
  existingNotes?: string | null,
  options: { since?: string | null } = {},
): {
  kind: ContactKind;
  roleTag: string;
  updatedNotes: string;
} {
  const roleMeta = CONTACT_ROLES[role];
  const since = options.since === undefined ? readTags(existingNotes).since : options.since;

  const roleTag = `role:${role.toLowerCase()}`;
  const updatedNotes = composeNotes({ text: visibleNotes(existingNotes), role, since });

  return {
    kind: roleMeta.dbKind,
    roleTag,
    updatedNotes,
  };
}


// -------------------------------------------------------------
// جدول إيجار المؤجر للمول (Landlord Rent Month Matrix & Schedule)
// -------------------------------------------------------------

/** What the schedule needs of a transaction: the full row and the slim dues query both fit. */
export type LandlordRentTx = {
  id: string;
  kind?: string | null;
  status?: string | null;
  amount: string | number | null;
  tx_date: string;
  description?: string | null;
  contact_id?: string | null;
  contact?: { id: string } | null;
};

/** Why a month carries no rent: it has not come yet, the contract does not cover it, or no rent is set. */
export type LandlordRentNotDueReason = 'future' | 'before_contract' | 'after_contract' | 'no_rent';

export type LandlordRentMonth<T extends LandlordRentTx = TransactionWithRelations> = {
  monthKey: string;     // e.g. "2026-07"
  monthNum: number;     // 1 - 12
  monthNameAr: string;  // "يوليو"
  year: number;         // 2026
  /** rent is owed for this month: it has started, the contract covers it and a rent is set */
  due: boolean;
  notDueReason: LandlordRentNotDueReason | null;
  /** the monthly rent when due, 0 otherwise */
  expectedAmount: number;
  /** everything paid for this month, also in advance or outside the contract */
  paidAmount: number;
  remainingAmount: number;
  /** paid beyond the rent of a due month */
  overpaidAmount: number;
  status: 'paid_full' | 'paid_partial' | 'unpaid' | 'not_due';
  paymentsCount: number;
  paymentTransactions: T[];
};

export type LandlordRentSchedule<T extends LandlordRentTx = TransactionWithRelations> = {
  year: number;
  /** the day the schedule was read on: later months are not owed yet */
  asOf: string;
  monthlyRent: number;
  /** rent of the due months only */
  totalExpected: number;
  totalPaid: number;
  /** sum of what each due month still lacks; a surplus in one month never hides a gap in another */
  totalOutstanding: number;
  overpaidAmount: number;
  dueMonthsCount: number;
  paidMonthsCount: number;
  partialMonthsCount: number;
  unpaidMonthsCount: number;
  /** no contract start is recorded, so the rent is counted from January */
  contractStartMissing: boolean;
  /** the contract ends before it starts: both dates are ignored */
  contractDatesInvalid: boolean;
  months: LandlordRentMonth<T>[];
};

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

const RENT_EPS = 0.0005;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const amountOf = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** "2026-03-15" or a full timestamp → "2026-03"; anything else → null */
const monthKeyOf = (d: string | null | undefined) => {
  const s = String(d ?? '').slice(0, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : null;
};

export function landlordMonthName(monthNum: number): string {
  return ARABIC_MONTHS[monthNum - 1] ?? '';
}

/**
 * The month a payment is for: the one its description names ("سداد إيجار شهر مارس 2026"), otherwise the month
 * it was paid in. Both read the date text, so the answer does not move with the device time zone.
 *
 * A month named without a year is the occurrence nearest the payment date: December's rent paid on the 5th of
 * January is last year's December, and January's rent paid in November is next year's January. Taking the year
 * of the payment date would count either one against the wrong year and could hide a real gap there.
 */
export function landlordPaymentMonthKey(tx: { description?: string | null; tx_date: string }): string {
  const paidIn = String(tx.tx_date ?? '').slice(0, 7);
  const target = extractTargetRentMonth(tx.description, tx.tx_date);
  if (!target.target_rent_month || !target.target_rent_month_key) return paidIn;
  // the same year test as extractTargetRentMonth: a year in the text decides, otherwise the nearest one does
  if (!/\b202\d\b/.test(tx.description ?? '') &&/^\d{4}-(0[1-9]|1[0-2])$/.test(paidIn)) {
    const month = Number(target.target_rent_month_key.slice(5, 7));
    const ahead = month - Number(paidIn.slice(5, 7));
    const paidYear = Number(paidIn.slice(0, 4));
    const year = ahead > 6 ? paidYear - 1 : ahead < -6 ? paidYear + 1 : paidYear;
    return `${year}-${String(month).padStart(2, '0')}`;
  }
  return target.target_rent_month_key;
}

/**
 * The description a landlord payment is prefilled with. The schedule reads the month back from this text, so
 * it is checked to say the month it was written for: a landlord whose name holds a month word ("شركة أكتوبر")
 * would otherwise pull the payment into October, so the name is left out in that case (the contact is
 * linked to the transaction anyway).
 */
export function landlordPaymentDescription(landlordName: string, monthKey: string): string {
  const name = (landlordName || '').trim();
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return name ? `سداد إيجار للمؤجر ${name}` : 'سداد إيجار';
  const base = `سداد إيجار شهر ${ARABIC_MONTHS[m - 1]} ${y}`;
  if (!name) return base;
  const full = `${base} للمؤجر ${name}`;
  // a date far from the month: only the words can make the text read as that month
  return landlordPaymentMonthKey({ description: full, tx_date: '1999-06-15' }) === monthKey ? full : base;
}

/**
 * بناء جدول استحقاقات وسداد إيجار المؤجر للمول (شهراً بشهر)
 *
 * Rent is owed for a month when it has started (not later than the current month), the landlord's contract
 * covers it (any day of the start and end months counts) and a monthly rent is set. Every other month owes
 * nothing, though a payment made for it is still shown. Only counted transactions (POSTED and RECONCILED) are
 * payments.
 */
export function buildLandlordRentSchedule<T extends LandlordRentTx = TransactionWithRelations>(
  contact: ContactRow,
  transactions: readonly T[],
  targetYear?: number,
  options: { today?: string } = {},
): LandlordRentSchedule<T> {
  const today = options.today ?? todayISODate();
  const todayKey = today.slice(0, 7);
  const year = targetYear ?? (Number(today.slice(0, 4)) || new Date().getFullYear());
  const monthlyRent = Math.max(0, amountOf(contact.monthly_rent));

  let startKey = monthKeyOf(contact.contract_start);
  let endKey = monthKeyOf(contact.contract_end);
  const contractDatesInvalid = !!startKey && !!endKey && endKey < startKey;
  if (contractDatesInvalid) {
    startKey = null;
    endKey = null;
  }

  // payments by the month they are for
  const byMonth = new Map<string, T[]>();
  for (const tx of getCountedContactTransactions(transactions)) {
    const ofLandlord = tx.contact?.id === contact.id || tx.contact_id === contact.id;
    if (!ofLandlord || !(tx.kind === 'EXPENSE' || tx.kind == null)) continue;
    const key = landlordPaymentMonthKey(tx);
    const list = byMonth.get(key);
    if (list) list.push(tx);
    else byMonth.set(key, [tx]);
  }

  const months: LandlordRentMonth<T>[] = [];
  let totalExpected = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;
  let overpaidAmount = 0;
  let dueMonthsCount = 0;
  let paidMonthsCount = 0;
  let partialMonthsCount = 0;
  let unpaidMonthsCount = 0;

  for (let m = 1; m <= 12; m++) {
    const monthKey = `${year}-${String(m).padStart(2, '0')}`;
    const payments = byMonth.get(monthKey) ?? [];

    const notDueReason: LandlordRentNotDueReason | null =
      monthlyRent <= 0
        ? 'no_rent'
        : startKey && monthKey < startKey
          ? 'before_contract'
          : endKey && monthKey > endKey
            ? 'after_contract'
            : monthKey > todayKey
              ? 'future'
              : null;
    const due = notDueReason === null;

    const paid = round3(payments.reduce((sum, tx) => sum + amountOf(tx.amount), 0));
    const expected = due ? monthlyRent : 0;
    const gap = due ? round3(expected - paid) : 0;
    const remaining = gap > RENT_EPS ? gap : 0;
    const overpaid = due && -gap > RENT_EPS ? -gap : 0;

    let status: LandlordRentMonth<T>['status'] = 'not_due';
    if (due) {
      dueMonthsCount++;
      if (remaining === 0) {
        status = 'paid_full';
        paidMonthsCount++;
      } else if (paid > RENT_EPS) {
        status = 'paid_partial';
        partialMonthsCount++;
      } else {
        status = 'unpaid';
        unpaidMonthsCount++;
      }
    }

    totalExpected += expected;
    totalPaid += paid;
    totalOutstanding += remaining;
    overpaidAmount += overpaid;

    months.push({
      monthKey,
      monthNum: m,
      monthNameAr: ARABIC_MONTHS[m - 1],
      year,
      due,
      notDueReason,
      expectedAmount: expected,
      paidAmount: paid,
      remainingAmount: remaining,
      overpaidAmount: overpaid,
      status,
      paymentsCount: payments.length,
      paymentTransactions: payments,
    });
  }

  return {
    year,
    asOf: today,
    monthlyRent,
    totalExpected: round3(totalExpected),
    totalPaid: round3(totalPaid),
    totalOutstanding: round3(totalOutstanding),
    overpaidAmount: round3(overpaidAmount),
    dueMonthsCount,
    paidMonthsCount,
    partialMonthsCount,
    unpaidMonthsCount,
    contractStartMissing: !startKey && !contractDatesInvalid,
    contractDatesInvalid,
    months,
  };
}
