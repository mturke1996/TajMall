'use client';

import Link from 'next/link';
import { cn, formatDate, formatMoney } from '@/lib/utils';

export type LedgerLineView = {
  journal_id?: string | null;
  journal_number?: string | number | null;
  journal_reference?: string | null;
  entry_date?: string | null;
  description?: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
};

export function LedgerMobileList({ lines }: { lines: LedgerLineView[] }) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden md:hidden">
      {lines.map((line, idx) => (
        <li key={`${line.journal_id}-${idx}`} className="px-3 py-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug line-clamp-2">
                {line.description || '—'}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground font-mono">
                {line.entry_date ? formatDate(line.entry_date) : '—'}
                {line.journal_number != null && line.journal_number !== ''
                  ? ` · قيد #${line.journal_number}`
                  : ''}
              </p>
              {line.journal_id && (
                <Link
                  href={`/journals?highlight=${line.journal_id}`}
                  className="mt-1.5 inline-block text-xs font-semibold text-foreground touch-manipulation"
                >
                  عرض القيد
                </Link>
              )}
            </div>
            <div className="shrink-0 text-end space-y-1">
              {line.debit > 0 && (
                <p className="text-xs font-mono font-semibold text-success-ink">
                  مدين {formatMoney(Math.abs(line.debit), '', { signed: true })}
                </p>
              )}
              {line.credit > 0 && (
                <p className="text-xs font-mono font-semibold text-danger">
                  دائن {formatMoney(-Math.abs(line.credit), '', { signed: true })}
                </p>
              )}
              <p className="text-[11px] font-mono font-bold text-foreground">
                {formatMoney(line.runningBalance, 'LYD')}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function LedgerDesktopTable({ lines }: { lines: LedgerLineView[] }) {
  return (
    <div className="hidden md:block overflow-x-auto -mx-1 px-1">
      <table className="w-full min-w-[720px] text-start text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground font-medium">
            <th className="pb-3 ps-2 text-start">التاريخ</th>
            <th className="pb-3 text-start">رقم القيد</th>
            <th className="pb-3 text-start">المرجع</th>
            <th className="pb-3 text-start">البيان</th>
            <th className="pb-3 text-end">مدين</th>
            <th className="pb-3 text-end">دائن</th>
            <th className="pb-3 pe-2 text-end">الرصيد</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lines.map((line, idx) => (
            <tr key={`${line.journal_id}-${idx}`} className="hover:bg-secondary/40">
              <td className="py-3 ps-2 font-mono text-muted-foreground">
                {line.entry_date ? formatDate(line.entry_date) : '—'}
              </td>
              <td className="py-3 font-mono font-medium">
                {line.journal_id ? (
                  <Link
                    href={`/journals?highlight=${line.journal_id}`}
                    className="text-foreground hover:underline touch-manipulation"
                  >
                    #{line.journal_number ?? '—'}
                  </Link>
                ) : (
                  <>#{line.journal_number ?? '—'}</>
                )}
              </td>
              <td className="py-3 font-mono text-xs text-muted-foreground">
                {line.journal_reference || '—'}
              </td>
              <td className="py-3 max-w-xs truncate" title={line.description || ''}>
                {line.description || '—'}
              </td>
              <td
                className={cn(
                  'py-3 text-end font-mono font-medium',
                  line.debit > 0 ? 'text-success-ink' : 'text-muted-foreground/40',
                )}
              >
                {line.debit > 0 ? `+${formatMoney(line.debit, '')}` : '—'}
              </td>
              <td
                className={cn(
                  'py-3 text-end font-mono font-medium',
                  line.credit > 0 ? 'text-danger' : 'text-muted-foreground/40',
                )}
              >
                {line.credit > 0 ? formatMoney(-Math.abs(line.credit), '', { signed: true }) : '—'}
              </td>
              <td className="py-3 pe-2 text-end font-mono font-bold">
                {formatMoney(line.runningBalance, 'LYD')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
