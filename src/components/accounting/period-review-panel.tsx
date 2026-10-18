'use client';

import Link from 'next/link';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { usePeriodReview } from '@/lib/db/period-review-queries';
import { friendlyError } from '@/lib/user-messages';
import { arabicCount, cn } from '@/lib/utils';

/** The pre-close checklist for one period: what to fix while it can still be changed. */
export function PeriodReviewPanel({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data: checks, isLoading, isError, error } = usePeriodReview(startDate, endDate, true);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-[13px] text-ink-mute">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        جارٍ مراجعة حركات الفترة…
      </div>
    );
  }
  if (isError || !checks) {
    return <p className="py-3 text-[13px] text-danger-ink">{friendlyError(error, 'تعذّرت المراجعة. أعد المحاولة.')}</p>;
  }

  const open = checks.filter((c) => c.status === 'warn').length;
  return (
    <section aria-label="مراجعة قبل الإقفال" className="flex flex-col gap-2">
      <p className={cn('px-1 text-[12.5px] font-medium', open ? 'text-warning-ink' : 'text-success-ink')}>
        {open
          ? `${arabicCount(open, ['ملاحظة واحدة', 'ملاحظتان', 'ملاحظات', 'ملاحظة'])} قبل الإقفال`
          : 'لا ملاحظات — الفترة جاهزة للإقفال'}
      </p>
      <ul className="surface divide-y divide-border overflow-hidden">
        {checks.map((c) => {
          const body = (
            <>
              <span
                className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', c.status === 'warn' ? 'bg-warning' : 'bg-success')}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium text-foreground">
                  {c.title}
                  <span className="sr-only">{c.status === 'warn' ? ' — يحتاج مراجعة' : ' — سليم'}</span>
                </span>
                <span className="block text-[12.5px] leading-relaxed text-ink-mute">{c.detail}</span>
              </span>
              {c.href && <ChevronLeft className="mt-1 h-4 w-4 shrink-0 text-ink-mute" aria-hidden />}
            </>
          );
          return (
            <li key={c.key}>
              {c.href ? (
                <Link href={c.href} className="flex items-start gap-3 px-4 py-3 hover:bg-canvas-sunken/60">
                  {body}
                </Link>
              ) : (
                <div className="flex items-start gap-3 px-4 py-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
