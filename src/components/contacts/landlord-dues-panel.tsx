'use client';

import Link from 'next/link';
import { Building2, CalendarClock, HandCoins, Hourglass } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Callout, EmptyBlock, ErrorBlock, KpiStrip, LoadingBlock, PartyAvatar, type KpiCardProps } from '@/components/people';
import { LandlordDueBadge, LandlordMonthStrip, LandlordPayButton, useLandlordPay } from '@/components/contacts/landlord-dues-parts';
import { useLandlordDues } from '@/lib/db/landlord-dues-queries';
import { landlordArrearsText, landlordIdleText, type LandlordDue, type LandlordDues } from '@/lib/landlord-dues';
import { usePermission } from '@/lib/supabase/use-permission';
import { arabicCount, cn, formatMoney } from '@/lib/utils';

const LANDLORDS: [string, string, string, string] = ['مؤجر واحد', 'مؤجران', 'مؤجرين', 'مؤجراً'];

/** A landlord with no rent this month shows a dash: nothing is due, so a zero would claim a settled month. */
const cell = (row: LandlordDue, value: number) => (row.idleReason ? '—' : formatMoney(value, ''));
/**
 * What is due or left for the month. With no monthly rent recorded and no payment to go by, the amount is not
 * known, so it is a dash and not a zero that would read as «nothing to pay».
 */
const owedCell = (row: LandlordDue, value: number) => (row.amountSource === 'unknown' ? '—' : cell(row, value));

function names(list: string[]) {
  return list.length <= 3 ? list.join('، ') : `${list.slice(0, 3).join('، ')} وغيرهم`;
}

type PayProps = { canPay: boolean; onPay: (row: LandlordDue) => void };

/** The amount of the month is a guess from the latest paid month: the row says so and where to fix it. */
function EstimateNote({ row }: { row: LandlordDue }) {
  if (row.amountSource === 'monthly_rent') return null;
  return (
    <p className="flex items-center justify-between gap-3 text-[12px] text-ink-mute">
      <span>{row.amountSource === 'estimate' ? 'الإيجار الشهري غير مسجَّل، والمبلغ تقدير' : 'الإيجار الشهري غير مسجَّل'}</span>
      <Link href={`/contacts/${row.contactId}`} className="inline-flex min-h-11 shrink-0 items-center text-info-ink underline underline-offset-4">
        حدّد الإيجار
      </Link>
    </p>
  );
}

function PhoneRow({ row, canPay, onPay }: PayProps & { row: LandlordDue }) {
  const arrearsText = landlordArrearsText(row);
  // the badge already says it when nothing else does
  const idle = row.status === 'none' ? null : landlordIdleText(row.idleReason);
  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-center gap-3">
        <PartyAvatar name={row.name} role="LANDLORD" size="sm" className="whitespace-nowrap text-[12px]" />
        <div className="min-w-0 flex-1">
          {/* the padding widens the tap area to 44px; the equal negative margin keeps the layout as it was */}
          <Link href={`/contacts/${row.contactId}`} className="-my-3 block truncate py-3 text-[14.5px] font-semibold text-foreground hover:underline">
            {row.name}
          </Link>
          {row.site && <p className="truncate text-[12.5px] text-ink-mute">{row.site}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <LandlordDueBadge row={row} />
        {idle && <span className="text-[12px] text-ink-mute">{idle}</span>}
      </div>
      <LandlordMonthStrip months={row.yearMonths} />
      <dl className="grid grid-cols-3 gap-x-3 text-[12.5px]">
        <div>
          <dt className="text-ink-mute">المستحق</dt>
          <dd className="mt-0.5 tabular-nums text-foreground">{owedCell(row, row.due)}</dd>
        </div>
        <div>
          <dt className="text-ink-mute">المسدّد</dt>
          <dd className="mt-0.5 tabular-nums text-foreground">{cell(row, row.paid)}</dd>
        </div>
        <div>
          <dt className="text-ink-mute">المتبقي</dt>
          <dd className={cn('mt-0.5 tabular-nums', row.remaining > 0 ? 'font-semibold text-danger-ink' : 'text-foreground')}>{owedCell(row, row.remaining)}</dd>
        </div>
      </dl>
      {row.arrears.amount > 0 && (
        <p className="flex items-baseline justify-between gap-3 text-[12.5px]">
          <span className="min-w-0 text-ink-mute">متأخرات سابقة{arrearsText ? ` · ${arrearsText}` : ''}</span>
          <span className="shrink-0 font-semibold tabular-nums text-danger-ink">{formatMoney(row.arrears.amount, 'LYD')}</span>
        </p>
      )}
      <EstimateNote row={row} />
      {row.next && canPay && <LandlordPayButton name={row.name} next={row.next} onPay={() => onPay(row)} className="w-full" />}
    </li>
  );
}

