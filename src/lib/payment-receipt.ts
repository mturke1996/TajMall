/**
 * The receipt a tenant or payer is handed right after a payment is posted: what it says, in what order,
 * how the balance left is worded, and when no receipt may be issued at all. The receipt screen, the PDF
 * and the WhatsApp message all read this one model, so the paper and the message cannot disagree.
 *
 * Only a posted (or reconciled) transaction gets a receipt. A draft is not money received and a voided
 * one was cancelled, so both are refused here and never reach the PDF.
 *
 * The receipt number is the transaction number behind an Arabic prefix («إيص-1042»), so any receipt can be
 * traced to its transaction. The prefix also keeps the number from being the first character of a line,
 * which the PDF engine would reorder.
 *
 * Strings that go into the PDF carry no direction marks (react-pdf prints them as boxes); money is kept
 * as numbers and drawn by the PDF kit.
 */
import { formatPaymentMethodAr } from '@/features/pdf/pdf-payment';
import { roundLyd, type RentAllocationLine } from '@/lib/rent-allocation';
import { formatMonthLabelAr } from '@/lib/rent-months';
import { arabicCount } from '@/lib/utils';

export const RECEIPT_NUMBER_PREFIX = 'إيص';
export const RECEIPT_STATUS_NOTE = 'إيصال عن معاملة مرحّلة';
export const RECEIPT_TITLE_RENT = 'إيصال تحصيل إيجار';
export const RECEIPT_TITLE_REVENUE = 'إيصال استلام مبلغ';

const EPS = 0.0005;
const MONTHS: [string, string, string, string] = ['شهر واحد', 'شهرين', 'أشهر', 'شهراً'];
/** how many unpaid months are named one by one on the receipt; more are counted */
const OTHER_MONTHS_NAMED = 3;

/** The part of a transaction a receipt reads. Structural, so a transaction row with its joins fits as it comes. */
export type ReceiptTransaction = {
  number: number | string | null | undefined;
  status: string | null | undefined;
  kind: string | null | undefined;
  amount: number | string | null | undefined;
  /** YYYY-MM-DD */
  tx_date: string;
  method: string | null | undefined;
  reference?: string | null;
  description?: string | null;
  cheque_number?: string | null;
  cheque_bank?: string | null;
  category?: { name_ar?: string | null } | null;
  cashbox?: { name_ar?: string | null; kind?: string | null; bank_name?: string | null } | null;
  contact?: { name?: string | null; shop_number?: string | null } | null;
};

export type ReceiptLine = {
  label: string;
  /** settled: nothing left on it; partial: part of it is still owed; other: not a month */
  state: 'settled' | 'partial' | 'other';
  statusLabel: string;
  /** what the month is worth; unknown when the receipt is rebuilt from a payment's month links */
  value: number | null;
  paidBefore: number;
  /** paid by this payment */
  paid: number;
  /** left on the line after this payment; null when it is not known */
  remaining: number | null;
};

export type ReceiptBalance =
  | { kind: 'remaining'; label: string; amount: number }
  | { kind: 'settled'; text: string };

export type PaymentReceipt = {
  kind: 'rent' | 'revenue';
  /** «إيص-1042»; null only for a receipt rebuilt from old data that has no transaction number */
  number: string | null;
  txNumber: number | null;
  title: string;
  statusNote: string;
  /** YYYY-MM-DD */
  date: string;
  payer: { name: string | null; shopNumber: string | null };
  total: number;
  /** short, for the summary: «نقدي»، «صك»، «حوالة مصرفية» */
  methodLabel: string;
  /** a cheque's number and bank, which are too long for the summary */
  methodDetail: string | null;
  sourceLabel: string;
  /** where the money went: the cashbox, or the bank account */
  source: string | null;
  reference: string | null;
  /** the transaction's own description */
  purpose: string | null;
  /** the account (category) it was posted under; shown for revenue other than rent */
  category: string | null;
  lines: ReceiptLine[];
  balance: ReceiptBalance | null;
  /** months owed that this receipt does not cover; only when the account was read in full */
  otherOwed: { label: string; detail: string; amount: number } | null;
  fileName: string;
};

export type ReceiptFailure = 'not_posted' | 'not_revenue' | 'no_number' | 'no_amount' | 'mismatch';

export const RECEIPT_FAILURE_TEXT: Record<ReceiptFailure, string> = {
  not_posted: 'لا يُصدر إيصال إلا لمعاملة مرحّلة.',
  not_revenue: 'الإيصال للمبالغ المستلمة فقط، وهذه المعاملة ليست إيراداً.',
  no_number: 'تعذّر معرفة رقم المعاملة، فلا يمكن إصدار إيصال مرقّم.',
  no_amount: 'مبلغ المعاملة غير صالح، فلا يمكن إصدار إيصال.',
  mismatch: 'توزيع الأشهر لا يطابق المبلغ المسجَّل. افتح سجل مدفوعات المستأجر وأصدر الإيصال منه.',
};

