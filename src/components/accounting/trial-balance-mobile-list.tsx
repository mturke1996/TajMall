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
  total_debit: number;
  total_credit: number;
  balance: number;
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
          <div className="mt-2 flex gap-3 text-[11px] font-mono">
            <span className="text-emerald-700">
              مدين {row.total_debit > 0 ? formatMoney(row.total_debit, '') : '—'}
            </span>
            <span className="text-red-600">
              دائن {row.total_credit > 0 ? formatMoney(row.total_credit, '') : '—'}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TrialBalanceDesktopTable({
  rows,
  year,
  totalDebits,
  totalCredits,
  isBalanced,
  difference,
}: {
  rows: TrialBalanceRowView[];
  year: number;
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  difference: number;
}) {
  return (
    <div className="hidden md:block overflow-x-auto -mx-1 px-1">
      <table className="w-full min-w-[640px] text-right text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground font-semibold">
            <th className="pb-3 pr-2 text-right">رمز الحساب</th>
            <th className="pb-3 text-right">اسم الحساب</th>
            <th className="pb-3 text-right">النوع</th>
            <th className="pb-3 text-left">مدين</th>
            <th className="pb-3 text-left">دائن</th>
            <th className="pb-3 pl-2 text-left">الرصيد</th>
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
              <td className="py-3 text-left font-mono text-emerald-700">
                {row.total_debit > 0 ? formatMoney(row.total_debit, '') : '—'}
              </td>
              <td className="py-3 text-left font-mono text-red-600">
                {row.total_credit > 0 ? formatMoney(row.total_credit, '') : '—'}
              </td>
              <td className="py-3 pl-2 text-left font-mono font-bold">
                {formatMoney(row.balance, 'LYD')}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-border bg-secondary/50 font-bold">
            <td colSpan={3} className="py-4 pr-2 text-right">
              الإجمالي العام
            </td>
            <td className="py-4 text-left font-mono text-emerald-800">
              {formatMoney(totalDebits, 'LYD')}
            </td>
            <td className="py-4 text-left font-mono text-red-700">
              {formatMoney(totalCredits, 'LYD')}
            </td>
            <td
              className={`py-4 pl-2 text-left font-mono ${isBalanced ? 'text-emerald-700' : 'text-red-700'}`}
            >
              {isBalanced ? 'متوازن' : `فارق: ${formatMoney(difference, '')}`}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
