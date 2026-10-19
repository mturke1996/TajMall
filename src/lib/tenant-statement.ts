/**
 * A tenant's rent statement of account: each month's rent as it falls due (debit), each rent receipt
 * (credit), and the running balance. Built from the same month-by-month account as the tenant profile,
 * so the closing balance can be reconciled line by line with "owed now":
 *
 *   closing balance = owed now − paid ahead for months not started − receipts linked to no month
 *
 * Anything left over is a linking difference (a receipt linked to more than it brought in, or to a month
 * that has since been excluded) and is shown as such instead of being hidden.
 */
import { isCountedTransaction } from '@/lib/contacts/contact-transactions';
import { roundLyd } from '@/lib/rent-allocation';
import { formatMonthLabelAr } from '@/lib/rent-months';
import type { TenantRentAccount } from '@/lib/tenant-rent-account';

export type StatementRow = {
  key: string;
  /** YYYY-MM-DD */
  date: string;
  type: 'charge' | 'payment';
  label: string;
  detail: string | null;
  /** the receipt's own reference (cheque or transfer number), kept apart because it is usually Latin */
  reference: string | null;
  debit: number;
  credit: number;
  /** debit − credit so far; positive = the tenant owes */
  balance: number;
  month?: string;
  transactionId?: string;
};

export type StatementReceipt = {
  id: string;
  number: number | null;
  tx_date: string;
  amount: number | string;
  status: string;
  kind: string;
  description?: string | null;
  reference?: string | null;
  method?: string | null;
  category?: { code?: string | null } | null;
};

export type TenantStatement = {
  /** null = the whole account */
  year: number | null;
  opening: number;
  rows: StatementRow[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
  /** only for the whole account: how the closing balance follows from the month-by-month account */
  reconciliation: {
    owedNow: number;
    paidAhead: number;
    unlinked: number;
    difference: number;
  } | null;
};

const DEBIT_KINDS = new Set(['paid', 'partial', 'due', 'uncharged']);

/** Rent receipts that count on the statement: posted or reconciled rent revenue, like every other total. */
export function isStatementReceipt(t: StatementReceipt) {
  return isCountedTransaction(t) && t.kind === 'REVENUE' && t.category?.code === 'REV-RNT';
}

export function buildTenantStatement(input: {
  account: TenantRentAccount;
  receipts: StatementReceipt[];
  /** receipts linked to no month (unlinkedRentReceipts().total) */
  unlinkedTotal: number;
  year?: number | null;
  methodLabel?: (method: string | null | undefined) => string;
}): TenantStatement {
  const year = input.year ?? null;
  const months = input.account.years.flatMap((y) => y.months);

  const all: Omit<StatementRow, 'balance'>[] = [];
  for (const m of months) {
    if (!m.started || !DEBIT_KINDS.has(m.kind) || m.amount <= 0) continue;
    all.push({
      key: `m-${m.month}`,
      date: `${m.month}-01`,
      type: 'charge',
      label: `إيجار ${formatMonthLabelAr(m.month)}`,
      detail: m.kind === 'uncharged' ? 'لم تُسجَّل مطالبته' : null,
      reference: null,
      debit: m.amount,
      credit: 0,
      month: m.month,
    });
  }
  for (const t of input.receipts) {
    if (!isStatementReceipt(t)) continue;
    const amount = roundLyd(Number(t.amount) || 0);
    if (amount <= 0) continue;
    const parts = [
      t.description?.trim() || null,
      t.method && input.methodLabel ? input.methodLabel(t.method) : null,
    ].filter(Boolean);
    all.push({
      key: `t-${t.id}`,
      date: String(t.tx_date).slice(0, 10),
      type: 'payment',
      label: t.number != null ? `دفعة رقم ${t.number}` : 'دفعة',
      detail: parts.length ? parts.join(' · ') : null,
      reference: t.reference?.trim() || null,
      debit: 0,
      credit: amount,
      transactionId: t.id,
    });
  }
  // by date; on the same day the month's rent comes before the payment against it
  all.sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? a.key.localeCompare(b.key) : a.type === 'charge' ? -1 : 1));

  const inYear = (r: { date: string }) => year == null || r.date.slice(0, 4) === String(year);
  const before = (r: { date: string }) => year != null && r.date.slice(0, 4) < String(year);

  let balance = roundLyd(all.filter(before).reduce((s, r) => s + r.debit - r.credit, 0));
  const opening = balance;
  const rows: StatementRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  for (const r of all) {
    if (!inYear(r)) continue;
    balance = roundLyd(balance + r.debit - r.credit);
    totalDebit += r.debit;
    totalCredit += r.credit;
    rows.push({ ...r, balance });
  }
  const closing = roundLyd(opening + totalDebit - totalCredit);

  let reconciliation: TenantStatement['reconciliation'] = null;
  if (year == null) {
    const paidAhead = roundLyd(months.filter((m) => !m.started).reduce((s, m) => s + m.paid, 0));
    const unlinked = roundLyd(input.unlinkedTotal);
    const expected = roundLyd(input.account.owedNow - paidAhead - unlinked);
    reconciliation = {
      owedNow: input.account.owedNow,
      paidAhead,
      unlinked,
      difference: roundLyd(closing - expected),
    };
  }

  return {
    year,
    opening,
    rows,
    totalDebit: roundLyd(totalDebit),
    totalCredit: roundLyd(totalCredit),
    closing,
    reconciliation,
  };
}

/** "مستحق عليه" / "رصيد له" / "لا رصيد" for a balance. */
export function statementBalanceLabel(balance: number) {
  if (balance > 0.0005) return 'مستحق على المستأجر';
  if (balance < -0.0005) return 'رصيد للمستأجر (مدفوع مقدماً)';
  return 'لا رصيد';
}