export type ReceiptResult = { ok: true; receipt: PaymentReceipt } | { ok: false; reason: ReceiptFailure; message: string };

const fail = (reason: ReceiptFailure): ReceiptResult => ({ ok: false, reason, message: RECEIPT_FAILURE_TEXT[reason] });

/** Posted and reconciled transactions are money received; drafts and voided ones are not. */
export function canIssueReceipt(status: string | null | undefined): boolean {
  return status === 'POSTED' || status === 'RECONCILED';
}

export function receiptNumber(txNumber: unknown): string | null {
  const n = Number(txNumber);
  return Number.isInteger(n) && n > 0 ? `${RECEIPT_NUMBER_PREFIX}-${n}` : null;
}

const text = (v: string | null | undefined) => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

const sum = (values: number[]) => roundLyd(values.reduce((s, v) => s + v, 0));

function chequeDetail(tx: ReceiptTransaction): string | null {
  if (tx.method !== 'CHEQUE') return null;
  const number = text(tx.cheque_number);
  return [number ? `رقم ${number}` : null, text(tx.cheque_bank)].filter(Boolean).join(' · ') || null;
}

function sourceOf(tx: ReceiptTransaction): string | null {
  const name = text(tx.cashbox?.name_ar);
  const bank = text(tx.cashbox?.bank_name);
  return [name, bank && bank !== name ? bank : null].filter(Boolean).join(' · ') || null;
}

