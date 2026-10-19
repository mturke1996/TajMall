import type { ContactKind, ContactRow } from '@/lib/db/types';
import {
  CONTACT_ROLES,
  extractContactBusinessRole,
  encodeContactRoleFields,
  visibleContactNotes,
  type ContactBusinessRole,
} from '@/lib/contacts/contact-roles';
import { readTags, toSinceMonth } from '@/lib/contacts/contact-tags';
import { normalizePhoneForSave } from '@/lib/contacts/phone';
import { DEFAULT_ANNUAL_LEAVE_DAYS, type EmploymentType } from '@/lib/leave';
import { NEEDS_DB_UPDATE, friendlyError } from '@/lib/user-messages';
import { parseAmountInput } from '@/lib/utils';

/** قيمة من Supabase قد تكون number (numeric) أو string */
function toFormString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : '';
  return String(value);
}

/** يحوّل النص الفارغ إلى null لتجنّب أخطاء قاعدة البيانات */
export function emptyToNull(value?: string | null | number): string | null {
  if (value == null) return null;
  const trimmed = toFormString(value).trim();
  return trimmed === '' ? null : trimmed;
}

/** يحوّل الحقل الرقمي الفارغ إلى null */
export function numericOrNull(value?: string | null | number): string | null {
  const s = emptyToNull(value);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? s : null;
}

/** Do not start financial activity from an archived contact profile. */
export function canCreateContactTransaction(isActive: boolean, hasPermission: boolean): boolean {
  return isActive && hasPermission;
}

// ---------------------------------------------------------------- the form's state

/** A customer is a person or a company. There is no column for it: it is kept in the job title, which the lists show. */
export type CustomerType = '' | 'individual' | 'company';

export const CUSTOMER_TYPE_LABEL: Record<Exclude<CustomerType, ''>, string> = {
  individual: 'فرد',
  company: 'شركة',
};

/** The categories the form fills in for a supplier; a category typed by hand is never replaced. */
export const SUPPLY_CATEGORY: Partial<Record<ContactBusinessRole, string>> = {
  SUPPLIER_ELECTRICITY: 'كهرباء وطاقة',
  SUPPLIER_WATER: 'مياه وصرف',
  SUPPLIER_GOODS: 'بضاعة ومواد',
  SERVICE_PROVIDER: 'خدمات ومقاولات',
};

export const LANDLORD_TITLE = 'مؤجر للمول';

/** What only an employee has: the pay, the file (bank, emergency contact, leave) and the kind of employment. */
export type EmployeeFormFields = {
  employmentType: EmploymentType;
  /** the end of a contract or temporary employment (YYYY-MM-DD) */
  contractEnd: string;
  housing: string;
  transport: string;
  bankName: string;
  bankAccount: string;
  iban: string;
  emergencyName: string;
  emergencyPhone: string;
  annualLeaveDays: string;
};

export type ContactFormState = {
  kind: ContactRow['kind'];
  businessRole: ContactBusinessRole;
  name: string;
  name_en: string;
  phone: string;
  phone2: string;
  email: string;
  address: string;
  id_number: string;
  tax_number: string;
  shop_number: string;
  floor: string;
  area_sqm: string;
  monthly_rent: string;
  contract_start: string;
  contract_end: string;
  job_title: string;
  department: string;
  /** the basic salary of an employee; the contact card keeps this plus the allowances (see `salaryTotal`) */
  salary: string;
  hire_date: string;
  is_active: boolean;
  /** the notes as the person wrote them: no machine tags (they are added when saving) */
  notes: string;
  /** the month the system starts following the monthly obligation, "YYYY-MM"; empty when not set */
  since: string;
  customerType: CustomerType;
  employee: EmployeeFormFields;
};

export const defaultEmployeeFields = (): EmployeeFormFields => ({
  employmentType: 'FULL_TIME',
  contractEnd: '',
  housing: '',
  transport: '',
  bankName: '',
  bankAccount: '',
  iban: '',
  emergencyName: '',
  emergencyPhone: '',
  annualLeaveDays: String(DEFAULT_ANNUAL_LEAVE_DAYS),
});

/** The kind a role is filed under when nothing says otherwise (a landlord is a vendor unless a screen chooses customers). */
export function defaultKindForRole(role: ContactBusinessRole): ContactKind {
  return CONTACT_ROLES[role].dbKind;
}

export const defaultContactFormState = (
  role: ContactBusinessRole = 'CUSTOMER',
  kind?: ContactKind,
): ContactFormState => ({
  kind: kind ?? defaultKindForRole(role),
  businessRole: role,
  name: '',
  name_en: '',
  phone: '',
  phone2: '',
  email: '',
  address: '',
  id_number: '',
  tax_number: '',
  shop_number: '',
  floor: '',
  area_sqm: '',
  monthly_rent: '',
  contract_start: '',
  contract_end: '',
  job_title: '',
  department: '',
  salary: '',
  hire_date: '',
  is_active: true,
  notes: '',
  since: '',
  customerType: '',
  employee: defaultEmployeeFields(),
});

