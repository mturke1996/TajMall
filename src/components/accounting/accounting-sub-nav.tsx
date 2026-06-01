'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ACCOUNTING_NAV_ITEMS } from '@/lib/accounting-nav';
import { usePermission } from '@/lib/supabase/use-permission';
import { isNavActive } from '@/components/layout/nav-active';

export function AccountingSubNav() {
  const pathname = usePathname();
  const { can, loading } = usePermission();

  const items = ACCOUNTING_NAV_ITEMS.filter(
    (item) => !item.permission || can(item.permission),
  );

  if (loading || items.length === 0) return null;

  return (
    <nav
      className="sticky top-0 z-20 border-b border-border bg-canvas/95 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/80"
      aria-label="تنقل المحاسبة والتقارير"
    >
      <div className="relative">
        <div
          className="flex gap-1.5 overflow-x-auto px-4 py-2.5 scroll-smooth-touch scrollbar-none snap-x snap-mandatory sm:px-5 md:px-8"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {items.map((item) => {
            const active = isNavActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                className={cn(
                  'snap-center shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium touch-manipulation transition-colors min-h-11',
                  active
                    ? 'bg-sage-700 text-white border-sage-700 shadow-sm'
                    : 'bg-card text-muted-foreground border-border hover:bg-secondary active:bg-secondary',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="whitespace-nowrap">{item.labelAr}</span>
              </Link>
            );
          })}
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-canvas/95 to-transparent md:hidden"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-canvas/95 to-transparent md:hidden"
          aria-hidden
        />
      </div>
    </nav>
  );
}
