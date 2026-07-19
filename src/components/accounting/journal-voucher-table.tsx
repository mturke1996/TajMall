'use client';

import { cn, formatMoney } from '@/lib/utils';
import {
  journalAmountsBalanced,
  toJournalAmount,
  type JournalVoucherLineInput,
} from '@/lib/journal-entry-display';
import { JournalBalanceBadge } from '@/components/accounting/journal-balance-badge';

export type JournalVoucherTableProps = {
  lines: JournalVoucherLineInput[];
  /** Explicit totals; if omitted, summed from lines */
  totalDebit?: number | string | null;
  totalCredit?: number | string | null;
  density?: 'compact' | 'comfortable';
  className?: string;
  /** Show balance badge above the table */
  showBalanceBadge?: boolean;
  /** Empty-state message */
  emptyLabel?: string;
  /** Optional running-balance column (ledger style) */
  runningBalances?: number[];
  /** Extra header cell when runningBalances provided */
  showRunningBalance?: boolean;
};

function MoneyCell({
  amount,
  side,
  density,
}: {
  amount: number;
  side: 'debit' | 'credit';
  density: 'compact' | 'comfortable';
}) {
  const empty = amount <= 0;
  return (
    <td
      className={cn(
        'text-left font-mono tabular-nums whitespace-nowrap',
        density === 'compact' ? 'px-2 py-1.5 text-[12px]' : 'px-3 py-2.5 text-[13px]',
        !empty && side === 'debit' && 'text-emerald-800',
        !empty && side === 'credit' && 'text-rose-800',
        empty && 'text-ink-mute/50',
      )}
      dir="ltr"
    >
      {empty ? '—' : formatMoney(amount, 'LYD')}
    </td>
  );
}

/**
 * Classic Arabic double-entry voucher grid:
 * الحساب | البيان | مدين | دائن (+ optional رصيد)
 * with a totals footer that proves balance.
 */
export function JournalVoucherTable({
  lines,
  totalDebit,
  totalCredit,
  density = 'comfortable',
  className,
  showBalanceBadge = true,
  emptyLabel = 'لا توجد بنود لهذا القيد',
  runningBalances,
  showRunningBalance = false,
}: JournalVoucherTableProps) {
  const sumDebit = lines.reduce((s, l) => s + toJournalAmount(l.debit), 0);
  const sumCredit = lines.reduce((s, l) => s + toJournalAmount(l.credit), 0);
  const debit = totalDebit != null ? toJournalAmount(totalDebit) : sumDebit;
  const credit = totalCredit != null ? toJournalAmount(totalCredit) : sumCredit;
  const balanced = journalAmountsBalanced(debit, credit);
  const withBalance = showRunningBalance && Array.isArray(runningBalances);
  const colCount = withBalance ? 5 : 4;

  if (lines.length === 0) {
    return (
      <div
        className={cn(
          'rounded-lg border border-dashed border-border bg-canvas-sunken/40 px-4 py-6 text-center text-sm text-ink-mute',
          className,
        )}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)} dir="rtl">
      {showBalanceBadge && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-ink-mute">
            بنود القيد · {lines.length}
          </p>
          <JournalBalanceBadge debit={debit} credit={credit} />
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-ink-mute">
              <th
                className={cn(
                  'text-start font-semibold',
                  density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2',
                )}
              >
                الحساب
              </th>
              <th
                className={cn(
                  'text-start font-semibold',
                  density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2',
                )}
              >
                البيان
              </th>
              <th
                className={cn(
                  'text-left font-semibold text-emerald-800',
                  density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2',
                )}
              >
                مدين
              </th>
              <th
                className={cn(
                  'text-left font-semibold text-rose-800',
                  density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2',
                )}
              >
                دائن
              </th>
              {withBalance && (
                <th
                  className={cn(
                    'text-left font-semibold',
                    density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2',
                  )}
                >
                  الرصيد
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const d = toJournalAmount(line.debit);
              const c = toJournalAmount(line.credit);
              const name = line.accountName?.trim() || '—';
              const code = line.accountCode?.trim();
              return (
                <tr
                  key={line.id ?? `line-${index}`}
                  className="border-b border-border/70 last:border-b-0 hover:bg-muted/20"
                >
                  <td
                    className={cn(
                      'text-start align-top',
                      density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2.5',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-ink-main leading-snug">{name}</p>
                      {code && (
                        <p className="mt-0.5 font-mono text-[10px] text-ink-mute" dir="ltr">
                          {code}
                        </p>
                      )}
                      {line.meta && (
                        <p className="mt-0.5 text-[11px] text-ink-mute leading-snug">
                          {line.meta}
                        </p>
                      )}
                    </div>
                  </td>
                  <td
                    className={cn(
                      'text-start align-top text-ink-mute',
                      density === 'compact' ? 'px-2 py-1.5 text-[12px]' : 'px-3 py-2.5 text-[13px]',
                    )}
                  >
                    {line.description?.trim() || '—'}
                  </td>
                  <MoneyCell amount={d} side="debit" density={density} />
                  <MoneyCell amount={c} side="credit" density={density} />
                  {withBalance && (
                    <td
                      className={cn(
                        'text-left font-mono tabular-nums whitespace-nowrap align-top',
                        density === 'compact' ? 'px-2 py-1.5 text-[12px]' : 'px-3 py-2.5 text-[13px]',
                      )}
                      dir="ltr"
                    >
                      {formatMoney(runningBalances![index] ?? 0, 'LYD')}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr
              className={cn(
                'border-t-2 font-semibold',
                balanced
                  ? 'border-emerald-600/40 bg-emerald-50/50'
                  : 'border-rose-600/40 bg-rose-50/50',
              )}
            >
              <td
                colSpan={2}
                className={cn(
                  'text-start',
                  density === 'compact' ? 'px-2 py-2 text-xs' : 'px-3 py-2.5 text-sm',
                )}
              >
                الإجمالي
                {!balanced && (
                  <span className="ms-2 text-[11px] font-normal text-rose-700">
                    (المدين ≠ الدائن)
                  </span>
                )}
              </td>
              <td
                className={cn(
                  'text-left font-mono tabular-nums text-emerald-900',
                  density === 'compact' ? 'px-2 py-2 text-[12px]' : 'px-3 py-2.5 text-[13px]',
                )}
                dir="ltr"
              >
                {formatMoney(debit, 'LYD')}
              </td>
              <td
                className={cn(
                  'text-left font-mono tabular-nums text-rose-900',
                  density === 'compact' ? 'px-2 py-2 text-[12px]' : 'px-3 py-2.5 text-[13px]',
                )}
                dir="ltr"
              >
                {formatMoney(credit, 'LYD')}
              </td>
              {withBalance && (
                <td
                  className={cn(
                    'text-left text-ink-mute',
                    density === 'compact' ? 'px-2 py-2 text-[12px]' : 'px-3 py-2.5 text-[13px]',
                  )}
                >
                  —
                </td>
              )}
            </tr>
            {/* Keep colCount referenced for a11y / future cols */}
            <tr className="sr-only">
              <td colSpan={colCount}>balance row</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
