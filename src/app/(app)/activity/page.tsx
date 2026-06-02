'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Activity as ActivityIcon,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  ArrowLeftRight,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTransactions } from '@/lib/db/queries';
import { cn, formatMoney, formatDateRelative } from '@/lib/utils';

export default function ActivityPage() {
  const { data: txs = [], isLoading, isError } = useTransactions(undefined, 80);
  const [kind, setKind] = useState<'ALL' | 'REVENUE' | 'EXPENSE'>('ALL');
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () =>
      txs.filter((tx) => {
        if (kind !== 'ALL' && tx.kind !== kind) return false;
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (
          tx.category?.name_ar?.toLowerCase().includes(q) ||
          tx.cashbox?.name_ar?.toLowerCase().includes(q) ||
          tx.contact?.name?.toLowerCase().includes(q) ||
          tx.description?.toLowerCase().includes(q)
        );
      }),
    [txs, kind, search],
  );

  const totals = useMemo(
    () => ({
      all: txs.length,
      revenue: txs.filter((t) => t.kind === 'REVENUE').length,
      expense: txs.filter((t) => t.kind === 'EXPENSE').length,
    }),
    [txs],
  );

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
        {!isLoading && !isError && txs.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setKind('ALL')}
                className={cn(
                  'rounded-lg border px-2 py-2 text-xs font-medium touch-manipulation',
                  kind === 'ALL'
                    ? 'border-sage-300 bg-sage-50 text-sage-700'
                    : 'border-border bg-card text-ink-mute',
                )}
              >
                الكل ({totals.all})
              </button>
              <button
                type="button"
                onClick={() => setKind('REVENUE')}
                className={cn(
                  'rounded-lg border px-2 py-2 text-xs font-medium touch-manipulation',
                  kind === 'REVENUE'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-border bg-card text-ink-mute',
                )}
              >
                إيرادات ({totals.revenue})
              </button>
              <button
                type="button"
                onClick={() => setKind('EXPENSE')}
                className={cn(
                  'rounded-lg border px-2 py-2 text-xs font-medium touch-manipulation',
                  kind === 'EXPENSE'
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-border bg-card text-ink-mute',
                )}
              >
                مصروفات ({totals.expense})
              </button>
            </div>

            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم البند أو الخزنة أو الجهة…"
              className="h-10 text-sm"
            />

            <p className="text-xs text-ink-mute">
              عرض {filtered.length} حركة من أصل {txs.length}
            </p>
          </>
        )}

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
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-center">
            <ActivityIcon className="h-9 w-9 text-ink-mute" aria-hidden />
            <p className="text-sm font-medium text-foreground">لا توجد حركات مطابقة</p>
            <p className="text-xs text-ink-mute">جرّب تغيير نوع الفلتر بالأعلى.</p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {filtered.map((tx) => (
              <div
                key={tx.id}
                className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-canvas-sunken/80 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
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
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-sm">
                        {tx.category?.name_ar ?? 'بدون بند'}
                      </p>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                          tx.kind === 'REVENUE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : tx.kind === 'EXPENSE'
                              ? 'bg-red-50 text-red-700'
                              : 'bg-secondary text-secondary-foreground',
                        )}
                      >
                        {tx.kind === 'REVENUE' ? 'إيراد' : tx.kind === 'EXPENSE' ? 'مصروف' : 'حركة'}
                      </span>
                    </div>
                    <p className="truncate text-xs text-ink-mute">
                      {tx.cashbox?.name_ar ?? '—'} · {formatDateRelative(tx.tx_date)}
                      {tx.contact?.name ? ` · ${tx.contact.name}` : ''}
                    </p>
                    {tx.description && (
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-mute">
                        {tx.description}
                      </p>
                    )}
                  </div>
                </div>
                <p
                  className={cn(
                    'shrink-0 self-end text-end text-sm font-semibold tabular-nums sm:self-auto',
                    tx.kind === 'REVENUE'
                      ? 'text-pastel-greenInk'
                      : tx.kind === 'EXPENSE'
                        ? 'text-pastel-redInk'
                        : 'text-foreground',
                  )}
                >
                  <span className="sm:hidden">
                    {tx.kind === 'REVENUE' ? '+' : tx.kind === 'EXPENSE' ? '−' : ''}
                    {' '}
                    {formatMoney(Number(tx.amount), tx.currency ?? 'LYD', { compact: true })}
                  </span>
                  <span className="hidden sm:inline">
                    {tx.kind === 'REVENUE' ? '+' : tx.kind === 'EXPENSE' ? '−' : ''}{' '}
                    {formatMoney(Number(tx.amount), tx.currency ?? 'LYD')}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
