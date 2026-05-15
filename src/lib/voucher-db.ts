import type { VoucherPdfModel } from '@/features/pdf/VoucherPDF';
import type {
  DisbursementVoucherWithLines,
  PaymentMethod,
} from '@/lib/db/types';

export function voucherUiMethodToPaymentMethod(
  m: VoucherPdfModel['method'],
): PaymentMethod {
  if (m === 'صك') return 'CHEQUE';
  if (m === 'حوالة') return 'TRANSFER';
  return 'CASH';
}

export function paymentMethodToUiMethod(p: PaymentMethod): VoucherPdfModel['method'] {
  if (p === 'CHEQUE') return 'صك';
  if (p === 'TRANSFER') return 'حوالة';
  return 'نقدي';
}

/** تحويل صف من قاعدة البيانات إلى نموذج PDF */
export function disbursementRowToPdfModel(
  row: DisbursementVoucherWithLines,
): VoucherPdfModel {
  const rawLines = row.disbursement_voucher_lines ?? [];
  const sorted = [...rawLines].sort((a, b) => a.sort_order - b.sort_order);
  const lines = sorted.map((l) => ({
    description: l.description,
    amount: Number(l.amount),
  }));
  const total = Number(row.total_amount);
  return {
    number: row.voucher_number,
    voucherDate: `${row.voucher_date}T12:00:00.000Z`,
    payee: row.payee,
    bank: row.bank_name ?? undefined,
    account: row.account_number ?? undefined,
    method: paymentMethodToUiMethod(row.method),
    lines: lines.length ? lines : [{ description: '—', amount: 0 }],
    total: Number.isFinite(total) ? total : 0,
    notes: row.notes ?? undefined,
  };
}
