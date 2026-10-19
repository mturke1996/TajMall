'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LandlordDueBadge, LandlordPayButton, useLandlordPay } from '@/components/contacts/landlord-dues-parts';
import { useLandlordDues } from '@/lib/db/landlord-dues-queries';
import { landlordArrearsText, landlordIdleText, type LandlordDue, type LandlordDues } from '@/lib/landlord-dues';
import { arabicCount, cn, formatMoney } from '@/lib/utils';

const LANDLORDS: [string, string, string, string] = ['مؤجر واحد', 'مؤجران', 'مؤجرين', 'مؤجراً'];

function Figure({ label, hint, owed, children }: { label: string; hint?: string; owed?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card p-4">
      <p className="text-[12.5px] text-ink-mute">{label}</p>
      <p className={cn('text-[18px] font-semibold tabular-nums text-foreground', owed && 'text-danger-ink')}>{children}</p>
      {hint && <p className="text-[12px] text-ink-mute">{hint}</p>}
    </div>
  );
}

/** A landlord with no rent this month shows a dash: nothing is due, so a zero would claim a settled month. */
const cell = (row: LandlordDue, value: number) => (row.idleReason ? '—' : formatMoney(value, ''));

function names(list: string[]) {
  return list.length <= 3 ? list.join('، ') : `${list.slice(0, 3).join('، ')} وغيرهم`;
}

type PayProps = { canPay: boolean; onPay: (row: LandlordDue) => void };

function PhoneRow({ row, canPay, onPay }: PayProps & { row: LandlordDue }) {
  const arrearsText = landlordArrearsText(row);
  // the badge already says it when nothing else does
  const idle = row.status === 'none' ? null : landlordIdleText(row.idleReason);
  return (
    <li className="px-4 py-3.5">
      {/* the padding widens the tap area to 44px; the equal negative margin keeps the layout as it was */}
      <Link href={`/contacts/${row.contactId}`} className="-my-3 block truncate py-3 text-[14px] font-semibold text-foreground hover:underline">
        {row.name}
      </Link>
      <p className="mt-0.5 truncate text-[12.5px] text-ink-mute">
        {row.site ?? 'عقار مؤجَّر للمول'} · إيجار شهري <span className="tabular-nums">{formatMoney(row.monthlyRent, 'LYD')}</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <LandlordDueBadge row={row} />
        {idle && <span className="text-[12px] text-ink-mute">{idle}</span>}
      </div>
      <dl className="mt-2.5 grid grid-cols-3 gap-x-3 text-[12.5px]">
        <div>
          <dt className="text-ink-mute">المستحق</dt>
          <dd className="mt-0.5 tabular-nums text-foreground">{cell(row, row.due)}</dd>
        </div>
        <div>
          <dt className="text-ink-mute">المسدد</dt>
          <dd className="mt-0.5 tabular-nums text-foreground">{cell(row, row.paid)}</dd>
        </div>
        <div>
          <dt className="text-ink-mute">المتبقي</dt>
          <dd className={cn('mt-0.5 tabular-nums', row.remaining > 0 ? 'font-semibold text-danger-ink' : 'text-foreground')}>{cell(row, row.remaining)}</dd>
        </div>
      </dl>
      {row.arrears.amount > 0 && (
        <p className="mt-2 flex items-baseline justify-between gap-3 text-[12.5px]">
          <span className="min-w-0 text-ink-mute">متأخرات سابقة{arrearsText ? ` · ${arrearsText}` : ''}</span>
          <span className="shrink-0 font-semibold tabular-nums text-danger-ink">{formatMoney(row.arrears.amount, 'LYD')}</span>
        </p>
      )}
      {row.next && canPay && (
        <div className="mt-3 flex sm:justify-end">
          <LandlordPayButton name={row.name} next={row.next} onPay={() => onPay(row)} className="w-full sm:w-auto" />
        </div>
      )}
    </li>
  );
}

