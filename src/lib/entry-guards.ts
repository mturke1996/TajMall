/**
 * Guard rails for the new-transaction dialog that are plain rules rather than screens: what a cheque or a
 * transfer must carry, when a missing description is worth one more tap, and how an existing transaction
 * becomes the starting point of a new one. The dialog is a thin layer over these.
 */
import { dayNumber } from '@/lib/duplicate-check';
import { isRentRevenueCode } from '@/lib/party-contacts';

// ── the entry date ──────────────────────────────────────────────────────────────────────────────

/** The books start here: the date field's own lower limit. */
export const EARLIEST_ENTRY_DATE = '2020-01-01';

/**
 * Why an entry date cannot be posted, or null when it can: a real calendar day, not later than today (all
 * dates are local calendar days), not before the books start. The date field has min and max too, but the
 * form validates in code (a typed year such as 2062 or 0202 slips past a browser's limits when it is
 * not enforced), so a typo never lands a payment in the wrong period.
 */
export function entryDateError(date: string, today: string): string | null {
  if (dayNumber(date) === null) return 'حدّد تاريخ العملية';
  if (date > today) return 'تاريخ العملية لم يحن بعد. اختر اليوم أو تاريخاً سابقاً.';
  if (date < EARLIEST_ENTRY_DATE) return 'تاريخ العملية قبل 2020. تأكد من السنة.';
  return null;
}

// ── cheque and transfer details ─────────────────────────────────────────────────────────────────

export type EntryMethod = 'CASH' | 'CHEQUE' | 'TRANSFER' | 'CARD';

export type PaymentDetailsInput = {
  method: EntryMethod;
  chequeNumber?: string;
  chequeBank?: string;
  /** "YYYY-MM-DD"; a post-dated cheque is normal, so any real date is fine */
  chequeDate?: string;
  reference?: string;
};

/** The columns of `transactions` these map to; only what the method uses, and only when filled. */
export type PaymentDetails = {
  cheque_number?: string;
  cheque_bank?: string;
  cheque_date?: string;
  reference?: string;
};

export type PaymentDetailsResult = {
  ok: boolean;
  errors: { chequeNumber?: string; chequeDate?: string };
  fields: PaymentDetails;
};

const CHEQUE_NUMBER_MAX = 40;
const BANK_MAX = 80;
const REFERENCE_MAX = 60;

/** Arabic-Indic digits typed on an Arabic keyboard become the digits the bank statement shows. */
function asciiDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

const tidy = (s: string | undefined) => asciiDigits(String(s ?? '')).replace(/\s+/g, ' ').trim();

function isRealDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/**
 * A cheque needs its number (30 cheques were posted without one); its bank and date are kept when given.
 * A transfer keeps an optional reference. Cash and card carry nothing, so a value typed earlier under
 * another method never reaches the database.
 */
export function validatePaymentDetails(input: PaymentDetailsInput): PaymentDetailsResult {
  const errors: PaymentDetailsResult['errors'] = {};
  const fields: PaymentDetails = {};

  if (input.method === 'CHEQUE') {
    const number = tidy(input.chequeNumber);
    if (!number) errors.chequeNumber = 'أدخل رقم الصك.';
    else if (!/[\p{L}\p{N}]/u.test(number)) errors.chequeNumber = 'رقم الصك غير صالح.';
    else if (number.length > CHEQUE_NUMBER_MAX) errors.chequeNumber = `رقم الصك طويل؛ ${CHEQUE_NUMBER_MAX} خانة على الأكثر.`;
    else fields.cheque_number = number;

    const bank = tidy(input.chequeBank).slice(0, BANK_MAX);
    if (bank) fields.cheque_bank = bank;

    const date = String(input.chequeDate ?? '').trim();
    if (date) {
      if (isRealDate(date)) fields.cheque_date = date;
      else errors.chequeDate = 'تاريخ الصك غير صالح.';
    }
  } else if (input.method === 'TRANSFER') {
    const reference = tidy(input.reference).slice(0, REFERENCE_MAX);
    if (reference) fields.reference = reference;
  }

  return { ok: Object.keys(errors).length === 0, errors, fields };
}

