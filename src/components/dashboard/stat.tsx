import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatMoney } from '@/lib/utils';
import { TILE, type Accent } from '@/components/dashboard/dashboard-ui';

/** Callers name the colour by meaning; the tile uses the matching vivid accent (neutral stays grey). */
const COLOR_ACCENT: Record<string, Accent> = { emerald: 'green', rose: 'red', amber: 'amber', blue: 'blue' };

export function Stat({
  label,
  value,
  icon: Icon,
  currency,
  className,
  color = 'neutral',
  loading,
  trend,
  trendLabel,
  onClick,
  active = false,
}: {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  currency?: string;
  className?: string;
  loading?: boolean;
  trend?: number;
  trendLabel?: string;
  /** the icon tile's colour: money in (emerald), money out (rose), cash and cheques (amber), counts (blue) */
  color?: 'neutral' | 'emerald' | 'rose' | 'amber' | 'blue';
  onClick?: () => void;
  active?: boolean;
}) {

  if (loading) {
    return (
      <div className={cn('surface flex flex-col gap-3 p-4', className)}>
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
        <Skeleton className="h-7 w-32" />
      </div>
    );
  }

  const display =
    typeof value === 'number'
      ? currency
        ? formatMoney(value, currency)
        : value.toLocaleString('en-US')
      : value;

  const interactive = typeof onClick === 'function';

  const classes = cn(
    'surface flex flex-col gap-2 p-4',
    interactive && 'cursor-pointer text-start transition-colors hover:border-foreground/25 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-foreground/40',
    active && 'ring-2 ring-foreground/40 shadow-lift',
    className,
  );

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="pt-0.5 text-[12.5px] font-medium text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <span
            className={cn(
              'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
              COLOR_ACCENT[color] ? TILE[COLOR_ACCENT[color]] : 'border border-border bg-canvas-sunken text-muted-foreground',
            )}
            aria-hidden
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>

      <span className="text-xl font-semibold text-foreground tabular-nums lg:text-2xl">
        {display}
      </span>

      {trend !== undefined && (
        <div className="flex items-center gap-1 text-xs">
          <span
            className={cn(
              'font-semibold',
              trend >= 0
                ? 'text-success'
                : 'text-danger',
            )}
          >
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
          </span>
          {trendLabel && (
            <span className="text-muted-foreground">{trendLabel}</span>
          )}
        </div>
      )}
    </>
  );

  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {inner}
      </button>
    );
  }

  return <div className={classes}>{inner}</div>;
}