function DeskTable({ dues, canPay, onPay }: PayProps & { dues: LandlordDues }) {
  const t = dues.totals;
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-border bg-card xl:block">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border bg-canvas-sunken text-[12.5px] text-ink-mute">
            <th scope="col" className="px-4 py-2.5 text-start font-medium">المؤجر</th>
            <th scope="col" className="px-4 py-2.5 text-start font-medium">الحالة</th>
            <th scope="col" className="px-4 py-2.5 text-end font-medium">المستحق</th>
            <th scope="col" className="px-4 py-2.5 text-end font-medium">المسدد</th>
            <th scope="col" className="px-4 py-2.5 text-end font-medium">المتبقي</th>
            <th scope="col" className="px-4 py-2.5 text-end font-medium">متأخرات سابقة</th>
            <th scope="col" className="px-4 py-2.5 text-end font-medium">
              <span className="sr-only">سداد</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {dues.rows.map((row) => {
            const arrearsText = landlordArrearsText(row);
            const idle = row.status === 'none' ? null : landlordIdleText(row.idleReason);
            return (
              <tr key={row.contactId} className="align-top">
                <th scope="row" className="px-4 py-3 text-start font-normal">
                  <Link href={`/contacts/${row.contactId}`} className="block font-semibold text-foreground hover:underline">
                    {row.name}
                  </Link>
                  <span className="mt-0.5 block text-[12px] text-ink-mute">{row.site ?? 'عقار مؤجَّر للمول'}</span>
                </th>
                <td className="px-4 py-3">
                  <LandlordDueBadge row={row} />
                  {arrearsText && <span className="mt-1 block text-[12px] text-ink-mute">{arrearsText}</span>}
                  {idle && <span className="mt-1 block text-[12px] text-ink-mute">{idle}</span>}
                </td>
                <td className="px-4 py-3 text-end tabular-nums">{cell(row, row.due)}</td>
                <td className="px-4 py-3 text-end tabular-nums">{cell(row, row.paid)}</td>
                <td className={cn('px-4 py-3 text-end tabular-nums', row.remaining > 0 && 'font-semibold text-danger-ink')}>{cell(row, row.remaining)}</td>
                <td className={cn('px-4 py-3 text-end tabular-nums', row.arrears.amount > 0 ? 'font-semibold text-danger-ink' : 'text-ink-mute')}>
                  {row.arrears.amount > 0 ? formatMoney(row.arrears.amount, '') : '—'}
                </td>
                <td className="px-4 py-3 text-end">
                  {row.next && canPay && <LandlordPayButton name={row.name} next={row.next} onPay={() => onPay(row)} />}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-border bg-canvas-sunken/40 font-semibold">
          <tr>
            <td className="px-4 py-2.5" colSpan={2}>
              المجموع · {arabicCount(t.landlords, LANDLORDS)}
            </td>
            <td className="px-4 py-2.5 text-end tabular-nums">{formatMoney(t.due, '')}</td>
            <td className="px-4 py-2.5 text-end tabular-nums">{formatMoney(t.paid, '')}</td>
            <td className={cn('px-4 py-2.5 text-end tabular-nums', t.remaining > 0 && 'text-danger-ink')}>{formatMoney(t.remaining, '')}</td>
            <td className={cn('px-4 py-2.5 text-end tabular-nums', t.arrears > 0 && 'text-danger-ink')}>{formatMoney(t.arrears, '')}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-busy="true">
      <span className="sr-only">جارٍ تحميل مستحقات المؤجرين…</span>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2 bg-card p-4">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="surface divide-y divide-border overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2 px-4 py-3.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-56 max-w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** What the mall owes each landlord this month and for the earlier months of the year, most urgent first. */
export function LandlordDuesPanel() {
  const result = useLandlordDues();
  const { canPay, pay } = useLandlordPay();
  const onPay = (row: LandlordDue) => {
    if (row.next) pay(row.contactId, row.next);
  };

  const ready = result.state === 'ready' ? result : null;
  const dues = ready?.dues;
  const behindWithoutStart = dues?.rows.filter((r) => r.arrears.amount > 0 && r.contractStartMissing).map((r) => r.name) ?? [];
  const badDates = dues?.rows.filter((r) => r.contractDatesInvalid).map((r) => r.name) ?? [];

  return (
    <section aria-labelledby="landlord-dues-heading" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <h2 id="landlord-dues-heading" className="text-[15px] font-semibold text-foreground">
          مستحقات المؤجرين
        </h2>
        <p className="text-[12.5px] text-ink-mute" aria-live="polite">
          {dues ? `${dues.monthNameAr} ${dues.year}${ready?.refreshing ? ' · جارٍ التحديث…' : ''}` : ''}
        </p>
      </div>

      {result.state === 'loading' ? (
        <Loading />
      ) : result.state === 'error' ? (
        <Card role="alert" className="flex flex-col items-center gap-3 border-danger-line bg-danger-soft p-6 text-center text-danger-ink">
          <p className="text-[13px]">تعذّر تحميل مستحقات المؤجرين. تحقق من الاتصال ثم أعد المحاولة.</p>
          <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-8" onClick={result.retry}>
            إعادة المحاولة
          </Button>
        </Card>
      ) : dues && dues.rows.length === 0 ? (
        <div className="surface px-4 py-8 text-center">
          <p className="text-[13.5px] font-medium text-foreground">لا يوجد مؤجر بإيجار شهري مسجَّل.</p>
          <p className="mt-1 text-[12.5px] text-ink-mute">سجّل الإيجار الشهري في ملف المؤجر لتظهر مستحقاته هنا.</p>
        </div>
      ) : dues ? (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
            <Figure label="المستحق هذا الشهر" hint={arabicCount(dues.totals.landlords, LANDLORDS)}>
              {formatMoney(dues.totals.due, 'LYD')}
            </Figure>
            <Figure label="المسدد هذا الشهر">{formatMoney(dues.totals.paid, 'LYD')}</Figure>
            <Figure label="المتبقي هذا الشهر" owed={dues.totals.remaining > 0}>
              {formatMoney(dues.totals.remaining, 'LYD')}
            </Figure>
            <Figure
              label="متأخرات سابقة"
              owed={dues.totals.arrears > 0}
              hint={dues.totals.behind > 0 ? `عند ${arabicCount(dues.totals.behind, LANDLORDS)}` : `لا متأخرات في ${dues.year}`}
            >
              {formatMoney(dues.totals.arrears, 'LYD')}
            </Figure>
          </div>

          <ul className="surface divide-y divide-border overflow-hidden xl:hidden" aria-label="مستحقات كل مؤجر">
            {dues.rows.map((row) => (
              <PhoneRow key={row.contactId} row={row} canPay={canPay} onPay={onPay} />
            ))}
          </ul>
          <DeskTable dues={dues} canPay={canPay} onPay={onPay} />

          <div className="flex flex-col gap-1 px-1 text-[12px] leading-relaxed text-ink-mute">
            <p>الأرقام من المعاملات المرحّلة والمُسوّاة، والشهر يُقرأ من بيان السداد (وإن لم يُذكر فهو شهر تاريخ الصرف). المتأخرات تخص أشهر {dues.year} فقط، وما قبلها يظهر في كشف المؤجر.</p>
            {dues.noRent > 0 && <p>لا تظهر هنا مستحقات المؤجرين الذين بلا إيجار شهري مسجَّل ({arabicCount(dues.noRent, LANDLORDS)}).</p>}
            {behindWithoutStart.length > 0 && <p>تُحسب المتأخرات من يناير لأن تاريخ بداية العقد غير مسجَّل عند: {names(behindWithoutStart)}.</p>}
            {badDates.length > 0 && <p className="text-warning-ink">تاريخا العقد غير منطقيين عند: {names(badDates)}. راجع بيانات العقد.</p>}
            {ready?.refreshFailed && (
              <p className="text-warning-ink">
                تعذّر تحديث الأرقام، وقد لا تشمل آخر سداد.{' '}
                <button type="button" className="min-h-11 underline underline-offset-2 sm:min-h-0" onClick={ready.retry}>
                  أعد المحاولة
                </button>
              </p>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
