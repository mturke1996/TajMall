import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** The shape of a party page while the contact loads: header, four figures, tabs, a block. */
export function ProfileSkeleton() {
  return (
    <div role="status" aria-label="جارٍ تحميل الملف" className="flex min-w-0 flex-col gap-4 sm:gap-5">
      <Card className="p-4 sm:p-6">
        <Skeleton className="mb-4 h-4 w-20" />
        <div className="flex items-start gap-4">
          <Skeleton className="h-14 w-14 shrink-0 rounded-2xl sm:h-16 sm:w-16" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton className="h-6 w-2/3 max-w-xs" />
            <Skeleton className="h-4 w-1/2 max-w-[14rem]" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-10 rounded-xl" />
            </div>
            <Skeleton className="mt-3 h-7 w-28 max-w-full" />
            <Skeleton className="mt-2 h-4 w-20 max-w-full" />
          </Card>
        ))}
      </div>
      <Skeleton className="h-12 w-full rounded-xl sm:w-96" />
      <Card className="p-4 sm:p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-4 h-48 w-full" />
      </Card>
    </div>
  );
}
