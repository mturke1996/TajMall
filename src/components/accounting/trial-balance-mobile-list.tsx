'use client';

import Link from 'next/link';
import { formatMoney } from '@/lib/utils';
import { ledgerUrl } from '@/lib/accounting-nav';
import { accountTypeLabelAr } from '@/lib/accounting-labels';

export type TrialBalanceRowView = {
  category_id: string;
  code: string;
  name_ar: string;
  type: string;
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  // Closing-side balances (debit/credit split of the closing balance).
  // Kept under total_debit/total_credit names so the balance check and PDF
  // verify the ledger on closing balances rather than period movements.
  total_debit: number;
  total_credit: number;
  balance: number;
};

export type TrialBalanceSummary = {
  total_opening_debit: number;
  total_opening_credit: number;
  total_period_debit: number;
  total_period_credit: number;
  total_closing_debit: number;
  total_closing_credit: number;
};

export function TrialBalanceMobileList({
  rows,
  year,
}: {
  rows: TrialBalanceRowView[];
  year: number;
}) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden md:hidden">
      {rows.map((row) => (
        <li key={row.category_id} className="px-3 py-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <Link
                href={ledgerUrl(row.category_id, year)}
                className="font-semibold text-sm text-foreground hover:text-foreground touch-manipulation"
              >
                {row.name_ar}
              </Link>
              <p className="mt-0.5 text-[11px] text-muted-foreground font-mono">
                {row.code} · {accountTypeLabelAr(row.type)}
              </p>
            </div>
            {/* closing balance is debit − credit: show the amount with its side, like the desktop columns */}
            <p className="shrink-0 text-end font-mono text-sm font-bold tabular-nums">
              {Math.abs(row.balance) < 0.0005 ? '—' : formatMoney(Math.abs(row.balance), 'LYD')}
              {Math.abs(row.balance) >= 0.0005 && (
                <span className="block text-[11px] font-normal text-muted-foreground">
                  {row.balance > 0 ? 'مدين' : 'دائن'}
                </span>
              )}
            </p>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[11.5px] font-mono">
            <div className="rounded-md bg-secondary/40 px-2 py-1">
              <p className="text-muted-foreground">افتتاحي</p>
              <p className="tabular-nums text-foreground">
                {row.opening_debit > 0
                  ? formatMoney(row.opening_debit, '')
                  : row.opening_credit > 0
                    ? `(${formatMoney(row.opening_credit, '')})`
                    : '—'}
              </p>
            </div>
            <div className="rounded-md bg-secondary/40 px-2 py-1">
              <p className="text-muted-foreground">حركة</p>
              <p className="tabular-nums">
                <span className="text-success-ink">
                  {row.period_debit > 0 ? formatMoney(row.period_debit, '') : '—'}
                </span>
                {' / '}
                <span className="text-danger">
                  {row.period_credit > 0 ? formatMoney(row.period_credit, '') : '—'}
                </span>
              </p>
            </div>
            <div className="rounded-md bg-secondary/40 px-2 py-1">
              <p className="text-muted-foreground">ختامي</p>
              <p className="tabular-nums">
                <span className="text-success-ink">
                  {row.total_debit > 0 ? formatMoney(row.total_debit, '') : '—'}
                </span>
                {' / '}
                <span className="text-danger">
                  {row.total_credit > 0 ? formatMoney(row.total_credit, '') : '—'}
                </span>
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TrialBalanceDesktopTable({
  rows,
  year,
  summary,
  isBalanced,
  difference,
}: {
  rows: TrialBalanceRowView[];
  year: number;
  summary: TrialBalanceSummary;
  isBalanced: boolean;
  difference: number;
}) {
  const num = (v: number) => (v > 0 ? formatMoney(v, '') : '—');
  return (
    <div className="hidden md:block overflow-x-auto -mx-1 px-1">
      <table className="w-full min-w-[960px] text-start text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground font-semibold">
            <th className="pb-3 ps-2 text-start">رمز الحساب</th>
            <th className="pb-3 text-start">اسم الحساب</th>
            <th className="pb-3 text-start">النوع</th>
            <th className="pb-3 text-center" colSpan={2}>
              رصيد افتتاحي
            </th>
            <th className="pb-3 text-center" colSpan={2}>
              حركة الفترة
            </th>
            <th className="pb-3 text-center" colSpan={2}>
              رصيد ختامي
            </th>
          </tr>
          <tr className="border-b border-border text-[11px] text-muted-foreground">
            <th className="pb-2 ps-2" />
            <th className="pb-2" />
            <th className="pb-2" />
            <th className="pb-2 text-end text-success-ink">مدين</th>
            <th className="pb-2 text-end text-danger">دائن</th>
            <th className="pb-2 text-end text-success-ink">مدين</th>
            <th className="pb-2 text-end text-danger">دائن</th>
            <th className="pb-2 text-end text-success-ink">مدين</th>
            <th className="pb-2 pe-2 text-end text-danger">دائن</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.category_id} className="hover:bg-secondary/40">
              <td className="py-3 ps-2 font-mono text-muted-foreground">{row.code}</td>
              <td className="py-3 font-semibold">
                <Link
                  href={ledgerUrl(row.category_id, year)}
                  className="hover:text-foreground hover:underline touch-manipulation"
                >
                  {row.name_ar}
                </Link>
              </td>
              <td className="py-3 text-muted-foreground">{accountTypeLabelAr(row.type)}</td>
              <td className="py-3 text-end font-mono text-success-ink">{num(row.opening_debit)}</td>
              <td className="py-3 text-end font-mono text-danger">{num(row.opening_credit)}</td>
              <td className="py-3 text-end font-mono text-success-ink">{num(row.period_debit)}</td>
              <td className="py-3 text-end font-mono text-danger">{num(row.period_credit)}</td>
              <td className="py-3 text-end font-mono font-semibold text-success-ink">
                {num(row.total_debit)}
              </td>
              <td className="py-3 pe-2 text-end font-mono font-semibold text-danger">
                {num(row.total_credit)}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-border bg-secondary/50 font-bold">
            <td className="py-4 ps-2 text-start" colSpan={3}>
              الإجمالي العام
            </td>
            <td className="py-4 text-end font-mono text-success-ink">
              {formatMoney(summary.total_opening_debit, '')}
            </td>
            <td className="py-4 text-end font-mono text-danger-ink">
              {formatMoney(summary.total_opening_credit, '')}
            </td>
            <td className="py-4 text-end font-mono text-success-ink">
              {formatMoney(summary.total_period_debit, '')}
            </td>
            <td className="py-4 text-end font-mono text-danger-ink">
              {formatMoney(summary.total_period_credit, '')}
            </td>
            <td className="py-4 text-end font-mono text-success-ink">
              {formatMoney(summary.total_closing_debit, 'LYD')}
            </td>
            <td className="py-4 pe-2 text-end font-mono text-danger-ink">
              {formatMoney(summary.total_closing_credit, 'LYD')}
            </td>
          </tr>
          <tr className="bg-secondary/30 text-sm">
            <td className="py-3 ps-2 text-start text-muted-foreground" colSpan={7}>
              حالة التوازن (على الأرصدة الختامية)
            </td>
            <td
              className={`py-3 pe-2 text-end font-mono font-bold ${isBalanced ? 'text-success-ink' : 'text-danger-ink'}`}
              colSpan={2}
            >
              {isBalanced ? 'متوازن ✓' : `غير متوازن — فارق ${formatMoney(difference, 'LYD')}`}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