/** a file name the operating system accepts, with the number first so receipts sort in order */
function receiptFileName(number: string | null, payer: string | null): string {
  return [number ?? 'إيصال', payer]
    .filter(Boolean)
    .join('-')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Counted words for the receipt and the confirmation: «شهر واحد»، «شهرين»، «3 أشهر». */
export function monthsCountText(n: number): string {
  return arabicCount(n, MONTHS);
}

function settledText(months: number): string {
  if (months === 1) return 'الشهر مُسدَّد بالكامل. لا مبلغ متبقٍ عليه.';
  if (months === 2) return 'الشهران مُسدَّدان بالكامل. لا مبلغ متبقٍ عليهما.';
  return 'الأشهر مُسدَّدة بالكامل. لا مبلغ متبقٍ عليها.';
}

function rentBalance(lines: ReceiptLine[]): ReceiptBalance | null {
  const months = lines.filter((l) => l.state !== 'other');
  if (months.length === 0) return null;
  const open = months.filter((l) => (l.remaining ?? 0) > EPS);
  if (open.length === 0) return { kind: 'settled', text: settledText(months.length) };
  return {
    kind: 'remaining',
    label: open.length === 1 ? `المتبقي من إيجار ${open[0].label}` : 'المتبقي على الأشهر المذكورة',
    amount: sum(open.map((l) => l.remaining ?? 0)),
  };
}

function otherOwedOf(owing: { month: string; amount: number }[] | null | undefined, covered: Set<string>): PaymentReceipt['otherOwed'] {
  const rest = (owing ?? [])
    .filter((o) => !covered.has(o.month) && Number.isFinite(o.amount) && o.amount > EPS)
    .sort((a, b) => a.month.localeCompare(b.month));
  if (rest.length === 0) return null;
  const label =
    rest.length === 1
      ? 'شهر آخر مستحق لم يشمله هذا الإيصال'
      : rest.length === 2
        ? 'شهران آخران مستحقان لم يشملهما هذا الإيصال'
        : 'أشهر أخرى مستحقة لم يشملها هذا الإيصال';
  const detail =
    rest.length <= OTHER_MONTHS_NAMED
      ? rest.map((o) => formatMonthLabelAr(o.month)).join('، ')
      : `أقدمها ${formatMonthLabelAr(rest[0].month)} (${monthsCountText(rest.length)})`;
  return { label, detail, amount: sum(rest.map((o) => o.amount)) };
}

/** Everything the two receipts share, once the transaction is known to be one that may be receipted. */
function base(tx: ReceiptTransaction, kind: PaymentReceipt['kind']): { receipt: PaymentReceipt } | { reason: ReceiptFailure } {
  if (!canIssueReceipt(tx.status)) return { reason: 'not_posted' };
  if (tx.kind !== 'REVENUE') return { reason: 'not_revenue' };
  const number = receiptNumber(tx.number);
  if (!number) return { reason: 'no_number' };
  const total = roundLyd(Number(tx.amount));
  if (!Number.isFinite(total) || total <= EPS) return { reason: 'no_amount' };

  const payerName = text(tx.contact?.name);
  return {
    receipt: {
      kind,
      number,
      txNumber: Number(tx.number),
      title: kind === 'rent' ? RECEIPT_TITLE_RENT : RECEIPT_TITLE_REVENUE,
      statusNote: RECEIPT_STATUS_NOTE,
      date: tx.tx_date,
      payer: { name: payerName, shopNumber: text(tx.contact?.shop_number) },
      total,
      methodLabel: formatPaymentMethodAr(tx.method ?? undefined),
      methodDetail: chequeDetail(tx),
      sourceLabel: 'الاستلام في',
      source: sourceOf(tx),
      reference: text(tx.reference),
      purpose: text(tx.description),
      category: kind === 'revenue' ? text(tx.category?.name_ar) : null,
      lines: [],
      balance: null,
      otherOwed: null,
      fileName: receiptFileName(number, payerName),
    },
  };
}

/**
 * The receipt for a rent payment. `lines` are the plan lines the cashier saw before saving (the same split
 * the database applied); a line that took no money is left out. `otherOwing` is what the tenant's account
 * still owes on months outside this payment: pass it only when the account loaded in full, because an
 * account read halfway would name months that are not owed.
 */
export function buildRentReceipt(input: {
  tx: ReceiptTransaction;
  tenant?: { name?: string | null; shopNumber?: string | null };
  lines: Pick<RentAllocationLine, 'month' | 'amount' | 'paidBefore' | 'applied' | 'paidAfter' | 'status'>[];
  otherOwing?: { month: string; amount: number }[] | null;
}): ReceiptResult {
  const made = base(input.tx, 'rent');
  if ('reason' in made) return fail(made.reason);
  const receipt = made.receipt;

  const used = input.lines.filter((l) => l.status !== 'skipped' && l.applied > EPS);
  const lines: ReceiptLine[] = used.map((l) => {
    const remaining = roundLyd(Math.max(l.amount - l.paidAfter, 0));
    const settled = remaining <= EPS;
    return {
      label: formatMonthLabelAr(l.month),
      state: settled ? 'settled' : 'partial',
      statusLabel: settled ? 'مُسدَّد' : 'جزئي',
      value: roundLyd(l.amount),
      paidBefore: roundLyd(l.paidBefore),
      paid: roundLyd(l.applied),
      remaining,
    };
  });

  // The months must add up to the amount that was recorded. Money without a month is shown as such; months
  // that add up to more than the amount mean the plan and the record disagree, and no receipt is printed.
  const gap = roundLyd(receipt.total - sum(lines.map((l) => l.paid)));
  if (gap < -EPS) return fail('mismatch');
  if (gap > EPS) {
    lines.push({ label: 'مبلغ غير موزَّع على شهر', state: 'other', statusLabel: 'رصيد', value: null, paidBefore: 0, paid: gap, remaining: null });
  }

  const tenantName = text(input.tenant?.name);
  const tenantShop = text(input.tenant?.shopNumber);
  receipt.payer = { name: tenantName ?? receipt.payer.name, shopNumber: tenantShop ?? receipt.payer.shopNumber };
  receipt.fileName = receiptFileName(receipt.number, receipt.payer.name);
  receipt.lines = lines;
  receipt.balance = rentBalance(lines);
  receipt.otherOwed = otherOwedOf(input.otherOwing, new Set(used.map((l) => l.month)));
  return { ok: true, receipt };
}

/** The receipt for any other revenue: who paid, how much, what for, and where the money went. */
export function buildRevenueReceipt(input: { tx: ReceiptTransaction }): ReceiptResult {
  const made = base(input.tx, 'revenue');
  if ('reason' in made) return fail(made.reason);
  return { ok: true, receipt: made.receipt };
}

/**
 * A receipt for a payment already in the tenant's history, rebuilt from what that screen holds: the months
 * the payment was linked to and the labels it already shows. It has no balance (the history does not know
 * what was left on each month), and carries a number only when the caller has the transaction's.
 */
export function rentReceiptFromHistory(input: {
  tenantName: string;
  shopNumber?: string | null;
  paymentDate: string;
  months: { monthLabel: string; amount: number; statusLabel: string }[];
  totalAmount: number;
  paymentMethod?: string;
  paymentSource?: string;
  reference?: string | null;
  receiptNumber?: string | null;
}): PaymentReceipt {
  const number = text(input.receiptNumber);
  const lines: ReceiptLine[] = input.months.map((m) => ({
    label: m.monthLabel,
    state: m.statusLabel === 'مدفوع' || m.statusLabel === 'مُسدَّد' ? 'settled' : m.statusLabel === 'جزئي' ? 'partial' : 'other',
    statusLabel: m.statusLabel,
    value: null,
    paidBefore: 0,
    paid: roundLyd(m.amount),
    remaining: null,
  }));
  return {
    kind: 'rent',
    number,
    txNumber: null,
    title: RECEIPT_TITLE_RENT,
    statusNote: RECEIPT_STATUS_NOTE,
    date: input.paymentDate,
    payer: { name: text(input.tenantName), shopNumber: text(input.shopNumber) },
    total: roundLyd(input.totalAmount),
    methodLabel: text(input.paymentMethod) ?? '—',
    methodDetail: null,
    sourceLabel: 'المصرف / الخزينة',
    source: text(input.paymentSource),
    reference: text(input.reference),
    purpose: null,
    category: null,
    lines,
    balance: null,
    otherOwed: null,
    fileName: receiptFileName(number, text(input.tenantName)),
  };
}
