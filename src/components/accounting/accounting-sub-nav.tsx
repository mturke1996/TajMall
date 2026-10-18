'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ACCOUNTING_NAV_ITEMS } from '@/lib/accounting-nav';
import { usePermission } from '@/lib/supabase/use-permission';
import { isNavActive } from '@/components/layout/nav-active';
import { useActiveInView } from '@/lib/hooks/use-active-in-view';

export function AccountingSubNav() {
  const pathname = usePathname();
  const { can, loading } = usePermission();
  const rowRef = useActiveInView<HTMLDivElement>(pathname);

  const items = ACCOUNTING_NAV_ITEMS.filter(
    (item) => !item.permission || can(item.permission),
  );

  if (loading || items.length === 0) return null;

  return (
    <nav className="sticky top-16 z-20 border-b border-border bg-canvas" aria-label="تنقل المحاسبة والتقارير">
      <div
        ref={rowRef}
        className="flex gap-1 overflow-x-auto px-4 py-2 scrollbar-none sm:px-5 md:px-8"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {items.map((item) => {
          // the reports hub is its own page here, not the parent of every report
          const active = item.href === '/reports' ? pathname === '/reports' : isNavActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium touch-manipulation transition-colors',
                active ? 'bg-foreground text-background' : 'text-ink-mute hover:bg-secondary hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">{item.labelAr}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
