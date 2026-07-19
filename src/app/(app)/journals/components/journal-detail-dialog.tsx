'use client';

import {
  Loader2,
  CheckCircle2,
  Clock,
  RotateCcw,
  FileText,
  Calendar,
  Hash,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatMoney, formatDate } from '@/lib/utils';
import { useJournalLines, type JournalEntryRow } from '@/lib/db/journal-queries';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { JournalSourceBadge } from './journal-source-badge';
import { JournalVoucherTable } from '@/components/accounting/journal-voucher-table';
import { JournalBalanceBadge } from '@/components/accounting/journal-balance-badge';
import { mapJournalLineRowToVoucherLine } from '@/lib/journal-entry-display';
import Link from 'next/link';

const STATUS_CONFIG = {
  POSTED: {
    label: 'مرحل',
    icon: CheckCircle2,
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
  },
  DRAFT: {
    label: 'مسودة',
    icon: Clock,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
  },
  REVERSED: {
    label: 'معكوس',
    icon: RotateCcw,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
};

export function JournalDetailDialog({
  entry,
  open,
  onClose,
}: {
  entry: JournalEntryRow;
  open: boolean;
  onClose: () => void;
}) {
  useBodyScrollLock(open);
  const { data: lines = [], isLoading } = useJournalLines(entry.id);
  const status = STATUS_CONFIG[entry.status];
  const StatusIcon = status.icon;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        className={cn(
          'absolute inset-0 flex flex-col bg-card sm:inset-x-4 sm:inset-y-auto',
          'sm:top-1/2 sm:left-1/2 sm:right-auto sm:bottom-auto sm:max-h-[90dvh] sm:w-[calc(100%-2rem)] sm:max-w-3xl',
          'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:shadow-xl',
        )}
        role="dialog"
        aria-modal
      >
        <div
          className="flex shrink-0 items-center gap-3 border-b px-4 py-3"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <FileText className="h-5 w-5 text-sage-700 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-base truncate">تفاصيل القيد #{entry.number}</h2>
            {entry.reference && (
              <p className="font-mono text-xs text-sage-800 truncate">{entry.reference}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2.5 hover:bg-secondary touch-manipulation min-h-11 min-w-11"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth-touch px-4 py-4 space-y-4">
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center shrink-0', status.bg)}>
                <StatusIcon className={cn('h-5 w-5', status.color)} />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge className={cn(status.bg, status.color, status.border)}>
                    {status.label}
                  </Badge>
                  <JournalSourceBadge entry={entry} />
                  <JournalBalanceBadge
                    debit={entry.total_debit}
                    credit={entry.total_credit}
                  />
                </div>
                <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 shrink-0" />
                    {formatDate(entry.entry_date)}
                  </span>
                  {entry.reference && (
                    <span className="inline-flex items-center gap-1.5">
                      <Hash className="h-4 w-4 shrink-0" />
                      {entry.reference}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3" dir="ltr">
              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-start">
                <p className="text-[10px] font-medium text-emerald-800">إجمالي المدين</p>
                <p className="font-mono text-lg font-bold tabular-nums text-emerald-900">
                  {formatMoney(Number(entry.total_debit), 'LYD')}
                </p>
              </div>
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-start">
                <p className="text-[10px] font-medium text-rose-800">إجمالي الدائن</p>
                <p className="font-mono text-lg font-bold tabular-nums text-rose-900">
                  {formatMoney(Number(entry.total_credit), 'LYD')}
                </p>
              </div>
            </div>

            {entry.description && (
              <div className="mt-3 border-t pt-3">
                <p className="text-xs text-muted-foreground">الوصف</p>
                <p className="mt-1 text-sm">{entry.description}</p>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden p-3 sm:p-4">
            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
              </div>
            ) : (
              <JournalVoucherTable
                lines={lines.map(mapJournalLineRowToVoucherLine)}
                totalDebit={entry.total_debit}
                totalCredit={entry.total_credit}
                density="comfortable"
              />
            )}
          </Card>
        </div>

        <div
          className="shrink-0 border-t p-4 space-y-2"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <Button variant="outline" className="w-full h-11 touch-manipulation" asChild>
            <Link href="/reports/ledger">دفتر الأستاذ العام</Link>
          </Button>
          <Button onClick={onClose} className="w-full h-12 touch-manipulation">
            إغلاق
          </Button>
        </div>
      </div>
    </div>
  );
}
