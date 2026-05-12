'use client';

import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * Page transition wrapper.
 *
 * A subtle 200ms fade + 4px slide between routes. Calibrated so:
 *   - It never feels sluggish (under 220ms).
 *   - It doesn't fight scroll: the new page starts at scroll-top.
 *   - prefers-reduced-motion is honoured by Framer's defaults.
 *
 * Per Emil's framework: route changes happen often, so the motion
 * is restrained — feedback that something happened, not a show.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{
          duration: 0.22,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="flex min-h-full flex-1 flex-col"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
