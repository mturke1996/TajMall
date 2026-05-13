import type { LucideIcon } from 'lucide-react';
import { cn, formatMoney } from '@/lib/utils';

export function Stat({
  label,
  value,
  icon: Icon,
  currency,
  className,
}: {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  currency?: string;
  className?: string;
}) {
  const display = typeof value === 'number'
    ? currency ? formatMoney(value, currency) : value.toLocaleString('en-US')
    : value;

  return (
    <div
      className={cn(
        'surface flex flex-col gap-2 p-4 transition-shadow duration-150 hover:shadow-sm',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-mute">
          {label}
        </span>
        {Icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-canvas-sunken text-ink-mute">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>

      <span className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {display}
      </span>
    </div>
  );
}
