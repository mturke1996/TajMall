import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatMoney } from '@/lib/utils';

export function Stat({
  label,
  value,
  icon: Icon,
  currency,
  className,
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
  /** Kept for existing callers; icons are neutral so colour only marks figures that carry meaning. */
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
        ? formatMoney(value, currency, { compact: value >= 100_000 })
        : value.toLocaleString('en-US')
      : value;

  const interactive = typeof onClick === 'function';

  const classes = cn(
    'surface flex flex-col gap-2 p-4',
    interactive && 'cursor-pointer text-start transition-all duration-200 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40',
    active && 'ring-2 ring-foreground/40 shadow-lift',
    className,
  );

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <span
            className={cn(
              'grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-canvas-sunken text-muted-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>

      <span className="text-xl font-semibold text-foreground tabular-nums sm:text-2xl">
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
