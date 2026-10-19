'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { ExportCsvButton } from '@/components/data/export-csv-button';
import { useTenantRentAccount } from '@/components/tenants/use-tenant-rent-account';
import { RentAccountFailed } from '@/components/tenants/rent-account-failed';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { formatPaymentMethodAr } from '@/features/pdf/pdf-payment';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import type { ContactRow, TransactionWithRelations } from '@/lib/db/types';
import { unlinkedRentReceipts } from '@/lib/tenant-rent-account';
import { buildTenantStatement, statementBalanceLabel, type StatementRow } from '@/lib/tenant-statement';
import { cn, formatDate, formatMoney, todayISODate } from '@/lib/utils';

const amount = (n: number) => (n > 0 ? formatMoney(n, '') : '—');

function BalanceCell({ value }: { value: number }) {
  return (
    <span className={cn('tabular-nums', value > 0.0005 ? 'text-danger-ink' : value < -0.0005 ? 'text-success-ink' : 'text-ink-mute')}>
      {formatMoney(Math.abs(value), '')}
      <span className="ms-1 text-[11.5px] font-normal text-ink-mute">{value > 0.0005 ? 'عليه' : value < -0.0005 ? 'له' : ''}</span>
    </span>
  );
}

/**
 * The tenant's rent statement: rent as each month falls due, every rent receipt, and the running balance
 * — the document a tenant is handed when they ask "what do I owe and why". Built from the same account
 * as the summary above, and reconciled to it at the bottom.
 */
