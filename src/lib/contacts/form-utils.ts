import type { ContactRow } from '@/lib/db/types';

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

export type ContactFormState = {
  kind: ContactRow['kind'];
  name: string;
  phone: string;
  phone2: string;
  email: string;
  address: string;
  shop_number: string;
  floor: string;
  area_sqm: string;
  monthly_rent: string;
  job_title: string;
  department: string;
  salary: string;
  notes: string;
};

export const defaultContactFormState = (
  kind: ContactRow['kind'] = 'CUSTOMER',
): ContactFormState => ({
  kind,
  name: '',
  phone: '',
  phone2: '',
  email: '',
  address: '',
  shop_number: '',
  floor: '',
  area_sqm: '',
  monthly_rent: '',
  job_title: '',
  department: '',
  salary: '',
  notes: '',
});

export function contactToFormState(contact: ContactRow): ContactFormState {
  const row = contact as ContactRow & Record<string, unknown>;
  return {
    kind: contact.kind,
    name: toFormString(contact.name),
    phone: toFormString(contact.phone),
    phone2: toFormString(contact.phone2),
    email: toFormString(contact.email),
    address: toFormString(contact.address),
    shop_number: toFormString(contact.shop_number),
    floor: toFormString(contact.floor),
    area_sqm: toFormString(row.area_sqm),
    monthly_rent: toFormString(row.monthly_rent),
    job_title: toFormString(contact.job_title),
    department: toFormString(contact.department),
    salary: toFormString(row.salary),
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
  const simpleProfile = form.kind === 'TENANT' || form.kind === 'EMPLOYEE';

  return {
    kind: form.kind,
    name: toFormString(form.name).trim(),
    phone: emptyToNull(form.phone),
    phone2: simpleProfile ? null : emptyToNull(form.phone2),
    email: simpleProfile ? null : emptyToNull(form.email),
    address: simpleProfile ? null : emptyToNull(form.address),
    shop_number: emptyToNull(form.shop_number),
    floor: emptyToNull(form.floor),
    area_sqm: numericOrNull(form.area_sqm),
    monthly_rent: numericOrNull(form.monthly_rent),
    job_title: emptyToNull(form.job_title),
    department: emptyToNull(form.department),
    salary: numericOrNull(form.salary),
    notes: simpleProfile ? null : emptyToNull(form.notes),
    name_en: null,
    id_number: null,
    tax_number: null,
    contract_start: null,
    contract_end: null,
    hire_date: null,
    is_active: true,
  };
}

/** رسالة خطأ Supabase للمستخدم */
export function formatContactSaveError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as { message: string }).message);
    if (msg.includes('permission denied') || msg.includes('42501')) {
      return 'لا توجد صلاحية للحفظ — تأكد من تسجيل الدخول أو نفّذ migration 014 في Supabase';
    }
    if (msg.includes('JWT') || msg.includes('session')) {
      return 'انتهت الجلسة — سجّل الدخول مرة أخرى';
    }
    if (msg.includes('duplicate key') || msg.includes('unique')) {
      return 'سجل مكرر — غيّر الاسم أو الرمز';
    }
    return msg;
  }
  return 'فشل الحفظ';
}
