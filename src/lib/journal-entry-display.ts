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