export function TenantRentStatement({
  contact,
  monthlyRent,
  claimStart,
  contractStartYear,
  transactions,
  journalEntries,
}: {
  contact: ContactRow;
  monthlyRent: number;
  claimStart: string | null;
  contractStartYear?: number | null;
  transactions: TransactionWithRelations[];
  journalEntries: JournalEntryRow[];
}) {
  const { account, charges, years, loading, failed, retry } = useTenantRentAccount({
    tenantId: contact.id,
    contactRent: monthlyRent,
    claimStart,
    contractStartYear,
  });
  const [year, setYear] = useState<number | null>(null);

  const unlinked = useMemo(
    () => unlinkedRentReceipts({ receipts: transactions, journalEntries, charges }),
    [transactions, journalEntries, charges],
  );
  const statement = useMemo(
    () =>
      buildTenantStatement({
        account,
        receipts: transactions,
        unlinkedTotal: unlinked.total,
        year,
        methodLabel: (m) => formatPaymentMethodAr(m ?? undefined),
      }),
    [account, transactions, unlinked.total, year],
  );

  const periodLabel = year == null ? 'كل الفترة' : `سنة ${year}`;
  const fileName = `كشف-حساب-${contact.name}-${year ?? 'كل-الفترة'}`;
  const empty = statement.rows.length === 0 && Math.abs(statement.opening) < 0.0005;
  const rec = statement.reconciliation;

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-ink-soft" aria-label="جارٍ التحميل" />
      </div>
    );
  }

  if (failed) {
    return (
      <div className="p-4 sm:p-5">
        <RentAccountFailed onRetry={retry} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-fit max-w-full overflow-x-auto rounded-lg border border-border bg-canvas-sunken p-0.5 no-scrollbar" role="group" aria-label="فترة الكشف">
          {[null, ...years].map((y) => (
            <button
              key={y ?? 'all'}
              type="button"
              aria-pressed={year === y}
              onClick={() => setYear(y)}
              className={cn(
                'h-8 shrink-0 rounded-md px-3 text-[13px] font-medium tabular-nums transition-colors',
                year === y ? 'bg-card text-foreground shadow-xs' : 'text-ink-mute hover:text-foreground',
              )}
            >
              {y ?? 'كل الفترة'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportCsvButton
            fileName={fileName}
            disabled={empty}
            headers={['التاريخ', 'البيان', 'تفاصيل', 'المرجع', 'مستحق', 'مدفوع', 'الرصيد']}
            rows={[
              ...(year != null ? [['', 'رصيد سابق', '', '', '', '', statement.opening]] : []),
              ...statement.rows.map((r) => [r.date, r.label, r.detail ?? '', r.reference ?? '', r.debit || '', r.credit || '', r.balance]),
              ['', 'الرصيد الختامي', '', '', statement.totalDebit, statement.totalCredit, statement.closing],
            ]}
          />
          <TajMallPdfToolbar
            fileName={fileName}
            shareTitle={`كشف حساب الإيجار — ${contact.name}`}
            shareText={`${periodLabel} · ${statementBalanceLabel(statement.closing)} ${formatMoney(Math.abs(statement.closing), 'LYD')}`}
            cacheKey={`${year ?? 'all'}-${statement.rows.length}-${statement.closing}`}
            disabled={empty}
            render={async () => {
              const { TenantStatementPDF } = await import('@/features/pdf/TenantStatementPDF');
              return (
                <TenantStatementPDF
                  tenantName={contact.name}
                  shopNumber={contact.shop_number}
                  phone={contact.phone}
                  periodLabel={periodLabel}
                  issuedOn={todayISODate()}
                  statement={statement}
                />
              );
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        <Figure label={year == null ? 'بداية الكشف' : `رصيد قبل ${year}`}>
          {year == null ? (
            <span className="text-[14px] text-ink-mute">{statement.rows[0] ? formatDate(statement.rows[0].date) : '—'}</span>
          ) : (
            <BalanceCell value={statement.opening} />
          )}
        </Figure>
        <Figure label="الإيجار المستحق">{formatMoney(statement.totalDebit, 'LYD')}</Figure>
        <Figure label="المدفوع">{formatMoney(statement.totalCredit, 'LYD')}</Figure>
        <Figure label={statementBalanceLabel(statement.closing)}>
          <span className={cn(statement.closing > 0.0005 ? 'text-danger-ink' : statement.closing < -0.0005 ? 'text-success-ink' : '')}>
            {formatMoney(Math.abs(statement.closing), 'LYD')}
          </span>
        </Figure>
      </div>

      {empty ? (
        <p className="py-8 text-center text-[13px] text-ink-mute">لا حركات في {periodLabel}.</p>
      ) : (
        <>
          <StatementTable rows={statement.rows} opening={year != null ? statement.opening : null} closing={statement} />
          <StatementList rows={statement.rows} opening={year != null ? statement.opening : null} />
        </>
      )}

      {rec && !empty && (
        <section aria-labelledby="statement-rec" className="flex flex-col gap-2">
          <h3 id="statement-rec" className="px-1 text-[12.5px] font-medium text-ink-mute">
            مطابقة الرصيد مع حساب الأشهر
          </h3>
          <dl className="surface divide-y divide-border overflow-hidden text-[13px]">
            <RecLine label="المستحق على الأشهر التي بدأت" value={rec.owedNow} />
            {rec.paidAhead > 0 && <RecLine label="ناقص: مدفوع مقدماً عن أشهر لم تبدأ" value={-rec.paidAhead} />}
            {rec.unlinked > 0 && <RecLine label="ناقص: محصّل لم يُربط بشهر بعد" value={-rec.unlinked} />}
            {Math.abs(rec.difference) > 0.0005 && (
              <RecLine
                label="فرق في ربط الدفعات بالأشهر"
                hint="دفعة رُبطت بأكثر من مبلغها أو بشهر استُبعد لاحقاً — راجع ربط الإيصالات في تقويم الإيجار."
                value={rec.difference}
                tone="warning"
              />
            )}
            <RecLine label="الرصيد الختامي للكشف" value={statement.closing} strong />
          </dl>
        </section>
      )}

      <p className="px-1 text-[12px] text-ink-mute">
        يُحتسب إيجار كل شهر في أول يوم منه، وتُحتسب الدفعات المرحّلة على بند الإيجار فقط.{' '}
        <Link href={`/transactions?contact=${contact.id}`} className="text-foreground underline-offset-2 hover:underline">
          كل معاملات المستأجر
        </Link>
      </p>
    </div>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card p-3.5">
      <p className="text-[12px] text-ink-mute">{label}</p>
      <p className="text-[15px] font-semibold tabular-nums text-foreground">{children}</p>
    </div>
  );
}

function RecLine({
  label,
  value,
  hint,
  strong,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  strong?: boolean;
  tone?: 'warning';
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2.5">
      <dt className={cn('min-w-0', strong && 'font-semibold text-foreground', tone === 'warning' && 'text-warning-ink')}>
        {label}
        {hint && <span className="mt-0.5 block text-[12px] font-normal text-ink-mute">{hint}</span>}
      </dt>
      <dd className={cn('shrink-0 tabular-nums', strong ? 'font-semibold text-foreground' : 'text-foreground')}>
        {formatMoney(value, 'LYD', { signed: !strong && value < 0 })}
      </dd>
    </div>
  );
}

function StatementTable({
  rows,
  opening,
  closing,
}: {
  rows: StatementRow[];
  opening: number | null;
  closing: { totalDebit: number; totalCredit: number; closing: number };
}) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead className="bg-canvas-sunken/60 text-[12px] text-ink-mute">
          <tr className="border-b border-border">
            <th scope="col" className="px-3 py-2.5 text-start font-medium">التاريخ</th>
            <th scope="col" className="px-3 py-2.5 text-start font-medium">البيان</th>
            <th scope="col" className="px-3 py-2.5 text-end font-medium">مستحق</th>
            <th scope="col" className="px-3 py-2.5 text-end font-medium">مدفوع</th>
            <th scope="col" className="px-3 py-2.5 text-end font-medium">الرصيد</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {opening != null && (
            <tr className="bg-canvas-sunken/30">
              <td className="px-3 py-2.5 text-ink-mute">—</td>
              <td className="px-3 py-2.5 font-medium">رصيد سابق</td>
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5 text-end font-medium">
                <BalanceCell value={opening} />
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="whitespace-nowrap px-3 py-2.5 text-ink-mute tabular-nums">{formatDate(r.date)}</td>
              <td className="px-3 py-2.5">
                {r.transactionId ? (
                  <Link href={`/transactions?highlight=${r.transactionId}`} className="font-medium text-foreground hover:underline">
                    {r.label}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">{r.label}</span>
                )}
                {(r.detail || r.reference) && (
                  <span className="block truncate text-[12px] text-ink-mute">
                    {r.detail}
                    {r.detail && r.reference && ' · '}
                    {r.reference && (
                      <>
                        مرجع <bdi>{r.reference}</bdi>
                      </>
                    )}
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 text-end tabular-nums">{amount(r.debit)}</td>
              <td className="px-3 py-2.5 text-end tabular-nums text-success-ink">{amount(r.credit)}</td>
              <td className="px-3 py-2.5 text-end font-medium">
                <BalanceCell value={r.balance} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border bg-canvas-sunken/40 font-semibold">
          <tr>
            <td className="px-3 py-2.5" />
            <td className="px-3 py-2.5">المجموع</td>
            <td className="px-3 py-2.5 text-end tabular-nums">{formatMoney(closing.totalDebit, '')}</td>
            <td className="px-3 py-2.5 text-end tabular-nums">{formatMoney(closing.totalCredit, '')}</td>
            <td className="px-3 py-2.5 text-end">
              <BalanceCell value={closing.closing} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function StatementList({ rows, opening }: { rows: StatementRow[]; opening: number | null }) {
  return (
    <ul className="surface divide-y divide-border overflow-hidden md:hidden">
      {opening != null && (
        <li className="flex items-center justify-between gap-3 bg-canvas-sunken/30 px-3.5 py-2.5 text-[13px]">
          <span className="font-medium">رصيد سابق</span>
          <BalanceCell value={opening} />
        </li>
      )}
      {rows.map((r) => (
        <li key={r.key} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
          <span className="min-w-0">
            <span className="block text-[13.5px] font-medium text-foreground">{r.label}</span>
            <span className="block truncate text-[12px] text-ink-mute">
              {[formatDate(r.date), r.detail].filter(Boolean).join(' · ')}
              {r.reference && (
                <>
                  {' · '}مرجع <bdi>{r.reference}</bdi>
                </>
              )}
            </span>
          </span>
          <span className="shrink-0 text-end">
            <span className={cn('block text-[13.5px] font-semibold tabular-nums', r.credit > 0 ? 'text-success-ink' : 'text-foreground')}>
              {r.credit > 0 ? formatMoney(-r.credit, '', { signed: true }) : formatMoney(r.debit, '', { signed: true })}
            </span>
            <span className="block text-[12px]">
              <BalanceCell value={r.balance} />
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
