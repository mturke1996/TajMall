/**
 * The rules of the add and edit form, with no React: which kinds and roles can be chosen, what moving a file
 * between kinds does to the form, what is wrong with it (field by field, in plain Arabic) and what an employee's
 * pay and file turn into when saved. The screens are a thin layer over this.
 */
import { CONTACT_ROLES, type ContactBusinessRole } from '@/lib/contacts/contact-roles';
import {
  amountOf,
  employeeOf,
  kindForRole,
  salaryTotal,
  type ContactFormState,
} from '@/lib/contacts/form-utils';
import { parsePhone, normalizePhoneForSave } from '@/lib/contacts/phone';
import { isValidIban, normalizeIban, DEFAULT_ANNUAL_LEAVE_DAYS, type EmployeeFileInput } from '@/lib/leave';
import { parseAmountInput } from '@/lib/utils';
import type { ContactKind } from '@/lib/db/types';

// ---------------------------------------------------------------- kinds and roles

/** What the person chooses first. A tenant is added here too (shop, floor and rent); the kind `OTHER` is only ever met when editing. */
export type FormKind = 'VENDOR' | 'CUSTOMER' | 'EMPLOYEE' | 'TENANT' | 'OTHER';

/** The choices on offer, in the order they are drawn. */
export const KIND_CHOICES: readonly Exclude<FormKind, 'OTHER'>[] = ['VENDOR', 'CUSTOMER', 'EMPLOYEE', 'TENANT'];

export const KIND_LABEL: Record<FormKind, string> = {
  VENDOR: 'مورد',
  CUSTOMER: 'عميل',
  EMPLOYEE: 'موظف',
  TENANT: 'مستأجر',
  OTHER: 'جهة أخرى',
};

/** One short line saying what the kind is for. */
export const KIND_HINT: Record<FormKind, string> = {
  VENDOR: 'جهة تدفع لها: كهرباء، مياه، بضاعة، خدمات',
  CUSTOMER: 'جهة تقبض منها، ومؤجرو المول',
  EMPLOYEE: 'راتب وإجازات وسلف',
  TENANT: 'محل في المول وإيجار شهري',
  OTHER: 'جهة غير مصنفة',
};

export const formKindOf = (form: Pick<ContactFormState, 'kind'>): FormKind =>
  form.kind === 'VENDOR' || form.kind === 'CUSTOMER' || form.kind === 'EMPLOYEE' || form.kind === 'TENANT' ? form.kind : 'OTHER';

/** The roles each kind offers. A landlord is a role of a vendor and of a customer alike. */
export const ROLES_BY_KIND: Record<FormKind, readonly ContactBusinessRole[]> = {
  VENDOR: ['SUPPLIER_ELECTRICITY', 'SUPPLIER_WATER', 'SUPPLIER_GOODS', 'SERVICE_PROVIDER', 'LANDLORD'],
  CUSTOMER: ['CUSTOMER', 'LANDLORD'],
  EMPLOYEE: ['EMPLOYEE'],
  TENANT: ['TENANT'],
  OTHER: ['OTHER'],
};

export const DEFAULT_ROLE: Record<FormKind, ContactBusinessRole> = {
  VENDOR: 'SUPPLIER_GOODS',
  CUSTOMER: 'CUSTOMER',
  EMPLOYEE: 'EMPLOYEE',
  TENANT: 'TENANT',
  OTHER: 'OTHER',
};

/** The words on the role buttons: short, because they sit side by side. */
export const ROLE_CHOICE_LABEL: Partial<Record<ContactBusinessRole, string>> = {
  SUPPLIER_ELECTRICITY: 'كهرباء وطاقة',
  SUPPLIER_WATER: 'مياه وصرف',
  SUPPLIER_GOODS: 'بضاعة ومواد',
  SERVICE_PROVIDER: 'خدمات وصيانة',
  LANDLORD: 'مؤجر للمول',
  CUSTOMER: 'عميل',
};

/** The kind to start a form with for a role (a landlord is filed with the customers unless the vendors' list asked for it). */
export function startingKind(role: ContactBusinessRole, listKind?: 'VENDOR' | 'CUSTOMER' | null): ContactKind {
  if (role === 'LANDLORD') return listKind === 'VENDOR' ? 'VENDOR' : 'CUSTOMER';
  return CONTACT_ROLES[role].dbKind;
}

/**
 * Choose a kind. The role stays when the new kind offers it (a landlord stays a landlord between vendors and
 * customers), otherwise the kind's usual role takes over. Everything the person typed stays.
 */
