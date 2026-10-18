'use client';

import { cn, formatMoney } from '@/lib/utils';
import { Card } from '@/components/ui/card';

export type SummaryStat = {
  label: string;
  value: number;
  currency?: string;
  tone?: 'default' | 'positive' | 'negative';
};

/** Report totals in one card. A tone colours the figure only when it is not zero. */
export function AccountingSummaryGrid({ stats, className }: { stats: SummaryStat[]; className?: string }) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div
        className={cn(
          'grid grid-cols-1 gap-px bg-border sm:grid-cols-2',
          stats.length === 3 && 'lg:grid-cols-3',
          stats.length >= 4 && 'lg:grid-cols-4',
        )}
      >
        {stats.map((stat) => {
          const nonZero = Math.abs(stat.value) > 0.0005;
          return (
            <div key={stat.label} className="bg-card p-4">
              <p className="text-[12.5px] text-ink-mute">{stat.label}</p>
              <p
                className={cn(
                  'mt-1 text-[20px] font-semibold tabular-nums text-foreground',
                  nonZero && stat.tone === 'positive' && 'text-success-ink',
                  nonZero && stat.tone === 'negative' && 'text-danger-ink',
                )}
              >
                {formatMoney(stat.value, stat.currency ?? 'LYD')}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
