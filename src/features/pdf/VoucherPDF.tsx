// @ts-nocheck
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar, arMoney, arDateMedium } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';

export type VoucherLinePdf = { description: string; amount: number };

export type VoucherPdfModel = {
  number: string;
  voucherDate: string;
  payee: string;
  bank?: string;
  account?: string;
  method: 'نقدي' | 'صك' | 'حوالة';
  lines: VoucherLinePdf[];
  total: number;
  notes?: string;
};

const s = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: PDF.logoGreenSoft,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRightWidth: 3,
    borderRightColor: PDF.logoGreen,
    borderRadius: 2,
    padding: 14,
    marginBottom: 18,
  },
  heroCell: { width: '32%' },
  heroLabel: { fontSize: 8.5, color: PDF.muted, marginBottom: 4 },
  heroValue: { fontSize: 11, fontWeight: 'bold', color: PDF.text },

  th_desc: { flex: 1, textAlign: 'right' },
  th_amount: { width: 110, textAlign: 'center' },

  totalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: PDF.primary,
    borderRadius: 2,
  },
  totalLabel: { fontSize: 11, color: '#FBF8F1', fontWeight: 'bold' },
  totalValue: { fontSize: 13, color: '#FBF8F1', fontWeight: 'bold' },

  notes: {
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 2,
  },
  notesLabel: { fontSize: 8.5, color: PDF.muted, marginBottom: 4 },
  notesText: { fontSize: 10, color: PDF.text, lineHeight: 1.5 },

  signRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 32,
  },
  signBox: { alignItems: 'center', width: '30%' },
  signLabel: { fontSize: 9, color: PDF.muted, marginBottom: 30 },
  signLine: { borderTopWidth: 1, borderTopColor: PDF.text, width: '100%', paddingTop: 4 },
  signName: { fontSize: 9, color: PDF.text },
});

export function VoucherPDF({
  voucher,
  currency = 'د.ل',
}: {
  voucher: VoucherPdfModel;
  currency?: string;
}) {
  return (
    <ReportShell
      title="إذن صرف"
      subtitle={`رقم ${voucher.number}`}
      metaCells={[
        { label: 'رقم الإذن', value: voucher.number },
        { label: 'التاريخ', value: arDateMedium(voucher.voucherDate) },
      ]}
    >
      {/* Hero */}
      <View style={s.hero} wrap={false}>
        <View style={s.heroCell}>
          <Text style={s.heroLabel}>{ar('يصرف إلى')}</Text>
          <Text style={s.heroValue}>{ar(voucher.payee)}</Text>
        </View>
        <View style={s.heroCell}>
          <Text style={s.heroLabel}>{ar('نوع السداد')}</Text>
          <Text style={s.heroValue}>{ar(voucher.method)}</Text>
        </View>
        <View style={s.heroCell}>
          <Text style={s.heroLabel}>{ar('المصرف / الحساب')}</Text>
          <Text style={s.heroValue}>
            {voucher.bank ? ar(`${voucher.bank} · ${voucher.account ?? ''}`) : ar('—')}
          </Text>
        </View>
      </View>

      {/* Lines */}
      <View style={pdfBase.tableHead}>
        <Text style={[pdfBase.th, s.th_amount, { textAlign: 'center' }]}>{ar('القيمة')}</Text>
        <Text style={[pdfBase.th, s.th_desc]}>{ar('البيـان')}</Text>
      </View>
      {voucher.lines.map((l, i) => (
        <View key={i} style={[pdfBase.tableRow, i % 2 !== 0 && pdfBase.rowEven]}>
          <Text style={[pdfBase.td, s.th_amount]}>{arMoney(l.amount, currency)}</Text>
          <Text style={[pdfBase.td, s.th_desc]}>{ar(l.description)}</Text>
        </View>
      ))}

      {/* Total */}
      <View style={s.totalBox}>
        <Text style={s.totalLabel}>{ar('الإجمالي المستحق')}</Text>
        <Text style={s.totalValue}>{arMoney(voucher.total, currency)}</Text>
      </View>

      {/* Notes */}
      {voucher.notes ? (
        <View style={s.notes}>
          <Text style={s.notesLabel}>{ar('ملاحظات')}</Text>
          <Text style={s.notesText}>{ar(voucher.notes)}</Text>
        </View>
      ) : null}

      {/* Signatures */}
      <View style={s.signRow} wrap={false}>
        <View style={s.signBox}>
          <Text style={s.signLabel}>{ar('المستلم')}</Text>
          <View style={s.signLine}>
            <Text style={s.signName}>{ar('الاسم والتوقيع')}</Text>
          </View>
        </View>
        <View style={s.signBox}>
          <Text style={s.signLabel}>{ar('المراجع')}</Text>
          <View style={s.signLine}>
            <Text style={s.signName}>{ar('الاسم والتوقيع')}</Text>
          </View>
        </View>
        <View style={s.signBox}>
          <Text style={s.signLabel}>{ar('المدير المالي')}</Text>
          <View style={s.signLine}>
            <Text style={s.signName}>{ar('الاسم والتوقيع')}</Text>
          </View>
        </View>
      </View>
    </ReportShell>
  );
}
