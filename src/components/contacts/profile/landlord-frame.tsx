'use client';

import { useMemo } from 'react';
import { Callout } from '@/components/people';
import { LandlordProfilePanel } from '@/components/contacts/landlord-profile-panel';
import { PartyDetails } from '@/components/contacts/profile/party-details';
import { PartyHeader } from '@/components/contacts/profile/party-header';
import type { PartyBodyProps } from '@/components/contacts/profile/party-profile';
import { profileDirection } from '@/lib/people/party-profile';
import { buildPartyStats } from '@/lib/people/party-stats';

/**
 * A landlord's page: the same header as every party, then the rent schedule panel, then the contact's data.
 * Whether the file sits under customers or vendors changes nothing here; the role tag decides.
 */
export function LandlordFrame({ contact, role, transactions, txLoading, txError, journalEntries, onEdit }: PartyBodyProps) {
  const failed = !!txError && transactions.length === 0;
  const stats = useMemo(() => (txLoading || failed ? null : buildPartyStats(transactions)), [transactions, txLoading, failed]);

  return (
    <>
      <PartyHeader
        contact={contact}
        role={role}
        direction={profileDirection(contact, stats)}
        landlord
        transactions={transactions}
        statementReady={!txLoading && !failed}
        onEdit={onEdit}
      />
      {!contact.is_active && (
        <Callout tone="warning">هذا الملف غير نشط. حركاته السابقة متاحة، ولا تُسجَّل حركة جديدة قبل إعادة تفعيله من «تعديل».</Callout>
      )}
      <LandlordProfilePanel contact={contact} transactions={transactions} journalEntries={journalEntries} txLoading={txLoading} onEdit={onEdit} />
      <PartyDetails contact={contact} onEdit={onEdit} />
    </>
  );
}
