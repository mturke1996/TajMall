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
        label: 'من معاملة',
        href: `/transactions?highlight=${entry.source_id}`,
      };
    case 'TENANT_CHARGE':
    case 'RENT_CHARGE':
    case 'CHARGE':
      return { kind: 'tenant_charge', label: 'استحقاق مطالبة مستأجر', href: '/mall?tab=charges' };
    case 'VOUCHER':
      return { kind: 'auto', label: 'من إذن صرف', href: `/vouchers?highlight=${entry.source_id}` };
    case 'CASH_TRANSFER':
      return { kind: 'auto', label: 'تحويل بين الخزائن', href: '/cashboxes' };
    case 'PAYROLL_RUN':
      return { kind: 'auto', label: 'كشف رواتب', href: '/payroll' };
    case 'YEAR_CLOSE':
      return { kind: 'auto', label: 'إقفال سنة مالية', href: '/reports/periods' };
    case 'ADJUSTMENT':
      return { kind: 'auto', label: 'تسوية جرد', href: '/settings/cashbox-count' };
    case 'OPENING':
      return { kind: 'auto', label: 'رصيد افتتاحي', href: null };
    default:
      return { kind: 'auto', label: 'قيد آلي', href: null };
  }
}

/**
 * A journal posted by the system for a document (a transaction, voucher, transfer, payroll run…) is
 * cancelled from that document; reversing the entry alone would leave the document live with no entry.
 */
export function isSourceLinkedJournal(entry: Pick<JournalEntryRow, 'source_type' | 'source_id' | 'reversal_of_entry_id'>) {
  return Boolean(entry.source_type && entry.source_id && !entry.reversal_of_entry_id);
}