function customerTypeOf(contact: Pick<ContactRow, 'kind' | 'job_title'>): CustomerType {
  if (contact.kind !== 'CUSTOMER') return '';
  const title = (contact.job_title ?? '').trim();
  if (title === CUSTOMER_TYPE_LABEL.company) return 'company';
  if (title === CUSTOMER_TYPE_LABEL.individual) return 'individual';
  return '';
}

export function contactToFormState(contact: ContactRow): ContactFormState {
  const row = contact as ContactRow & Record<string, unknown>;
  const role = extractContactBusinessRole(contact);

  return {
    kind: contact.kind,
    businessRole: role,
    name: toFormString(contact.name),
    name_en: toFormString(contact.name_en),
    phone: toFormString(contact.phone),
    phone2: toFormString(contact.phone2),
    email: toFormString(contact.email),
    address: toFormString(contact.address),
    id_number: toFormString(contact.id_number),
    tax_number: toFormString(contact.tax_number),
    shop_number: toFormString(contact.shop_number),
    floor: toFormString(contact.floor),
    area_sqm: toFormString(row.area_sqm),
    monthly_rent: toFormString(row.monthly_rent),
    contract_start: toFormString(contact.contract_start ? contact.contract_start.slice(0, 10) : ''),
    contract_end: toFormString(contact.contract_end ? contact.contract_end.slice(0, 10) : ''),
    job_title: toFormString(contact.job_title),
    department: toFormString(contact.department),
    salary: toFormString(row.salary),
    hire_date: toFormString(contact.hire_date ? contact.hire_date.slice(0, 10) : ''),
    is_active: contact.is_active,
    notes: visibleContactNotes(contact.notes),
    since: readTags(contact.notes).since ?? '',
    customerType: customerTypeOf(contact),
    employee: defaultEmployeeFields(),
  };
}

/** True when the person has typed or chosen anything beyond what a fresh form of that kind and role holds. */
export function isFormDirty(form: ContactFormState, role?: ContactBusinessRole, kind?: ContactKind): boolean {
  const fresh = defaultContactFormState(role ?? form.businessRole, kind ?? form.kind);
  const strip = (f: ContactFormState) => JSON.stringify({ ...f, kind: '', businessRole: '' });
  return strip(form) !== strip(fresh);
}

// ---------------------------------------------------------------- the payload

