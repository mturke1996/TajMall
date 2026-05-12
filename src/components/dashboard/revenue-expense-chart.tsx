'use client';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney } from '@/lib/utils';

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

export type ChartDatum = { month: string; revenue: number; expense: number };

export function RevenueExpenseChart({
  data,
  currency = 'LYD',
}: {
  data?: ChartDatum[];
  currency?: string;
}) {
  const series = useMemo<ChartDatum[]>(
    () => data?.length ? data : MONTHS.map((month) => ({ month, revenue: 0, expense: 0 })),
    [data],
  );

  const isEmpty = !data?.length;

  return (
    <div className="relative h-[300px] w-full">
      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <div className="rounded-full border border-border bg-card px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute shadow-whisper">
            لا توجد بيانات بعد
          </div>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#536647" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#536647" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradExp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#A89253" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#A89253" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="#ECEAE3" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            stroke="#6E7470"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            reversed
          />
          <YAxis
            stroke="#6E7470"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            orientation="right"
            tickFormatter={(v) =>
              v
                ? new Intl.NumberFormat('en-US', {
                    notation: 'compact',
                    maximumFractionDigits: 1,
                  }).format(v)
                : '0'
            }
          />
          {!isEmpty && (
            <Tooltip
              cursor={{ stroke: '#536647', strokeWidth: 1, strokeDasharray: '3 3' }}
              contentStyle={{
                background: '#FFFFFF',
                border: '1px solid #ECEAE3',
                borderRadius: 10,
                boxShadow: '0 1px 2px rgba(20, 22, 25, 0.04), 0 8px 24px -16px rgba(20, 22, 25, 0.06)',
                direction: 'rtl',
                padding: '8px 12px',
              }}
              labelStyle={{ color: '#15171A', fontWeight: 600, fontSize: 12 }}
              formatter={(value: number, name: string) => [
                formatMoney(value, currency, { compact: true }),
                name === 'revenue' ? 'الإيرادات' : 'المصروفات',
              ]}
            />
          )}
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#3E4D34"
            strokeWidth={1.75}
            fill="url(#gradRev)"
            isAnimationActive
            animationDuration={700}
            animationEasing="ease-out"
          />
          <Area
            type="monotone"
            dataKey="expense"
            stroke="#8B7943"
            strokeWidth={1.75}
            fill="url(#gradExp)"
            isAnimationActive
            animationDuration={700}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