/**
 * For a rent collection, which the database records through one function that takes no cheque columns:
 * the cheque or transfer is written into the description instead, so it is still on the statement.
 */
export function paymentNoteAr(method: EntryMethod, fields: PaymentDetails): string | null {
  if (method === 'CHEQUE' && fields.cheque_number) {
    return [`صك رقم ${fields.cheque_number}`, fields.cheque_bank].filter(Boolean).join(' · ');
  }
  if (method === 'TRANSFER' && fields.reference) return `حوالة رقم ${fields.reference}`;
  return null;
}

export function withPaymentNote(description: string, note: string | null): string {
  const base = description.trim();
  if (!note) return base;
  if (base.includes(note)) return base;
  return base ? `${base} · ${note}` : note;
}

// ── the description ─────────────────────────────────────────────────────────────────────────────

/**
 * 178 transactions have no description. It stays optional, but the first time someone posts without one the
 * dialog stops once, points at the field and offers a suggestion; the second press goes through. A
 * description the system wrote itself (a rent collection) never triggers it.
 */
export function needsDescriptionNudge(input: { description: string; alreadyNudged: boolean; autoDescribed?: boolean }): boolean {
  return input.description.trim() === '' && !input.alreadyNudged && !input.autoDescribed;
}

// ── repeat a transaction ────────────────────────────────────────────────────────────────────────

export type RepeatSource = {
  kind: string;
  number: number | string;
  amount: number | string;
  method?: string | null;
  description: string | null;
  category_id: string | null;
  cashbox_id: string | null;
  category?: { code?: string | null } | null;
  contact?: { id: string; name: string; kind: string } | null;
};

export type RepeatPrefill = {
  kind: 'REVENUE' | 'EXPENSE';
  amount?: number;
  contactId?: string;
  contactKind?: 'ALL' | 'TENANT' | 'EMPLOYEE' | 'CUSTOMER' | 'VENDOR';
  description?: string;
  categoryId?: string;
  cashboxId?: string;
  method?: EntryMethod;
  /** what the dialog says it was copied from */
  repeatOf: { number: number; contactName?: string };
};

const METHODS: readonly string[] = ['CASH', 'CHEQUE', 'TRANSFER', 'CARD'];
const PARTY_KINDS: readonly string[] = ['TENANT', 'EMPLOYEE', 'CUSTOMER', 'VENDOR'];

/** The permission that lets someone repeat this kind of transaction (the same one that creates it). */
export function repeatPermissionKey(kind: string): 'revenue.create' | 'expense.create' | null {
  return kind === 'REVENUE' ? 'revenue.create' : kind === 'EXPENSE' ? 'expense.create' : null;
}

/**
 * The new entry's starting point. The date, the cheque number and everything else stay out: it is a fresh
 * entry dated today, so the dialog resets those itself. A rent collection leaves the description to the
 * months chosen (its old text names a month that is paid). Null for transfers, openings and adjustments,
 * which the dialog does not record.
 */
export function repeatPrefillFrom(tx: RepeatSource): RepeatPrefill | null {
  if (tx.kind !== 'REVENUE' && tx.kind !== 'EXPENSE') return null;
  const amount = Math.round(Number(tx.amount) * 1000) / 1000;
  const description = tx.description?.trim();
  const rent = isRentRevenueCode(tx.category?.code ?? null);
  return {
    kind: tx.kind,
    amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
    contactId: tx.contact?.id || undefined,
    contactKind: tx.contact && PARTY_KINDS.includes(tx.contact.kind) ? (tx.contact.kind as RepeatPrefill['contactKind']) : tx.contact ? 'ALL' : undefined,
    description: description && !rent ? description : undefined,
    categoryId: tx.category_id || undefined,
    cashboxId: tx.cashbox_id || undefined,
    method: tx.method && METHODS.includes(tx.method) ? (tx.method as EntryMethod) : undefined,
    repeatOf: { number: Number(tx.number), contactName: tx.contact?.name },
  };
}
