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
  heroValue: { direction: 'rtl', fontSize: 10, fontWeight: 'bold', color: PDF.text, textAlign: 'right', lineHeight: 1.35 },
  /** the account number is its own left-to-right run: inside one Arabic line its digit groups come out reversed */
  heroAccount: { fontSize: 9, color: PDF.muted, textAlign: 'right', direction: 'ltr', marginTop: 2 },
  notes: {
    direction: 'rtl',
    marginTop: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 3,
  },
  notesLabel: { fontSize: 8.5, color: PDF.muted, marginBottom: 4, textAlign: 'right' },
  /** react-pdf does not pass the box's direction down to its text: the text carries it (a trailing full stop and a leading digit stay on the right side) */
  notesText: { direction: 'rtl', fontSize: 10, color: PDF.text, lineHeight: 1.5, textAlign: 'right' },
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

/**
 * A payer's name longer than this is left out of the summary card at the top: it wrapped to six or seven lines there and made the
 * card a third of the page. The card below it ("الدافع") prints the full name.
 */
const SUMMARY_NAME_CHARS = 44;

/** notes longer than this may flow onto the next page; shorter ones stay with the total and the signatures */
const KEEP_NOTES_CHARS = 700;

/**
 * Page-break rules (the table itself is unchanged): the table is cut in two, everything above the last TAIL_ROWS lines and a
 * tail that holds those lines, the total, the notes and the signatures as one block, so the total and the signatures never stand
 * alone on a page. (A rule on the last row of a table inside its own frame cannot reach the block after the frame.) The frame is
 * open at the cut, so the two halves read as one table when they share a page; the gap under the table is the total bar's
 * margin-top, because react-pdf counts a bottom margin as room the block still needs.
 */
const TAIL_ROWS = 2;
const FRAME_OPEN_BOTTOM = {
  borderBottomWidth: 0,
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  marginBottom: 0,
};
const FRAME_OPEN_TOP = {
  borderTopWidth: 0,
  borderTopLeftRadius: 0,
  borderTopRightRadius: 0,
  marginBottom: 0,
};

export function ReceiptVoucherPDF({
  voucher,
  currency = 'د.ل',
}: {
  voucher: ReceiptVoucherPdfModel;
  currency?: string;
}) {
  const keepClosing = (voucher.notes ?? '').length <= KEEP_NOTES_CHARS;
  const rows = voucher.lines.map((l, i) => (
    <View
      key={i}
      style={[pdfReportTable.tableRow, i % 2 === 1 ? pdfReportTable.rowAlt : {}]}
      wrap={false}
    >
      <View style={[pdfReportTable.tdNum, { width: W.amount }]}>
        <PdfMoneyText amount={l.amount} align="center" adaptive adaptiveBase={9} />
      </View>
      <Text style={[pdfReportTable.tdAr, { width: W.desc }]}>{ar(l.description)}</Text>
    </View>
  ));
  const tailFrom = Math.max(0, rows.length - TAIL_ROWS);
  const head = (
    <View style={pdfReportTable.tableHead} wrap={false} {...(tailFrom > 0 ? { fixed: true } : {})}>
      <Text style={[pdfReportTable.th, { width: W.amount }]}>{ar('المبلغ')}</Text>
      <Text style={[pdfReportTable.thAr, { width: W.desc }]}>{ar('البيان')}</Text>
    </View>
  );
  const tailCard = (
    <View style={[pdfReportTable.tableWrap, tailFrom > 0 ? FRAME_OPEN_TOP : { marginBottom: 0 }]}>
      {tailFrom > 0 ? null : head}
      {rows.slice(tailFrom)}
    </View>
  );
  const totalBar = (
    <View style={[pdfReportTable.totalBar, { marginTop: 20 }]} wrap={false}>
      <PdfMoneyText
        amount={voucher.total}
        currency={currency}
        light
        align="left"
        adaptive
        adaptiveBase={11}
        style={{ fontSize: 14, fontWeight: 'bold', color: '#FBF8F1' }}
        // as in the voucher: the figure takes its own width, so the label keeps the right edge instead of running out of the bar
        containerStyle={{ width: 'auto', flexShrink: 0 }}
      />
      <Text style={pdfReportTable.totalLabel}>{ar('إجمالي المبلغ المستلم')}</Text>
    </View>
  );
  const notesBox = voucher.notes?.trim() ? (
    <View style={s.notes}>
      <Text style={s.notesLabel}>{ar('ملاحظات')}</Text>
      <Text style={s.notesText}>{ar(voucher.notes)}</Text>
    </View>
  ) : null;
  const signatures = (
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
  );
  return (
    <ReportShell
      title="إيصال قبض"
      titleEn="RECEIPT"
      subtitle={`رقم ${voucher.number}`}
      documentTitle={voucher.documentTitle}
      summaryPrimaryDateIso={voucher.receiptDate}
      summaryPrimaryDateLabel="تاريخ الإيصال"
      metaCells={[
        ...((voucher.payer ?? '').length <= SUMMARY_NAME_CHARS ? [{ label: 'استلمنا من', value: voucher.payer }] : []),
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
          <Text style={s.heroValue}>{voucher.bank ? ar(voucher.bank) : ar('—')}</Text>
          {voucher.bank && voucher.account?.trim() ? <Text style={s.heroAccount}>{voucher.account.trim()}</Text> : null}
        </View>
      </View>

      {/* the column head is the first thing inside the table, which cannot move it: this element carries the rule (head and first row start here, or the table starts on the next page) */}
      <View minPresenceAhead={80} />
      {tailFrom > 0 ? (
        <View style={[pdfReportTable.tableWrap, FRAME_OPEN_BOTTOM]}>
          {head}
          {rows.slice(0, tailFrom)}
        </View>
      ) : null}
      {keepClosing ? (
        <View wrap={false}>
          {tailCard}
          {totalBar}
          {notesBox}
          {signatures}
          <PdfReportCaption />
        </View>
      ) : (
        <>
          <View wrap={false}>
            {tailCard}
            {totalBar}
          </View>
          <View>
            {notesBox}
            {signatures}
            <PdfReportCaption />
          </View>
        </>
      )}
    </ReportShell>
  );
}
