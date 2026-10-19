'use client';

import { useMemo, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import { keepSeriesOrder } from '@/lib/chart-order';
import { ACCENT_VAR, type Accent } from '@/components/dashboard/dashboard-ui';
import { EmptyBlock, ErrorBlock } from '@/components/people/states';
import { ACCENT_CHIP, ACCENT_FILL, INK } from '@/components/people/people-theme';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatMoney } from '@/lib/utils';

export type ChartSeries = { key: string; label: string; accent: Accent };
export type ChartRow = { label: string } & Record<string, number | string>;

function MonthTooltip({ active, payload, label, series }: { active?: boolean; payload?: { payload: ChartRow }[]; label?: string; series: ChartSeries[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div dir="rtl" className="rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] shadow-lift">
      <p className="mb-1 font-semibold">{label}</p>
      {series.map((s) => (
        <p key={s.key} className={cn('tabular-nums', INK[ACCENT_CHIP[s.accent]])}>
          {s.label} {formatMoney(Number(row[s.key] ?? 0), 'LYD')}
        </p>
      ))}
    </div>
  );
}

const axisTick = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };
// 2,500 reads as «2.5 ألف», never as «3 ألف»
const thousands = (v: number) => (v >= 1000 ? `${Number((v / 1000).toFixed(1))} ألف` : String(v));

/**
 * Monthly bars in the accent colours, exact figures in the tooltip. The chart itself is hidden from screen
 * readers; a table with the same figures stands in for it.
 */
export function MonthlyBarChart({
  data,
  series,
  title,
  height = 220,
  summary,
  loading,
  error,
  onRetry,
  emptyText = 'لا توجد حركة في هذه الفترة.',
  className,
}: {
  data: readonly ChartRow[];
  series: ChartSeries[];
  /** what the chart shows; names the figures for screen readers */
  title: string;
  height?: number;
  /** figures under the chart (totals), as the dashboard does */
  summary?: ReactNode;
  loading?: boolean;
  error?: string | boolean;
  onRetry?: () => void;
  emptyText?: string;
  className?: string;
}) {
  const empty = useMemo(() => data.every((row) => series.every((s) => !Number(row[s.key]))), [data, series]);

  if (error) return <ErrorBlock message={typeof error === 'string' ? error : undefined} onRetry={onRetry} className={className} />;
  if (loading) return <Skeleton className={cn('w-full', className)} style={{ height }} role="status" aria-label="جارٍ التحميل" />;
  if (data.length === 0 || empty) return <EmptyBlock className={className}>{emptyText}</EmptyBlock>;

  return (
    <div className={className}>
      {series.length > 1 && (
        <div className="mb-3 flex items-center justify-end gap-4 text-[12.5px] text-ink-mute">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className={cn('h-2.5 w-2.5 rounded-full', ACCENT_FILL[s.accent])} aria-hidden />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div aria-hidden dir="ltr">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data as ChartRow[]} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={6} />
            <YAxis width={52} tick={axisTick} axisLine={false} tickLine={false} tickFormatter={thousands} />
            <RechartsTooltip content={<MonthTooltip series={series} />} itemSorter={keepSeriesOrder} cursor={{ fill: 'hsl(var(--muted))', radius: 6 }} />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} fill={ACCENT_VAR[s.accent]} radius={[5, 5, 0, 0]} maxBarSize={series.length > 1 ? 24 : 34} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">الشهر</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {series.map((s) => (
                <td key={s.key}>{formatMoney(Number(row[s.key] ?? 0), 'LYD')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {summary}
    </div>
  );
}
