'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useTransactions } from '@/lib/db/queries';
import { matchesSearch } from '@/lib/arabic-search';
import { arabicCount, cn, formatDate, formatMoney } from '@/lib/utils';
import { formatMonthLabelAr } from '@/lib/rent-months';

/** Revenue in, expense out; transfers carry no sign. */
function signedTxAmount(tx: { kind: string; amount: string | number }) {
  const amount = Math.abs(Number(tx.amount));
  return tx.kind === 'EXPENSE' ? -amount : amount;
}

const KINDS = [
  { value: 'ALL', label: 'الكل' },
  { value: 'REVENUE', label: 'إيرادات' },
  { value: 'EXPENSE', label: 'مصروفات' },
] as const;

/** The latest money movements, grouped by month, one line each with its date. */
export default function ActivityPage() {
  const { data: txs = [], isLoading, isError } = useTransactions(undefined, 80);
  const [kind, setKind] = useState<(typeof KINDS)[number]['value']>('ALL');
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () =>
      txs.filter(
        (tx) =>
          (kind === 'ALL' || tx.kind === kind) &&
          matchesSearch(search, [tx.category?.name_ar, tx.cashbox?.name_ar, tx.contact?.name, tx.description, tx.number]),
      ),
    [txs, kind, search],
  );

  const counts = useMemo(
    () => ({
      ALL: txs.length,
      REVENUE: txs.filter((t) => t.kind === 'REVENUE').length,
      EXPENSE: txs.filter((t) => t.kind === 'EXPENSE').length,
    }),
    [txs],
  );

  const days = useMemo(() => {
    const byDay = new Map<string, typeof filtered>();
    for (const tx of filtered) {
      const key = String(tx.tx_date).slice(0, 7);
      byDay.set(key, [...(byDay.get(key) ?? []), tx]);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, rows]) => ({
        key,
        rows,
        revenue: rows.filter((r) => r.kind === 'REVENUE' && r.status !== 'VOIDED').reduce((s, r) => s + Number(r.amount), 0),
        expense: rows.filter((r) => r.kind === 'EXPENSE' && r.status !== 'VOIDED').reduce((s, r) => s + Number(r.amount), 0),
      }));
  }, [filtered]);

  return (
    <>
      <PageHeader
        title="النشاط"
        description="آخر المعاملات المسجّلة، مجمّعة حسب الشهر."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/transactions" prefetch>
              كل المعاملات
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-4 px-4 py-5 sm:px-5 sm:py-6 md:px-8 md:py-7">
        {!isLoading && !isError && txs.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex w-fit rounded-lg border border-border bg-canvas-sunken p-0.5" role="group" aria-label="نوع الحركة">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  aria-pressed={kind === k.value}
                  onClick={() => setKind(k.value)}
                  className={cn(
                    'h-8 rounded-md px-3 text-[13px] font-medium transition-colors',
                    kind === k.value ? 'bg-card text-foreground shadow-xs' : 'text-ink-mute hover:text-foreground',
                  )}
                >
                  {k.label} <span className="tabular-nums opacity-70">{counts[k.value]}</span>
                </button>
              ))}
            </div>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute inset-s-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالبيان أو البند أو الخزينة أو الجهة…"
                aria-label="بحث في النشاط"
                className="h-10 ps-9"
              />
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-ink-soft" aria-label="جارٍ التحميل" />
          </div>
        ) : isError ? (
          <Card className="p-8 text-center text-[13px] text-danger-ink">تعذّر تحميل النشاط. أعد تحميل الصفحة.</Card>
        ) : txs.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center">
            <p className="text-sm font-medium">لا يوجد نشاط بعد</p>
            <p className="max-w-md text-[13px] text-ink-mute">تظهر هنا الإيرادات والمصروفات فور تسجيلها.</p>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center text-[13px] text-ink-mute">لا توجد حركات تطابق البحث.</Card>
        ) : (
          <div className="flex flex-col gap-4">
            {days.map((day) => {
              return (
                <section key={day.key} aria-labelledby={`act-${day.key}`}>
                  <h2
                    id={`act-${day.key}`}
                    className="sticky top-16 z-10 -mx-1 mb-1.5 flex flex-wrap items-baseline gap-x-2 bg-canvas px-1 py-1.5"
                  >
                    <span className="text-[14px] font-semibold text-foreground">{formatMonthLabelAr(day.key)}</span>
                    <span className="text-[12.5px] text-ink-mute tabular-nums">{arabicCount(day.rows.length, ['حركة واحدة', 'حركتان', 'حركات', 'حركة'])}</span>
                    <span className="ms-auto text-[12px] tabular-nums text-ink-mute">
                      {day.revenue > 0 && <>إيرادات {formatMoney(day.revenue, 'LYD')}</>}
                      {day.revenue > 0 && day.expense > 0 && ' · '}
                      {day.expense > 0 && <>مصروفات {formatMoney(day.expense, 'LYD')}</>}
                    </span>
                  </h2>
                  <ul className="surface divide-y divide-border overflow-hidden">
                    {day.rows.map((tx) => {
                      const voided = tx.status === 'VOIDED';
                      return (
                        <li key={tx.id}>
                          <Link
                            href={`/transactions?highlight=${tx.id}`}
                            className={cn('flex items-center gap-3 px-4 py-2.5 hover:bg-canvas-sunken/60', voided && 'text-ink-mute')}
                          >
                            <span
                              className={cn(
                                'h-2 w-2 shrink-0 rounded-full',
                                tx.kind === 'REVENUE' ? 'bg-success' : tx.kind === 'EXPENSE' ? 'bg-danger' : 'bg-info',
                              )}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate text-[13.5px] font-medium text-foreground">
                                  {tx.description || tx.category?.name_ar || 'معاملة'}
                                </span>
                                {voided && <span className="shrink-0 text-[12px] text-danger-ink">ملغاة</span>}
                                {tx.status === 'DRAFT' && <span className="shrink-0 text-[12px] text-warning-ink">مسودة</span>}
                              </span>
                              <span className="block truncate text-[12px] text-ink-mute">
                                {[formatDate(tx.tx_date), `#${tx.number}`, tx.category?.name_ar, tx.cashbox?.name_ar, tx.contact?.name].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                            <span
                              className={cn(
                                'shrink-0 text-[13.5px] font-semibold tabular-nums',
                                voided ? 'line-through' : tx.kind === 'REVENUE' ? 'text-success-ink' : tx.kind === 'EXPENSE' ? 'text-danger-ink' : 'text-foreground',
                              )}
                            >
                              {formatMoney(signedTxAmount(tx), tx.currency ?? 'LYD', { signed: tx.kind !== 'TRANSFER' })}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
