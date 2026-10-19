/**
 * One day of the cashboxes, as the cashier hands it over: for each box the opening balance, what came in,
 * what went out, transfers between boxes, the closing balance, and every movement in between.
 *
 * Built only from the cashbox ledger (get_cashbox_ledger), the same events that give each row its running
 * balance, so the day always adds up to the balance the ledger shows. Rows arrive newest first.
 */
export type DailyLedgerRow = {
  event_id: string;
  source_type: 'transaction' | 'cash_transfer' | 'journal';
  event_date: string;
  reference?: string | null;
  seq_label?: string | null;
  description?: string | null;
  signed_amount: number | string;
  balance_after: number | string;
  counter_name_ar?: string | null;
};

export type DailyCashbox = {
  id: string;
  name_ar: string;
  kind: string;
  active?: boolean;
  opening_balance: number | string;
  /** balance as of now, from the ledger */
  current_balance?: number | string | null;
  rows: DailyLedgerRow[];
};

export type DailyLineKind = 'receipt' | 'payment' | 'transfer_in' | 'transfer_out';

export type DailyLine = {
  id: string;
  kind: DailyLineKind;
  /** document number or sequence label */
  ref: string | null;
  description: string | null;
  /** the other box of a transfer */
  counter: string | null;
  /** always positive; `kind` says which way */
  amount: number;
  balanceAfter: number;
};

export type DailyBox = {
  id: string;
  name: string;
  kind: string;
  opening: number;
  receipts: number;
  payments: number;
  transfersIn: number;
  transfersOut: number;
  closing: number;
  /** opening + in - out + transfers = closing */
  reconciles: boolean;
  /** only for today: the closing balance equals the box's current balance */
  matchesCurrent: boolean | null;
  lines: DailyLine[];
};

export type DailyStatement = {
  date: string;
  isToday: boolean;
  boxes: DailyBox[];
  totals: { opening: number; receipts: number; payments: number; transfersIn: number; transfersOut: number; closing: number };
  movements: number;
  allReconcile: boolean;
};

const EPS = 0.01;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const dayOf = (iso: unknown) => String(iso ?? '').slice(0, 10);

export const isDayKey = (v: string | null | undefined): v is string => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v ?? '');

function boxOf(box: DailyCashbox, date: string, isToday: boolean): DailyBox | null {
  const base = num(box.opening_balance);
  // rows come newest first: the first match is the latest movement up to that day
  const closing = num(box.rows.find((r) => dayOf(r.event_date) <= date)?.balance_after ?? base);
  const opening = num(box.rows.find((r) => dayOf(r.event_date) < date)?.balance_after ?? base);

  let receipts = 0;
  let payments = 0;
  let transfersIn = 0;
  let transfersOut = 0;
  const lines: DailyLine[] = [];
  box.rows.forEach((r, index) => {
    if (dayOf(r.event_date) !== date) return;
    const signed = num(r.signed_amount);
    const transfer = r.source_type === 'cash_transfer';
    const kind: DailyLineKind = transfer ? (signed >= 0 ? 'transfer_in' : 'transfer_out') : signed >= 0 ? 'receipt' : 'payment';
    const amount = Math.abs(signed);
    if (kind === 'receipt') receipts += amount;
    else if (kind === 'payment') payments += amount;
    else if (kind === 'transfer_in') transfersIn += amount;
    else transfersOut += amount;
    lines.push({
      id: r.event_id || `${box.id}:${index}`,
      kind,
      ref: r.reference?.trim() || r.seq_label?.trim() || null,
      description: r.description?.trim() || null,
      counter: transfer ? r.counter_name_ar ?? null : null,
      amount: round3(amount),
      balanceAfter: round3(num(r.balance_after)),
    });
  });
  lines.reverse(); // oldest first, the order the day happened

  // a box that is switched off and did nothing that day is not part of the sheet
  if (box.active === false && lines.length === 0 && Math.abs(closing) < EPS && Math.abs(opening) < EPS) return null;

  const current = box.current_balance == null ? null : num(box.current_balance);
  return {
    id: box.id,
    name: box.name_ar,
    kind: box.kind,
    opening: round3(opening),
    receipts: round3(receipts),
    payments: round3(payments),
    transfersIn: round3(transfersIn),
    transfersOut: round3(transfersOut),
    closing: round3(closing),
    reconciles: Math.abs(opening + receipts - payments + transfersIn - transfersOut - closing) < EPS,
    matchesCurrent: isToday && current != null ? Math.abs(closing - current) < EPS : null,
    lines,
  };
}

export function buildDailyStatement(input: { date: string; today: string; cashboxes: DailyCashbox[] }): DailyStatement {
  const { date, today } = input;
  const isToday = date === today;
  const boxes = input.cashboxes.map((b) => boxOf(b, date, isToday)).filter((b): b is DailyBox => b !== null);
  const sum = (pick: (b: DailyBox) => number) => round3(boxes.reduce((s, b) => s + pick(b), 0));
  return {
    date,
    isToday,
    boxes,
    totals: {
      opening: sum((b) => b.opening),
      receipts: sum((b) => b.receipts),
      payments: sum((b) => b.payments),
      transfersIn: sum((b) => b.transfersIn),
      transfersOut: sum((b) => b.transfersOut),
      closing: sum((b) => b.closing),
    },
    movements: boxes.reduce((s, b) => s + b.lines.length, 0),
    allReconcile: boxes.every((b) => b.reconciles && b.matchesCurrent !== false),
  };
}

/** "18/10/2026" from "2026-10-18" */
export const dayLabel = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
