'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  Loader2,
  Wallet,
  Landmark,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/empty-state';
import { CashboxTransferDialog } from '@/components/cashboxes/cashbox-transfer-dialog';
import {
  LEDGER_KIND_LABELS,
  useCashboxLedger,
  type CashboxLedgerRow,
} from '@/lib/db/cashbox-queries';
import { useCashboxBalances } from '@/lib/db/queries';
import { usePermission } from '@/lib/supabase/use-permission';
import { cn, formatMoney, formatDate, formatShortDate } from '@/lib/utils';

type FilterKind = 'all' | 'in' | 'out' | 'transfer';

function ledgerLink(row: CashboxLedgerRow): string | null {
  if (row.source_type === 'transaction') {
    if (row.event_kind === 'REVENUE') return `/revenues?highlight=${row.event_id}`;
    if (row.event_kind === 'EXPENSE') return `/expenses?highlight=${row.event_id}`;
    return `/transactions?highlight=${row.event_id}`;
  }
  if (row.counter_cashbox_id) return `/cashboxes/${row.counter_cashbox_id}`;
  return null;
}

export default function CashboxLedgerPage() {
  const params = useParams<{ id: string }>();
  const cashboxId = params.id;
  const { can } = usePermission();
  const canManage = can('cashbox.manage');

  const { data: ledger, isLoading, isError } = useCashboxLedger(cashboxId);
  const { data: balances = [] } = useCashboxBalances();
  const balanceRow = balances.find((b) => b.id === cashboxId);

  const [filter, setFilter] = useState<FilterKind>('all');
  const [transferOpen, setTransferOpen] = useState(false);

  const filteredRows = useMemo(() => {
    const rows = ledger?.rows ?? [];
    if (filter === 'all') return rows;
    if (filter === 'in') return rows.filter((r) => r.direction === 'in');
    if (filter === 'out') return rows.filter((r) => r.direction === 'out');
    return rows.filter((r) => r.source_type === 'cash_transfer');
  }, [ledger?.rows, filter]);

  const Icon = ledger?.kind === 'BANK' || ledger?.kind === 'CARD' ? Landmark : Wallet;

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-sage-600" />
      </div>
    );
  }

  if (isError || !ledger) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-[15px] font-semibold">تعذّر تحميل سجل الخزينة</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/cashboxes">العودة للخزائن</Link>
        </Button>
      </div>
    );
  }

  const currency = ledger.currency || 'LYD';
  const totalIn = ledger.rows.filter((r) => r.direction === 'in').reduce((s, r) => s + Math.abs(r.signed_amount), 0);
  const totalOut = ledger.rows.filter((r) => r.direction === 'out').reduce((s, r) => s + Math.abs(r.signed_amount), 0);

  const filterChips: { key: FilterKind; label: string }[] = [
    { key: 'all', label: 'الكل' },
    { key: 'in', label: 'وارد' },
    { key: 'out', label: 'صادر' },
    { key: 'transfer', label: 'تحويلات' },
  ];

  return (
    <>
      <PageHeader
        eyebrow="الخزائن والمصارف"
        title={ledger.name_ar}
        description={`سجل حركات ${ledger.kind === 'CASH' ? 'الخزينة النقدية' : 'الحساب المصرفي'} — ${ledger.code}`}
        actions={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button variant="outline" size="sm" asChild>
              <Link href="/cashboxes">
                <ArrowLeft className="h-4 w-4" />
                كل الخزائن
              </Link>
            </Button>
            {canManage ? (
              <Button size="sm" className="gap-1.5" onClick={() => setTransferOpen(true)}>
                <ArrowLeftRight className="h-4 w-4" />
                تحويل من هذه الخزينة
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="surface p-4 col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3">
              <span
                className="grid h-10 w-10 place-items-center rounded-md border"
                style={{
                  background: `${balanceRow?.color ?? '#6E7470'}1f`,
                  borderColor: `${balanceRow?.color ?? '#6E7470'}55`,
                }}
              >
                <Icon className="h-4 w-4" style={{ color: balanceRow?.color ?? undefined }} />
              </span>
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-ink-mute">الرصيد الحالي</p>
                <p className="num text-[22px] font-bold tabular-nums">
                  {formatMoney(ledger.current_balance, currency)}
                </p>
              </div>
            </div>
          </div>
          <div className="surface p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink-mute">افتتاحي</p>
            <p className="num mt-1 text-[16px] font-semibold">{formatMoney(ledger.opening_balance, currency)}</p>
          </div>
          <div className="surface p-4">
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-pastel-greenInk">
              <ArrowDownToLine className="h-3 w-3" /> وارد
            </p>
            <p className="num mt-1 text-[16px] font-semibold text-pastel-greenInk">
              + {formatMoney(totalIn, currency, { compact: true })}
            </p>
          </div>
          <div className="surface p-4">
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-pastel-redInk">
              <ArrowUpFromLine className="h-3 w-3" /> صادر
            </p>
            <p className="num mt-1 text-[16px] font-semibold text-pastel-redInk">
              − {formatMoney(totalOut, currency, { compact: true })}
            </p>
          </div>
        </div>

        <div className="surface overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-sage-700" />
              <div>
                <h2 className="text-[14px] font-semibold">سجل الحركات</h2>
                <p className="text-[11.5px] text-ink-mute">{filteredRows.length} حركة</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setFilter(chip.key)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors',
                    filter === chip.key
                      ? 'bg-sage-800 text-white'
                      : 'bg-canvas-sunken text-ink-mute hover:text-foreground',
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="لا توجد حركات"
              description="ستظهر الإيرادات والمصروفات والتحويلات هنا فور تسجيلها على هذه الخزينة."
              className="border-0 bg-transparent"
            />
          ) : (
            <>
              <div className="divide-y divide-border md:hidden">
                {filteredRows.map((row) => (
                  <LedgerMobileRow key={`${row.source_type}-${row.event_id}-${row.event_kind}`} row={row} currency={currency} />
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-border bg-canvas-sunken/50 text-[10px] uppercase tracking-[0.14em] text-ink-mute">
                      <th className="px-4 py-2.5 text-right font-semibold">التاريخ</th>
                      <th className="px-4 py-2.5 text-right font-semibold">المرجع</th>
                      <th className="px-4 py-2.5 text-right font-semibold">النوع</th>
                      <th className="px-4 py-2.5 text-right font-semibold">البيان</th>
                      <th className="px-4 py-2.5 text-left font-semibold">المبلغ</th>
                      <th className="px-4 py-2.5 text-left font-semibold">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => {
                      const href = ledgerLink(row);
                      const kindLabel = LEDGER_KIND_LABELS[row.event_kind] ?? row.event_kind;
                      const isIn = row.direction === 'in';
                      return (
                        <tr key={`${row.source_type}-${row.event_id}-${row.event_kind}`} className="border-b border-border/70 hover:bg-canvas-sunken/30">
                          <td className="px-4 py-3 whitespace-nowrap" dir="ltr">
                            {formatShortDate(row.event_date)}
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-ink-mute" dir="ltr">
                            {row.reference ?? row.seq_label ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={isIn ? 'success' : row.event_kind.startsWith('TRANSFER') ? 'info' : 'danger'}>
                              {kindLabel}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 max-w-[280px]">
                            <p className="truncate">{row.description ?? '—'}</p>
                            {row.counter_name_ar ? (
                              <p className="mt-0.5 text-[11px] text-ink-mute">
                                {isIn ? 'من' : 'إلى'}:{' '}
                                {href ? (
                                  <Link href={href} className="font-medium text-sage-700 hover:underline">
                                    {row.counter_name_ar}
                                  </Link>
                                ) : (
                                  row.counter_name_ar
                                )}
                              </p>
                            ) : null}
                          </td>
                          <td className={cn('num px-4 py-3 text-left font-bold tabular-nums', isIn ? 'text-pastel-greenInk' : 'text-pastel-redInk')}>
                            {isIn ? '+' : '−'} {formatMoney(Math.abs(row.signed_amount), currency)}
                          </td>
                          <td className="num px-4 py-3 text-left font-semibold tabular-nums text-ink-mute">
                            {formatMoney(row.balance_after, currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      <CashboxTransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        defaultFromId={cashboxId}
      />
    </>
  );
}

function LedgerMobileRow({ row, currency }: { row: CashboxLedgerRow; currency: string }) {
  const href = ledgerLink(row);
  const kindLabel = LEDGER_KIND_LABELS[row.event_kind] ?? row.event_kind;
  const isIn = row.direction === 'in';

  return (
    <article className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <Badge variant={isIn ? 'success' : row.event_kind.startsWith('TRANSFER') ? 'info' : 'danger'}>
          {kindLabel}
        </Badge>
        <span className={cn('num text-[15px] font-bold tabular-nums', isIn ? 'text-pastel-greenInk' : 'text-pastel-redInk')}>
          {isIn ? '+' : '−'} {formatMoney(Math.abs(row.signed_amount), currency)}
        </span>
      </div>
      <p className="mt-2 text-[13px] font-medium leading-snug">{row.description ?? '—'}</p>
      {row.counter_name_ar ? (
        <p className="mt-1 text-[12px] text-ink-mute">
          {isIn ? 'من' : 'إلى'}:{' '}
          {href ? (
            <Link href={href} className="font-semibold text-sage-700">
              {row.counter_name_ar}
            </Link>
          ) : (
            row.counter_name_ar
          )}
        </p>
      ) : null}
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-ink-mute">
        <span className="font-mono" dir="ltr">
          {row.reference ?? row.seq_label ?? '—'}
        </span>
        <span dir="ltr">{formatDate(row.event_date)}</span>
      </div>
      <p className="mt-1 text-[11px] text-ink-mute">
        الرصيد بعد الحركة:{' '}
        <span className="num font-semibold text-foreground">{formatMoney(row.balance_after, currency)}</span>
      </p>
    </article>
  );
}
