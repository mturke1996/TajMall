'use client';

import Link from 'next/link';
import { Menu, Search, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
import { UserMenu } from './user-menu';
import { BRAND } from '@/lib/brand';

export function TopBar({ onOpenMobileNav }: { onOpenMobileNav?: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-canvas/95 px-3 backdrop-blur-sm">
      {/* Mobile nav button */}
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMobileNav}>
        <Menu className="h-5 w-5" />
      </Button>

      {/* Mobile brand */}
      <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-sage-700 font-bold text-white text-sm">
          {BRAND.monogram}
        </span>
      </Link>

      {/* Desktop Search */}
      <div className="hidden md:flex flex-1 items-center gap-2">
        <div className="flex h-9 flex-1 max-w-md items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-ink-mute">
          <Search className="h-4 w-4" />
          <span>البحث...</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 ms-auto">
        <NewTransactionButton variant="outline" size="sm" />
        <Button size="icon-sm" variant="ghost" className="hidden md:flex" asChild>
          <Link href="/boss" prefetch={true}>
            <Crown className="h-4 w-4" />
          </Link>
        </Button>
        <UserMenu />
      </div>
    </header>
  );
}
