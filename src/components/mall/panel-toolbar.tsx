'use client';

import { cn } from '@/lib/utils';

export function MallPanelToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-4 flex flex-wrap items-center justify-end gap-2',
        className,
      )}
    >
      {children}
    </div>
  );
}
