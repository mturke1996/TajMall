'use client';

import Link from 'next/link';
import { Bell, Menu, Search, Shield, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
import { UserMenu } from './user-menu';
import { BrandGlyph } from '@/components/brand/logo';
import { useEffect, useState } from 'react';
import { usePermission } from '@/lib/supabase/use-permission';
import { useUnreadNotificationCount } from '@/lib/db/notification-queries';
import { Badge } from '@/components/ui/badge';

function NotificationBell() {
  const { data: unread = 0 } = useUnreadNotificationCount();

  return (
    <Button size="icon-sm" variant="ghost" className="relative" asChild>
      <Link href="/notifications" prefetch aria-label="الإشعارات">
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-8 w-8" />;

  return (
    <Button
      size="icon-sm"
      variant="ghost"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label="تبديل المظهر"
      className="hidden md:flex"
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4 text-amber-400" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}

export function TopBar({
  onOpenMobileNav,
  onOpenSearch,
}: {
  onOpenMobileNav?: () => void;
  onOpenSearch?: () => void;
}) {
  const { isViewer, loading: permLoading, can } = usePermission();

  return (
    <header
      className="sticky top-0 z-30 flex min-h-16 shrink-0 items-center gap-2 border-b border-border bg-canvas/95 px-3 backdrop-blur-sm"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 8px)',
        paddingBottom: '8px',
      }}
    >
      {/* Mobile nav button */}
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMobileNav}>
        <Menu className="h-5 w-5" />
      </Button>

      {/* Mobile brand */}
      <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
        <BrandGlyph size={28} />
      </Link>

      {/* Desktop Search — clickable, opens command palette */}
      <div className="hidden md:flex flex-1 items-center gap-2">
        <button
          onClick={onOpenSearch}
          className="flex h-9 flex-1 max-w-sm items-center gap-2 rounded-md border border-border bg-canvas-sunken px-3 text-sm text-ink-mute hover:border-ring/40 hover:bg-card transition-colors duration-150 cursor-text"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-start">البحث في النظام…</span>
          <span className="hidden lg:flex items-center gap-1">
            <kbd className="kbd">⌘</kbd>
            <kbd className="kbd">K</kbd>
          </span>
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 ms-auto">
        {!permLoading && isViewer && (
          <Badge variant="outline" className="hidden text-[10px] sm:inline-flex">
            قراءة فقط
          </Badge>
        )}
        <NewTransactionButton variant="outline" size="sm" />
        <NotificationBell />
        <ThemeToggle />
        {can('org.users') && (
          <Button size="icon-sm" variant="ghost" className="hidden md:flex" asChild>
            <Link href="/users" prefetch={true} aria-label="المستخدمون والصلاحيات">
              <Shield className="h-4 w-4" />
            </Link>
          </Button>
        )}
        <UserMenu />
      </div>
    </header>
  );
}
