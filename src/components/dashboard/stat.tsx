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
  color = 'neutral',
}: {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  currency?: string;
  className?: string;
  loading?: boolean;
  trend?: number;
  trendLabel?: string;
  color?: 'neutral' | 'emerald' | 'rose' | 'amber' | 'blue';
}) {
  const iconColors: Record<string, string> = {
    neutral: 'bg-canvas-sunken text-muted-foreground',
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    rose:    'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
    amber:   'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    blue:    'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  };

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

  return (
    <div
      className={cn(
        'surface flex flex-col gap-2 p-4 transition-all duration-200 hover:shadow-lift',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <span
            className={cn(
              'grid h-8 w-8 shrink-0 place-items-center rounded-md',
              iconColors[color],
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>

      <span className="text-xl font-bold tracking-tight text-foreground tabular-nums sm:text-2xl">
        {display}
      </span>

      {trend !== undefined && (
        <div className="flex items-center gap-1 text-xs">
          <span
            className={cn(
              'font-semibold',
              trend >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400',
            )}
          >
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
          </span>
          {trendLabel && (
            <span className="text-muted-foreground">{trendLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