/** أعمدة قابلة للإدراج/التحديث — بدون code (يُولَّد في قاعدة البيانات) */
export type ContactUpsertPayload = {
  kind: ContactRow['kind'];
  name: string;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  address: string | null;
  shop_number: string | null;
  floor: string | null;
  area_sqm: string | null;
  monthly_rent: string | null;
  job_title: string | null;
  department: string | null;
  salary: string | null;
  notes: string | null;
  name_en: string | null;
  id_number: string | null;
  tax_number: string | null;
  contract_start: string | null;
  contract_end: string | null;
  hire_date: string | null;
  is_active: boolean;
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** A typed amount, 0 when blank or not a number (validation reports the latter before anything is saved). */
export function amountOf(value: string | null | undefined): number {
  const n = parseAmountInput(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
}

/** The monthly pay of an employee: basic salary plus housing and transport. This is what the contact card keeps. */
export function salaryTotal(form: Pick<ContactFormState, 'salary' | 'employee'>): number {
  return round3(amountOf(form.salary) + amountOf(form.employee.housing) + amountOf(form.employee.transport));
}

const isBlank = (v: string | null | undefined) => (v ?? '').trim() === '';

/** The filing for a role whose kind the role does not settle: a landlord stays in the list it was filed in. */
export function kindForRole(role: ContactBusinessRole, currentKind?: ContactKind | null): ContactKind {
  if (role === 'LANDLORD') return currentKind === 'CUSTOMER' ? 'CUSTOMER' : 'VENDOR';
  return defaultKindForRole(role);
}

const AUTO_CATEGORIES = new Set(Object.values(SUPPLY_CATEGORY));
const CUSTOMER_TYPE_TITLES = new Set<string>(Object.values(CUSTOMER_TYPE_LABEL));

/**
 * حمولة الحفظ — الاسم فقط إلزامي.
 *
 * `baseline` is the form as it opened for an existing contact: a phone number that the person did not touch is
 * saved exactly as it was, instead of being rewritten into the standard spelling.
 */
export function buildContactPayload(form: ContactFormState, baseline?: ContactFormState | null): ContactUpsertPayload {
  const role = form.businessRole || 'CUSTOMER';
  const since = form.since === undefined ? undefined : toSinceMonth(form.since);
  const { updatedNotes } = encodeContactRoleFields(role, form.notes, { since });
  const kind = kindForRole(role, form.kind);

  let jobTitle = emptyToNull(form.job_title);
  let department = emptyToNull(form.department);
  let monthlyRent = numericOrNull(form.monthly_rent);

  if (role === 'LANDLORD') {
    if (!jobTitle || CUSTOMER_TYPE_TITLES.has(jobTitle)) jobTitle = LANDLORD_TITLE;
  } else if (jobTitle === LANDLORD_TITLE) {
    // a former landlord that was moved to another role
    jobTitle = null;
  }

  // a customer's type lives in the job title; a file that is no longer a customer drops it
  if (role === 'CUSTOMER') {
    if (form.customerType) jobTitle = CUSTOMER_TYPE_LABEL[form.customerType];
    else if (jobTitle && CUSTOMER_TYPE_TITLES.has(jobTitle)) jobTitle = null;
  } else if (jobTitle && CUSTOMER_TYPE_TITLES.has(jobTitle) && kind !== 'EMPLOYEE' && kind !== 'TENANT') {
    jobTitle = null;
  }

  // the category follows the supplier role while it is still one the form filled in (never a typed one)
  const supplyCategory = SUPPLY_CATEGORY[role];
  if (supplyCategory) {
    if (!department || AUTO_CATEGORIES.has(department)) department = supplyCategory;
  } else if (department && AUTO_CATEGORIES.has(department) && role !== 'EMPLOYEE') {
    department = null;
  }

  // a monthly amount belongs to rent (owed or collected) and to a customer's regular contract; for any other
  // role it would make a vendor read as a landlord
  if (role !== 'LANDLORD' && role !== 'TENANT' && role !== 'CUSTOMER') monthlyRent = null;

  const pay = role === 'EMPLOYEE' && [form.salary, form.employee.housing, form.employee.transport].some((v) => !isBlank(v));
  const salary = pay ? String(salaryTotal(form)) : null;

  const untouched = (key: 'phone' | 'phone2') => !!baseline && baseline[key] === form[key];
  const phone = (key: 'phone' | 'phone2') => (untouched(key) ? emptyToNull(form[key]) : normalizePhoneForSave(form[key]));

  return {
    kind,
    name: toFormString(form.name).trim(),
    phone: phone('phone'),
    phone2: phone('phone2'),
    email: emptyToNull(form.email),
    address: emptyToNull(form.address),
    shop_number: emptyToNull(form.shop_number),
    floor: emptyToNull(form.floor),
    area_sqm: numericOrNull(form.area_sqm),
    monthly_rent: monthlyRent,
    job_title: jobTitle,
    department,
    salary,
    notes: updatedNotes ? updatedNotes : null,
    name_en: emptyToNull(form.name_en),
    id_number: emptyToNull(form.id_number),
    tax_number: emptyToNull(form.tax_number),
    contract_start: emptyToNull(form.contract_start),
    contract_end: emptyToNull(form.contract_end),
    hire_date: emptyToNull(form.hire_date),
    is_active: form.is_active,
  };
}

/** رسالة خطأ Supabase للمستخدم */
export function formatContactSaveError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as { message: string }).message);
    if (
      msg.includes('دور المشاهد') ||
      msg.includes('row-level security') ||
      msg.includes('violates row-level security')
    ) {
      return 'لا توجد صلاحية للحفظ — دورك «مشاهد» (قراءة فقط). اطلب من المدير ترقية دورك من صفحة المستخدمين.';
    }
    if (msg.includes('permission denied') || msg.includes('42501')) {
      return 'لا توجد صلاحية للحفظ — تأكد من تسجيل الدخول ومن دورك (مدير، محاسب، أمين صندوق).';
    }
    if (msg.includes('portal_token')) {
      return NEEDS_DB_UPDATE;
    }
    if (msg.includes('JWT') || msg.includes('session')) {
      return 'انتهت الجلسة — سجّل الدخول مرة أخرى';
    }
    if (msg.includes('duplicate key') || msg.includes('unique')) {
      return 'سجل مكرر — غيّر الاسم أو الرمز';
    }
    // an update that matched no row (PGRST116 "Cannot coerce the result to a single JSON object"): the
    // database allowed nothing to change, usually because the role may not edit
    if ((error as { code?: string }).code === 'PGRST116' || msg.includes('single JSON object')) {
      return 'لم يُحفظ التعديل — قد لا تملك صلاحية تعديل هذا الملف، أو حُذف. أعد تحميل الصفحة.';
    }
    return friendlyError(error, 'تعذّر الحفظ — حاول مرة أخرى.');
  }
  return 'تعذّر الحفظ — حاول مرة أخرى.';
}
