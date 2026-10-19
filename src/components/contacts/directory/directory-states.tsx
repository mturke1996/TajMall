import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyBlock, ErrorBlock } from '@/components/people';

/** Shaped like the real rows: the table on a wide screen, the cards below it. */
export function DirectorySkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="جارٍ تحميل القائمة">
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card xl:block" aria-hidden>
        <div className="h-[41px] border-b border-border bg-canvas-sunken" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-6 border-b border-border px-4 py-3.5 last:border-b-0">
            <div className="flex w-[31%] items-center gap-3">
              <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
            <Skeleton className="h-4 w-[13%]" />
            <Skeleton className="h-9 w-[12%]" />
            <Skeleton className="h-9 w-[18%]" />
            <Skeleton className="ms-auto h-9 w-[10%]" />
          </div>
        ))}
      </div>
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:hidden" aria-hidden>
        {Array.from({ length: Math.min(rows, 4) }, (_, i) => (
          <li key={i}>
            <Card className="flex flex-col gap-3.5 p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 border-t border-border pt-3.5">
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
              </div>
              <div className="flex gap-2 border-t border-border pt-3.5">
                <Skeleton className="h-11 flex-1" />
                <Skeleton className="h-11 w-11" />
                <Skeleton className="h-11 w-11" />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Nothing in the list at all: one sentence and, for people who may add, the one action. */
export function DirectoryEmpty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <Card className="px-4 py-6">
      <EmptyBlock action={action}>{children}</EmptyBlock>
    </Card>
  );
}

/** The files could not be read: said so, with a retry. Never drawn as an empty list. */
export function DirectoryError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="border-danger-line bg-danger-soft px-4 py-6">
      <ErrorBlock message="تعذّر تحميل القائمة. تحقق من الاتصال ثم أعد المحاولة." onRetry={onRetry} />
    </Card>
  );
}

/** The search or filter matched nothing: the one action clears it. */
export function DirectoryNoMatch({ onClear, searching }: { onClear: () => void; /** a search was typed, not only a role chosen */ searching: boolean }) {
  return (
    <Card className="px-4 py-6">
      <EmptyBlock
        action={
          <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={onClear}>
            {searching ? 'مسح البحث والتصفية' : 'عرض الكل'}
          </Button>
        }
      >
        {searching ? 'لا يوجد ما يطابق البحث.' : 'لا توجد جهات بهذه الصفة.'}
      </EmptyBlock>
    </Card>
  );
}
