'use client';

import { useEffect, useState } from 'react';
import { Bell, Menu, Search, Command as CommandIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CommandPalette } from './command-palette';
import { UserMenu } from './user-menu';
import { BRAND } from '@/lib/brand';

export function TopBar({ onOpenMobileNav }: { onOpenMobileNav?: () => void }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((s) => !s);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <header
        className="
          sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2.5
          border-b border-border bg-canvas/85 px-3 backdrop-blur-md
          sm:gap-3 sm:px-4 md:px-6
        "
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Mobile nav button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onOpenMobileNav}
          aria-label="فتح القائمة"
        >
          <Menu className="stroke-[1.5]" />
        </Button>

        {/* Mobile brand mark (shown only on small screens) */}
        <div className="flex items-center gap-2 md:hidden">
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-md bg-sage-700 text-[14px] font-bold text-sand-50"
          >
            {BRAND.monogram}
          </span>
        </div>

        {/* Search trigger — collapses to icon on the smallest screens */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="
            group ms-auto flex h-10 items-center gap-2 rounded-md border border-border
            bg-card px-3 text-[13px] text-ink-mute
            transition-colors duration-200
            hover:border-sage-300 hover:text-foreground
            focus-visible:outline-none focus-visible:shadow-focus
            md:ms-0 md:h-9 md:max-w-[420px] md:flex-1
          "
          aria-label="فتح البحث"
        >
          <Search className="h-4 w-4 stroke-[1.5] transition-colors group-hover:text-sage-700" />
          <span className="hidden flex-1 text-start sm:inline">ابحث، استدعِ أمراً…</span>
          <kbd className="kbd hidden items-center gap-0.5 sm:inline-flex">
            <CommandIcon className="h-3 w-3 stroke-[1.5]" />K
          </kbd>
        </button>

        <div className="ms-auto flex items-center gap-1 sm:gap-1.5">
          <NewTransactionButton
            variant="outline"
            size="sm"
            className="hidden lg:inline-flex"
          />

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="الإشعارات">
                <Bell className="stroke-[1.5]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[280px] sm:w-[300px]">
              <DropdownMenuLabel>الإشعارات</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2.5 py-6 text-center text-[12.5px] text-ink-mute">
                لا توجد إشعارات بعد
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User menu */}
          <UserMenu />
        </div>
      </header>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
