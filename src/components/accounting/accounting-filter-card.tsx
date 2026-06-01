'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** بطاقة فلاتر بعرض كامل — تمنع تداخل العناصر على الشاشات الصغيرة */
export function AccountingFilterCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="p-4 sm:p-5">{children}</CardContent>
    </Card>
  );
}