export function switchKind(form: ContactFormState, kind: FormKind): ContactFormState {
  const role = ROLES_BY_KIND[kind].includes(form.businessRole) ? form.businessRole : DEFAULT_ROLE[kind];
  return { ...form, kind, businessRole: role };
}

/** Choose a role of the current kind. */
export function switchRole(form: ContactFormState, role: ContactBusinessRole): ContactFormState {
  return { ...form, businessRole: role, kind: kindForRole(role, form.kind) };
}

/**
 * Whether an existing file may be filed as another kind. Vendors and customers move freely (the money and the
 * entries do not change); a tenant keeps its leases and an employee its payroll, so those two stay what they are.
 */
export function canMoveTo(original: ContactKind | null | undefined, target: FormKind): boolean {
  if (!original) return true;
  if (original === 'TENANT' || original === 'EMPLOYEE') return original === target;
  return target === 'VENDOR' || target === 'CUSTOMER';
}

/** The roles an expense category points to: rent is paid to a landlord, a utility bill to that utility. */
const EXPENSE_CODE_ROLE: Record<string, ContactBusinessRole> = {
  'EXP-RNT': 'LANDLORD',
  'EXP-ELC': 'SUPPLIER_ELECTRICITY',
  'EXP-UTL': 'SUPPLIER_ELECTRICITY',
  'EXP-WTR': 'SUPPLIER_WATER',
  'EXP-MNT': 'SERVICE_PROVIDER',
  'EXP-CLN': 'SERVICE_PROVIDER',
  'EXP-SEC': 'SERVICE_PROVIDER',
};

/**
 * The role a party added from a transaction entry starts with, so the form opens on what the entry is about. The
 * party filter of a tenant or an employee is exact. Otherwise an expense says who it was paid to (rent: a landlord,
 * whichever list the filter shows; a utility or a service: that supplier, when the filter is vendors or all), a
 * plain expense is a supplier of goods and an income a customer. The person can still change it in the form.
 */
export function roleForEntry(entry: {
  kind: 'REVENUE' | 'EXPENSE';
  partyFilter: 'ALL' | 'TENANT' | 'EMPLOYEE' | 'CUSTOMER' | 'VENDOR';
  categoryCode?: string | null;
}): ContactBusinessRole {
  const { kind, partyFilter } = entry;
  if (partyFilter === 'TENANT') return 'TENANT';
  if (partyFilter === 'EMPLOYEE') return 'EMPLOYEE';
  if (kind === 'EXPENSE') {
    const byCategory = EXPENSE_CODE_ROLE[String(entry.categoryCode ?? '').trim().toUpperCase()];
    if (byCategory === 'LANDLORD') return byCategory;
    if (byCategory && (partyFilter === 'VENDOR' || partyFilter === 'ALL')) return byCategory;
  }
  if (partyFilter === 'CUSTOMER') return 'CUSTOMER';
  if (partyFilter === 'VENDOR') return 'SUPPLIER_GOODS';
  return kind === 'REVENUE' ? 'CUSTOMER' : 'SUPPLIER_GOODS';
}

/** «مؤجر للمول» for a landlord, otherwise the kind: «مورد»، «عميل»، «موظف»، «مستأجر». */
export function kindOrRoleLabel(contact: Pick<ContactFormState, 'kind'>, role: ContactBusinessRole): string {
  return role === 'LANDLORD' ? 'مؤجر للمول' : KIND_LABEL[formKindOf(contact)];
}

/** The noun for a message about one file: «المورد»، «العميل»، «المؤجر»، «الموظف»، «المستأجر». */
export function nounFor(role: ContactBusinessRole, kind: ContactKind): string {
  if (role === 'LANDLORD') return 'المؤجر';
  switch (kind) {
    case 'VENDOR':
      return 'المورد';
    case 'CUSTOMER':
      return 'العميل';
    case 'EMPLOYEE':
      return 'الموظف';
    case 'TENANT':
      return 'المستأجر';
    default:
      return 'الجهة';
  }
}

// ---------------------------------------------------------------- payment terms (kept as a line in the notes)

export const PAYMENT_TERMS = ['نقداً عند التسليم', 'آجل 30 يوماً', 'نهاية كل شهر', 'دفعة مقدّمة'] as const;
const TERMS_PREFIX = 'شروط الدفع:';

