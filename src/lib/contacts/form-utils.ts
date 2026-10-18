import type { ContactRow } from '@/lib/db/types';
import {
  extractContactBusinessRole,
  encodeContactRoleFields,
  type ContactBusinessRole,
} from '@/lib/contacts/contact-roles';
import { NEEDS_DB_UPDATE, friendlyError } from '@/lib/user-messages';

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
  salary: string;
  hire_date: string;
  is_active: boolean;
  notes: string;
};

export const defaultContactFormState = (
  role: ContactBusinessRole = 'CUSTOMER',
): ContactFormState => {
  const isTenant = role === 'TENANT';
  const isEmployee = role === 'EMPLOYEE';
  const isLandlord = role === 'LANDLORD';

  return {
    kind: isTenant ? 'TENANT' : isEmployee ? 'EMPLOYEE' : isLandlord ? 'VENDOR' : role === 'CUSTOMER' ? 'CUSTOMER' : 'VENDOR',
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
    job_title: isLandlord ? 'مؤجر للمول' : '',
    department: '',
    salary: '',
    hire_date: '',
    is_active: true,
    notes: '',
  };
};

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
    notes: toFormString(contact.notes),
  };
}

/** أعمدة قابلة للإدراج/التحديث — بدون code (يُولَّد في قاعدة البيانات) */
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

/** حمولة الحفظ — الاسم فقط إلزامي */
export function buildContactPayload(form: ContactFormState): ContactUpsertPayload {
  const role = form.businessRole || 'CUSTOMER';
  const { kind, roleTag, updatedNotes } = encodeContactRoleFields(role, form.notes);

  let jobTitle = emptyToNull(form.job_title);
  let department = emptyToNull(form.department);
  let monthlyRent = numericOrNull(form.monthly_rent);
  let salary = numericOrNull(form.salary);

  if (role === 'LANDLORD') {
    if (!jobTitle) jobTitle = 'مؤجر للمول';
  } else {
    // إذا كان المسمى القديم هو مؤجر للمول وتم تحويله لمورد أو دور آخر
    if (jobTitle === 'مؤجر للمول') {
      jobTitle = null;
    }
  }

  if (role === 'SUPPLIER_ELECTRICITY' && !department) {
    department = 'كهرباء وطاقة';
  } else if (role === 'SUPPLIER_WATER' && !department) {
    department = 'مياه وصرف';
  } else if (role === 'SUPPLIER_GOODS' && !department) {
    department = 'بضاعة ومواد';
  } else if (role === 'SERVICE_PROVIDER' && !department) {
    department = 'خدمات ومقاولات';
  }

  // تصفير حقول الإيجار إذا كان الدور لا يتضمن إيجاراً
  if (role !== 'LANDLORD' && role !== 'TENANT') {
    monthlyRent = null;
  }
  // تصفير المرتب إذا لم يكن موظفاً
  if (role !== 'EMPLOYEE') {
    salary = null;
  }

  return {
    kind,
    name: toFormString(form.name).trim(),
    phone: emptyToNull(form.phone),
    phone2: emptyToNull(form.phone2),
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
