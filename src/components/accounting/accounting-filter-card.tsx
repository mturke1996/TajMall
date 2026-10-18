'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** The filter row of a report: one light card that wraps on small screens. */
export function AccountingFilterCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="p-3 sm:px-4">{children}</CardContent>
    </Card>
  );
}
