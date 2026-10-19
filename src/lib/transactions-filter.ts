import { normalizeArabic } from '@/lib/arabic-search';
import { downloadCsv } from '@/lib/csv-export';
import type { TransactionWithRelations } from '@/lib/db/types';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'نقدي',
  CHEQUE: 'صك',
  TRANSFER: 'حوالة',
  CARD: 'بطاقة',
};

// Normalising every field of every row on each keystroke is what made typing lag on thousands of
// rows; rows keep their identity between renders (structural sharing), so the text is built once.
const haystacks = new WeakMap<TransactionWithRelations, string>();

function haystackOf(r: TransactionWithRelations): string {
  let h = haystacks.get(r);
  if (h === undefined) {
    h = [
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
    ]
      .map(normalizeArabic)
      .join(' \u0000 ');
    haystacks.set(r, h);
  }
  return h;
}

/** Search by number, reference, description, item, party, shop, cashbox, cheque or amount. */
export function transactionMatches(r: TransactionWithRelations, query: string): boolean {
  const q = normalizeArabic(query);
  if (!q) return true;
  const h = haystackOf(r);
  return q.split(' ').every((w) => h.includes(w));
}

export function filterTransactions(rows: TransactionWithRelations[], query: string) {
  const q = normalizeArabic(query);
  if (!q) return rows;
  const words = q.split(' ');
  return rows.filter((r) => {
    const h = haystackOf(r);
    return words.every((w) => h.includes(w));
  });
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
