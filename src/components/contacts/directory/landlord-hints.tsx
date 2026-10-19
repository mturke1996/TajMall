'use client';

import { Loader2 } from 'lucide-react';
import { Callout } from '@/components/people';
import { Button } from '@/components/ui/button';
import type { DirectoryRow } from '@/lib/contacts/directory';

function titleFor(n: number): string {
  if (n === 1) return 'ملف واحد يُدفع له إيجار';
  if (n === 2) return 'ملفان يُدفع لهما إيجار';
  return `${n} ${n <= 10 ? 'ملفات' : 'ملفاً'} يُدفع لها إيجار`;
}

/**
 * Files that were paid rent and never received money, but are not marked as landlords. Marking them moves
 * them to «مؤجرون». Only people who may edit see the button; anyone can dismiss the note for themselves.
 */
export function LandlordHints({
  hints,
  canWrite,
  approving,
  onApprove,
  onDismiss,
}: {
  hints: readonly DirectoryRow[];
  canWrite: boolean;
  approving: boolean;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  if (hints.length === 0) return null;
  const names = hints.length <= 3 ? hints.map((r) => r.contact.name).join('، ') : `${hints.slice(0, 3).map((r) => r.contact.name).join('، ')} وغيرهم`;
  return (
    <Callout
      tone="info"
      title={titleFor(hints.length)}
      action={
        <>
          {canWrite && (
            <Button type="button" size="sm" className="h-11 sm:h-9" onClick={onApprove} disabled={approving}>
              {approving && <Loader2 className="animate-spin" aria-hidden />}
              اعتماد كمؤجرين
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" className="h-11 sm:h-9" onClick={onDismiss} disabled={approving}>
            تجاهل
          </Button>
        </>
      }
    >
      <p>{names}</p>
      <p className="text-[12.5px] opacity-90">المدفوع لهم إيجارات فقط، ولا مقبوضات منهم في آخر 12 شهراً.</p>
    </Callout>
  );
}
