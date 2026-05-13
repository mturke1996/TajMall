'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NAV } from './nav-items';
import { Logo } from '@/components/brand/logo';
import { SidebarProfile } from './sidebar-profile';
import { cn } from '@/lib/utils';

export function Sidebar({
  collapsed,
  onToggle,
  className,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <aside
        className={cn(
          'sticky top-0 hidden h-[100dvh] shrink-0 flex-col border-e border-border bg-canvas md:flex',
          collapsed ? 'w-[72px]' : 'w-[256px]',
          className,
        )}
        dir="rtl"
      />
    );
  }

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-[100dvh] shrink-0 flex-col border-e border-border bg-canvas md:flex',
        'transition-[width] duration-200 ease-out',
        collapsed ? 'w-[72px]' : 'w-[256px]',
        className,
      )}
      dir="rtl"
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        {collapsed ? <Logo size="sm" /> : <Logo size="md" showTagline />}
        {onToggle && (
          <button
            onClick={onToggle}
            className={cn(
              'me-auto rounded-md p-1.5 text-ink-mute hover:bg-secondary transition-colors',
              collapsed && 'me-0 mx-auto'
            )}
          >
            <svg
              className={cn('h-4 w-4 transition-transform duration-200', collapsed && 'rotate-180')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Nav - Fast links with prefetch */}
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
        {NAV.map((section) => (
          <div key={section.titleAr} className="flex flex-col gap-0.5">
            <span className={cn(
              'px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute',
              collapsed && 'sr-only'
            )}>
              {section.titleAr}
            </span>
            {section.items.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  className={cn(
                    'group flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-all duration-150',
                    active 
                      ? 'bg-canvas-sunken text-foreground ring-1 ring-border' 
                      : 'text-ink-mute hover:text-foreground hover:bg-secondary'
                  )}
                  title={collapsed ? item.labelAr : undefined}
                >
                  <Icon className={cn('h-4 w-4 shrink-0 transition-colors', active ? 'text-sage-700' : 'text-ink-mute group-hover:text-sage-600')} />
                  <span className={cn('flex-1 truncate transition-opacity', collapsed && 'opacity-0 pointer-events-none w-0')}>
                    {item.labelAr}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Profile */}
      <div className="border-t border-border p-3">
        <SidebarProfile collapsed={collapsed} />
      </div>
    </aside>
  );
}
