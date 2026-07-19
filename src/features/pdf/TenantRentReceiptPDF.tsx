// @ts-nocheck
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar, arDateParts } from './arabicPDF';
import { PDF } from './pdfBase';
import { PdfMoneyText } from './pdfBrandKit';
import { formatPaymentMethodAr } from './pdf-payment';

const s = StyleSheet.create({
  payBox: {
    direction: 'rtl',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
    padding: 10,
    backgroundColor: PDF.rowAlt,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: PDF.border,
  },
  payCell: { width: '48%' },
  payLabel: { fontSize: 8, color: PDF.muted, marginBottom: 2, textAlign: 'right' },
  payValue: { fontSize: 10, color: PDF.text, fontWeight: 'bold', textAlign: 'right' },
  table: {
    direction: 'rtl',
    marginTop: 8,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    backgroundColor: PDF.primary,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  th: { flex: 1, fontSize: 8.5, color: PDF.white, fontWeight: 'bold', textAlign: 'center' },
  col: { flex: 1, fontSize: 9, color: PDF.text, textAlign: 'center' },
  total: {
    marginTop: 14,
    padding: 14,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 2,
    borderTopColor: PDF.primary,
    alignItems: 'center',
  },
});

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
};

export function TenantRentReceiptPDF({
  tenantName,
  shopNumber,
  paymentDate,
  months,
  totalAmount,
  paymentMethod,
  paymentSource,
  reference,
}: TenantRentReceiptPdfProps) {
  const dateParts = arDateParts(paymentDate);

  return (
    <ReportShell
      title="إيصال تحصيل إيجار"
      subtitle="مستند رسمي — تاج مول"
      summaryPrimaryDateIso={`${paymentDate}T12:00:00.000Z`}
      summaryPrimaryDateLabel="تاريخ التحصيل"
      metaCells={[
        { label: 'المستأجر', value: tenantName },
        { label: 'المحل', value: shopNumber ? `محل ${shopNumber}` : '—' },
        { label: 'نوع الدفع', value: paymentMethod ? ar(paymentMethod) : '—' },
        { label: 'المصرف / الخزينة', value: paymentSource ? ar(paymentSource) : '—' },
      ]}
    >
      <View style={s.payBox}>
        <View style={s.payCell}>
          <Text style={s.payLabel}>{ar('المرجع')}</Text>
          <Text style={s.payValue}>{reference ?? '—'}</Text>
        </View>
        <View style={s.payCell}>
          <Text style={s.payLabel}>{ar('عدد الأشهر')}</Text>
          <Text style={s.payValue}>{ar(String(months.length))}</Text>
        </View>
      </View>

      <View style={s.table}>
        <View style={s.head}>
          <Text style={s.th}>{ar('الشهر')}</Text>
          <Text style={s.th}>{ar('الحالة')}</Text>
          <Text style={s.th}>{ar('المبلغ')}</Text>
        </View>
        {months.map((line, i) => (
          <View key={i} style={s.row}>
            <Text style={s.col}>{ar(line.monthLabel)}</Text>
            <Text style={s.col}>{ar(line.statusLabel)}</Text>
            <View style={s.col}>
              <PdfMoneyText amount={line.amount} align="center" />
            </View>
          </View>
        ))}
      </View>

      <View style={s.total}>
        <Text style={{ fontSize: 9, color: PDF.muted }}>{ar('إجمالي التحصيل')}</Text>
        <PdfMoneyText amount={totalAmount} style={{ fontSize: 14, fontWeight: 'bold' }} />
        <Text style={{ fontSize: 8, color: PDF.muted, marginTop: 4 }}>
          {ar(`${dateParts.day} ${dateParts.monthName} ${dateParts.year}`)}
        </Text>
      </View>
    </ReportShell>
  );
}

export { formatPaymentMethodAr };
