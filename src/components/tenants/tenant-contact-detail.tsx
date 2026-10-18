'use client';

import { useMemo } from 'react';
import { Loader2, Receipt, BookOpen, Banknote } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MobileTransactionList } from '@/components/data/mobile-transaction-list';
import { TransactionsTable } from '@/components/data/transactions-table';

import { TenantRentOverview } from '@/components/tenants/tenant-rent-overview';
import { TenantProfileSidebar } from '@/components/tenants/tenant-profile-sidebar';
import { TenantRentCalendarPanel } from '@/components/tenants/tenant-rent-calendar-panel';
import { TenantProfileCharges } from '@/components/tenants/tenant-profile-charges';
import { TenantRentHistory } from '@/components/tenants/tenant-rent-history';
import { TenantJournalEntryCard } from '@/components/journals/tenant-journal-entry-card';
import { journalEntryIsVoided } from '@/lib/journal-entry-display';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import type { ContactRow } from '@/lib/db/types';
import type { TenantRentSummary } from '@/lib/db/queries';
import type { TransactionWithRelations } from '@/lib/db/types';

const TAB_TRIGGER =
  'shrink-0 gap-1.5 rounded-lg px-3 py-2 text-[13px] data-[state=active]:bg-card data-[state=active]:shadow-xs touch-manipulation sm:text-sm';

export function TenantContactDetail({
  contact,
  rent,
  tenantId,
  monthlyRent,
  transactions,
  txLoading,
  journalEntries,
  jeLoading,
  rentPaymentsCount,
  onEdit,
  onCollect,
}: {
  contact: ContactRow;
  rent: TenantRentSummary;
  tenantId: string;
  monthlyRent: number;
  transactions: TransactionWithRelations[];
  txLoading: boolean;
  journalEntries: JournalEntryRow[];
  jeLoading: boolean;
  rentPaymentsCount: number;
  onEdit: () => void;
  /** open rent collection, optionally with months selected; absent when the user may not collect */
  onCollect?: (months?: string[]) => void;
}) {
  const claimStart = rent.rent_claim_start ?? contact.contract_start ?? null;
  const contractStartYear = contact.contract_start
    ? new Date(contact.contract_start).getFullYear()
    : rent.rent_claim_start
      ? new Date(rent.rent_claim_start).getFullYear()
      : null;

  const { activeJournalEntries, voidedJournalEntries } = useMemo(() => {
    const voided: JournalEntryRow[] = [];
    const active: JournalEntryRow[] = [];
    for (const je of journalEntries) {
      if (journalEntryIsVoided(je.status)) voided.push(je);
      else active.push(je);
    }
    return { activeJournalEntries: active, voidedJournalEntries: voided };
  }, [journalEntries]);

  return (
    <>
      <TenantRentOverview
        contact={contact}
        monthlyRent={monthlyRent}
        claimStart={claimStart}
        contractStartYear={contractStartYear}
        transactions={transactions}
        journalEntries={journalEntries}
        onCollect={onCollect}
      />

      <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-8 min-w-0 order-1">
          <Card className="min-w-0 overflow-hidden">
            <Tabs defaultValue="rent-calendar" dir="rtl">
              <div className="border-b border-border/60 bg-canvas-sunken/40 px-3 pt-3 sm:px-4">
                <TabsList className="mb-0 flex h-auto w-full justify-start gap-1 overflow-x-auto p-1 no-scrollbar flex-nowrap bg-transparent">
                  <TabsTrigger
                    value="rent-calendar"
                    className={TAB_TRIGGER}
                  >
                    <Banknote className="h-4 w-4 shrink-0" />
                    تقويم الإيجار
                  </TabsTrigger>
                  <TabsTrigger
                    value="charges"
                    className={TAB_TRIGGER}
                  >
                    <Receipt className="h-4 w-4 shrink-0" />
                    المطالبات
                  </TabsTrigger>
                  <TabsTrigger
                    value="rent"
                    className={TAB_TRIGGER}
                  >
                    <Receipt className="h-4 w-4 shrink-0" />
                    مدفوعات ({rentPaymentsCount})
                  </TabsTrigger>
                  <TabsTrigger
                    value="transactions"
                    className={TAB_TRIGGER}
                  >
                    <Receipt className="h-4 w-4 shrink-0" />
                    معاملات ({transactions.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="journals"
                    className={TAB_TRIGGER}
                  >
                    <BookOpen className="h-4 w-4 shrink-0" />
                    قيود ({journalEntries.length})
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="rent-calendar" className="mt-0 px-0">
                <TenantRentCalendarPanel
                  tenantId={tenantId}
                  tenantName={contact.name}
                  monthlyRent={monthlyRent}
                  journalEntries={journalEntries}
                  journalsLoading={jeLoading}
                  contractStartYear={contractStartYear}
                  claimStart={claimStart}
                  onCollect={onCollect ? (month) => onCollect([month]) : undefined}
                  className="rounded-none border-0 shadow-none"
                />
              </TabsContent>

              <TabsContent value="charges" className="mt-0 p-4 sm:p-5">
                <TenantProfileCharges contact={contact} />
              </TabsContent>

              <TabsContent value="rent" className="mt-0 p-4 sm:p-5">
                <TenantRentHistory tenantId={tenantId} contact={contact} />
              </TabsContent>

              <TabsContent value="transactions" className="mt-0">
                <div className="hidden sm:block">
                  <TransactionsTable rows={transactions} loading={txLoading} />
                </div>
                <div className="sm:hidden p-3">
                  <MobileTransactionList rows={transactions} />
                </div>
              </TabsContent>

              <TabsContent value="journals" className="mt-0 p-4 sm:p-5">
                {jeLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-ink-soft" />
                  </div>
                ) : journalEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    لا توجد قيود يومية مرتبطة
                  </p>
                ) : (
                  <div className="space-y-4">
                    {activeJournalEntries.length > 0 && (
                      <div className="space-y-2">
                        {activeJournalEntries.map((je) => (
                          <TenantJournalEntryCard key={je.id} entry={je} />
                        ))}
                      </div>
                    )}
                    {voidedJournalEntries.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-danger-ink px-1">
                          قيود ملغاة أو معكوسة ({voidedJournalEntries.length})
                        </p>
                        {voidedJournalEntries.map((je) => (
                          <TenantJournalEntryCard key={je.id} entry={je} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <div className="lg:col-span-4 order-2">
          <TenantProfileSidebar contact={contact} claimStart={claimStart} onEdit={onEdit} />
        </div>
      </div>
    </>
  );
}
