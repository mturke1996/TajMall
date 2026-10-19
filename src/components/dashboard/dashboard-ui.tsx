import type { ElementType } from 'react';
import { cn } from '@/lib/utils';

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
