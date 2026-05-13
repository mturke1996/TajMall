'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { NAV } from './nav-items';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function MobileNav({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.2 }}
            className="fixed inset-y-0 end-0 z-50 flex w-[320px] flex-col border-s border-border bg-canvas md:hidden"
            dir="rtl"
          >
            {/* Header */}
            <div className="flex h-16 items-center gap-3 border-b border-border px-4">
              <Logo size="md" showTagline />
              <Button variant="ghost" size="icon" className="me-auto" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Nav */}
            <nav className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
              {NAV.map((section) => (
                <div key={section.titleAr} className="flex flex-col gap-0.5">
                  <span className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
                    {section.titleAr}
                  </span>
                  {section.items.map((item) => {
                    const active = pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          'flex items-center gap-3 rounded-md px-3 py-2.5 text-[14px] font-medium transition-colors',
                          active
                            ? 'bg-canvas-sunken text-foreground ring-1 ring-border'
                            : 'text-ink-mute hover:bg-secondary hover:text-foreground'
                        )}
                      >
                        <Icon className={cn('h-[17px] w-[17px]', active ? 'text-sage-700' : 'text-ink-mute')} />
                        <span>{item.labelAr}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
