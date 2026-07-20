'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './sidebar';
import { TopBar } from './topbar';
import { MobileNav } from './mobile-nav';
import { MobileBottomNav } from './mobile-bottom-nav';
import { PageTransition } from './page-transition';
import { CommandPalette } from './command-palette';
import { NewTransactionDialog } from '@/components/transactions/new-transaction-dialog';
import { AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { NAV } from './nav-items';
import { AppDataBootstrap } from './app-data-bootstrap';
import { AutoColdBackup } from '@/components/backup/auto-cold-backup';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const router = useRouter();

  // Prefetch all application pages in the background on initial mount to make navigation instant
  useEffect(() => {
    const timer = setTimeout(() => {
      const hrefs = NAV.flatMap((section) => section.items.map((item) => item.href));
      hrefs.forEach((href) => {
        try {
          router.prefetch(href);
        } catch (err) {
          console.warn(`Failed to prefetch ${href}:`, err);
        }
      });
    }, 1200); // 1.2s delay to avoid blocking critical initial rendering
    return () => clearTimeout(timer);
  }, [router]);

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
    <div className="flex min-h-[100dvh] bg-background" dir="rtl">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <AnimatePresence>
        {mobileOpen && (
          <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onOpenMobileNav={() => setMobileOpen(true)}
          onOpenSearch={() => setCmdOpen(true)}
        />
        <main className="flex min-w-0 flex-1 flex-col pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">
          <AppDataBootstrap>
            <PageTransition>{children}</PageTransition>
          </AppDataBootstrap>
        </main>
      </div>

      <MobileBottomNav />
      <NewTransactionDialog />
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <AutoColdBackup />
    </div>
  );
}
