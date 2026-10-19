'use client';

import { PartyProfile, type PartyBodyProps } from '@/components/contacts/profile/party-profile';

/**
 * Page of a customer, a plain vendor, an employee or any other party that is not a tenant, a landlord or a
 * supplier of electricity, water, goods or services: header, figures and the four tabs.
 */
export function OtherContactDetailBody(props: PartyBodyProps) {
  return <PartyProfile {...props} />;
}
