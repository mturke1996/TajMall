'use client';

import { motion } from 'framer-motion';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { formatMoney } from '@/lib/utils';

export type Slice = { label: string; value: number; color: string };

export function CategoryBreakdown({
  slices,
  currency = 'LYD',
}: {
  slices?: Slice[];
  currency?: string;
}) {
  const data = slices?.length ? slices : [];
  const total = data.reduce((s, x) => s + x.value, 0);
  const isEmpty = !data.length || total === 0;

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-[160px_1fr]">
      <div className="relative mx-auto h-[160px] w-[160px] sm:mx-0">
        {isEmpty ? (
          <div className="grid h-full w-full place-items-center rounded-full border border-dashed border-border">
            <span className="text-center text-[11px] uppercase tracking-[0.16em] text-ink-mute">
              لا توجد
              <br />
              بيانات
            </span>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  innerRadius={52}
                  outerRadius={76}
                  dataKey="value"
                  stroke="#FFFFFF"
                  strokeWidth={3}
                  paddingAngle={1.5}
                  isAnimationActive
                  animationDuration={600}
                >
                  {data.map((s, i) => (
                    <Cell key={i} fill={s.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center">
              <span className="text-[9.5px] uppercase tracking-[0.18em] text-ink-mute">
                الإجمالي
              </span>
              <span className="num text-[14px] font-semibold tabular-nums text-foreground">
                {formatMoney(total, currency, { compact: true })}
              </span>
            </div>
          </>
        )}
      </div>

      <ul className="flex flex-col gap-2.5">
        {isEmpty ? (
          <li className="text-[12.5px] text-ink-mute">
            لم تتم إضافة أي بنود حتى الآن. ابدأ بإنشاء بنود الإيرادات والمصروفات من
            صفحة <span className="font-medium text-foreground">البنود</span>.
          </li>
        ) : (
          data.map((s, i) => {
            const pct = total ? (s.value / total) * 100 : 0;
            return (
              <motion.li
                key={s.label}
                initial={{ opacity: 0, x: 4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-3"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="flex-1 truncate text-[13px] text-foreground">
                  {s.label}
                </span>
                <span className="num w-12 text-end text-[12px] tabular-nums text-ink-mute">
                  {pct.toFixed(1)}%
                </span>
                <span className="num w-24 text-end text-[13px] tabular-nums">
                  {formatMoney(s.value, currency, { compact: true })}
                </span>
              </motion.li>
            );
          })
        )}
      </ul>
    </div>
  );
}
