'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ContactLedgerPanel } from '@/components/contacts/contact-ledger-panel';
import { LandlordDueBadge, LandlordPayButton, useLandlordPay } from '@/components/contacts/landlord-dues-parts';
import {
  buildLandlordRentSchedule,
  landlordMonthName,
  landlordPaymentDescription,
  visibleContactNotes,
  type LandlordRentMonth,
  type LandlordRentSchedule,
} from '@/lib/contacts/contact-roles';
import { canCreateContactTransaction } from '@/lib/contacts/form-utils';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import { useContactTransactions } from '@/lib/db/queries';
import type { ContactRow, TransactionWithRelations } from '@/lib/db/types';
import { buildLandlordDue, landlordArrearsText, LANDLORD_DUES_MONTHS, type LandlordDue } from '@/lib/landlord-dues';
import { useTxDialog } from '@/stores/transaction-dialog';
import { cn, formatDate, formatMoney, todayISODate } from '@/lib/utils';

type Props = {
  contact: ContactRow;
  transactions: TransactionWithRelations[];
  journalEntries: JournalEntryRow[];
  txLoading: boolean;
  onEdit?: () => void;
};

function Figure({ label, hint, owed, children }: { label: string; hint?: string; owed?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card p-4">
      <p className="text-[12.5px] text-ink-mute">{label}</p>
      <p className={cn('text-[18px] font-semibold tabular-nums text-foreground', owed && 'text-danger-ink')}>{children}</p>
      {hint && <p className="text-[12px] text-ink-mute">{hint}</p>}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-ink-mute">{label}</dt>
      <dd className="min-w-0 text-end font-medium text-foreground">{children}</dd>
    </div>
  );
}

const NOT_DUE_TEXT = {
  future: 'لم يحن بعد',
  before_contract: 'قبل بداية العقد',
  after_contract: 'بعد نهاية العقد',
  no_rent: 'بلا إيجار مسجَّل',
} as const;

/** Text first, colour second: what the month is, in words. */
function monthState(m: LandlordRentMonth<TransactionWithRelations>): { variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; text: string } {
  switch (m.status) {
    case 'paid_full':
      return { variant: 'success', text: 'مدفوع بالكامل' };
    case 'paid_partial':
      return { variant: 'warning', text: 'مسدد جزئياً' };
    case 'unpaid':
      return { variant: 'danger', text: 'غير مدفوع' };
    case 'not_due':
      if (m.paidAmount > 0) return { variant: 'info', text: m.notDueReason === 'future' ? 'مدفوع مقدماً' : 'مدفوع خارج مدة العقد' };
      return { variant: 'neutral', text: NOT_DUE_TEXT[m.notDueReason ?? 'future'] };
  }
}

function Loading() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-busy="true">
      <span className="sr-only">جارٍ تحميل حركات المؤجر…</span>
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
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusLine({ due, hint }: { due: LandlordDue; hint: string | null }) {
  const arrearsText = landlordArrearsText(due);
  return (
    <div className="min-w-0 flex-1">
      <LandlordDueBadge row={due} />
      <dl className={cn('flex flex-wrap gap-x-5 gap-y-1 text-[13px]', (due.due > 0 || due.arrears.amount > 0) && 'mt-2')}>
        {due.due > 0 && (
          <>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-ink-mute">المستحق هذا الشهر</dt>
              <dd className="font-medium tabular-nums text-foreground">{formatMoney(due.due, 'LYD')}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-ink-mute">المسدد</dt>
              <dd className="font-medium tabular-nums text-foreground">{formatMoney(due.paid, 'LYD')}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-ink-mute">المتبقي</dt>
              <dd className={cn('font-medium tabular-nums', due.remaining > 0 ? 'text-danger-ink' : 'text-foreground')}>{formatMoney(due.remaining, 'LYD')}</dd>
            </div>
          </>
        )}
        {due.arrears.amount > 0 && (
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-mute">متأخرات سابقة{arrearsText ? ` (${arrearsText})` : ''}</dt>
            <dd className="font-semibold tabular-nums text-danger-ink">{formatMoney(due.arrears.amount, 'LYD')}</dd>
          </div>
        )}
      </dl>
      {hint && <p className="mt-1.5 text-[12px] text-ink-mute">{hint}</p>}
    </div>
  );
}

