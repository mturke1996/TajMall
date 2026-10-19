import { ACCENT_FILL } from '@/components/people/people-theme';
import type { Accent } from '@/components/dashboard/dashboard-ui';
import { cn, formatMoney } from '@/lib/utils';

export type BarPoint = { label: string; value: number };

/**
 * Twelve small bars with no axis: the shape of a year at a glance. The last bar is the current month and is
 * drawn solid. Each bar has the exact figure in its tooltip and the whole row is read out as a list.
 */
export function MiniBars({
  points,
  accent = 'green',
  title,
  format = (n) => formatMoney(n, 'LYD'),
  height = 36,
  className,
}: {
  points: readonly BarPoint[];
  accent?: Accent;
  /** what the bars are, for the accessible name: «المدفوع آخر 12 شهراً» */
  title: string;
  format?: (n: number) => string;
  height?: number;
  className?: string;
}) {
  const max = Math.max(0, ...points.map((p) => (Number.isFinite(p.value) ? p.value : 0)));
  const last = points.length - 1;
  return (
    <div
      dir="ltr"
      role="img"
      aria-label={`${title}: ${points.map((p) => `${p.label} ${format(p.value)}`).join('، ')}`}
      className={cn('flex items-end gap-[3px]', className)}
      style={{ height }}
    >
      {points.map((p, i) => {
        const v = Number.isFinite(p.value) ? Math.max(0, p.value) : 0;
        const h = v === 0 || max === 0 ? 3 : Math.max(5, Math.round((v / max) * height));
        return (
          <span
            key={`${p.label}-${i}`}
            title={`${p.label}: ${format(v)}`}
            className={cn('min-w-0 flex-1 rounded-[3px]', v === 0 ? 'bg-border' : ACCENT_FILL[accent], v > 0 && i !== last && 'opacity-55')}
            style={{ height: h }}
          />
        );
      })}
    </div>
  );
}
