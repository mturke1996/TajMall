import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export const DEFAULT_ERROR_TEXT = 'تعذّر تحميل البيانات. أعد المحاولة، وإن تكرر الخطأ أبلغ مسؤول النظام.';

/** Grey bars where the content will be. */
export function LoadingBlock({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3 p-4 sm:p-5', className)} role="status" aria-label="جارٍ التحميل">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn('h-10 w-full', i === rows - 1 && rows > 1 && 'w-2/3')} />
      ))}
    </div>
  );
}

/** One sentence and at most one action. */
export function EmptyBlock({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}>
      <p className="max-w-sm text-[13.5px] text-ink-mute">{children}</p>
      {action}
    </div>
  );
}

/** A failed load is never drawn as empty or zero: it says so and offers a retry. */
export function ErrorBlock({ message = DEFAULT_ERROR_TEXT, onRetry, className }: { message?: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}>
      <p className="max-w-sm text-[13.5px] text-danger-ink">{message}</p>
      {onRetry && (
        <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}
