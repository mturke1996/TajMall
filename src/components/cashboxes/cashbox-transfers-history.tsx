'use client';

import Link from 'next/link';
import { ArrowLeftRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useCashTransfers } from '@/lib/db/cashbox-queries';
import { formatMoney, formatDate, cn } from '@/lib/utils';

export function CashboxTransfersHistory() {
  const { data: transfers = [], isLoading } = useCashTransfers(30);

  if (isLoading) {
    return (
      <div className="surface flex items-center justify-center gap-2 p-8 text-[12.5px] text-ink-mute">
        <Loader2 className="h-4 w-4 animate-spin" />
        جارٍ تحميل سجل التحويلات…
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <div className="surface flex flex-col items-center gap-2 p-8 text-center">
        <ArrowLeftRight className="h-8 w-8 text-ink-mute stroke-[1.5]" />
        <p className="text-[14px] font-semibold">لا توجد تحويلات بعد</p>
        <p className="text-[12.5px] text-ink-mute">ستظهر هنا كل التحويلات بين الخزائن والحسابات المصرفية.</p>
      </div>
    );
  }

  return (
    <div className="surface overflow-hidden">
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <h3 className="text-[14px] font-semibold">سجل التحويلات</h3>
        <p className="text-[11.5px] text-ink-mute">آخر {transfers.length} تحويل — اضغط الخزينة لعرض سجلها</p>
      </div>
      <ul className="divide-y divide-border">
        {transfers.map((t) => {
          const amount = Number(t.amount);
          const fromName = t.from_cashbox?.name_ar ?? '—';
          const toName = t.to_cashbox?.name_ar ?? '—';
          return (
            <li key={t.id} className="px-4 py-3.5 sm:px-5 hover:bg-canvas-sunken/40 transition-colors">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="info" className="font-mono normal-case tracking-normal">
                      {t.reference ?? `#${t.number}`}
                    </Badge>
                    <span className="text-[11px] text-ink-mute" dir="ltr">
                      {formatDate(t.transfer_date)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[13px] font-medium leading-snug">
                    <Link
                      href={`/cashboxes/${t.from_cashbox_id}`}
                      className="text-foreground hover:text-sage-700 underline-offset-2 hover:underline"
                    >
                      {fromName}
                    </Link>
                    <span className="mx-1.5 text-ink-mute">←</span>
                    <Link
                      href={`/cashboxes/${t.to_cashbox_id}`}
                      className="text-foreground hover:text-sage-700 underline-offset-2 hover:underline"
                    >
                      {toName}
                    </Link>
                  </p>
                  {t.description ? (
                    <p className="mt-1 line-clamp-2 text-[12px] text-ink-mute">{t.description}</p>
                  ) : null}
                </div>
                <span className={cn('num shrink-0 text-[15px] font-bold tabular-nums text-sage-800')}>
                  {formatMoney(amount, t.currency || 'LYD')}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
