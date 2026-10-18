'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Loader2, Search } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { ExportCsvButton } from '@/components/data/export-csv-button';
import { Input } from '@/components/ui/input';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { formatPaymentMethodAr } from '@/features/pdf/pdf-payment';
import { useTenantStatementSources } from '@/lib/db/tenant-statements-queries';
import {
  buildTenantStatementsReport,
  statementTotals,
  type TenantStatementLine,
} from '@/lib/tenant-statements-report';
import { matchesSearch } from '@/lib/arabic-search';
import { currentYear } from '@/lib/rent-months';
import { friendlyError } from '@/lib/user-messages';
import { arabicCount, cn, formatMoney, todayISODate } from '@/lib/utils';

const EPS = 0.0005;
const tenantsLabel = (n: number) => arabicCount(n, ['مستأجر واحد', 'مستأجران', 'مستأجرين', 'مستأجراً']);
const methodLabel = (m: string | null | undefined) => formatPaymentMethodAr(m ?? undefined);

function Balance({ value, strong, currency = '' }: { value: number; strong?: boolean; currency?: string }) {
  return (
    <span
      className={cn(
        'tabular-nums',
        strong && 'font-semibold',
        value > EPS ? 'text-danger-ink' : value < -EPS ? 'text-success-ink' : 'text-ink-mute',
      )}
    >
      {formatMoney(Math.abs(value), currency)}
      <span className="ms-1 text-[11.5px] font-normal text-ink-mute">{value > EPS ? 'عليه' : value < -EPS ? 'له' : ''}</span>
    </span>
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

const statementHref = (id: string) => `/contacts/${id}?tab=statement`;

/**
 * Every tenant's rent balance for a year (or the whole account), each built exactly like the statement
 * in the tenant's file, with the mall totals — and all the statements in one PDF for month-end.
 */
export default function TenantStatementsPage() {
  const { data: sources = [], isLoading, isError, error } = useTenantStatementSources();
  const [year, setYear] = useState<number | null>(() => currentYear());
  const [query, setQuery] = useState('');
  const [owedOnly, setOwedOnly] = useState(false);

  const years = useMemo(() => {
    const now = currentYear();
    const first = Math.min(
      now,
      ...sources.map((s) => s.contractStartYear ?? now).filter((y) => y > 1990),
    );
    const list: number[] = [];
    for (let y = now; y >= Math.max(first, now - 5); y--) list.push(y);
    return list;
  }, [sources]);

  const report = useMemo(() => buildTenantStatementsReport(sources, year, methodLabel), [sources, year]);

  const lines = useMemo(
    () =>
      report.lines.filter(
        (l: TenantStatementLine) =>
          (!owedOnly || l.statement.closing > EPS) &&
          matchesSearch(query, [l.tenant.name, l.tenant.shop_number, l.tenant.phone]),
      ),
    [report.lines, owedOnly, query],
  );
  const filtered = lines.length !== report.lines.length;
  const totals = useMemo(() => (filtered ? statementTotals(lines) : report.totals), [filtered, lines, report.totals]);

  const periodLabel = year == null ? 'كل الفترة' : `سنة ${year}`;
  const fileName = `كشوف-حساب-المستأجرين-${year ?? 'كل-الفترة'}`;

  return (
    <>
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="كشوف حساب المستأجرين"
        description="رصيد كل مستأجر محسوباً كما في كشف حسابه في ملفه، مع مجاميع المول — وكل الكشوف في ملف PDF واحد لنهاية الشهر."
        actions={
          <>
            <ExportCsvButton
              fileName={fileName}
              disabled={lines.length === 0}
              headers={['المحل', 'المستأجر', 'الهاتف', ...(year != null ? [`رصيد قبل ${year}`] : []), 'المستحق', 'المدفوع', 'الرصيد', '']}
              rows={lines.map(({ tenant, statement: s }) => [
                tenant.shop_number ?? '',
                tenant.name,
                tenant.phone ?? '',
                ...(year != null ? [s.opening] : []),
                s.totalDebit,
                s.totalCredit,
                Math.abs(s.closing),
                s.closing > EPS ? 'عليه' : s.closing < -EPS ? 'له' : '',
              ])}
            />
            <TajMallPdfToolbar
              fileName={fileName}
              shareTitle="كشوف حساب المستأجرين"
              shareText={`${periodLabel} · ${tenantsLabel(lines.length)} · على المستأجرين ${formatMoney(totals.owed, 'LYD')}`}
              cacheKey={`${year ?? 'all'}:${owedOnly}:${query.trim()}:${lines.length}:${totals.closing}`}
              disabled={lines.length === 0}
              openLabel="الكشوف PDF"
              render={async () => {
                const { TenantStatementsBatchPDF } = await import('@/features/pdf/TenantStatementsBatchPDF');
                return (
                  <TenantStatementsBatchPDF
                    report={{ ...report, lines, totals }}
                    periodLabel={periodLabel}
                    issuedOn={todayISODate()}
                  />
                );
              }}
            />
          </>
        }
      />

      <AccountingPageBody>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="flex w-fit max-w-full overflow-x-auto rounded-lg border border-border bg-canvas-sunken p-0.5 no-scrollbar"
            role="group"
            aria-label="فترة الكشوف"
          >
            {[...years, null].map((y) => (
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex h-9 cursor-pointer items-center gap-2 text-[13px] text-ink-soft">
              <input
                type="checkbox"
                checked={owedOnly}
                onChange={(e) => setOwedOnly(e.target.checked)}
                className="h-4 w-4 accent-foreground"
              />
              من عليهم رصيد فقط
            </label>
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث بالاسم أو رقم المحل"
                aria-label="بحث في المستأجرين"
                className="h-9 ps-9"
              />
            </div>
          </div>
        </div>

        {/* opening + due − paid = the balances: with a year selected all four parts are shown */}
        <div
          className={cn(
            'grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border',
            year != null ? 'sm:grid-cols-5 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1' : 'sm:grid-cols-4',
          )}
        >
          {year != null && (
            <Figure label={`رصيد قبل ${year}`}>
              <Balance value={totals.opening} currency="LYD" />
            </Figure>
          )}
          <Figure label="الإيجار المستحق">{formatMoney(totals.debit, 'LYD')}</Figure>
          <Figure label="المدفوع">{formatMoney(totals.credit, 'LYD')}</Figure>
          <Figure label="على المستأجرين">
            <span className={totals.owed > EPS ? 'text-danger-ink' : ''}>{formatMoney(totals.owed, 'LYD')}</span>
          </Figure>
          <Figure label="مدفوع مقدماً">
            <span className={totals.ahead > EPS ? 'text-success-ink' : ''}>{formatMoney(totals.ahead, 'LYD')}</span>
          </Figure>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-ink-mute">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            جارٍ إعداد كشوف المستأجرين…
          </div>
        ) : isError ? (
          <p className="py-10 text-center text-[13px] text-danger-ink">{friendlyError(error, 'تعذّر تحميل الكشوف. أعد المحاولة.')}</p>
        ) : lines.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-ink-mute">
            {report.lines.length === 0 ? `لا مستحقات ولا دفعات في ${periodLabel}.` : 'لا مستأجرين يطابقون البحث.'}
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead className="bg-canvas-sunken/60 text-[12px] text-ink-mute">
                  <tr className="border-b border-border">
                    <th scope="col" className="px-3 py-2.5 text-start font-medium">المحل</th>
                    <th scope="col" className="px-3 py-2.5 text-start font-medium">المستأجر</th>
                    {year != null && <th scope="col" className="px-3 py-2.5 text-end font-medium">رصيد قبل {year}</th>}
                    <th scope="col" className="px-3 py-2.5 text-end font-medium">المستحق</th>
                    <th scope="col" className="px-3 py-2.5 text-end font-medium">المدفوع</th>
                    <th scope="col" className="px-3 py-2.5 text-end font-medium">الرصيد</th>
                    <th scope="col" className="w-10 px-3 py-2.5"><span className="sr-only">الكشف</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map(({ tenant, statement: s }) => (
                    <tr key={tenant.id} className="hover:bg-canvas-sunken/40">
                      <td className="px-3 py-2.5 tabular-nums text-ink-soft">{tenant.shop_number || '—'}</td>
                      <td className="px-3 py-2.5">
                        <Link href={statementHref(tenant.id)} className="font-medium text-foreground hover:underline underline-offset-2">
                          {tenant.name}
                        </Link>
                        {!tenant.is_active && <span className="ms-2 text-[11.5px] text-ink-mute">غير نشط</span>}
                      </td>
                      {year != null && (
                        <td className="px-3 py-2.5 text-end"><Balance value={s.opening} /></td>
                      )}
                      <td className="px-3 py-2.5 text-end tabular-nums">{s.totalDebit > 0 ? formatMoney(s.totalDebit, '') : '—'}</td>
                      <td className="px-3 py-2.5 text-end tabular-nums text-success-ink">{s.totalCredit > 0 ? formatMoney(s.totalCredit, '') : '—'}</td>
                      <td className="px-3 py-2.5 text-end"><Balance value={s.closing} strong /></td>
                      <td className="px-3 py-2.5 text-end">
                        <Link href={statementHref(tenant.id)} aria-label={`كشف ${tenant.name}`} className="inline-flex text-ink-mute hover:text-foreground">
                          <ChevronLeft className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border bg-canvas-sunken/40 font-semibold">
                  <tr>
                    <td className="px-3 py-2.5" colSpan={2}>المجموع ({tenantsLabel(lines.length)})</td>
                    {year != null && <td className="px-3 py-2.5 text-end"><Balance value={totals.opening} /></td>}
                    <td className="px-3 py-2.5 text-end tabular-nums">{formatMoney(totals.debit, '')}</td>
                    <td className="px-3 py-2.5 text-end tabular-nums">{formatMoney(totals.credit, '')}</td>
                    <td className="px-3 py-2.5 text-end"><Balance value={totals.closing} strong /></td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <ul className="surface divide-y divide-border overflow-hidden md:hidden">
              {lines.map(({ tenant, statement: s }) => (
                <li key={tenant.id}>
                  <Link href={statementHref(tenant.id)} className="flex items-start justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-foreground">{tenant.name}</span>
                      <span className="mt-0.5 block text-[12px] text-ink-mute">
                        {tenant.shop_number ? `محل ${tenant.shop_number} · ` : ''}
                        مستحق {formatMoney(s.totalDebit, '')} · مدفوع {formatMoney(s.totalCredit, '')}
                      </span>
                    </span>
                    <span className="shrink-0 text-end text-[14px]"><Balance value={s.closing} strong /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="px-1 text-[12px] leading-relaxed text-ink-mute">
          {year != null
            ? `الرصيد = رصيد ما قبل ${year} + إيجار أشهر ${year} التي بدأت − ما دُفع خلالها. `
            : 'الرصيد = إيجار كل الأشهر التي بدأت − كل ما دُفع. '}
          لا يشمل التأمين ولا رسوم الخدمات.
          {report.skipped > 0 && ` لم يُدرج ${tenantsLabel(report.skipped)} بلا مستحق ولا دفعات ولا رصيد في هذه الفترة.`}
        </p>
      </AccountingPageBody>
    </>
  );
}
