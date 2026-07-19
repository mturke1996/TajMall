// @ts-nocheck
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { pdfFormatAmountRaw, PdfMoneyText } from './pdfMoney';

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
  /** صف البطاقة العلوية: row-reverse + ltr يثبت الترتيب البصري يمين ← يسار في Yoga */
  hero: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    backgroundColor: PDF.logoGreenSoft,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRightWidth: 3,
    borderRightColor: PDF.logoGreen,
    borderRadius: 2,
    padding: 14,
    marginBottom: 18,
  },
  heroCell: { width: '31%', direction: 'rtl' },
  heroLabel: { fontSize: 8.5, color: PDF.muted, marginBottom: 4, textAlign: 'right' },
  heroValue: { fontSize: 11, fontWeight: 'bold', color: PDF.text, textAlign: 'right' },

  th_desc: { flex: 1, textAlign: 'right' },
  th_amount: { width: 110, textAlign: 'center' },

  /** رأس وجسم جدول البيان — نفس نمط pdfBase: ltr + row-reverse لوضع البيان يميناً والمبلغ يساراً */
  tableHeadRtl: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    backgroundColor: PDF.headerBg,
    paddingVertical: 8,
    paddingHorizontal: 9,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
  },
  tableRowRtl: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
    alignItems: 'center',
  },

  /**
   * شريط الإجمالي: يساراً الرقم ثم العملة؛ يميناً عنوان الإذن.
   */
  totalBox: {
    direction: 'ltr',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    width: '100%',
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: PDF.primary,
    borderRadius: 2,
  },
  totalLeftCluster: {
    direction: 'ltr',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    flexShrink: 0,
  },
  totalCurr: {
    fontSize: 12,
    color: '#FBF8F1',
    fontWeight: 'bold',
    opacity: 0.95,
    textAlign: 'left',
  },
  totalNum: {
    fontSize: 15,
    color: '#FBF8F1',
    fontWeight: 'bold',
    textAlign: 'left',
  },
  totalLabel: {
    fontSize: 12,
    color: '#FBF8F1',
    fontWeight: 'bold',
    textAlign: 'right',
        flexShrink: 1,
    maxWidth: '58%',
    paddingLeft: 12,
  },

  notes: {
    direction: 'rtl',
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 2,
  },
  notesLabel: { fontSize: 8.5, color: PDF.muted, marginBottom: 4, textAlign: 'right' },
  notesText: { fontSize: 10, color: PDF.text, lineHeight: 1.5, textAlign: 'right' },

  signRow: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 32,
  },
  signBox: { alignItems: 'center', width: '30%', direction: 'rtl' },
  signLabel: { fontSize: 9, color: PDF.muted, marginBottom: 30, textAlign: 'center' },
  signLine: { borderTopWidth: 1, borderTopColor: PDF.text, width: '100%', paddingTop: 4 },
  signName: { fontSize: 9, color: PDF.text, textAlign: 'center' },

  /** عمود المبلغ: رقم فقط؛ العرض يُضبط عبر th_amount (110) مثل الرأس */
  tdAmountNum: {
    fontSize: 9,
    color: PDF.text,
    fontWeight: 'bold',
    textAlign: 'center',
  },

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
      summaryPrimaryDateIso={voucher.voucherDate}
      summaryPrimaryDateLabel="تاريخ الإذن"
      metaCells={[
        { label: 'المستفيد', value: voucher.payee },
        { label: 'نوع السداد', value: voucher.method },
      ]}
    >
      {/* Hero — ترتيب JSX: يصرف إلى ثم السداد ثم المصرف؛ row-reverse يضع يصرف إلى يمين الورقة */}
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

      {/* جدول البنود (البيان + المبلغ) — الإجمالي منفصل أسفله */}
      <View style={s.tableHeadRtl}>
        <Text style={[pdfBase.th, s.th_desc]}>{ar('البيـان')}</Text>
        <Text style={[pdfBase.th, s.th_amount, { textAlign: 'center' }]}>{ar('المبلغ')}</Text>
      </View>
      {voucher.lines.map((l, i) => (
        <View key={i} style={[s.tableRowRtl, i % 2 !== 0 && pdfBase.rowEven]}>
          <Text style={[pdfBase.td, s.th_desc]}>{ar(l.description)}</Text>
          <View style={[pdfBase.td, s.th_amount]}>
            <PdfMoneyText amount={l.amount} style={s.tdAmountNum} align="center" />
          </View>
        </View>
      ))}

      {/* إجمالي الإذن — مبلغ واحد معزول: الرقم ثم العملة */}
      <View style={s.totalBox} wrap={false}>
        <PdfMoneyText
          amount={voucher.total}
          currency={currency}
          light
          align="left"
          style={s.totalNum}
          currStyle={s.totalCurr}
          containerStyle={{ width: 'auto', flexShrink: 0 }}
        />
        <Text style={s.totalLabel}>{ar('إجمالي مبلغ الإذن')}</Text>
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
