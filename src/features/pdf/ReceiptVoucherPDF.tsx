// @ts-nocheck
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PdfMoneyText } from './pdfMoney';
import { pdfReportTable, PdfReportCaption } from './pdfReportTable';

export type ReceiptVoucherLinePdf = { description: string; amount: number };

export type ReceiptVoucherPdfModel = {
  number: string;
  receiptDate: string;
  payer: string;
  bank?: string;
  account?: string;
  method: 'نقدي' | 'صك' | 'حوالة';
  lines: ReceiptVoucherLinePdf[];
  total: number;
  notes?: string;
  documentTitle?: string;
};

const W = { amount: '22%', desc: '78%' };

const s = StyleSheet.create({
  hero: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: PDF.logoGreenSoft,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRightWidth: 3,
    borderRightColor: PDF.logoGreen,
    borderRadius: 3,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  heroCell: { direction: 'rtl', flex: 1, minWidth: 0 },
  heroLabel: { fontSize: 7.5, color: PDF.muted, fontWeight: 'bold', marginBottom: 4, textAlign: 'right' },
  heroValue: { fontSize: 10, fontWeight: 'bold', color: PDF.text, textAlign: 'right', lineHeight: 1.35 },
  notes: {
    direction: 'rtl',
    marginTop: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 3,
  },
  notesLabel: { fontSize: 8.5, color: PDF.muted, marginBottom: 4, textAlign: 'right' },
  notesText: { fontSize: 10, color: PDF.text, lineHeight: 1.5, textAlign: 'right' },
  signRow: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginTop: 28,
  },
  signBox: { alignItems: 'center', width: '30%', direction: 'rtl' },
  signLabel: { fontSize: 9, color: PDF.muted, marginBottom: 28, textAlign: 'center' },
  signLine: { borderTopWidth: 1, borderTopColor: PDF.text, width: '100%', paddingTop: 4 },
});

export function ReceiptVoucherPDF({
  voucher,
  currency = 'د.ل',
}: {
  voucher: ReceiptVoucherPdfModel;
  currency?: string;
}) {
  return (
    <ReportShell
      title="إيصال قبض"
      subtitle={`رقم ${voucher.number}`}
      documentTitle={voucher.documentTitle}
      summaryPrimaryDateIso={voucher.receiptDate}
      summaryPrimaryDateLabel="تاريخ الإيصال"
      metaCells={[
        { label: 'استلمنا من', value: voucher.payer },
        { label: 'نوع التحصيل', value: voucher.method },
      ]}
    >
      <View style={s.hero} wrap={false}>
        <View style={s.heroCell}>
          <Text style={s.heroLabel}>{ar('الدافع')}</Text>
          <Text style={s.heroValue}>{ar(voucher.payer)}</Text>
        </View>
        <View style={s.heroCell}>
          <Text style={s.heroLabel}>{ar('طريقة التحصيل')}</Text>
          <Text style={s.heroValue}>{ar(voucher.method)}</Text>
        </View>
        <View style={s.heroCell}>
          <Text style={s.heroLabel}>{ar('المصرف / الحساب')}</Text>
          <Text style={s.heroValue}>
            {voucher.bank ? ar(`${voucher.bank} · ${voucher.account ?? ''}`) : ar('—')}
          </Text>
        </View>
      </View>

      <View style={pdfReportTable.tableWrap}>
        <View style={pdfReportTable.tableHead} wrap={false}>
          <Text style={[pdfReportTable.th, { width: W.amount }]}>{ar('المبلغ')}</Text>
          <Text style={[pdfReportTable.thAr, { width: W.desc }]}>{ar('البيان')}</Text>
        </View>
        {voucher.lines.map((l, i) => (
          <View
            key={i}
            style={[pdfReportTable.tableRow, i % 2 === 1 ? pdfReportTable.rowAlt : {}]}
          >
            <View style={[pdfReportTable.tdNum, { width: W.amount }]}>
              <PdfMoneyText amount={l.amount} align="center" adaptive adaptiveBase={9} />
            </View>
            <Text style={[pdfReportTable.tdAr, { width: W.desc }]}>{ar(l.description)}</Text>
          </View>
        ))}
      </View>

      <View style={pdfReportTable.totalBar} wrap={false}>
        <PdfMoneyText
          amount={voucher.total}
          currency={currency}
          align="left"
          adaptive
          adaptiveBase={11}
          style={{ fontSize: 14, fontWeight: 'bold', color: '#FBF8F1' }}
        />
        <Text style={pdfReportTable.totalLabel}>{ar('إجمالي المبلغ المستلم')}</Text>
      </View>

      {voucher.notes?.trim() ? (
        <View style={s.notes}>
          <Text style={s.notesLabel}>{ar('ملاحظات')}</Text>
          <Text style={s.notesText}>{ar(voucher.notes)}</Text>
        </View>
      ) : null}

      <View style={s.signRow} wrap={false}>
        <View style={s.signBox}>
          <Text style={s.signLabel}>{ar('توقيع المستلم')}</Text>
          <View style={s.signLine} />
        </View>
        <View style={s.signBox}>
          <Text style={s.signLabel}>{ar('توقيع أمين الصندوق')}</Text>
          <View style={s.signLine} />
        </View>
        <View style={s.signBox}>
          <Text style={s.signLabel}>{ar('توقيع الدافع')}</Text>
          <View style={s.signLine} />
        </View>
      </View>

      <PdfReportCaption />
    </ReportShell>
  );
}
