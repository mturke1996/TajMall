'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Shown instead of a rent account that could not be loaded. A failed load leaves the lists empty, and an
 * empty list reads as "nothing charged, nothing owed", so figures built from it would be wrong, not blank.
 */
export function RentAccountFailed({ onRetry, className }: { onRetry: () => void; className?: string }) {
  return (
    <div
      role="alert"
      className={cn('flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-[13px] text-danger-ink', className)}
    >
      <p>تعذّر تحميل المطالبات، فالأرقام غير مكتملة ولا يصح الاعتماد عليها.</p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        إعادة المحاولة
      </Button>
    </div>
  );
}
