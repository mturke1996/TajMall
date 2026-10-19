'use client';

import { useState, type ElementType } from 'react';
import { cn, formatMoney } from '@/lib/utils';

/** The vivid accents (globals.css): a tinted tile for icons, the plain colour for chart series. */
export type Accent = 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'teal';

export const TILE: Record<Accent, string> = {
  green: 'bg-chart-green/15 text-chart-green',
  red: 'bg-chart-red/15 text-chart-red',
  amber: 'bg-chart-amber/15 text-chart-amber',
  blue: 'bg-chart-blue/15 text-chart-blue',
  violet: 'bg-chart-violet/15 text-chart-violet',
  teal: 'bg-chart-teal/15 text-chart-teal',
};

/** for SVG fills and inline styles, where a Tailwind class cannot reach */
export const ACCENT_VAR: Record<Accent, string> = {
  green: 'hsl(var(--chart-green))',
  red: 'hsl(var(--chart-red))',
  amber: 'hsl(var(--chart-amber))',
  blue: 'hsl(var(--chart-blue))',
  violet: 'hsl(var(--chart-violet))',
  teal: 'hsl(var(--chart-teal))',
};

export function IconTile({ icon: Icon, accent, className }: { icon: ElementType; accent: Accent; className?: string }) {
  return (
    <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', TILE[accent], className)} aria-hidden>
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

/** From this size a figure is abbreviated on a phone (1.2M); smaller ones already fit a two-column card. */
const PHONE_ABBREVIATE_FROM = 1_000_000;

/**
 * A money figure for a card. On a desktop or tablet it is always exact. On a phone a figure of a million
 * or more is abbreviated (1.2M د.ل) and tapping the card shows it in full with separators; tapping again
 * folds it back. The button stretches over the whole card (the card must be `relative`), so any tap on the
 * card works, and screen readers get the exact figure as the name.
 */
export function PhoneMoney({ value, className }: { value: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const full = formatMoney(value, 'LYD');
  if (!Number.isFinite(value) || Math.abs(value) < PHONE_ABBREVIATE_FROM) return <span className={className}>{full}</span>;
  return (
    <>
      <span className={cn('hidden sm:inline', className)}>{full}</span>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${full}، اضغط لتبديل عرض الرقم كاملاً أو مختصراً`}
        onClick={() => setOpen((o) => !o)}
        className={cn('text-start after:absolute after:inset-0 after:content-[\'\'] sm:hidden', open && 'text-[0.8em]', className)}
      >
        {open ? full : formatMoney(value, 'LYD', { compact: true })}
      </button>
    </>
  );
}
