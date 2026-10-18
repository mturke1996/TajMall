'use client';

import Link from 'next/link';
import { FileText, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { buildJournalEntriesForPdf } from '@/lib/journal-pdf';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import {
  formatJournalEntryTitle,
  journalEntryIsVoided,
  journalVoidStatusLabelAr,
  JOURNAL_VOID_MUTED_CLASS,
  JOURNAL_VOID_ROW_CLASS,
  JOURNAL_VOID_TEXT_CLASS,
  type JournalLike,
} from '@/lib/journal-entry-display';
import { cn, formatDate, formatMoney } from '@/lib/utils';

function VoidBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold text-white shrink-0">
      <Ban className="h-3 w-3" aria-hidden />
      ملغى
    </span>
  );
}

export function TenantJournalEntryCard({
  entry,
  showPdf = true,
  showLedgerLink = true,
  compact = false,
}: {
  entry: JournalEntryRow;
  showPdf?: boolean;
  showLedgerLink?: boolean;
  compact?: boolean;
}) {
  const voided = journalEntryIsVoided(entry.status);

  return (
    <div
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border px-3 transition-colors',
        compact ? 'py-2.5' : 'py-3',
        voided
          ? JOURNAL_VOID_ROW_CLASS
          : 'border-border/70 bg-card hover:border-border/80',
      )}
      aria-label={voided ? `قيد ملغى رقم ${entry.number}` : `قيد رقم ${entry.number}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            voided
              ? 'bg-danger-soft text-danger-ink'
              : 'bg-muted',
          )}
        >
          {voided ? (
            <Ban className="h-4 w-4" aria-hidden />
          ) : (
            <FileText
              className="h-4 w-4 text-foreground"
              aria-hidden
            />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p
              className={cn(
                'font-medium truncate text-sm',
                voided && JOURNAL_VOID_TEXT_CLASS,
              )}
            >
              {formatJournalEntryTitle(entry)}
            </p>
            {voided && <VoidBadge />}
          </div>
          <p
            className={cn(
              'text-xs mt-0.5',
              voided ? JOURNAL_VOID_MUTED_CLASS : 'text-muted-foreground',
            )}
          >
            {formatDate(entry.entry_date)} · {journalVoidStatusLabelAr(entry.status)}
            {voided && ' — لا يُحسب في التحصيل'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <p
          className={cn(
            'font-bold text-sm tabular-nums',
            voided && JOURNAL_VOID_TEXT_CLASS,
          )}
        >
          {formatMoney(Number(entry.total_debit), 'LYD')}
        </p>
        {showPdf && !voided && (
          <TajMallPdfToolbar
            fileName={`قيد-${entry.number}`}
            render={async () => {
              const { JournalPDF } = await import('@/features/pdf/JournalPDF');
              const entries = await buildJournalEntriesForPdf([entry]);
              return (
                <JournalPDF
                  entries={entries}
                  periodLabel={`القيد رقم ${entry.number}`}
                />
              );
            }}
          />
        )}
        {showLedgerLink && (
          <Button
            size="sm"
            variant={voided ? 'ghost' : 'outline'}
            className={cn(
              'h-8 text-xs',
              voided && 'text-danger-ink hover:text-danger-ink hover:bg-danger-soft/80',
            )}
            asChild
          >
            <Link href={`/journals?highlight=${entry.id}`}>
              {voided ? 'سجل القيد' : 'الدفتر'}
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

/** مرجع قيد في المطالبة أو التقويم — قد يكون معكوساً أو محذوفاً من القائمة */
export function VoidedJournalLinkChip({
  journalNumber,
  journalStatus,
  deleted,
  compact,
}: {
  journalNumber?: number | null;
  journalStatus?: string | null;
  deleted?: boolean;
  compact?: boolean;
}) {
  const voided = deleted || journalEntryIsVoided(journalStatus ?? null);
  if (!voided && journalNumber == null) return null;

  const label =
    journalNumber != null
      ? `قيد #${journalNumber}`
      : 'قيد محذوف';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-medium',
        compact ? 'text-[9px]' : 'text-[10px]',
        'bg-danger-soft text-danger-ink line-through decoration-danger',
      )}
      title="تم عكس القيد أو حذفه — لا يُحسب كتحصيل"
    >
      <Ban className={cn(compact ? 'h-2.5 w-2.5' : 'h-3 w-3')} aria-hidden />
      {label} · ملغى
    </span>
  );
}
