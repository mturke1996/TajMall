'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Callout } from '@/components/people';
import { useReturnFocus } from '@/components/contacts/profile/use-return-focus';
import { LANDLORD_SUGGESTION_ACTION, suggestLandlord, type LandlordEvidenceTx } from '@/lib/contacts/contact-tags';
import { formatContactSaveError } from '@/lib/contacts/form-utils';
import { approveLandlordPatch } from '@/lib/people/party-profile';
import { useUpdateContact } from '@/lib/db/queries';
import type { ContactRow } from '@/lib/db/types';
import { arabicCount, formatDate, formatMoney } from '@/lib/utils';

const dismissKey = (id: string) => `contact-landlord-suggestion:${id}`;

function wasDismissed(id: string): boolean {
  try {
    return window.sessionStorage.getItem(dismissKey(id)) === '1';
  } catch {
    return false;
  }
}

/**
 * «Is this a landlord?» for a customer or vendor that was paid rent and never paid anything. Shows nothing for
 * a contact that is a landlord already, has revenue, or has no rent payments. The offer asks before it writes,
 * and «ليس الآن» hides it for the rest of the session. Only people who may edit contacts see it.
 */
export function LandlordSuggestion({
  contact,
  transactions,
  canEdit,
}: {
  contact: ContactRow;
  transactions: readonly LandlordEvidenceTx[];
  canEdit: boolean;
}) {
  const update = useUpdateContact();
  const [dismissed, setDismissed] = useState(() => wasDismissed(contact.id));
  const [confirming, setConfirming] = useState(false);
  useReturnFocus(confirming);
  const s = useMemo(() => suggestLandlord(transactions, contact), [transactions, contact]);

  if (!canEdit || dismissed || !s.suggest) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(dismissKey(contact.id), '1');
    } catch {
      // private window: it simply comes back next visit
    }
  }

  async function approve() {
    try {
      await update.mutateAsync({ id: contact.id, ...approveLandlordPatch(contact) });
      toast.success('اعتُمدت الجهة مؤجراً للمول');
    } catch (err) {
      console.error('[contacts] landlord approval failed', err);
      toast.error(formatContactSaveError(err));
      throw err; // the dialog stays open for another try
    }
  }

  return (
    <>
      <Callout
        tone="info"
        title={`سُجّلت لهذه الجهة ${arabicCount(s.rentPayments, ['دفعة إيجار واحدة', 'دفعتا إيجار', 'دفعات إيجار', 'دفعة إيجار'])}. هل هي مؤجر للمول؟`}
        action={
          <>
            <Button type="button" onClick={() => setConfirming(true)}>
              {LANDLORD_SUGGESTION_ACTION}
            </Button>
            <Button type="button" variant="ghost" onClick={dismiss}>
              ليس الآن
            </Button>
          </>
        }
      >
        لم يُسجَّل لها أي مقبوض.
      </Callout>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        tone="default"
        title="اعتماد الجهة مؤجراً للمول"
        description="يظهر لها جدول الإيجار الشهري وأشهره المسدّدة. حركاتها وقيودها لا تتغير، وتبقى في قائمتها."
        details={[
          { label: 'الجهة', value: contact.name },
          { label: 'دفعات الإيجار', value: <span className="tabular-nums">{s.rentPayments}</span> },
          { label: 'إجماليها', value: <span className="tabular-nums">{formatMoney(s.rentTotal, 'LYD')}</span> },
          ...(s.lastPaidOn ? [{ label: 'آخر دفعة', value: <span className="tabular-nums">{formatDate(s.lastPaidOn)}</span> }] : []),
        ]}
        confirmLabel={LANDLORD_SUGGESTION_ACTION}
        onConfirm={approve}
      />
    </>
  );
}
