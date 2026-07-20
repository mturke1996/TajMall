import type { ReceiptVoucherPdfModel } from '@/features/pdf/ReceiptVoucherPDF';
import type { ReceiptVoucherWithLines } from '@/lib/db/types';
import { paymentMethodToUiMethod } from '@/lib/voucher-db';

export function receiptRowToPdfModel(row: ReceiptVoucherWithLines): ReceiptVoucherPdfModel {
  const rawLines = row.receipt_voucher_lines ?? [];
  const sorted = [...rawLines].sort((a, b) => a.sort_order - b.sort_order);
  const lines = sorted.map((l) => ({
    description: l.description,
    amount: Number(l.amount),
  }));
  const total = Number(row.total_amount);
  return {
    number: row.receipt_number,
    receiptDate: `${row.receipt_date}T12:00:00.000Z`,
    payer: row.payer_name,
    bank: row.bank_name ?? undefined,
    account: row.account_number ?? undefined,
    method: paymentMethodToUiMethod(row.method),
    lines: lines.length ? lines : [{ description: '—', amount: 0 }],
    total: Number.isFinite(total) ? total : 0,
    notes: row.notes ?? undefined,
  };
}

export { voucherUiMethodToPaymentMethod as receiptUiMethodToPaymentMethod } from '@/lib/voucher-db';
