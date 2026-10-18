'use client';

import Link from 'next/link';
import {
  Phone,
  Loader2,
  FileText,
  Receipt,
  BookOpen,
  Banknote,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MobileTransactionList } from '@/components/data/mobile-transaction-list';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { ContactRentLinks } from '@/components/contacts/contact-rent-links';
import { ContactPhoneActions } from '@/components/contacts/contact-phone-actions';
import { TenantRentHistory } from '@/components/tenants/tenant-rent-history';
import { TenantProfileCharges } from '@/components/tenants/tenant-profile-charges';
import { TenantRentCalendarPanel } from '@/components/tenants/tenant-rent-calendar-panel';
import { getTenantStatus } from '@/components/tenants/tenant-status-config';
import { getTenantCurrentMonthPresentation } from '@/lib/tenant-current-month';
import { buildJournalEntriesForPdf } from '@/lib/journal-pdf';
import { ContactLedgerPanel } from '@/components/contacts/contact-ledger-panel';
import type { JournalEntryRow } from '@/lib/db/journal-queries';

import type { TenantRentSummary } from '@/lib/db/queries';
import type { ContactRow, TransactionWithRelations } from '@/lib/db/types';
import { cn, formatDate, formatMoney } from '@/lib/utils';

export function OtherContactDetailBody({
  contactId,
  contact,
  isTenant,
  rent,
  monthlyRent,
  totals,
  transactions,
  txLoading,
  journalEntries,
  jeLoading,
  rentPaymentsCount,
  canRecordRent,
  onRecordPayment,
  kindLabel,
  kindColor,
  KindIcon,
}: {
  contactId: string;
  contact: ContactRow;
  isTenant: boolean;
  rent: TenantRentSummary | null | undefined;
  monthlyRent: number;
  totals: { revenue: number; expense: number };
  transactions: TransactionWithRelations[];
  txLoading: boolean;
  journalEntries: JournalEntryRow[];
  jeLoading: boolean;
  rentPaymentsCount: number;
  canRecordRent: boolean;
  onRecordPayment: () => void;
  kindLabel?: string;
  kindColor?: string;
  KindIcon: LucideIcon;
}) {
  const monthPres = rent
    ? getTenantCurrentMonthPresentation(rent, monthlyRent)
    : null;
  const rentStatus = rent?.current_month_status
    ? getTenantStatus(rent.current_month_status)
    : null;
  const RentStatusIcon = rentStatus?.icon;

  return (
    <>
      <div className="-mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar snap-x snap-mandatory md:grid md:grid-cols-2 md:gap-3 md:overflow-visible lg:grid-cols-4">
          {isTenant && rent && (
            <Card className="min-w-38 shrink-0 snap-center p-4 border-border bg-canvas-sunken/50 md:min-w-0">
              <p className="text-xs text-ink-mute">إيجارات 12 شهر</p>
              <p className="text-lg font-bold text-foreground sm:text-xl">
                {formatMoney(Number(rent.last_12_months_revenue), 'LYD')}
              </p>
            </Card>
          )}
          <Card className="min-w-38 shrink-0 snap-center p-4 md:min-w-0">
            <p className="text-xs text-ink-mute">إجمالي الإيرادات</p>
            <p className="text-lg font-bold text-success sm:text-xl">
              {formatMoney(totals.revenue, 'LYD')}
            </p>
          </Card>
          <Card className="min-w-38 shrink-0 snap-center p-4 md:min-w-0">
            <p className="text-xs text-ink-mute">إجمالي المصروفات</p>
            <p className="text-lg font-bold text-danger sm:text-xl">
              {formatMoney(totals.expense, 'LYD')}
            </p>
          </Card>
          {!isTenant ? (
            <Card className="min-w-38 shrink-0 snap-center p-4 md:min-w-0">
              <p className="text-xs text-ink-mute">صافي الحركة</p>
              <p
                className={cn(
                  'text-lg font-bold sm:text-xl',
                  totals.revenue - totals.expense >= 0
                    ? 'text-foreground'
                    : 'text-warning-ink',
                )}
              >
                {formatMoney(totals.revenue - totals.expense, 'LYD')}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px]">
                <Link
                  href={`/transactions?contact=${contactId}`}
                  className="text-foreground hover:underline"
                >
                  المعاملات
                </Link>
                <span className="text-ink-mute">·</span>
                <Link
                  href={`/journals?contact=${contactId}`}
                  className="text-foreground hover:underline"
                >
                  اليومية
                </Link>
              </div>
            </Card>
          ) : null}
          <Card className="min-w-38 shrink-0 snap-center p-4 md:min-w-0">
            <p className="text-xs text-ink-mute">عدد المعاملات</p>
            <p className="text-lg font-bold sm:text-xl">{transactions.length}</p>
          </Card>
          <Card className="min-w-38 shrink-0 snap-center p-4 md:min-w-0">
            <p className="text-xs text-ink-mute">قيود اليومية</p>
            <p className="text-lg font-bold sm:text-xl">{journalEntries.length}</p>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 order-2 lg:order-0">
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                <KindIcon className={cn('h-6 w-6', kindColor)} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{kindLabel}</Badge>
                  <Badge className={cn(
                    contact.is_active
                      ? 'bg-success-soft text-success-ink'
                      : 'bg-warning-soft text-warning-ink',
                  )}>
                    {contact.is_active ? 'نشط' : 'غير نشط'}
                  </Badge>
                </div>
                {contact.code && (
                  <p className="text-xs text-ink-mute mt-1">{contact.code}</p>
                )}
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              {contact.name_en && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-mute">الاسم باللغة الإنجليزية</dt>
                  <dd className="font-medium text-left" dir="ltr">{contact.name_en}</dd>
                </div>
              )}
              {contact.phone && (
                <div className="space-y-2">
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-mute flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" /> هاتف
                    </dt>
                    <dd dir="ltr">{contact.phone}</dd>
                  </div>
                  <ContactPhoneActions
                    name={contact.name}
                    phone={contact.phone}
                    kind={contact.kind}
                  />
                </div>
              )}
              {contact.email && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-mute">البريد الإلكتروني</dt>
                  <dd className="max-w-[65%] break-all text-left" dir="ltr">{contact.email}</dd>
                </div>
              )}
              {contact.address && (
                <div className="flex justify-between gap-2">
                  <dt className="shrink-0 text-ink-mute">العنوان</dt>
                  <dd className="text-end">{contact.address}</dd>
                </div>
              )}
              {contact.phone2 && (
                <div className="space-y-2">
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-mute flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" /> هاتف 2
                    </dt>
                    <dd dir="ltr">{contact.phone2}</dd>
                  </div>
                  <ContactPhoneActions
                    name={contact.name}
                    phone={contact.phone2}
                    kind={contact.kind}
                    compact
                  />
                </div>
              )}
              {contact.kind === 'EMPLOYEE' && contact.job_title ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-mute">المسمى الوظيفي</dt>
                  <dd className="font-medium">{contact.job_title}</dd>
                </div>
              ) : null}
              {contact.kind === 'EMPLOYEE' && contact.department ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-mute">القسم</dt>
                  <dd className="font-medium">{contact.department}</dd>
                </div>
              ) : null}
              {contact.kind === 'EMPLOYEE' && contact.salary ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-mute">الراتب الشهري</dt>
                  <dd className="font-medium tabular-nums">
                    {formatMoney(Number(contact.salary), 'LYD')}
                  </dd>
                </div>
              ) : null}
              {contact.kind === 'EMPLOYEE' && contact.hire_date ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-mute">تاريخ التعيين</dt>
                  <dd>{formatDate(contact.hire_date)}</dd>
                </div>
              ) : null}
              {contact.monthly_rent && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-mute">إيجار شهري</dt>
                  <dd className="font-medium">
                    {formatMoney(Number(contact.monthly_rent), 'LYD')}
                  </dd>
                </div>
              )}
              {monthPres && rentStatus && RentStatusIcon && (
                <div className="flex justify-between gap-2 items-center">
                  <dt className="text-ink-mute">إيجار {monthPres.monthName}</dt>
                  <dd className={cn('flex items-center gap-1 font-medium', rentStatus.color)}>
                    <RentStatusIcon className="h-4 w-4" />
                    {monthPres.headline}
                  </dd>
                </div>
              )}
              {monthPres && monthPres.paid > 0 && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-mute">المسدّد</dt>
                  <dd className="font-medium text-success-ink tabular-nums">
                    {formatMoney(monthPres.paid, 'LYD')}
                  </dd>
                </div>
              )}
              {monthPres && monthPres.remaining > 0 && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-mute">المتبقي</dt>
                  <dd className="font-medium text-warning-ink tabular-nums">
                    {formatMoney(monthPres.remaining, 'LYD')}
                  </dd>
                </div>
              )}
              {rent && Number(rent.open_charges_count) > 0 && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-mute">مطالبات مفتوحة</dt>
                  <dd className="text-danger-ink font-medium">
                    {rent.open_charges_count} (
                    {formatMoney(Number(rent.open_charges_total ?? 0), 'LYD')})
                  </dd>
                </div>
              )}
              {!contact.phone && !contact.monthly_rent && !contact.shop_number && (
                <p className="text-ink-mute text-xs">
                  بيانات ناقصة — يمكن إكمالها من «تعديل»
                </p>
              )}
            </dl>
          </Card>
          {isTenant && (
            <ContactRentLinks
              contact={contact}
              onRecordPayment={canRecordRent && rent ? onRecordPayment : undefined}
            />
          )}
        </div>

        <Card className="p-4 lg:col-span-2 min-w-0 order-1">
          <Tabs defaultValue={isTenant ? 'rent-calendar' : 'transactions'} dir="rtl">
            <TabsList className="mb-4 flex h-auto w-full justify-start gap-1 overflow-x-auto p-1 no-scrollbar flex-nowrap sm:flex-wrap">
              {isTenant && (
                <>
                  <TabsTrigger
                    value="rent-calendar"
                    className="shrink-0 gap-1.5 px-3 py-2 text-xs touch-manipulation sm:text-sm"
                  >
                    <Banknote className="h-4 w-4 shrink-0" />
                    تقويم الإيجار
                  </TabsTrigger>
                  <TabsTrigger
                    value="charges"
                    className="shrink-0 gap-1.5 px-3 py-2 text-xs touch-manipulation sm:text-sm"
                  >
                    <Receipt className="h-4 w-4 shrink-0" />
                    المطالبات
                  </TabsTrigger>
                  <TabsTrigger
                    value="rent"
                    className="shrink-0 gap-1.5 px-3 py-2 text-xs touch-manipulation sm:text-sm"
                  >
                    <Receipt className="h-4 w-4 shrink-0" />
                    مدفوعات ({rentPaymentsCount})
                  </TabsTrigger>
                </>
              )}
              <TabsTrigger
                value="transactions"
                className="shrink-0 gap-1.5 px-3 py-2 text-xs touch-manipulation sm:text-sm"
              >
                <Receipt className="h-4 w-4 shrink-0" />
                معاملات ({transactions.length})
              </TabsTrigger>
              <TabsTrigger
                value="journals"
                className="shrink-0 gap-1.5 px-3 py-2 text-xs touch-manipulation sm:text-sm"
              >
                <BookOpen className="h-4 w-4 shrink-0" />
                قيود ({journalEntries.length})
              </TabsTrigger>
            </TabsList>

            {isTenant && (
              <TabsContent value="rent-calendar" className="mt-0">
                <TenantRentCalendarPanel
                  tenantId={contactId}
                  tenantName={contact.name}
                  monthlyRent={monthlyRent}
                  journalEntries={journalEntries}
                  journalsLoading={jeLoading}
                  className="border-0 shadow-none"
                />
              </TabsContent>
            )}
            {isTenant && (
              <TabsContent value="charges" className="mt-0">
                <TenantProfileCharges contact={contact} />
              </TabsContent>
            )}
            {isTenant && (
              <TabsContent value="rent">
                <TenantRentHistory tenantId={contactId} contact={contact} />
              </TabsContent>
            )}

            <TabsContent value="transactions" className="mt-0">
              <ContactLedgerPanel
                contact={contact}
                transactions={transactions}
                journalEntries={journalEntries}
                txLoading={txLoading}
                jeLoading={jeLoading}
              />
            </TabsContent>

            <TabsContent value="journals" className="mt-0">
              <ContactLedgerPanel
                contact={contact}
                transactions={transactions}
                journalEntries={journalEntries}
                txLoading={txLoading}
                jeLoading={jeLoading}
              />
            </TabsContent>
          </Tabs>
        </Card>
      </div>

    </>
  );
}
