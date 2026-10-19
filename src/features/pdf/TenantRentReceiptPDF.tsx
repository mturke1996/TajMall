// @ts-nocheck
import React from 'react';
import { PaymentReceiptPDF } from './PaymentReceiptPDF';
import { formatPaymentMethodAr } from './pdf-payment';
import { rentReceiptFromHistory } from '@/lib/payment-receipt';

export type RentReceiptMonthLine = {
  monthLabel: string;
  amount: number;
  statusLabel: string;
};

export type TenantRentReceiptPdfProps = {
  tenantName: string;
  shopNumber: string | null;
  paymentDate: string;
  months: RentReceiptMonthLine[];
  totalAmount: number;
  paymentMethod?: string;
  paymentSource?: string;
  reference?: string;
  /** «إيص-1042»: بدونه يُطبع الإيصال بلا رقم (دفعات قديمة لا يصلها رقم المعاملة) */
  receiptNumber?: string | null;
};

/**
 * Receipt of a payment already in the tenant's history, in the same layout as the one printed at the
 * counter. The history knows the months a payment was linked to but not what was left on each, so this
 * one has no balance; the receipt printed right after payment (PaymentReceiptPDF) has it.
 */
export function TenantRentReceiptPDF(props: TenantRentReceiptPdfProps) {
  return <PaymentReceiptPDF receipt={rentReceiptFromHistory(props)} />;
}

export { formatPaymentMethodAr };
