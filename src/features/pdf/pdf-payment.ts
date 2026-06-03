import type { TransactionWithRelations } from '@/lib/db/types';

const METHOD_AR: Record<string, string> = {
  CASH: 'نقدي',
  CHEQUE: 'صك',
  TRANSFER: 'حوالة مصرفية',
  CARD: 'بطاقة',
};

/** نوع الدفع + المصرف/الخزينة للعرض في PDF */
export function formatPaymentMethodAr(method: string | undefined): string {
  return METHOD_AR[method ?? ''] ?? method ?? '—';
}

export function formatPaymentBankOrSource(tx: TransactionWithRelations): string {
  const method = tx.method;
  const cashbox = tx.cashbox as
    | { name_ar?: string; kind?: string; bank_name?: string | null }
    | null
    | undefined;

  if (method === 'CASH') {
    return cashbox?.name_ar ? `نقدي — ${cashbox.name_ar}` : 'نقدي';
  }

  if (method === 'TRANSFER') {
    const bank =
      cashbox?.bank_name?.trim() ||
      (cashbox?.kind === 'BANK' ? cashbox?.name_ar : null);
    return bank ? `حوالة — ${bank}` : cashbox?.name_ar ?? 'حوالة مصرفية';
  }

  if (method === 'CHEQUE') {
    const bank = tx.cheque_bank?.trim();
    return bank ? `صك — ${bank}` : 'صك';
  }

  if (method === 'CARD') {
    return cashbox?.bank_name
      ? `بطاقة — ${cashbox.bank_name}`
      : cashbox?.name_ar ?? 'بطاقة';
  }

  return cashbox?.name_ar ?? '—';
}
