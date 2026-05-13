'use client';

import { useState } from 'react';
import { Sidebar } from './sidebar';
import { TopBar } from './topbar';
import { MobileNav } from './mobile-nav';
import { MobileActionBar } from './mobile-action-bar';
import { PageTransition } from './page-transition';
import { NewTransactionDialog } from '@/components/transactions/new-transaction-dialog';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-[100dvh] bg-background" dir="rtl">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="flex min-w-0 flex-1 flex-col pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      <MobileActionBar />
      <NewTransactionDialog />
    </div>
  );
}
