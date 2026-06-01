import type { JournalEntryRow } from '@/lib/db/journal-queries';

export type JournalSourceMeta = {
  label: string;
  href: string | null;
  kind: 'transaction' | 'tenant_charge' | 'reversal' | 'manual' | 'auto';
};

export function getJournalSourceMeta(
  entry: Pick<JournalEntryRow, 'source_type' | 'source_id' | 'reversal_of_entry_id'>,
): JournalSourceMeta | null {
  if (entry.reversal_of_entry_id) {
    return {
      kind: 'reversal',
      label: 'قيد عكسي',
      href: `/journals?highlight=${entry.reversal_of_entry_id}`,
    };
  }

  if (!entry.source_type || !entry.source_id) {
    return { kind: 'manual', label: 'قيد يدوي', href: null };
  }

  switch (entry.source_type) {
    case 'TRANSACTION':
      return {
        kind: 'transaction',
        label: 'مُولَّد من معاملة',
        href: `/dashboard?tx=${entry.source_id}`,
      };
    case 'TENANT_CHARGE':
    case 'RENT_CHARGE':
      return {
        kind: 'tenant_charge',
        label: 'مُولَّد من مستحقات المستأجر',
        href: `/mall/charges`,
      };
    default:
      return {
        kind: 'auto',
        label: `آلي: ${entry.source_type}`,
        href: null,
      };
  }
}
