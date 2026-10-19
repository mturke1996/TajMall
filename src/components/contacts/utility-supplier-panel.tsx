'use client';

import { PartyProfile, type PartyBodyProps } from '@/components/contacts/profile/party-profile';

/**
 * Page of a supplier (electricity, water, goods, services): the same frame as every party, with the supply
 * facts (what is supplied, meter or contract number, classification) in the overview.
 */
export function UtilitySupplierPanel(props: PartyBodyProps) {
  return <PartyProfile {...props} supply />;
}
