'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { BookOpen, FileText, IdCard, LayoutGrid, Receipt, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Callout, InfoList, SectionCard } from '@/components/people';
import { ContactJournalsList, ContactTransactionsList } from '@/components/contacts/contact-ledger-panel';
import { LandlordSuggestion } from '@/components/contacts/profile/landlord-suggestion';
import { hasSupplyFacts, PartyDetails, supplyItems } from '@/components/contacts/profile/party-details';
import { PartyHeader } from '@/components/contacts/profile/party-header';
import { PartyOverview } from '@/components/contacts/profile/party-overview';
import { ProfileKpis, UncountedNote } from '@/components/contacts/profile/profile-kpis';
import { ProfilePanel, ProfileTabs, useProfileTab, type ProfileTabDef } from '@/components/contacts/profile/profile-tabs';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import type { ContactBusinessRole } from '@/lib/contacts/contact-roles';
import { canCreateContactTransaction } from '@/lib/contacts/form-utils';
import { isLandlord } from '@/lib/contacts/contact-tags';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import type { ContactRow, TransactionWithRelations } from '@/lib/db/types';
import { profileDirection, txKindOfDirection, uncountedCount } from '@/lib/people/party-profile';
import { buildPartyStats } from '@/lib/people/party-stats';
import { usePermission } from '@/lib/supabase/use-permission';
import { useTxDialog } from '@/stores/transaction-dialog';
import { todayISODate } from '@/lib/utils';

/** What a vendor, customer or other party page needs from the page that loaded it. */
export type PartyBodyProps = {
  contact: ContactRow;
  role: ContactBusinessRole;
  transactions: TransactionWithRelations[];
  txLoading: boolean;
  txError?: unknown;
  onRetryTx?: () => void;
  journalEntries: JournalEntryRow[];
  jeLoading: boolean;
  jeError?: unknown;
  onRetryJe?: () => void;
  /** absent for people who may not edit the file */
  onEdit?: () => void;
  /** the tab named in the address */
  initialTab?: string | null;
};

const TAB_IDS = ['overview', 'transactions', 'journals', 'details'] as const;
type TabId = (typeof TAB_IDS)[number];

/** The «التوريد» card of a supplier: what is supplied and under which meter or contract. */
function SupplyCard({ contact }: { contact: ContactRow }) {
  return (
    <SectionCard title="التوريد" icon={Truck} accent="amber">
      <InfoList items={supplyItems(contact)} />
    </SectionCard>
  );
}

/**
 * The page of a vendor, a customer or any other party that is not a tenant or a landlord: header, the landlord
 * offer when the payments suggest one, four figures, and four tabs. A supplier of electricity, water, goods or
 * services adds its supply facts to the overview.
 */
export function PartyProfile({
  contact,
  role,
  transactions,
  txLoading,
  txError,
  onRetryTx,
  journalEntries,
  jeLoading,
  jeError,
  onRetryJe,
  onEdit,
  initialTab,
  supply = false,
}: PartyBodyProps & { supply?: boolean }) {
  const { can } = usePermission();
  const openTx = useTxDialog((s) => s.open);
  const [tab, setTab] = useProfileTab<TabId>(TAB_IDS, initialTab);

  const failed = !!txError && transactions.length === 0;
  const stats = useMemo(() => (txLoading || failed ? null : buildPartyStats(transactions)), [transactions, txLoading, failed]);
  const direction = profileDirection(contact, stats);
  const kind = txKindOfDirection(direction);
  const mayCreate = canCreateContactTransaction(contact.is_active, can(kind === 'EXPENSE' ? 'expense.create' : 'revenue.create'));
  const add = mayCreate ? () => openTx({ kind, contactId: contact.id, contactKind: contact.kind }) : undefined;

  async function renderDossier() {
    const { ContactDossierPDF } = await import('@/features/pdf/ContactDossierPDF');
    return <ContactDossierPDF contact={contact} rent={null} transactions={transactions} />;
  }

  const tabs: ProfileTabDef<TabId>[] = [
    { id: 'overview', label: 'نظرة عامة', icon: LayoutGrid },
    { id: 'transactions', label: 'الحركات', count: txLoading || failed ? null : transactions.length, icon: Receipt },
    { id: 'journals', label: 'القيود', count: jeLoading || jeError ? null : journalEntries.length, icon: BookOpen },
    { id: 'details', label: 'بيانات الجهة', icon: IdCard },
  ];

  return (
    <>
      <PartyHeader
        contact={contact}
        role={role}
        direction={direction}
        landlord={isLandlord(contact)}
        transactions={transactions}
        statementReady={!txLoading && !failed}
        onEdit={onEdit}
        extraActions={
          contact.kind === 'EMPLOYEE' ? (
            <Button asChild variant="outline" className="min-h-11 flex-1 gap-1.5 sm:min-h-9 sm:flex-none">
              <Link href={`/payroll/employees/${contact.id}`}>
                <FileText aria-hidden />
                ملف الراتب والسلف
              </Link>
            </Button>
          ) : undefined
        }
      />

      {!contact.is_active && (
        <Callout tone="warning">هذا الملف غير نشط. حركاته السابقة متاحة، ولا تُسجَّل حركة جديدة قبل إعادة تفعيله من «تعديل».</Callout>
      )}

      {!txLoading && !failed && <LandlordSuggestion contact={contact} transactions={transactions} canEdit={!!onEdit} />}

      <ProfileKpis stats={stats} direction={direction} loading={txLoading} error={failed} onRetry={onRetryTx} />
      {!txLoading && !failed && <UncountedNote count={uncountedCount(transactions)} />}

      <ProfileTabs tabs={tabs} value={tab} onValueChange={setTab} label={`ملف ${contact.name}`}>
        <ProfilePanel id="overview">
          <PartyOverview
            stats={stats}
            direction={direction}
            transactions={transactions}
            loading={txLoading}
            error={failed ? txError : undefined}
            onRetry={onRetryTx}
            notes={contact.notes}
            extra={supply && hasSupplyFacts(contact, role) ? <SupplyCard contact={contact} /> : undefined}
            onOpenMovements={() => setTab('transactions')}
            onAdd={add}
          />
        </ProfilePanel>
        <ProfilePanel id="transactions">
          <ContactTransactionsList
            contact={contact}
            transactions={transactions}
            direction={direction}
            loading={txLoading}
            error={failed ? txError : undefined}
            onRetry={onRetryTx}
          />
        </ProfilePanel>
        <ProfilePanel id="journals">
          <ContactJournalsList entries={journalEntries} loading={jeLoading} error={jeError} onRetry={onRetryJe} />
        </ProfilePanel>
        <ProfilePanel id="details">
          <PartyDetails
            contact={contact}
            onEdit={onEdit}
            documents={
              <TajMallPdfToolbar
                fileName={`ملف-${contact.name}-${todayISODate()}`}
                render={renderDossier}
                disabled={txLoading || failed}
                openLabel="عرض ملف الجهة"
                className="[&>button]:flex-1 sm:[&>button]:flex-none"
              />
            }
          />
        </ProfilePanel>
      </ProfileTabs>
    </>
  );
}
