'use client';

import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { ACCENT_VAR, type Accent } from '@/components/dashboard/dashboard-ui';
import { EmptyBlock, ErrorBlock } from '@/components/people/states';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatMoney } from '@/lib/utils';

export type DonutSlice = { key: string; label: string; value: number; /** the «others» slice, drawn grey */ rest?: boolean };

/** largest first; `lead` takes the first place, so a ring of money in starts green and one of money out starts red */
const SLICE_ORDER: Accent[] = ['red', 'amber', 'blue', 'violet', 'teal', 'green'];
const orderFor = (lead: Accent): Accent[] => [lead, ...SLICE_ORDER.filter((a) => a !== lead)];
const REST_FILL = 'hsl(var(--ink-mute) / 0.4)';

type Drawn = DonutSlice & { fill: string; pct: number };

function SliceTooltip({ active, payload }: { active?: boolean; payload?: { payload: Drawn }[] }) {
  if (!active || !payload?.length) return null;
  const { label, value, pct } = payload[0].payload;
  return (
    <div dir="rtl" className="rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] shadow-lift">
      <p className="mb-0.5 font-semibold">{label}</p>
      <p className="tabular-nums text-ink-mute">
        {formatMoney(value, 'LYD')} · {pct.toFixed(1)}%
      </p>
    </div>
  );
}

const pctText = (pct: number) => `${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%`;

/**
 * A ring with the total in the middle and, beside it, every slice with its exact amount and share. The ring
 * is for the eye only; the list is the information.
 */
export function DonutBreakdown({
  slices,
  total,
  centerLabel,
  lead = 'red',
  loading,
  error,
  onRetry,
  emptyText = 'لا توجد بيانات.',
  className,
}: {
  slices: readonly DonutSlice[];
  /** the whole the shares are taken of; defaults to the sum of the slices */
  total?: number;
  centerLabel: string;
  /** colour of the biggest slice: green for money in, red for money out (default) */
  lead?: Accent;
  loading?: boolean;
  error?: string | boolean;
  onRetry?: () => void;
  emptyText?: string;
  className?: string;
}) {
  const positive = useMemo(() => slices.filter((s) => Number.isFinite(s.value) && s.value > 0), [slices]);
  const whole = total ?? positive.reduce((sum, s) => sum + s.value, 0);
  const drawn = useMemo<Drawn[]>(() => {
    const order = orderFor(lead);
    let i = 0;
    return positive.map((s) => ({
      ...s,
      fill: s.rest ? REST_FILL : ACCENT_VAR[order[i++ % order.length]],
      pct: whole > 0 ? (s.value / whole) * 100 : 0,
    }));
  }, [positive, whole, lead]);

  if (error) return <ErrorBlock message={typeof error === 'string' ? error : undefined} onRetry={onRetry} className={className} />;
  if (loading) {
    return (
      <div className={cn('space-y-3', className)} role="status" aria-label="جارٍ التحميل">
        <Skeleton className="mx-auto h-40 w-40 rounded-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }
  if (drawn.length === 0) return <EmptyBlock className={className}>{emptyText}</EmptyBlock>;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="relative mx-auto h-[180px] w-[180px]">
        <div aria-hidden dir="ltr" className="h-full w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                rootTabIndex={-1}
                data={drawn}
                dataKey="value"
                nameKey="label"
                innerRadius={58}
                outerRadius={86}
                paddingAngle={drawn.length > 1 ? 2 : 0}
                stroke="hsl(var(--card))"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {drawn.map((sl) => (
                  <Cell key={sl.key} fill={sl.fill} />
                ))}
              </Pie>
              <RechartsTooltip content={<SliceTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[12px] text-ink-mute">{centerLabel}</span>
          <span className="mt-0.5 px-5 text-[14px] font-bold tabular-nums text-foreground">{formatMoney(whole, 'LYD')}</span>
        </div>
      </div>
      <ul className="space-y-2">
        {drawn.map((sl) => (
          <li key={sl.key} className="flex items-center gap-2.5 text-[13px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: sl.fill }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-foreground">{sl.label}</span>
            <span className="shrink-0 tabular-nums text-foreground">{formatMoney(sl.value, 'LYD')}</span>
            <span className="w-11 shrink-0 text-end text-[12px] tabular-nums text-ink-mute">{pctText(sl.pct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
