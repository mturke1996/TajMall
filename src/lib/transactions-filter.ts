import { matchesSearch } from '@/lib/arabic-search';
import { downloadCsv } from '@/lib/csv-export';
import type { TransactionWithRelations } from '@/lib/db/types';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'نقدي',
  CHEQUE: 'صك',
  TRANSFER: 'حوالة',
  CARD: 'بطاقة',
};

/** Search by number, reference, description, item, party, shop, cashbox, cheque or amount. */
export function transactionMatches(r: TransactionWithRelations, query: string): boolean {
  return matchesSearch(query, [
    r.number,
    `#${r.number}`,
    r.reference,
    r.description,
    r.category?.name_ar,
    r.category?.code,
    r.contact?.name,
    r.contact?.shop_number,
    r.cashbox?.name_ar,
    r.cheque_number,
    r.amount,
  ]);
}

export function filterTransactions(rows: TransactionWithRelations[], query: string) {
  if (!query.trim()) return rows;
  return rows.filter((r) => transactionMatches(r, query));
}

/** Exports exactly the rows the user is looking at (after tabs, dates and search). */
export function exportTransactionsCsv(rows: TransactionWithRelations[], fileName: string) {
  downloadCsv(
    fileName,
    ['رقم', 'التاريخ', 'النوع', 'البند', 'البيان', 'الجهة', 'رقم المحل', 'الخزينة', 'الطريقة', 'رقم الصك', 'المبلغ'],
    rows.map((r) => [
      r.number,
      r.tx_date?.slice(0, 10),
      r.kind === 'REVENUE' ? 'إيراد' : r.kind === 'EXPENSE' ? 'مصروف' : r.kind,
      r.category?.name_ar ?? '',
      r.description ?? '',
      r.contact?.name ?? '',
      r.contact?.shop_number ?? '',
      r.cashbox?.name_ar ?? '',
      METHOD_LABEL[r.method] ?? r.method,
      r.cheque_number ?? '',
      Number(r.amount),
    ]),
  );
}