/** The payment terms line of a note, without its label; null when there is none. */
export function paymentTermsOf(notes: string | null | undefined): string | null {
  for (const line of String(notes ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    if (line.trim().startsWith(TERMS_PREFIX)) return line.trim().slice(TERMS_PREFIX.length).trim() || null;
  }
  return null;
}

/**
 * The note with these terms: the «شروط الدفع» line is set or replaced, and chosen again it is taken away. The rest of
 * the note stays as it is.
 */
export function applyPaymentTerms(notes: string, term: string): string {
  const lines = String(notes ?? '').replace(/\r\n?/g, '\n').split('\n');
  const at = lines.findIndex((l) => l.trim().startsWith(TERMS_PREFIX));
  const line = `${TERMS_PREFIX} ${term}`;
  if (at === -1) return lines.some((l) => l.trim() !== '') ? `${lines.join('\n').replace(/\s+$/, '')}\n${line}` : line;
  if (paymentTermsOf(notes) === term) return lines.filter((_, i) => i !== at).join('\n').trim();
  const next = [...lines];
  next[at] = line;
  return next.join('\n');
}

// ---------------------------------------------------------------- what is wrong with the form

export type FormField =
  | 'name'
  | 'phone'
  | 'phone2'
  | 'email'
  | 'monthly_rent'
  | 'area_sqm'
  | 'contract_end'
  | 'salary'
  | 'housing'
  | 'transport'
  | 'employeeContractEnd'
  | 'iban'
  | 'emergencyPhone'
  | 'annualLeaveDays';

export type FormErrors = Partial<Record<FormField, string>>;

/** Fields in the order the form draws them: the first wrong one gets the focus. */
export const FIELD_ORDER: readonly FormField[] = [
  'name', 'phone', 'phone2', 'email', 'monthly_rent', 'area_sqm', 'contract_end', 'salary', 'housing', 'transport',
  'employeeContractEnd', 'iban', 'emergencyPhone', 'annualLeaveDays',
];

export const IBAN_PROBLEM = 'رقم الآيبان غير صحيح. يبدأ برمز البلد ثم أرقام وحروف، مثل LY83…';
const AMOUNT_PROBLEM = 'اكتب مبلغاً صحيحاً';
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const filled = (v: string | null | undefined) => (v ?? '').trim() !== '';

/** A number with at most 3 decimals and no sign: the same reading every amount in the system uses. */
function amountProblem(value: string, max = 1_000_000_000): string | null {
  if (!filled(value)) return null;
  const n = parseAmountInput(value);
  if (!Number.isFinite(n) || n > max) return AMOUNT_PROBLEM;
  return null;
}

/**
 * What is wrong, field by field. Only the fields the role shows are checked: a value left in a hidden field
 * never stops a save. `baseline` is the form as an existing contact opened: a phone number or an e-mail that
 * the person did not touch is not reported, because an older version of the form accepted it and the person may
 * be here to fix something else. `employeeFile` says whether the bank, emergency and leave fields are on screen.
 */
export function validateContactForm(
  form: ContactFormState,
  options: { baseline?: ContactFormState | null; employeeFile?: boolean } = {},
): FormErrors {
  const { baseline } = options;
  const errors: FormErrors = {};
  const role = form.businessRole;
  const changed = (a: string, b: string | undefined) => !baseline || a !== b;

  if (!filled(form.name)) errors.name = 'اكتب الاسم';
  else if (form.name.trim().length > 150) errors.name = 'الاسم طويل جداً';

  if (changed(form.phone, baseline?.phone)) {
    const problem = parsePhone(form.phone).problem;
    if (problem) errors.phone = problem;
  }
  if (changed(form.phone2, baseline?.phone2)) {
    const problem = parsePhone(form.phone2).problem;
    if (problem) errors.phone2 = problem;
  }
  if (filled(form.email) && changed(form.email, baseline?.email) && !EMAIL_RX.test(form.email.trim())) {
    errors.email = 'البريد الإلكتروني غير صحيح';
  }

  const hasRent = role === 'LANDLORD' || role === 'TENANT' || role === 'CUSTOMER';
  if (hasRent) {
    const rent = amountProblem(form.monthly_rent);
    if (rent) errors.monthly_rent = rent;
    if (filled(form.contract_start) && filled(form.contract_end) && form.contract_end < form.contract_start) {
      errors.contract_end = 'نهاية العقد قبل بدايته';
    }
  }
  if (role === 'LANDLORD' || role === 'TENANT') {
    const area = amountProblem(form.area_sqm, 1_000_000);
    if (area) errors.area_sqm = area;
  }

  if (role === 'EMPLOYEE') {
    const e = employeeOf(form);
    for (const [field, value] of [['salary', form.salary], ['housing', e.housing], ['transport', e.transport]] as const) {
      const problem = amountProblem(value);
      if (problem) errors[field] = problem;
    }
    if (!errors.salary && !filled(form.salary) && (filled(e.housing) || filled(e.transport))) {
      errors.salary = 'اكتب الراتب الأساسي';
    }
    const { employmentType, contractEnd } = e;
    if ((employmentType === 'CONTRACT' || employmentType === 'TEMPORARY') && filled(contractEnd) && filled(form.hire_date) && contractEnd < form.hire_date) {
      errors.employeeContractEnd = 'نهاية العقد قبل تاريخ التعيين';
    }
    if (options.employeeFile) {
      if (filled(e.iban) && !isValidIban(e.iban)) errors.iban = IBAN_PROBLEM;
      const emergency = parsePhone(e.emergencyPhone).problem;
      if (emergency) errors.emergencyPhone = emergency;
      const days = parseAmountInput(e.annualLeaveDays);
      if (filled(e.annualLeaveDays) && (!Number.isFinite(days) || days < 0 || days > 365)) {
        errors.annualLeaveDays = 'اكتب عدد أيام بين 0 و365';
      }
    }
  }
  return errors;
}

/** The first wrong field in drawing order, for the focus after a failed save. */
export function firstInvalidField(errors: FormErrors): FormField | null {
  return FIELD_ORDER.find((f) => errors[f]) ?? null;
}

// ---------------------------------------------------------------- an employee's pay and file

export type SalaryPlan = {
  /** the first day of the month the pay starts: the hire month, else this month */
  effectiveFrom: string;
  /** the month comes from the hire date; false when there is none and it is this month */
  fromHireDate: boolean;
  base: number;
  housing: number;
  transport: number;
  other: number;
  total: number;
};

/**
 * The salary structure to record when an employee is added, or null when there is no pay to record. It starts
 * in the month of the hire date (the month it is today when none is given), because that is when the pay began.
 */
export function planSalaryStructure(form: ContactFormState, today: string): SalaryPlan | null {
  if (form.businessRole !== 'EMPLOYEE') return null;
  const total = salaryTotal(form);
  if (!(total > 0)) return null;
  const hire = /^\d{4}-\d{2}-\d{2}$/.test(form.hire_date) ? form.hire_date.slice(0, 7) : null;
  const month = hire ?? today.slice(0, 7);
  return {
    effectiveFrom: `${month}-01`,
    fromHireDate: hire !== null,
    base: amountOf(form.salary),
    housing: amountOf(employeeOf(form).housing),
    transport: amountOf(employeeOf(form).transport),
    other: 0,
    total,
  };
}

/**
 * The employee's file (employment type, bank, emergency contact, leave allowance, end of a contract) as the save
 * function takes it, or null when the form holds nothing beyond what a file-less employee already has (full time,
 * 30 days): the screens then do not open a file for nothing.
 */
export function planEmployeeFile(form: ContactFormState): EmployeeFileInput | null {
  if (form.businessRole !== 'EMPLOYEE') return null;
  const e = employeeOf(form);
  const days = filled(e.annualLeaveDays) ? parseAmountInput(e.annualLeaveDays) : DEFAULT_ANNUAL_LEAVE_DAYS;
  const timeBound = e.employmentType === 'CONTRACT' || e.employmentType === 'TEMPORARY';
  const contractEnd = timeBound && filled(e.contractEnd) ? e.contractEnd : null;
  const empty =
    e.employmentType === 'FULL_TIME' &&
    !contractEnd &&
    !filled(e.bankName) && !filled(e.bankAccount) && !filled(e.iban) &&
    !filled(e.emergencyName) && !filled(e.emergencyPhone) &&
    (!Number.isFinite(days) || days === DEFAULT_ANNUAL_LEAVE_DAYS);
  if (empty) return null;
  return {
    employmentType: e.employmentType,
    nationalId: filled(form.id_number) ? form.id_number.trim() : null,
    contractEnd,
    bankName: filled(e.bankName) ? e.bankName.trim() : null,
    bankAccount: filled(e.bankAccount) ? e.bankAccount.trim() : null,
    iban: filled(e.iban) ? normalizeIban(e.iban) : null,
    emergencyName: filled(e.emergencyName) ? e.emergencyName.trim() : null,
    emergencyPhone: normalizePhoneForSave(e.emergencyPhone),
    annualLeaveDays: Number.isFinite(days) ? days : DEFAULT_ANNUAL_LEAVE_DAYS,
  };
}
