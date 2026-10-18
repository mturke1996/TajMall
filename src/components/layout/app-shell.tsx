'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './sidebar';
import { TopBar } from './topbar';
import { MobileNav } from './mobile-nav';
import { MobileBottomNav } from './mobile-bottom-nav';
import { CommandPalette } from './command-palette';
import { NewTransactionDialog } from '@/components/transactions/new-transaction-dialog';
import { AutoColdBackup } from '@/components/backup/auto-cold-backup';
import { useNotificationsRealtime } from '@/lib/db/notification-queries';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  useNotificationsRealtime();

  // Global keyboard shortcut ⌘K / Ctrl+K → open command palette
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex min-h-dvh w-full bg-background" dir="rtl">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-background px-4 py-3 text-sm font-semibold shadow-lift ring-2 ring-ring focus:not-sr-only focus:fixed focus:inset-s-3 focus:top-3 focus:z-100"
      >
        تجاوز إلى المحتوى
      </a>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onOpenMobileNav={() => setMobileOpen(true)}
          mobileNavOpen={mobileOpen}
          onOpenSearch={() => setCmdOpen(true)}
        />
        <main
          id="main-content"
          className="flex min-w-0 flex-1 flex-col pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0"
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        </main>
      </div>

      <MobileBottomNav />
      <NewTransactionDialog />
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <AutoColdBackup />
    </div>
  );
}
