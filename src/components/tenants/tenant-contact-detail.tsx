'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Loader2, Receipt, BookOpen, Banknote } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MobileTransactionList } from '@/components/data/mobile-transaction-list';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { TenantCurrentMonthBanner } from '@/components/tenants/tenant-current-month-banner';
import { TenantProfileStats } from '@/components/tenants/tenant-profile-stats';
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
import { cn, formatDate, formatMoney } from '@/lib/utils';

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
  onRecordPayment,
  canRecordPayment,
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
  onRecordPayment: () => void;
  canRecordPayment: boolean;
}) {
  const totalsRevenue = transactions
    .filter((t) => t.kind === 'REVENUE')
    .reduce((s, t) => s + Number(t.amount || 0), 0);

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
      <TenantCurrentMonthBanner rent={rent} monthlyRent={monthlyRent} />

      <TenantProfileStats
        rent={rent}
        monthlyRent={monthlyRent}
        totalsRevenue={totalsRevenue}
        transactionCount={transactions.length}
        journalCount={journalEntries.length}
      />

      <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-8 min-w-0 order-1">
          <Card className="overflow-hidden border-border/80 shadow-sm min-w-0">
            <Tabs defaultValue="rent-calendar" dir="rtl">
              <div className="border-b border-border/60 bg-canvas-sunken/40 px-3 pt-3 sm:px-4">
                <TabsList className="mb-0 flex h-auto w-full justify-start gap-1 overflow-x-auto p-1 no-scrollbar flex-nowrap bg-transparent">
                  <TabsTrigger
                    value="rent-calendar"
                    className="shrink-0 gap-1.5 rounded-lg px-3 py-2 text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm touch-manipulation sm:text-sm"
                  >
                    <Banknote className="h-4 w-4 shrink-0" />
                    تقويم الإيجار
                  </TabsTrigger>
                  <TabsTrigger
                    value="charges"
                    className="shrink-0 gap-1.5 rounded-lg px-3 py-2 text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm touch-manipulation sm:text-sm"
                  >
                    <Receipt className="h-4 w-4 shrink-0" />
                    المطالبات
                  </TabsTrigger>
                  <TabsTrigger
                    value="rent"
                    className="shrink-0 gap-1.5 rounded-lg px-3 py-2 text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm touch-manipulation sm:text-sm"
                  >
                    <Receipt className="h-4 w-4 shrink-0" />
                    مدفوعات ({rentPaymentsCount})
                  </TabsTrigger>
                  <TabsTrigger
                    value="transactions"
                    className="shrink-0 gap-1.5 rounded-lg px-3 py-2 text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm touch-manipulation sm:text-sm"
                  >
                    <Receipt className="h-4 w-4 shrink-0" />
                    معاملات ({transactions.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="journals"
                    className="shrink-0 gap-1.5 rounded-lg px-3 py-2 text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm touch-manipulation sm:text-sm"
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
                  contractStartYear={
                    contact.contract_start
                      ? new Date(contact.contract_start).getFullYear()
                      : rent.rent_claim_start
                        ? new Date(rent.rent_claim_start).getFullYear()
                        : null
                  }
                  claimStart={rent.rent_claim_start ?? contact.contract_start ?? null}
                  className="border-0 shadow-none rounded-none"
                />
              </TabsContent>

              <TabsContent value="charges" className="mt-0 p-4 sm:p-5">
                <TenantProfileCharges contact={contact} />
              </TabsContent>

              <TabsContent value="rent" className="mt-0 p-4 sm:p-5">
                <TenantRentHistory tenantId={tenantId} contact={contact} />
              </TabsContent>

              <TabsContent value="transactions" className="mt-0 p-4 sm:p-5">
                {txLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
                  </div>
                ) : transactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    لا توجد معاملات مرتبطة بهذا المستأجر
                  </p>
                ) : (
                  <>
                    <div className="sm:hidden">
                      <MobileTransactionList rows={transactions} />
                    </div>
                    <div className="hidden sm:block overflow-x-auto rounded-xl border border-border/60">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-canvas-sunken/50 text-muted-foreground text-right">
                            <th className="py-2.5 pr-3 font-medium">التاريخ</th>
                            <th className="py-2.5 font-medium">النوع</th>
                            <th className="py-2.5 font-medium">الحساب</th>
                            <th className="py-2.5 pl-3 text-left font-medium">المبلغ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transactions.map((tx) => (
                            <tr
                              key={tx.id}
                              className="border-b border-border/50 last:border-0 hover:bg-muted/30"
                            >
                              <td className="py-2.5 pr-3">{formatDate(tx.tx_date)}</td>
                              <td className="py-2.5">
                                <span
                                  className={cn(
                                    'text-xs font-semibold rounded-full px-2 py-0.5',
                                    tx.kind === 'REVENUE'
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                      : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
                                  )}
                                >
                                  {tx.kind === 'REVENUE' ? 'إيراد' : 'مصروف'}
                                </span>
                              </td>
                              <td className="py-2.5 text-muted-foreground">
                                {tx.category?.name_ar ?? '—'}
                              </td>
                              <td className="py-2.5 pl-3 text-left font-semibold tabular-nums">
                                {formatMoney(Number(tx.amount), tx.currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="journals" className="mt-0 p-4 sm:p-5">
                {jeLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
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
                        <p className="text-xs font-semibold text-red-700 px-1">
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
          <TenantProfileSidebar
            contact={contact}
            rent={rent}
            onEdit={onEdit}
            onRecordPayment={canRecordPayment ? onRecordPayment : undefined}
          />
        </div>
      </div>
    </>
  );
}
