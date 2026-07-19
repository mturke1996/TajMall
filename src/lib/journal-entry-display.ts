import type { JournalEntryRow, JournalStatus } from '@/lib/db/journal-queries';

export function journalEntryIsVoided(
  status: JournalStatus | string | null | undefined,
): boolean {
  return status === 'REVERSED';
}

export function journalVoidStatusLabelAr(
  status: JournalStatus | string | null | undefined,
): string {
  if (status === 'REVERSED') return 'معكوس / ملغى';
  if (status === 'DRAFT') return 'مسودة';
  if (status === 'POSTED') return 'مرحّل';
  return 'غير معروف';
}

/** صنف CSS للصف أو البطاقة عند إلغاء القيد */
export const JOURNAL_VOID_ROW_CLASS =
  'border-red-300/90 bg-red-50/80 dark:bg-red-950/30 dark:border-red-800/70 opacity-95';

export const JOURNAL_VOID_TEXT_CLASS =
  'text-red-700 dark:text-red-400 line-through decoration-red-600/80 decoration-2';

export const JOURNAL_VOID_MUTED_CLASS =
  'text-red-600/90 dark:text-red-400/90 line-through decoration-red-500/70';

export type JournalLike = Pick<
  JournalEntryRow,
  'id' | 'number' | 'status' | 'entry_date' | 'description' | 'total_debit'
>;

export function formatJournalEntryTitle(je: JournalLike): string {
  return `قيد #${je.number}${je.description ? ` — ${je.description}` : ''}`;
}

/** Tolerance used across UI for debit === credit checks. */
export const JOURNAL_BALANCE_EPS = 0.001;

export function toJournalAmount(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? Number(value) : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function journalAmountsBalanced(
  debit: number | string | null | undefined,
  credit: number | string | null | undefined,
): boolean {
  const d = toJournalAmount(debit);
  const c = toJournalAmount(credit);
  return d > 0 && Math.abs(d - c) < JOURNAL_BALANCE_EPS;
}

export function journalBalanceDifference(
  debit: number | string | null | undefined,
  credit: number | string | null | undefined,
): number {
  return toJournalAmount(debit) - toJournalAmount(credit);
}

export type JournalVoucherLineInput = {
  id?: string;
  accountCode?: string | null;
  accountName?: string | null;
  description?: string | null;
  debit?: number | string | null;
  credit?: number | string | null;
  /** Secondary line (contact / cashbox) under the account name */
  meta?: string | null;
};

export function mapJournalLineRowToVoucherLine(line: {
  id?: string;
  category_code?: string | null;
  category_name?: string | null;
  description?: string | null;
  debit?: number | string | null;
  credit?: number | string | null;
  contact_name?: string | null;
  contact_kind?: string | null;
  cashbox_name_ar?: string | null;
}): JournalVoucherLineInput {
  const kindLabel =
    line.contact_kind === 'TENANT'
      ? 'متجر'
      : line.contact_kind === 'EMPLOYEE'
        ? 'موظف'
        : line.contact_kind === 'VENDOR'
          ? 'مورد'
          : line.contact_kind === 'CUSTOMER'
            ? 'عميل'
            : null;
  const metaParts = [
    line.contact_name
      ? kindLabel
        ? `${line.contact_name} (${kindLabel})`
        : line.contact_name
      : null,
    line.cashbox_name_ar ? `خزينة: ${line.cashbox_name_ar}` : null,
  ].filter(Boolean);

  return {
    id: line.id,
    accountCode: line.category_code,
    accountName: line.category_name,
    description: line.description,
    debit: line.debit,
    credit: line.credit,
    meta: metaParts.length ? metaParts.join(' · ') : null,
  };
}

/** Running balance for a ledger-style list (debit increases, credit decreases by default). */
export function computeRunningBalances(
  lines: Array<{ debit?: number | string | null; credit?: number | string | null }>,
  opening = 0,
): number[] {
  let bal = opening;
  return lines.map((line) => {
    bal += toJournalAmount(line.debit) - toJournalAmount(line.credit);
    return bal;
  });
}
