'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BookOpen, Building2, CalendarCheck, CalendarDays, FileText, HandCoins, Hourglass, Pencil, Receipt, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Callout, ErrorBlock, InfoList, KpiStrip, LoadingBlock, MonthGrid, SectionCard, type InfoItem, type KpiCardProps } from '@/components/people';
import { ContactJournalsList, ContactTransactionsList } from '@/components/contacts/contact-ledger-panel';
import { LandlordPayButton, useLandlordPay } from '@/components/contacts/landlord-dues-parts';
import { LandlordPayments, MonthlyRentDialog, TrackingLine, TrackingStartDialog, YearSwitch } from '@/components/contacts/landlord-profile-parts';
import { ProfilePanel, ProfileTabs, useProfileTab, type ProfileTabDef } from '@/components/contacts/profile/profile-tabs';
import { UncountedNote } from '@/components/contacts/profile/profile-kpis';
import { canCreateContactTransaction } from '@/lib/contacts/form-utils';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { useJournalEntries, type JournalEntryRow } from '@/lib/db/journal-queries';
import { useContactTransactions, useContacts } from '@/lib/db/queries';
import type { ContactRow, TransactionWithRelations } from '@/lib/db/types';
import { landlordPaymentFor } from '@/lib/landlord-dues';
import { buildLandlordProfile, type LandlordProfileInput } from '@/lib/landlord-profile';
import { goLiveMonthOf, obligationMonthsText, type ObligationMonth } from '@/lib/people/obligation-months';
import { uncountedCount } from '@/lib/people/party-profile';
import { formatMonthLabelAr } from '@/lib/rent-months';
import { usePermission } from '@/lib/supabase/use-permission';
import { useTxDialog } from '@/stores/transaction-dialog';
import { formatDate, formatMoney, todayISODate } from '@/lib/utils';

type Props = {
  contact: ContactRow;
  transactions: TransactionWithRelations[];
  journalEntries: JournalEntryRow[];
  txLoading: boolean;
  onEdit?: () => void;
};

const TABS = ['payments', 'transactions', 'journals'] as const;
type TabId = (typeof TABS)[number];

/** contract dates are calendar days; an ended or not-yet-started lease must not read as in force */
function contractBadge(contact: ContactRow, today: string) {
  const start = contact.contract_start?.slice(0, 10) ?? '';
  const end = contact.contract_end?.slice(0, 10) ?? '';
  if (!start && !end) return <Badge variant="outline">غير محدد</Badge>;
  if (end && end < today) return <Badge variant="danger">منتهٍ</Badge>;
  if (start && start > today) return <Badge variant="warning">لم يبدأ</Badge>;
  return <Badge variant="success">ساري المفعول</Badge>;
}

/**
 * A landlord's page below the header: four figures, the months of the year with what each one is (paid, due,
 * upcoming, or paid before the system), the payments with the months they cover, the file's movements and
 * entries, and the lease. Whether the file sits under customers or vendors changes nothing: the role tag decides.
 */
