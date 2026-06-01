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
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatMoney, formatDate } from '@/lib/utils';
import { useJournalLines, type JournalEntryRow } from '@/lib/db/journal-queries';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { JournalSourceBadge } from './journal-source-badge';
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
  const isBalanced = Number(entry.total_debit) === Number(entry.total_credit);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        className={cn(
          'absolute inset-0 flex flex-col bg-card sm:inset-x-4 sm:inset-y-auto',
          'sm:top-1/2 sm:left-1/2 sm:right-auto sm:bottom-auto sm:max-h-[90dvh] sm:w-[calc(100%-2rem)] sm:max-w-2xl',
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
                  {!isBalanced && <Badge variant="danger">غير متوازن</Badge>}
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
            <div className="mt-4 pt-3 border-t">
              <p className="text-xs text-muted-foreground">إجمالي القيد</p>
              <p className="text-2xl font-bold text-sage-700">
                {formatMoney(Number(entry.total_debit), 'LYD')}
              </p>
            </div>
            {entry.description && (
              <div className="mt-3 pt-3 border-t">
                <Label className="text-xs text-muted-foreground">الوصف</Label>
                <p className="text-sm mt-1">{entry.description}</p>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="px-4 py-2.5 border-b bg-muted/30 text-sm font-medium">
              البنود ({entry.line_count})
            </div>
            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
              </div>
            ) : lines.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">لا توجد بنود</p>
            ) : (
              <div className="divide-y">
                {lines.map((line) => (
                  <div key={line.id} className="p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: line.category_color || '#ccc' }}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{line.category_name}</p>
                        {line.category_code && (
                          <p className="text-[11px] text-muted-foreground">{line.category_code}</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-lg bg-green-50 px-3 py-2">
                        <span className="text-[10px] text-green-800">مدين</span>
                        <p className="font-semibold text-green-700">
                          {Number(line.debit) > 0
                            ? formatMoney(Number(line.debit), 'LYD')
                            : '—'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-red-50 px-3 py-2">
                        <span className="text-[10px] text-red-800">دائن</span>
                        <p className="font-semibold text-red-700">
                          {Number(line.credit) > 0
                            ? formatMoney(Number(line.credit), 'LYD')
                            : '—'}
                        </p>
                      </div>
                    </div>
                    {(line.contact_name || line.cashbox_name_ar) && (
                      <p className="text-xs text-muted-foreground">
                        {[line.contact_name, line.cashbox_name_ar].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {line.description && (
                      <p className="text-xs text-muted-foreground border-t pt-2">{line.description}</p>
                    )}
                  </div>
                ))}
                <div className="p-4 bg-muted/20 grid grid-cols-2 gap-2 text-sm font-bold border-t-2">
                  <span className="text-green-700">
                    {formatMoney(Number(entry.total_debit), 'LYD')}
                  </span>
                  <span className="text-red-700">
                    {formatMoney(Number(entry.total_credit), 'LYD')}
                  </span>
                </div>
              </div>
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
