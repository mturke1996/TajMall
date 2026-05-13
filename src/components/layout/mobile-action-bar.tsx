'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ArrowDownToLine, Plus, ArrowUpFromLine, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTxDialog } from '@/stores/transaction-dialog';

const NAV = [
  { href: '/dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { href: '/revenues', label: 'إيرادات', icon: ArrowDownToLine },
  { href: '/expenses', label: 'مصروفات', icon: ArrowUpFromLine },
  { href: '/cashboxes', label: 'خزائن', icon: Wallet },
];

export function MobileActionBar() {
  const pathname = usePathname();
  const openTx = useTxDialog((s) => s.open);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="relative w-full">
        <div className="relative flex items-stretch border-t border-border bg-canvas/95 backdrop-blur-md">
          {NAV.slice(0, 2).map((item) => (
            <TabLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
          ))}

          {/* زر الإضافة */}
          <div className="relative -mt-4 flex w-[68px] shrink-0 items-end justify-center pb-1">
            <button
              onClick={() => openTx('REVENUE')}
              className="grid h-[52px] w-[52px] place-items-center rounded-full bg-sage-700 text-white shadow-lg active:scale-95"
            >
              <Plus className="h-6 w-6" />
            </button>
          </div>

          {NAV.slice(2).map((item) => (
            <TabLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
          ))}
        </div>
      </div>
    </nav>
  );
}

function TabLink({ item, active }: { item: typeof NAV[0]; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium',
        active ? 'text-sage-700' : 'text-ink-mute'
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
      <span>{item.label}</span>
    </Link>
  );
}