export function LandlordProfilePanel({ contact, transactions, journalEntries, txLoading, onEdit }: Props) {
  const today = useMemo(() => todayISODate(), []);
  const currentYear = Number(today.slice(0, 4));
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const openTx = useTxDialog((s) => s.open);
  const { canPay, pay } = useLandlordPay();
  const mayRecordPayment = canCreateContactTransaction(contact.is_active, canPay);

  // the page reads the same list; asking here too is one request, and tells a failed read from an empty one
  const history = useContactTransactions(contact.id);
  const failed = history.isError && !history.data;

  const schedule: LandlordRentSchedule<TransactionWithRelations> = useMemo(
    () => buildLandlordRentSchedule(contact, transactions, selectedYear, { today }),
    [contact, transactions, selectedYear, today],
  );
  const due = useMemo(() => buildLandlordDue(contact, transactions, today), [contact, transactions, today]);
  // paid beyond a due month's rent, or for a month not owed (yet): it is in "المدفوع" but settles no other month
  const setAside = useMemo(
    () => Math.round((schedule.overpaidAmount + schedule.months.reduce((sum, m) => sum + (m.due ? 0 : m.paidAmount), 0)) * 1000) / 1000,
    [schedule],
  );

  const payMonth = (m: LandlordRentMonth<TransactionWithRelations>) => {
    if (!mayRecordPayment || m.remainingAmount <= 0) return;
    pay(
      contact.id,
      {
        monthKey: m.monthKey,
        monthNameAr: m.monthNameAr,
        year: m.year,
        amount: m.remainingAmount,
        late: m.monthKey < today.slice(0, 7),
        description: landlordPaymentDescription(contact.name, m.monthKey),
      },
      contact.kind,
    );
  };

  // a payment with no month in mind; the schedule files it under the month it is paid in
  const payOther = () => {
    if (!mayRecordPayment) return;
    openTx({ kind: 'EXPENSE', contactId: contact.id, contactKind: contact.kind, description: `سداد إيجار للمؤجر ${contact.name}` });
  };

  // contract dates are calendar days; an ended or not-yet-started lease must not read as in force
  const contractStart = contact.contract_start?.slice(0, 10) ?? '';
  const contractEnd = contact.contract_end?.slice(0, 10) ?? '';
  const contractState =
    !contractStart && !contractEnd
      ? 'unset'
      : contractEnd && contractEnd < today
        ? 'ended'
        : contractStart && contractStart > today
          ? 'upcoming'
          : 'active';

  const hint = due.contractDatesInvalid
    ? 'تاريخا العقد غير منطقيين؛ راجع بيانات العقد.'
    : due.arrears.amount > 0 && due.contractStartMissing
      ? 'تاريخ بداية العقد غير مسجَّل، فتُحسب المتأخرات من يناير.'
      : null;

  const next = due.next;
  const thisYear = selectedYear === currentYear;
  const noRent = schedule.monthlyRent <= 0;
  const currentMonthKey = today.slice(0, 7);
  const loadError = (
    <Card role="alert" className="flex flex-col items-center gap-3 border-danger-line bg-danger-soft p-6 text-center text-danger-ink">
      <p className="text-[13px]">تعذّر تحميل حركات المؤجر، فلا يمكن حساب ما عليه. تحقق من الاتصال ثم أعد المحاولة.</p>
      <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-8" onClick={() => void history.refetch()}>
        إعادة المحاولة
      </Button>
    </Card>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* who the landlord is, and where this month stands */}
      <section className="surface overflow-hidden" aria-label="حالة إيجار هذا الشهر">
        <div className="flex flex-col gap-3 p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">مؤجر للمول (المول مستأجر منه)</Badge>
              {!contact.is_active && <Badge variant="neutral">غير نشط</Badge>}
            </div>
            <p className="mt-1.5 text-[12.5px] text-ink-mute">
              {contact.shop_number ? `الموقع/العقار: ${contact.shop_number}` : 'عقار مؤجر للمول'}
              {contact.area_sqm ? ` · المساحة: ${contact.area_sqm} م²` : ''}
              {contact.phone ? (
                <>
                  {' · الهاتف: '}
                  <span dir="ltr" className="tabular-nums">
                    {contact.phone}
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            {mayRecordPayment && (
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={payOther}>
                <Plus aria-hidden />
                تسجيل سداد إيجار
              </Button>
            )}
            {onEdit && (
              <Button type="button" variant="outline" size="sm" onClick={onEdit}>
                تعديل بيانات العقد
              </Button>
            )}
          </div>
        </div>

        {/* a failed read is said once, by the card below, which also offers the retry */}
        {!failed && (
          <div className="border-t border-border px-4 py-3.5 sm:px-5">
            {txLoading ? (
              <div className="flex flex-col gap-2" aria-busy="true">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <StatusLine due={due} hint={hint} />
                {next && mayRecordPayment && (
                  <LandlordPayButton name={contact.name} next={next} onPay={() => pay(contact.id, next, contact.kind)} className="w-full sm:w-auto" />
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {failed ? (
        loadError
      ) : txLoading ? (
        <Loading />
      ) : noRent ? (
        <div className="surface px-4 py-8 text-center">
          <p className="text-[13.5px] font-medium text-foreground">لم يُسجَّل إيجار شهري لهذا المؤجر.</p>
          <p className="mt-1 text-[12.5px] text-ink-mute">سجّله في بيانات العقد لتُحسب مستحقاته شهراً بشهر.</p>
          {onEdit && (
            <Button type="button" variant="outline" size="sm" className="mt-3 min-h-11 sm:min-h-8" onClick={onEdit}>
              تعديل بيانات العقد
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
            <Figure label="الإيجار الشهري" hint="حسب عقد الإيجار">
              {formatMoney(schedule.monthlyRent, 'LYD')}
            </Figure>
            <Figure
              label={thisYear ? `المستحق حتى ${landlordMonthName(Number(currentMonthKey.slice(5, 7)))}` : `المستحق في ${selectedYear}`}
              hint={schedule.dueMonthsCount > 0 ? `عن ${LANDLORD_DUES_MONTHS(schedule.dueMonthsCount)}` : 'لا أشهر مستحقة'}
            >
              {formatMoney(schedule.totalExpected, 'LYD')}
            </Figure>
            <Figure
              label={`المدفوع للمؤجر (${selectedYear})`}
              hint={schedule.paidMonthsCount > 0 ? `مسدد بالكامل: ${LANDLORD_DUES_MONTHS(schedule.paidMonthsCount)}` : 'لا شهر مسدد بالكامل'}
            >
              {formatMoney(schedule.totalPaid, 'LYD')}
            </Figure>
            <Figure
              label="المتبقي"
              owed={schedule.totalOutstanding > 0}
              hint={
                schedule.totalOutstanding > 0
                  ? [
                      schedule.unpaidMonthsCount > 0 && `بلا دفع: ${LANDLORD_DUES_MONTHS(schedule.unpaidMonthsCount)}`,
                      schedule.partialMonthsCount > 0 && `جزئياً: ${LANDLORD_DUES_MONTHS(schedule.partialMonthsCount)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'لا شيء مستحق'
              }
            >
              {formatMoney(schedule.totalOutstanding, 'LYD')}
            </Figure>
          </div>
          {setAside > 0 && (
            <p className="-mt-3 px-1 text-[12px] text-ink-mute">
              من المدفوع {formatMoney(setAside, 'LYD')} زيادة على المستحق أو عن أشهر غير مستحقة؛ ولا يُخصم من شهر آخر.
            </p>
          )}

          <section aria-labelledby="landlord-schedule-heading" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
              <h2 id="landlord-schedule-heading" className="text-[15px] font-semibold text-foreground">
                جدول إيجار {selectedYear}
              </h2>
              <div className="flex items-center gap-1 rounded-lg border border-border bg-canvas-sunken p-0.5" role="group" aria-label="السنة">
                <button
                  type="button"
                  aria-label="السنة السابقة"
                  onClick={() => setSelectedYear((y) => y - 1)}
                  className="grid h-11 w-11 place-items-center rounded-md text-ink-mute hover:bg-card hover:text-foreground sm:h-8 sm:w-8"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
                <span className="min-w-12 px-2 text-center text-[13px] font-semibold tabular-nums" aria-live="polite">
                  {selectedYear}
                </span>
                <button
                  type="button"
                  aria-label="السنة التالية"
                  onClick={() => setSelectedYear((y) => y + 1)}
                  className="grid h-11 w-11 place-items-center rounded-md text-ink-mute hover:bg-card hover:text-foreground sm:h-8 sm:w-8"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>

            {/* phone and tablet: one card per month (the sidebar leaves a tablet little width) */}
            <ul className="surface divide-y divide-border overflow-hidden xl:hidden" aria-label={`أشهر ${selectedYear}`}>
              {schedule.months.map((m) => {
                const state = monthState(m);
                return (
                  <li key={m.monthKey} className="px-4 py-3" aria-current={m.monthKey === currentMonthKey ? 'date' : undefined}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[14px] font-medium text-foreground">
                        {m.monthNameAr}
                        {m.monthKey === currentMonthKey && <span className="ms-2 text-[12px] font-normal text-ink-mute">الشهر الحالي</span>}
                      </span>
                      <Badge variant={state.variant}>{state.text}</Badge>
                    </div>
                    {m.status === 'paid_full' && (
                      <p className="mt-1 text-[12.5px] text-ink-mute">
                        المسدد <span className="tabular-nums text-foreground">{formatMoney(m.paidAmount, 'LYD')}</span>
                      </p>
                    )}
                    {m.status !== 'paid_full' && (m.due || m.paidAmount > 0) && (
                      <dl className="mt-2 grid grid-cols-3 gap-x-3 text-[12.5px]">
                        <div>
                          <dt className="text-ink-mute">المستحق</dt>
                          <dd className="mt-0.5 tabular-nums text-foreground">{m.due ? formatMoney(m.expectedAmount, '') : '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-ink-mute">المسدد</dt>
                          <dd className="mt-0.5 tabular-nums text-foreground">{formatMoney(m.paidAmount, '')}</dd>
                        </div>
                        <div>
                          <dt className="text-ink-mute">المتبقي</dt>
                          <dd className={cn('mt-0.5 tabular-nums', m.remainingAmount > 0 ? 'font-semibold text-danger-ink' : 'text-foreground')}>
                            {m.due ? formatMoney(m.remainingAmount, '') : '—'}
                          </dd>
                        </div>
                      </dl>
                    )}
                    {m.remainingAmount > 0 && mayRecordPayment && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2.5 h-11 w-full"
                        aria-label={`سداد شهر ${m.monthNameAr} ${m.year}، المبلغ ${formatMoney(m.remainingAmount, 'LYD')}`}
                        onClick={() => payMonth(m)}
                      >
                        سداد شهر {m.monthNameAr}
                      </Button>
                    )}
                  </li>
                );
              })}
              <li className="bg-canvas-sunken/40 px-4 py-3">
                <p className="text-[13px] font-semibold text-foreground">الإجمالي</p>
                <dl className="mt-1.5 grid grid-cols-3 gap-x-3 text-[12.5px]">
                  <div>
                    <dt className="text-ink-mute">المستحق</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-foreground">{formatMoney(schedule.totalExpected, '')}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-mute">المسدد</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-foreground">{formatMoney(schedule.totalPaid, '')}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-mute">المتبقي</dt>
                    <dd className={cn('mt-0.5 font-semibold tabular-nums', schedule.totalOutstanding > 0 ? 'text-danger-ink' : 'text-foreground')}>
                      {formatMoney(schedule.totalOutstanding, '')}
                    </dd>
                  </div>
                </dl>
              </li>
            </ul>

            {/* wide screens: the month table */}
            <div className="hidden overflow-x-auto rounded-xl border border-border bg-card xl:block">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-canvas-sunken text-[12.5px] text-ink-mute">
                    <th scope="col" className="px-4 py-2.5 text-start font-medium">الشهر</th>
                    <th scope="col" className="px-4 py-2.5 text-end font-medium">المستحق</th>
                    <th scope="col" className="px-4 py-2.5 text-end font-medium">المسدد</th>
                    <th scope="col" className="px-4 py-2.5 text-end font-medium">المتبقي</th>
                    <th scope="col" className="px-4 py-2.5 text-start font-medium">الحالة</th>
                    <th scope="col" className="px-4 py-2.5 text-end font-medium">
                      <span className="sr-only">سداد</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {schedule.months.map((m) => {
                    const state = monthState(m);
                    return (
                      <tr key={m.monthKey} className={cn(m.monthKey === currentMonthKey && 'bg-canvas-sunken/50')} aria-current={m.monthKey === currentMonthKey ? 'date' : undefined}>
                        <th scope="row" className="px-4 py-2.5 text-start font-medium text-foreground">
                          {m.monthNameAr}
                          {m.monthKey === currentMonthKey && <span className="ms-2 text-[12px] font-normal text-ink-mute">الشهر الحالي</span>}
                        </th>
                        <td className="px-4 py-2.5 text-end tabular-nums">{m.due ? formatMoney(m.expectedAmount, '') : '—'}</td>
                        <td className="px-4 py-2.5 text-end tabular-nums">{m.due || m.paidAmount > 0 ? formatMoney(m.paidAmount, '') : '—'}</td>
                        <td className={cn('px-4 py-2.5 text-end tabular-nums', m.remainingAmount > 0 ? 'font-semibold text-danger-ink' : 'text-ink-mute')}>
                          {m.due ? formatMoney(m.remainingAmount, '') : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant={state.variant}>{state.text}</Badge>
                        </td>
                        <td className="px-4 py-2 text-end">
                          {m.remainingAmount > 0 && mayRecordPayment && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              aria-label={`سداد شهر ${m.monthNameAr} ${m.year}، المبلغ ${formatMoney(m.remainingAmount, 'LYD')}`}
                              onClick={() => payMonth(m)}
                            >
                              سداد شهر {m.monthNameAr}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-border bg-canvas-sunken/40 font-semibold">
                  <tr>
                    <td className="px-4 py-2.5">الإجمالي</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{formatMoney(schedule.totalExpected, '')}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{formatMoney(schedule.totalPaid, '')}</td>
                    <td className={cn('px-4 py-2.5 text-end tabular-nums', schedule.totalOutstanding > 0 && 'text-danger-ink')}>{formatMoney(schedule.totalOutstanding, '')}</td>
                    <td colSpan={2} className="px-4 py-2.5 text-[12.5px] font-normal text-ink-mute">
                      {schedule.dueMonthsCount > 0 ? `مسدد بالكامل: ${schedule.paidMonthsCount} من ${LANDLORD_DUES_MONTHS(schedule.dueMonthsCount)}` : 'لا أشهر مستحقة في هذه السنة'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="px-1 text-[12px] text-ink-mute">
              المستحق يشمل الأشهر التي بدأت وتغطيها مدة العقد. الأرقام من المعاملات المرحّلة والمُسوّاة، والشهر يُقرأ من بيان السداد.
            </p>
          </section>
        </>
      )}

      {/* the leased site and the contract */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="surface p-4" aria-labelledby="landlord-site-heading">
          <h2 id="landlord-site-heading" className="text-[14px] font-semibold text-foreground">
            الموقع والعقار المستأجر
          </h2>
          <dl className="mt-1 divide-y divide-border text-[13px]">
            <Fact label="اسم العقار / الموقع">{contact.shop_number || 'غير محدد'}</Fact>
            <Fact label="الموقع / الطابق">{contact.floor || 'المول / خارجي'}</Fact>
            <Fact label="المساحة المستأجرة">{contact.area_sqm ? `${contact.area_sqm} م²` : 'غير محدد'}</Fact>
            <Fact label="العنوان">{contact.address || '—'}</Fact>
          </dl>
        </section>

        <section className="surface p-4" aria-labelledby="landlord-contract-heading">
          <h2 id="landlord-contract-heading" className="text-[14px] font-semibold text-foreground">
            شروط العقد والتواريخ
          </h2>
          <dl className="mt-1 divide-y divide-border text-[13px]">
            <Fact label="بداية العقد">
              <span className="tabular-nums">{contact.contract_start ? formatDate(contact.contract_start) : '—'}</span>
            </Fact>
            <Fact label="نهاية العقد">
              <span className="tabular-nums">{contact.contract_end ? formatDate(contact.contract_end) : '—'}</span>
            </Fact>
            <Fact label="ملاحظات العقد">{visibleContactNotes(contact.notes) || 'لا توجد ملاحظات'}</Fact>
            <Fact label="حالة العقد">
              {contractState === 'unset' ? (
                <Badge variant="outline">غير محدد</Badge>
              ) : contractState === 'ended' ? (
                <Badge variant="danger">منتهٍ</Badge>
              ) : contractState === 'upcoming' ? (
                <Badge variant="warning">لم يبدأ</Badge>
              ) : (
                <Badge variant="success">ساري المفعول</Badge>
              )}
            </Fact>
          </dl>
        </section>
      </div>

      {/* the full ledger and journal entries */}
      <section aria-labelledby="landlord-ledger-heading" className="flex flex-col gap-2">
        <h2 id="landlord-ledger-heading" className="px-1 text-[15px] font-semibold text-foreground">
          كشف الحساب المالي وسجل القيود والدفعات للمؤجر
        </h2>
        <ContactLedgerPanel contact={contact} transactions={transactions} journalEntries={journalEntries} txLoading={txLoading} />
      </section>
    </div>
  );
}
