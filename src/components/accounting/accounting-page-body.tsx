'use client';

import { cn } from '@/lib/utils';

/** حاوية محتوى موحّدة لصفحات المحاسبة — هوامش آمنة للهاتف */
export function AccountingPageBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-7xl space-y-4 px-4 py-4 sm:space-y-5 sm:px-5 sm:py-5 md:px-8 md:py-6',
        className,
      )}
    >
      {children}
    </div>
  );
}
