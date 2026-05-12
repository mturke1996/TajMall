'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronsLeft } from 'lucide-react';
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

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-[100dvh] shrink-0 flex-col border-e border-border bg-canvas md:flex',
        'transition-[width] duration-300 ease-out-expo',
        collapsed ? 'w-[72px]' : 'w-[256px]',
        className,
      )}
      dir="rtl"
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        {collapsed ? (
          <Logo size="sm" />
        ) : (
          <Logo size="md" showTagline />
        )}
        {onToggle && (
          <button
            onClick={onToggle}
            className={cn(
              'me-auto rounded-md p-1.5 text-ink-mute hover:bg-secondary hover:text-foreground press transition-colors duration-150',
              collapsed && 'me-0 mx-auto',
            )}
            aria-label="Toggle sidebar"
          >
            <ChevronsLeft
              className={cn(
                'h-4 w-4 stroke-[1.5] transition-transform duration-300 ease-out-expo',
                collapsed && 'rotate-180',
              )}
            />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4 no-scrollbar">
        {NAV.map((section) => (
          <div key={section.titleAr} className="flex flex-col gap-0.5">
            <span
              className={cn(
                'px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute',
                collapsed && 'sr-only',
              )}
            >
              {section.titleAr}
            </span>
            {section.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors duration-150',
                    active
                      ? 'text-foreground'
                      : 'text-ink-mute hover:text-foreground hover:bg-secondary',
                  )}
                  title={collapsed ? item.labelAr : undefined}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      transition={{ type: 'spring', stiffness: 400, damping: 36 }}
                      className="absolute inset-0 -z-10 rounded-md bg-canvas-sunken ring-1 ring-border"
                    />
                  )}
                  <Icon
                    className={cn(
                      'h-[16px] w-[16px] shrink-0 stroke-[1.5] transition-colors',
                      active ? 'text-sage-700' : 'text-ink-mute group-hover:text-foreground',
                    )}
                  />
                  <span
                    className={cn(
                      'flex-1 truncate transition-opacity',
                      collapsed && 'pointer-events-none opacity-0',
                    )}
                  >
                    {item.labelAr}
                  </span>
                  {!collapsed && item.shortcut && (
                    <kbd className="kbd hidden lg:inline-flex">{item.shortcut}</kbd>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Profile pill */}
      <div className="border-t border-border p-3">
        <SidebarProfile collapsed={collapsed} />
      </div>
    </aside>
  );
}