export function LandlordProfilePanel({ contact, transactions, journalEntries, txLoading, onEdit }: Props) {
  const today = useMemo(() => todayISODate(), []);
  const initialTab = useSearchParams().get('tab');
  const [tab, setTab] = useProfileTab<TabId>(TABS, initialTab);
  const [year, setYear] = useState<number>(Number(today.slice(0, 4)));
  const [rentOpen, setRentOpen] = useState(false);
  const [sinceOpen, setSinceOpen] = useState(false);

  const { canWrite } = usePermission();
  const openTx = useTxDialog((s) => s.open);
  const { canPay, pay } = useLandlordPay();
  const mayRecordPayment = canCreateContactTransaction(contact.is_active, canPay);

  // the page reads the same lists; asking here too is one request each, and tells a failed read from an empty one
  const history = useContactTransactions(contact.id);
  const entries = useJournalEntries({ contactId: contact.id, status: 'ALL' }, 500);
  const contacts = useContacts();
  const failed = history.isError && !history.data;
  const loading = txLoading || contacts.isLoading;
  const goLiveMonth = useMemo(() => goLiveMonthOf(contacts.data ?? []), [contacts.data]);

  const input = useMemo<LandlordProfileInput>(() => ({ contact, payments: transactions, today, goLiveMonth }), [contact, transactions, today, goLiveMonth]);
  const profile = useMemo(() => buildLandlordProfile({ ...input, year }), [input, year]);
  const { view, due, totals, tracking, defaultTracking } = profile;

  // on a phone, months settled before the system are one line (the tracking line above the grid), not a block of identical cells
  const wide = useMediaQuery('(min-width: 640px)');
  const settledMonths = view.months.filter((m) => m.status === 'before_system').length;
  const gridMonths = !wide && settledMonths >= 2 ? view.months.filter((m) => m.status !== 'before_system') : view.months;

  const payFor = (m: ObligationMonth) => pay(contact.id, landlordPaymentFor(contact.name, m, today), contact.kind);
  // a payment with no month in mind; the engine files it under the month it is paid in
  const payOther = mayRecordPayment
    ? () =>
        openTx({
          kind: 'EXPENSE',
          contactId: contact.id,
          contactKind: contact.kind,
          description: `سداد إيجار للمؤجر ${contact.name}`,
        })
    : undefined;

  const state: KpiCardProps['state'] = failed ? 'error' : loading ? 'loading' : 'ready';
  const retry = () => {
    void history.refetch();
    void contacts.refetch();
  };

  const estimated = view.amountSource === 'estimate';
  const rentKnown = view.amountSource === 'monthly_rent';
  const oldestOwed = due.arrears.months[0]?.monthKey ?? null;
  // months are owed but none has a known amount (no monthly rent, no month to copy it from): a dash, never a zero
  const owedUnknown = due.owedMonths > 0 && due.owed <= 0;

  const kpis: KpiCardProps[] = [
    {
      label: 'الإيجار الشهري',
      icon: Building2,
      accent: 'violet',
      value: view.monthlyAmount,
      context: rentKnown ? 'حسب بيانات العقد' : estimated ? 'تقدير من آخر شهر مسدّد' : 'غير مسجَّل',
      contextTone: rentKnown ? 'mute' : 'warn',
      state,
      onRetry: retry,
    },
    {
      label: `المسدّد عن ${profile.year}`,
      icon: HandCoins,
      accent: 'green',
      value: totals.paid,
      context:
        [
          totals.paidMonths > 0 && `مسدّد: ${obligationMonthsText(totals.paidMonths)}`,
          totals.ahead > 0 && `منه ${formatMoney(totals.ahead, 'LYD')} لأشهر قادمة`,
        ]
          .filter(Boolean)
          .join(' · ') || 'لا دفعات عن هذه السنة',
      state,
    },
    {
      label: 'المستحق الآن',
      icon: Hourglass,
      accent: 'red',
      value: owedUnknown ? null : due.owed,
      tone: due.owedMonths === 0 ? 'good' : oldestOwed ? 'bad' : 'warn',
      context:
        due.owedMonths === 0
          ? 'لا مستحقات'
          : [
              obligationMonthsText(due.owedMonths),
              oldestOwed && `الأقدم ${formatMonthLabelAr(oldestOwed)}`,
              owedUnknown ? 'المبلغ غير معروف' : due.owedEstimated && 'تقديري',
              !owedUnknown && !due.owedComplete && 'على الأقل',
            ]
              .filter(Boolean)
              .join(' · '),
      contextTone: due.owedMonths === 0 ? 'good' : oldestOwed ? 'bad' : 'warn',
      state,
    },
    {
      label: 'آخر دفعة',
      icon: CalendarCheck,
      accent: 'amber',
      value: profile.lastPayment?.amount ?? null,
      context: profile.lastPayment ? formatDate(profile.lastPayment.date) : 'لا دفعات بعد',
      state,
    },
  ];

  const tabs: ProfileTabDef<TabId>[] = [
    {
      id: 'payments',
      label: 'الدفعات',
      count: loading || failed ? null : profile.payments.length,
      icon: Wallet,
    },
    {
      id: 'transactions',
      label: 'الحركات',
      count: loading || failed ? null : transactions.length,
      icon: Receipt,
    },
    {
      id: 'journals',
      label: 'القيود',
      count: entries.isLoading || entries.isError ? null : (entries.data ?? journalEntries).length,
      icon: BookOpen,
    },
  ];

  const rentValue =
    Number(contact.monthly_rent) > 0 ? (
      <span className="inline-flex flex-wrap items-center gap-x-3">
        <span className="tabular-nums">{formatMoney(Number(contact.monthly_rent), 'LYD')}</span>
        {canWrite && (
          <button
            type="button"
            onClick={() => setRentOpen(true)}
            className="-my-3 inline-flex min-h-11 items-center text-[12.5px] text-info-ink underline underline-offset-4"
          >
            تعديل
          </button>
        )}
      </span>
    ) : canWrite ? (
      <button type="button" onClick={() => setRentOpen(true)} className="-my-3 inline-flex min-h-11 items-center text-info-ink underline underline-offset-4">
        غير مسجَّل، سجّله
      </button>
    ) : null;

  const siteItems: InfoItem[] = [
    { label: 'العقار / الموقع', value: contact.shop_number?.trim() || null },
    { label: 'الطابق', value: contact.floor?.trim() || null },
    {
      label: 'المساحة',
      value: contact.area_sqm ? `${contact.area_sqm} م²` : null,
    },
  ];
  const contractItems: InfoItem[] = [
    { label: 'الإيجار الشهري', value: rentValue },
    {
      label: 'بداية العقد',
      value: contact.contract_start ? formatDate(contact.contract_start) : null,
    },
    {
      label: 'نهاية العقد',
      value: contact.contract_end ? formatDate(contact.contract_end) : null,
    },
    { label: 'حالة العقد', value: contractBadge(contact, today) },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
      <KpiStrip label={`مستحقات ${contact.name}`} items={kpis} />

      {!loading && !failed && <UncountedNote count={uncountedCount(transactions)} />}

      {!loading && !failed && !rentKnown && (
        <Callout
          tone="info"
          title={estimated ? 'الإيجار الشهري غير مسجَّل' : 'الإيجار الشهري غير مسجَّل، ولا دفعة تدلّ عليه'}
          action={
            canWrite ? (
              <Button type="button" variant="outline" onClick={() => setRentOpen(true)}>
                سجّل الإيجار الشهري
              </Button>
            ) : undefined
          }
        >
          {estimated
            ? `المستحق يُقدَّر بـ ${formatMoney(view.monthlyAmount ?? 0, 'LYD')}، من آخر شهر مسدّد. سجّل الإيجار الفعلي ليصير المبلغ ثابتاً.`
            : 'سجّل الإيجار الشهري ليظهر ما يستحقه المؤجر كل شهر.'}
        </Callout>
      )}

      {!loading && due.contractDatesInvalid && <Callout tone="warning">نهاية العقد قبل بدايته. راجع بيانات العقد.</Callout>}

      <SectionCard
        title={`أشهر ${profile.year}`}
        icon={CalendarDays}
        accent="violet"
        actions={<YearSwitch year={profile.year} min={profile.years.min} max={profile.years.max} onChange={setYear} />}
      >
        {failed ? (
          <ErrorBlock message="تعذّر تحميل حركات المؤجر، فلا يمكن تحديد حالة الأشهر. تحقق من الاتصال ثم أعد المحاولة." onRetry={retry} className="py-6" />
        ) : (
          <div className="flex flex-col gap-4">
            {!loading && <TrackingLine tracking={tracking} onChange={canWrite ? () => setSinceOpen(true) : undefined} />}
            {gridMonths.length === 0 && !loading ? (
              <p className="text-[13px] text-ink-mute">كل أشهر {profile.year} مسدّدة قبل المنظومة.</p>
            ) : (
              <MonthGrid
                months={gridMonths}
                columns={6}
                loading={loading}
                renderAction={(m) =>
                  (m.status === 'due' || m.status === 'partial') && mayRecordPayment ? (
                    <LandlordPayButton
                      compact
                      name={contact.name}
                      next={landlordPaymentFor(contact.name, m, today)}
                      onPay={() => payFor(m)}
                      className="w-full"
                    />
                  ) : null
                }
                footnote={
                  <>
                    الشهر يُقرأ من بيان السداد، وإن لم يُذكر فهو شهر تاريخ الصرف.
                    {totals.ahead > 0 && ` المدفوع لأشهر لم تبدأ بعد (${formatMoney(totals.ahead, 'LYD')}) لا يُعدّ مستحقاً.`}
                  </>
                }
              />
            )}
          </div>
        )}
      </SectionCard>

      <ProfileTabs tabs={tabs} value={tab} onValueChange={setTab} label={`سجل ${contact.name}`}>
        <ProfilePanel id="payments">
          <Card className="min-w-0 overflow-hidden">
            {failed ? (
              <ErrorBlock message="تعذّر تحميل دفعات المؤجر." onRetry={retry} />
            ) : loading ? (
              <LoadingBlock rows={4} />
            ) : (
              <LandlordPayments rows={profile.payments} onAdd={payOther} />
            )}
          </Card>
        </ProfilePanel>
        <ProfilePanel id="transactions">
          <ContactTransactionsList
            contact={contact}
            transactions={transactions}
            direction="out"
            loading={txLoading}
            error={failed ? history.error : undefined}
            onRetry={retry}
          />
        </ProfilePanel>
        <ProfilePanel id="journals">
          <ContactJournalsList
            entries={entries.data ?? journalEntries}
            loading={entries.isLoading}
            error={entries.isError ? entries.error : undefined}
            onRetry={() => void entries.refetch()}
          />
        </ProfilePanel>
      </ProfileTabs>

      <SectionCard
        title="العقار والعقد"
        icon={FileText}
        accent="blue"
        actions={
          onEdit && (
            <Button type="button" variant="outline" className="min-h-11 gap-1.5 sm:min-h-9" onClick={onEdit}>
              <Pencil aria-hidden />
              تعديل
            </Button>
          )
        }
      >
        <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          <InfoList items={siteItems} />
          {/* on a phone the two lists stack: a hairline keeps the second one from reading as more of the first */}
          <InfoList items={contractItems} className="max-md:border-t max-md:border-border max-md:pt-3" />
        </div>
      </SectionCard>

      {/* mounted only while open, so each opening starts from the file as it is now */}
      {rentOpen && <MonthlyRentDialog open onOpenChange={setRentOpen} contact={contact} estimate={estimated ? view.monthlyAmount : null} />}
      {sinceOpen && <TrackingStartDialog open onOpenChange={setSinceOpen} contact={contact} input={input} tracking={tracking} suggested={defaultTracking} />}
    </div>
  );
}
