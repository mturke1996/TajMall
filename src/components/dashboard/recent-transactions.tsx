'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, Receipt, ArrowLeft, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatMoney, formatShortDate, cn } from '@/lib/utils';
import { useRecentTransactions } from '@/lib/db/queries';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'نقدي',
  CHEQUE: 'صك',
  TRANSFER: 'حوالة',
  CARD: 'بطاقة',
};

const METHOD_TONE: Record<string, 'success' | 'info' | 'warning' | 'plum'> = {
  CASH: 'success',
  CHEQUE: 'info',
  TRANSFER: 'warning',
  CARD: 'plum',
};

export function RecentTransactions({ currency = 'LYD' }: { currency?: string }) {
  const { data, isLoading } = useRecentTransactions(8);
  const rows = data ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-canvas-sunken/40 py-10 text-[12.5px] text-ink-mute">
        <Loader2 className="h-4 w-4 animate-spin stroke-[1.6]" />
        جارٍ التحميل…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-canvas-sunken/40 px-5 py-10 text-center sm:py-12">
        <span className="grid h-10 w-10 place-items-center rounded-md border border-border bg-card text-ink-mute">
          <Receipt className="h-4 w-4 stroke-[1.5]" />
        </span>
        <h3 className="text-[14px] font-semibold">لا توجد معاملات بعد</h3>
        <p className="max-w-md text-[12.5px] text-ink-mute">
          سجّل أول إيراد أو مصروف وستظهر معاملاتك الأخيرة هنا تلقائياً.
        </p>
        <Link
          href="/revenues"
          className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-medium text-sage-700 hover:underline"
        >
          إضافة معاملة
          <ArrowLeft className="h-3.5 w-3.5 stroke-[1.6]" />
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="hidden grid-cols-[110px_110px_1fr_110px_140px] items-center gap-3 border-b border-border bg-canvas-sunken px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute md:grid">
        <span>التاريخ</span>
        <span>رقم القيد</span>
        <span>البيان</span>
        <span>نوع السداد</span>
        <span className="text-end">المبلغ</span>
      </div>

      <ul className="divide-y divide-border">
        {rows.map((r, i) => {
          const positive = r.kind === 'REVENUE';
          const amount = Number(r.amount);
          return (
            <motion.li
              key={r.id}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.025, duration: 0.3 }}
              className="px-3 py-3 transition-colors duration-150 hover:bg-canvas-sunken/60 md:grid md:grid-cols-[110px_110px_1fr_110px_140px] md:items-center md:gap-3 md:px-4"
            >
              <div className="flex items-start justify-between gap-3 md:contents">
                <div className="flex min-w-0 items-center gap-2.5 md:order-3">
                  <span
                    className={cn(
                      'grid h-7 w-7 shrink-0 place-items-center rounded-md border',
                      positive
                        ? 'border-pastel-greenInk/15 bg-pastel-green text-pastel-greenInk'
                        : 'border-pastel-redInk/15 bg-pastel-red text-pastel-redInk',
                    )}
                  >
                    {positive ? (
                      <ArrowDownLeft className="h-3.5 w-3.5 stroke-[1.6]" />
                    ) : (
                      <ArrowUpRight className="h-3.5 w-3.5 stroke-[1.6]" />
                    )}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] leading-tight">
                      {r.description ?? '—'}
                    </span>
                    <span className="mt-0.5 truncate text-[11px] text-ink-mute">
                      {r.category?.name_ar ?? '—'}
                    </span>
                  </div>
                </div>

                <span
                  className={cn(
                    'num shrink-0 text-end font-mono text-[13px] font-semibold tabular-nums md:order-5',
                    positive ? 'text-pastel-greenInk' : 'text-pastel-redInk',
                  )}
                >
                  {positive ? '+' : '−'} {formatMoney(amount, currency)}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-ink-mute md:hidden">
                <span className="num font-mono">
                  {formatShortDate(r.tx_date)} · #{r.reference ?? r.number}
                </span>
                <Badge variant={METHOD_TONE[r.method] ?? 'neutral'}>
                  {METHOD_LABEL[r.method] ?? r.method}
                </Badge>
              </div>

              <span className="num hidden font-mono text-[11.5px] text-ink-mute md:order-1 md:inline">
                {formatShortDate(r.tx_date)}
              </span>
              <span className="num hidden font-mono text-[11.5px] md:order-2 md:inline">
                {r.reference ?? r.number}
              </span>
              <div className="hidden md:order-4 md:block">
                <Badge variant={METHOD_TONE[r.method] ?? 'neutral'}>
                  {METHOD_LABEL[r.method] ?? r.method}
                </Badge>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
