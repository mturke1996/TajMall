'use client';

import { ExternalLink, TriangleAlert } from 'lucide-react';
import { extractContactBusinessRole } from '@/lib/contacts/contact-roles';
import type { ContactMatch, MatchReason, MatchableContact } from '@/lib/contacts/duplicates';
import { kindOrRoleLabel } from '@/lib/contacts/form-rules';

const REASON_TEXT: Record<MatchReason, string> = {
  phone: 'نفس الهاتف',
  same_name: 'نفس الاسم',
  similar_name: 'اسم مشابه',
};

/**
 * Who already has this name or this phone, with a way to open them. It warns and never blocks: two people can
 * share a name, and the person typing knows better. The file opens in a new tab so what was typed stays here.
 */
export function DuplicateWarning({ matches }: { matches: ContactMatch<MatchableContact>[] }) {
  if (matches.length === 0) return null;
  return (
    <div role="status" className="rounded-xl border border-warning-line bg-warning-soft p-3.5 text-warning-ink">
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
        قد تكون هذه الجهة مسجّلة من قبل
      </p>
      <ul className="mt-2 divide-y divide-warning-line">
        {matches.map(({ contact, reasons }) => (
          <li key={contact.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-medium text-foreground">{contact.name}</p>
              <p className="truncate text-[12.5px] text-ink-soft">
                {[...reasons.map((r) => REASON_TEXT[r]), kindOrRoleLabel(contact, extractContactBusinessRole(contact)), contact.is_active ? null : 'غير نشط']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <a
              href={`/contacts/${contact.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-8"
            >
              فتح الملف
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">(في صفحة جديدة)</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
