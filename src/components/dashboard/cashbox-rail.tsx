'use client';

import { motion } from 'framer-motion';
import { Wallet, Landmark, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { formatMoney, cn } from '@/lib/utils';
import { useCashboxBalances } from '@/lib/db/queries';

export function CashboxRail({ currency = 'LYD' }: { currency?: string }) {
  const { data, isLoading } = useCashboxBalances();
  const items = data ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-canvas-sunken/40 py-10 text-[12.5px] text-ink-mute">
        <Loader2 className="h-4 w-4 animate-spin stroke-[1.6]" />
        جارٍ التحميل…
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="surface flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <span className="grid h-10 w-10 place-items-center rounded-md border border-border bg-canvas-sunken text-ink-mute">
          <Wallet className="h-4 w-4 stroke-[1.5]" />
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="text-[14px] font-semibold">لا توجد خزائن بعد</h3>
          <p className="max-w-md text-[12.5px] text-ink-mute">
            شغّل ملف الـ SQL في Supabase لإنشاء الخزائن الافتراضية، أو أضف خزينة يدوياً.
          </p>
        </div>
        <Link
          href="/cashboxes"
          className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-medium text-sage-700 hover:underline"
        >
          إنشاء خزينة
          <ArrowLeft className="h-3.5 w-3.5 stroke-[1.6]" />
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((c, i) => {
        const Icon = c.kind === 'CASH' ? Wallet : Landmark;
        const balance = Number(c.balance);
        const net = Number(c.month_inflow) - Number(c.month_outflow);
        return (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="surface flex flex-col gap-4 p-4 transition-shadow duration-200 hover:shadow-whisper"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className="grid h-8 w-8 place-items-center rounded-md border text-ink-mute"
                  style={{
                    background: `${c.color ?? '#6E7470'}1f`,
                    borderColor: `${c.color ?? '#6E7470'}55`,
                  }}
                >
                  <Icon
                    className="h-[14px] w-[14px] stroke-[1.5]"
                    style={{ color: c.color ?? undefined }}
                  />
                </span>
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
                    {c.kind === 'CASH' ? 'خزينة' : 'مصرف'}
                  </span>
                  <span className="text-[13px] font-medium">{c.name_ar}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-mute">
                الرصيد الحالي
              </span>
              <span className="num text-[20px] font-semibold tracking-tight">
                {formatMoney(balance, c.currency || currency)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3 text-[11px] text-ink-mute">
              <span>صافي الشهر</span>
              <span
                className={cn(
                  'num font-medium tabular-nums',
                  net >= 0 ? 'text-pastel-greenInk' : 'text-pastel-redInk',
                )}
              >
                {net >= 0 ? '+' : '−'}{' '}
                {formatMoney(Math.abs(net), c.currency || currency, { compact: true })}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
