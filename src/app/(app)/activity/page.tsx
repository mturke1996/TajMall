'use client';

import Link from 'next/link';
import {
  Activity as ActivityIcon,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  ArrowLeftRight,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useTransactions } from '@/lib/db/queries';
import { cn, formatMoney, formatDateRelative } from '@/lib/utils';

export default function ActivityPage() {
  const { data: txs = [], isLoading, isError } = useTransactions(undefined, 80);

  return (
    <>
      <PageHeader
        eyebrow="النشاط المباشر"
        title="سجل النشاط"
        description="آخر المعاملات المالية المسجلة في النظام — مصدر مباشر من جدول المعاملات."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/transactions" prefetch>
              كل المعاملات
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-4 px-5 py-7 md:px-8 md:py-10">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-sage-600" aria-hidden />
          </div>
        ) : isError ? (
          <p className="text-center text-sm text-destructive">تعذّر تحميل النشاط.</p>
        ) : txs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card py-16 text-center">
            <ActivityIcon className="h-10 w-10 text-ink-mute" aria-hidden />
            <p className="text-sm font-medium text-foreground">لا يوجد نشاط بعد</p>
            <p className="max-w-md text-sm text-ink-mute">
              عند تسجيل إيرادات أو مصروفات ستظهر هنا مرتبة زمنياً.
            </p>
            <Button asChild>
              <Link href="/transactions">انتقل إلى المعاملات</Link>
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {txs.map((tx) => (
              <div
                key={tx.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-canvas-sunken/80 sm:flex-nowrap"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                      tx.kind === 'REVENUE'
                        ? 'bg-pastel-green text-pastel-greenInk'
                        : tx.kind === 'EXPENSE'
                          ? 'bg-pastel-red text-pastel-redInk'
                          : 'bg-secondary text-secondary-foreground',
                    )}
                  >
                    {tx.kind === 'REVENUE' ? (
                      <ArrowDownToLine className="h-5 w-5" aria-hidden />
                    ) : tx.kind === 'EXPENSE' ? (
                      <ArrowUpFromLine className="h-5 w-5" aria-hidden />
                    ) : (
                      <ArrowLeftRight className="h-5 w-5" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">
                      {tx.category?.name_ar ?? 'بدون بند'}
                    </p>
                    <p className="truncate text-xs text-ink-mute">
                      {tx.cashbox?.name_ar ?? '—'} · {formatDateRelative(tx.tx_date)}
                      {tx.contact?.name ? ` · ${tx.contact.name}` : ''}
                    </p>
                  </div>
                </div>
                <p
                  className={cn(
                    'shrink-0 text-end text-sm font-semibold tabular-nums',
                    tx.kind === 'REVENUE'
                      ? 'text-pastel-greenInk'
                      : tx.kind === 'EXPENSE'
                        ? 'text-pastel-redInk'
                        : 'text-foreground',
                  )}
                >
                  {tx.kind === 'REVENUE' ? '+' : tx.kind === 'EXPENSE' ? '−' : ''}{' '}
                  {formatMoney(Number(tx.amount), tx.currency ?? 'LYD')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
