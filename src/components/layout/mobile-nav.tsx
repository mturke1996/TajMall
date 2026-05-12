'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useDragControls, type PanInfo } from 'framer-motion';
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
  const dragControls = useDragControls();

  /**
   * Velocity-aware swipe-to-close: if the user swipes towards the right
   * (RTL: outward) fast enough, dismiss regardless of distance.
   */
  function handleDragEnd(_: unknown, info: PanInfo) {
    const { offset, velocity } = info;
    const dismiss = offset.x > 80 || velocity.x > 280;
    if (dismiss) onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px] md:hidden"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            drag="x"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.18 }}
            onDragEnd={handleDragEnd}
            className="
              fixed inset-y-0 end-0 z-50 flex w-[320px] max-w-[88vw] flex-col
              border-s border-border bg-canvas md:hidden
            "
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
            dir="rtl"
          >
            {/* Drag handle / header */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="flex h-16 cursor-grab items-center gap-3 border-b border-border px-4 active:cursor-grabbing"
            >
              <Logo size="md" showTagline />
              <Button
                variant="ghost"
                size="icon"
                className="me-auto"
                onClick={onClose}
                aria-label="إغلاق القائمة"
              >
                <X className="stroke-[1.5]" />
              </Button>
            </div>

            {/* Soft grab affordance */}
            <div className="flex justify-center pt-2">
              <div className="h-1 w-10 rounded-full bg-border" />
            </div>

            <nav
              className="flex flex-1 flex-col gap-5 overflow-y-auto p-3 no-scrollbar"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
            >
              {NAV.map((section) => (
                <div key={section.titleAr} className="flex flex-col gap-0.5">
                  <span className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
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
                        onClick={onClose}
                        className={cn(
                          'press flex items-center gap-3 rounded-md px-3 py-2.5 text-[13.5px] font-medium',
                          'transition-colors duration-150 ease-out-quint',
                          active
                            ? 'bg-canvas-sunken text-foreground ring-1 ring-border'
                            : 'text-ink-mute hover:bg-secondary hover:text-foreground active:bg-secondary',
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-[17px] w-[17px] stroke-[1.5]',
                            active ? 'text-sage-700' : 'text-ink-mute',
                          )}
                        />
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
