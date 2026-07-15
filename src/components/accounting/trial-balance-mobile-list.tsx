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
                className="font-semibold text-sm text-foreground hover:text-sage-800 touch-manipulation"
              >
                {row.name_ar}
              </Link>
              <p className="mt-0.5 text-[11px] text-muted-foreground font-mono">
                {row.code} · {accountTypeLabelAr(row.type)}
              </p>
            </div>
            <p className="shrink-0 font-mono text-sm font-bold tabular-nums">
              {formatMoney(row.balance, 'LYD')}
            </p>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[10.5px] font-mono">
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
                <span className="text-emerald-700">
                  {row.period_debit > 0 ? formatMoney(row.period_debit, '') : '—'}
                </span>
                {' / '}
                <span className="text-red-600">
                  {row.period_credit > 0 ? formatMoney(row.period_credit, '') : '—'}
                </span>
              </p>
            </div>
            <div className="rounded-md bg-secondary/40 px-2 py-1">
              <p className="text-muted-foreground">ختامي</p>
              <p className="tabular-nums">
                <span className="text-emerald-700">
                  {row.total_debit > 0 ? formatMoney(row.total_debit, '') : '—'}
                </span>
                {' / '}
                <span className="text-red-600">
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
      <table className="w-full min-w-[960px] text-right text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground font-semibold">
            <th className="pb-3 pr-2 text-right">رمز الحساب</th>
            <th className="pb-3 text-right">اسم الحساب</th>
            <th className="pb-3 text-right">النوع</th>
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
            <th className="pb-2 pr-2" />
            <th className="pb-2" />
            <th className="pb-2" />
            <th className="pb-2 text-left text-emerald-700">مدين</th>
            <th className="pb-2 text-left text-red-600">دائن</th>
            <th className="pb-2 text-left text-emerald-700">مدين</th>
            <th className="pb-2 text-left text-red-600">دائن</th>
            <th className="pb-2 text-left text-emerald-700">مدين</th>
            <th className="pb-2 pl-2 text-left text-red-600">دائن</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.category_id} className="hover:bg-secondary/40">
              <td className="py-3 pr-2 font-mono text-muted-foreground">{row.code}</td>
              <td className="py-3 font-semibold">
                <Link
                  href={ledgerUrl(row.category_id, year)}
                  className="hover:text-sage-800 hover:underline touch-manipulation"
                >
                  {row.name_ar}
                </Link>
              </td>
              <td className="py-3 text-muted-foreground">{accountTypeLabelAr(row.type)}</td>
              <td className="py-3 text-left font-mono text-emerald-700">{num(row.opening_debit)}</td>
              <td className="py-3 text-left font-mono text-red-600">{num(row.opening_credit)}</td>
              <td className="py-3 text-left font-mono text-emerald-700">{num(row.period_debit)}</td>
              <td className="py-3 text-left font-mono text-red-600">{num(row.period_credit)}</td>
              <td className="py-3 text-left font-mono font-semibold text-emerald-700">
                {num(row.total_debit)}
              </td>
              <td className="py-3 pl-2 text-left font-mono font-semibold text-red-600">
                {num(row.total_credit)}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-border bg-secondary/50 font-bold">
            <td className="py-4 pr-2 text-right" colSpan={3}>
              الإجمالي العام
            </td>
            <td className="py-4 text-left font-mono text-emerald-800">
              {formatMoney(summary.total_opening_debit, '')}
            </td>
            <td className="py-4 text-left font-mono text-red-700">
              {formatMoney(summary.total_opening_credit, '')}
            </td>
            <td className="py-4 text-left font-mono text-emerald-800">
              {formatMoney(summary.total_period_debit, '')}
            </td>
            <td className="py-4 text-left font-mono text-red-700">
              {formatMoney(summary.total_period_credit, '')}
            </td>
            <td className="py-4 text-left font-mono text-emerald-800">
              {formatMoney(summary.total_closing_debit, 'LYD')}
            </td>
            <td className="py-4 pl-2 text-left font-mono text-red-700">
              {formatMoney(summary.total_closing_credit, 'LYD')}
            </td>
          </tr>
          <tr className="bg-secondary/30 text-sm">
            <td className="py-3 pr-2 text-right text-muted-foreground" colSpan={7}>
              حالة التوازن (على الأرصدة الختامية)
            </td>
            <td
              className={`py-3 pl-2 text-left font-mono font-bold ${isBalanced ? 'text-emerald-700' : 'text-red-700'}`}
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
