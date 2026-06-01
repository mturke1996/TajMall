'use client';

import { cn } from '@/lib/utils';

/**
 * شريط إجراء سفلي للجوال — يظهر فوق شريط التنقل السفلي (h-16).
 */
export function MobilePageActionBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 z-40 border-t border-border bg-canvas/95 p-3 backdrop-blur-md',
        'shadow-[0_-4px_24px_rgba(0,0,0,0.07)] md:hidden',
        'bottom-[calc(4rem+env(safe-area-inset-bottom,0px))]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** مسافة سفلية للمحتوى عند وجود MobilePageActionBar على الجوال */
export const MOBILE_PAGE_ACTION_PADDING = 'pb-[calc(8.75rem+env(safe-area-inset-bottom,0px))] md:pb-10';