function DeskTable({ dues, canPay, onPay }: PayProps & { dues: LandlordDues }) {
  const t = dues.totals;
  return (
    <div className="hidden overflow-x-auto xl:block">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border bg-canvas-sunken text-[12.5px] text-ink-mute">
            <th scope="col" className="px-4 py-2.5 text-start font-medium">المؤجر</th>
            <th scope="col" className="px-3 py-2.5 text-start font-medium">أشهر {dues.year}</th>
            <th scope="col" className="px-3 py-2.5 text-end font-medium">المستحق</th>
            <th scope="col" className="px-3 py-2.5 text-end font-medium">المسدّد</th>
            <th scope="col" className="px-3 py-2.5 text-end font-medium">المتبقي</th>
            <th scope="col" className="px-3 py-2.5 text-end font-medium">متأخرات سابقة</th>
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
                <th scope="row" className="px-4 py-3.5 text-start font-normal">
                  <div className="flex items-start gap-3">
                    <PartyAvatar name={row.name} role="LANDLORD" size="sm" className="whitespace-nowrap text-[12px]" />
                    <div className="min-w-0">
                      <Link href={`/contacts/${row.contactId}`} className="block font-semibold text-foreground hover:underline">
                        {row.name}
                      </Link>
                      {row.site && <span className="mt-0.5 block text-[12px] text-ink-mute">{row.site}</span>}
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <LandlordDueBadge row={row} />
                        {idle && <span className="text-[12px] text-ink-mute">{idle}</span>}
                      </span>
                      {arrearsText && <span className="mt-1 block text-[12px] text-ink-mute">{arrearsText}</span>}
                    </div>
                  </div>
                </th>
                <td className="px-3 py-4">
                  <LandlordMonthStrip months={row.yearMonths} />
                </td>
                <td className="px-3 py-3.5 text-end tabular-nums">
                  {owedCell(row, row.due)}
                  {row.amountSource === 'estimate' && !row.idleReason && <span className="block text-[11.5px] text-ink-mute">تقديري</span>}
                </td>
                <td className="px-3 py-3.5 text-end tabular-nums">{cell(row, row.paid)}</td>
                <td className={cn('px-3 py-3.5 text-end tabular-nums', row.remaining > 0 && 'font-semibold text-danger-ink')}>{owedCell(row, row.remaining)}</td>
                <td className={cn('px-3 py-3.5 text-end tabular-nums', row.arrears.amount > 0 ? 'font-semibold text-danger-ink' : 'text-ink-mute')}>
                  {row.arrears.amount > 0 ? formatMoney(row.arrears.amount, '') : '—'}
                </td>
                <td className="px-4 py-3 text-end">{row.next && canPay && <LandlordPayButton name={row.name} next={row.next} onPay={() => onPay(row)} />}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-border bg-canvas-sunken/40 font-semibold">
          <tr>
            <td className="px-4 py-2.5" colSpan={2}>
              المجموع · {arabicCount(t.landlords, LANDLORDS)}
            </td>
            <td className="px-3 py-2.5 text-end tabular-nums">{formatMoney(t.due, '')}</td>
            <td className="px-3 py-2.5 text-end tabular-nums">{formatMoney(t.paid, '')}</td>
            <td className={cn('px-3 py-2.5 text-end tabular-nums', t.remaining > 0 && 'text-danger-ink')}>{formatMoney(t.remaining, '')}</td>
            <td className={cn('px-3 py-2.5 text-end tabular-nums', t.arrears > 0 && 'text-danger-ink')}>{formatMoney(t.arrears, '')}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function figures(dues: LandlordDues | null, failed: boolean, retry?: () => void): KpiCardProps[] {
  const state: KpiCardProps['state'] = failed ? 'error' : dues ? 'ready' : 'loading';
  const t = dues?.totals;
  return [
    {
      label: 'الإيجار هذا الشهر',
      icon: Building2,
      accent: 'violet',
      value: t?.due ?? null,
      context: t ? arabicCount(t.landlords, LANDLORDS) : undefined,
      state,
      onRetry: retry,
    },
    {
      label: 'المسدّد هذا الشهر',
      icon: HandCoins,
      accent: 'green',
      value: t?.paid ?? null,
      context: t ? (t.paid > 0 ? 'من الدفعات المرحّلة' : 'لا دفعات هذا الشهر') : undefined,
      state,
    },
    {
      label: 'المتبقي هذا الشهر',
      icon: Hourglass,
      accent: 'amber',
      value: t?.remaining ?? null,
      context: t ? (t.remaining > 0 ? undefined : 'لا متبقي') : undefined,
      contextTone: t && t.remaining > 0 ? 'warn' : 'good',
      state,
    },
    {
      label: 'متأخرات سابقة',
      icon: CalendarClock,
      accent: 'red',
      value: t?.arrears ?? null,
      tone: t && t.arrears > 0 ? 'bad' : 'plain',
      context: t ? (t.behind > 0 ? `المتأخر: ${arabicCount(t.behind, LANDLORDS)}${t.incomplete > 0 ? ' · على الأقل' : ''}` : 'لا متأخرات') : undefined,
      contextTone: t && t.behind > 0 ? 'bad' : 'good',
      state,
    },
  ];
}

/** What the mall owes each landlord this month and for the earlier months, most urgent first. */
export function LandlordDuesPanel() {
  // rent paid to landlords is an expense: a role that may not see expenses is shown nothing, and nothing is read for it
  const { can } = usePermission();
  const result = useLandlordDues(can('expense.view'));
  const { canPay, pay } = useLandlordPay();
  const onPay = (row: LandlordDue) => {
    if (row.next) pay(row.contactId, row.next, row.kind);
  };

  const ready = result.state === 'ready' ? result : null;
  const dues = ready?.dues ?? null;
  const failed = result.state === 'error';
  const badDates = dues?.rows.filter((r) => r.contractDatesInvalid).map((r) => r.name) ?? [];

  if (result.state === 'off') return null;

  return (
    <section aria-labelledby="landlord-dues-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <h2 id="landlord-dues-heading" className="text-[15px] font-semibold text-foreground">
          مستحقات المؤجرين
        </h2>
        <p className="text-[12.5px] text-ink-mute" aria-live="polite">
          {dues ? `${dues.monthNameAr} ${dues.year}${ready?.refreshing ? ' · جارٍ التحديث…' : ''}` : ''}
        </p>
      </div>

      {failed ? (
        <Card>
          <ErrorBlock message="تعذّر تحميل مستحقات المؤجرين. تحقق من الاتصال ثم أعد المحاولة." onRetry={result.retry} />
        </Card>
      ) : !dues ? (
        <>
          <KpiStrip label="ملخص مستحقات المؤجرين" items={figures(null, false)} />
          <Card>
            <LoadingBlock rows={3} />
          </Card>
        </>
      ) : dues.rows.length === 0 ? (
        <Card>
          <EmptyBlock>لا يوجد مؤجر مسجَّل. اعتمد جهة مؤجراً من ملفها لتظهر مستحقاتها هنا.</EmptyBlock>
        </Card>
      ) : (
        <>
          <KpiStrip label="ملخص مستحقات المؤجرين" items={figures(dues, false)} />

          {dues.totals.estimated > 0 && (
            <Callout tone="info">
              {arabicCount(dues.totals.estimated, LANDLORDS)} بلا إيجار شهري مسجَّل: المبلغ تقدير من آخر شهر مسدّد، أو غير معروف إن لم تُسجَّل دفعة. سجّل الإيجار الشهري في ملف المؤجر ليصير المبلغ ثابتاً.
            </Callout>
          )}

          <Card className="overflow-hidden">
            <ul className="divide-y divide-border xl:hidden" aria-label="مستحقات كل مؤجر">
              {dues.rows.map((row) => (
                <PhoneRow key={row.contactId} row={row} canPay={canPay} onPay={onPay} />
              ))}
            </ul>
            <DeskTable dues={dues} canPay={canPay} onPay={onPay} />
          </Card>

          <div className="flex flex-col gap-1 px-1 text-[12px] leading-relaxed text-ink-mute">
            <p>الأرقام من المعاملات المرحّلة والمُسوّاة. الشهر يُقرأ من بيان السداد، وإن لم يُذكر فهو شهر تاريخ الصرف. الأشهر قبل بداية المتابعة تُعدّ مسدّدة قبل المنظومة.</p>
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
      )}
    </section>
  );
}
