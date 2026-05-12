'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ArrowDownToLine,
  Plus,
  ArrowUpFromLine,
  FileBarChart,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTxDialog } from '@/stores/transaction-dialog';

/**
 * Mobile bottom action bar.
 *
 * - Visible only on small screens (md:hidden).
 * - Five quick destinations + a central elevated CTA.
 * - Respects iOS safe-area-inset-bottom.
 * - Sits above content but never above modals (z-30).
 */

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const NAV: Item[] = [
  { href: '/dashboard',  label: 'الرئيسية',  icon: LayoutDashboard },
  { href: '/revenues',   label: 'إيرادات',   icon: ArrowDownToLine },
  { href: '/expenses',   label: 'مصروفات',   icon: ArrowUpFromLine },
  { href: '/reports/trial-balance', label: 'التقارير', icon: FileBarChart },
];

export function MobileActionBar() {
  const pathname = usePathname();
  const openTx = useTxDialog((s) => s.open);

  return (
    <nav
      aria-label="القائمة السفلية"
      className="
        pointer-events-auto fixed inset-x-0 bottom-0 z-30
        flex items-end justify-center
        md:hidden
      "
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
    >
      <div className="relative w-full">
        {/* Soft top gradient (no harsh shadow) */}
        <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-canvas to-transparent" />

        <div className="relative flex items-stretch border-t border-border bg-canvas/95 backdrop-blur-md">
          {NAV.slice(0, 2).map((item) => (
            <TabLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}

          {/* Center primary CTA */}
          <div className="relative -mt-5 flex w-[68px] shrink-0 items-end justify-center pb-1.5">
            <button
              type="button"
              onClick={() => openTx('REVENUE')}
              className="
                press grid h-[52px] w-[52px] place-items-center rounded-full
                bg-sage-700 text-sand-50 ring-1 ring-sage-800/40
                transition-transform duration-200 ease-out-quint
                active:scale-95
              "
              aria-label="إضافة معاملة"
            >
              <Plus className="h-5 w-5 stroke-[1.8]" />
            </button>
          </div>

          {NAV.slice(2).map((item) => (
            <TabLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </div>
      </div>
    </nav>
  );
}

function isActive(path: string, href: string): boolean {
  if (href === '/dashboard') return path === '/dashboard';
  return path.startsWith(href);
}

function TabLink({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        'press relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium',
        'transition-colors duration-200 ease-out-quint',
        active ? 'text-sage-700' : 'text-ink-mute hover:text-foreground',
      )}
    >
      <Icon
        className={cn(
          'h-[18px] w-[18px] stroke-[1.6] transition-transform duration-200',
          active && 'scale-105',
        )}
      />
      <span className="tracking-tight">{item.label}</span>
      {active && (
        <span className="absolute top-0 h-[2px] w-8 rounded-b-full bg-sage-700" />
      )}
    </Link>
  );
}
