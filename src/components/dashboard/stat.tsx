import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn, formatMoney, formatPercent } from '@/lib/utils';

/**
 * Editorial stat card.
 * Flat surface, hairline border, monumental tabular numeral,
 * optional delta chip. No gradient halos, no glow.
 *
 * Mobile sizing:
 *   - Padding reduces from 5 (md) to 4 (sm)
 *   - Value scales 22 → 28 across breakpoints (was fixed 28)
 *   - Hint truncates instead of wrapping
 *
 * Server-renderable on purpose — uses CSS entry animation so we can accept
 * a LucideIcon prop from Server Components.
 */
export function Stat({
  label,
  value,
  delta,
  icon: Icon,
  currency,
  unit,
  hint,
  loading,
  className,
}: {
  label: string;
  value: number | string | null | undefined;
  delta?: number;
  icon?: LucideIcon;
  currency?: string;
  unit?: string;
  hint?: string;
  loading?: boolean;
  className?: string;
}) {
  const positive = (delta ?? 0) >= 0;
  const hasValue = value !== null && value !== undefined && value !== '';

  const display =
    !hasValue
      ? '—'
      : typeof value === 'number'
        ? currency
          ? formatMoney(value, currency)
          : value.toLocaleString('en-US')
        : value;

  return (
    <div
      className={cn(
        'animate-fade-up surface flex flex-col gap-3 p-4 transition-shadow duration-200 hover:shadow-whisper sm:gap-4 sm:p-5',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-ink-mute sm:text-[11px]">
          {label}
        </span>
        {Icon && (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-canvas-sunken text-ink-mute">
            <Icon className="h-[14px] w-[14px] stroke-[1.5]" />
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        {loading ? (
          <div className="shimmer h-7 w-32 rounded-md" />
        ) : (
          <span className="num text-[22px] font-semibold leading-none tracking-tight text-foreground sm:text-[26px] md:text-[28px]">
            {display}
          </span>
        )}
        {unit && hasValue && !loading && (
          <span className="text-[12px] text-ink-mute">{unit}</span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        {typeof delta === 'number' && hasValue && !loading ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium',
              positive
                ? 'bg-pastel-green text-pastel-greenInk'
                : 'bg-pastel-red text-pastel-redInk',
            )}
          >
            {positive ? (
              <ArrowUpRight className="h-3 w-3 stroke-[1.6]" />
            ) : (
              <ArrowDownRight className="h-3 w-3 stroke-[1.6]" />
            )}
            <span className="num tabular-nums">
              {formatPercent(Math.abs(delta), 1)}
            </span>
          </span>
        ) : (
          <span className="truncate text-[11px] text-ink-mute">
            {hint ?? 'في انتظار البيانات'}
          </span>
        )}
      </div>
    </div>
  );
}
