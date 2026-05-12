'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Editorial page header.
 *
 * Mobile-first sizing:
 *   - eyebrow stays at 10.5px (already small)
 *   - title scales 22 → 28 → 32 across breakpoints
 *   - description hidden on the very smallest screens (< 360px)
 *   - actions row scrolls horizontally with a thin fade when overflow
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'flex flex-col gap-4 border-b border-border bg-canvas',
        'px-4 pb-5 pt-7 md:px-8 md:pb-8 md:pt-10',
        'md:flex-row md:items-end md:justify-between md:gap-6',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow && <span className="eyebrow w-fit">{eyebrow}</span>}
        <h1 className="text-balance text-[22px] font-semibold leading-[1.15] tracking-tightest text-foreground sm:text-[26px] md:text-[30px] lg:text-[32px]">
          {title}
        </h1>
        {description && (
          <p className="hidden max-w-2xl text-[13px] leading-[1.55] text-ink-mute sm:block md:text-[14px]">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div
          className="
            -mx-4 flex shrink-0 items-center gap-2 overflow-x-auto px-4
            no-scrollbar
            md:mx-0 md:flex-wrap md:overflow-visible md:px-0
          "
        >
          {actions}
        </div>
      )}
    </motion.div>
  );
}
