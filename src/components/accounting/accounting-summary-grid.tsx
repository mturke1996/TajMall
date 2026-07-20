'use client';

import { cn, formatMoney } from '@/lib/utils';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export type SummaryStat = {
  label: string;
  value: number;
  currency?: string;
  tone?: 'default' | 'positive' | 'negative';
};

export function AccountingSummaryGrid({
  stats,
  className,
}: {
  stats: SummaryStat[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4',
        stats.length === 3 && 'lg:grid-cols-3',
        stats.length >= 4 && 'lg:grid-cols-4',
        className,
      )}
    >
      {stats.map((stat) => (
        <Card
          key={stat.label}
          className={cn(
            stat.tone === 'positive' && 'border-emerald-200/80 bg-emerald-50/40',
            stat.tone === 'negative' && 'border-red-200/80 bg-red-50/30',
            stat.tone === 'default' && 'bg-secondary/30',
          )}
        >
          <CardHeader className="py-4">
            <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
            <CardTitle
              className={cn(
                'mt-1 text-xl font-mono font-bold tabular-nums sm:text-2xl',
                stat.tone === 'positive' && 'text-emerald-900',
                stat.tone === 'negative' && 'text-red-800',
              )}
            >
              {formatMoney(stat.value, stat.currency ?? 'LYD')}
            </CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
