// @ts-nocheck
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PdfMoneyText, pdfFmtNum } from './pdfBrandKit';

const col = StyleSheet.create({
  row: {
    direction: 'rtl',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
  },
  rowAlt: { backgroundColor: PDF.rowAlt },
  head: {
    direction: 'rtl',
    flexDirection: 'row',
    backgroundColor: PDF.headerBg,
    paddingVertical: 7,
    paddingHorizontal: 6,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
  },
  th: { color: PDF.white, fontSize: 8.5, fontWeight: 'bold' },
  td: { fontSize: 8.5, color: PDF.text },
  tdMuted: { fontSize: 8, color: PDF.muted },
  date: { width: '14%', textAlign: 'right', paddingRight: 4 },
  number: { width: '12%', textAlign: 'center' },
  ref: { width: '14%', textAlign: 'center' },
  desc: { flex: 1, textAlign: 'right', paddingRight: 4 },
  debit: { width: '15%', textAlign: 'center' },
  credit: { width: '15%', textAlign: 'center' },
  balance: { width: '15%', textAlign: 'center' },
  summaryRow: {
    direction: 'rtl',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
  },
  foot: {
    direction: 'rtl',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'baseline',
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 1.5,
    borderTopColor: PDF.primary,
  },
});

export type LedgerReportPdfProps = {
  category: { name_ar: string; code: string; type: string };
  startDate?: string;
  endDate?: string;
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  lines: Array<{
    entry_date: string;
    journal_number: number;
    journal_reference: string | null;
    description: string | null;
    debit: number;
    credit: number;
    runningBalance: number;
  }>;
};

export function LedgerReportPDF({
  category,
  startDate,
  endDate,
  openingBalance,
  closingBalance,
  totalDebit,
  totalCredit,
  lines,
}: LedgerReportPdfProps) {
  const periodLabel =
    startDate || endDate
      ? `${startDate ?? '…'} ← ${endDate ?? '…'}`
      : 'كل الفترات';

  return (
    <ReportShell
      title={`دفتر الأستاذ — ${category.name_ar}`}
      subtitle={`كشف حساب تفصيلي للبند ${category.code}`}
      metaCells={[
        { label: 'البند', value: `${category.code} · ${category.name_ar}` },
        { label: 'الفترة', value: periodLabel },
        { label: 'عدد الحركات', value: pdfFmtNum(lines.length) },
      ]}
    >
      <Text style={pdfBase.sectionTitle}>{ar('حركات البند والرصيد التراكمي')}</Text>

      <View style={col.summaryRow} wrap={false}>
        <Text style={[col.td, col.balance, { fontWeight: 'bold' }]}>
          {ar('الرصيد الافتتاحي: ')}
        </Text>
        <View style={[col.balance, { flex: 1 }]}>
          <PdfMoneyText amount={openingBalance} />
        </View>
      </View>

      <View style={col.head} wrap={false}>
        <Text style={[col.th, col.balance]}>{ar('الرصيد')}</Text>
        <Text style={[col.th, col.credit]}>{ar('دائن')}</Text>
        <Text style={[col.th, col.debit]}>{ar('مدين')}</Text>
        <Text style={[col.th, col.desc]}>{ar('البيان')}</Text>
        <Text style={[col.th, col.ref]}>{ar('المرجع')}</Text>
        <Text style={[col.th, col.number]}>{ar('رقم القيد')}</Text>
        <Text style={[col.th, col.date]}>{ar('التاريخ')}</Text>
      </View>

      {lines.length === 0 ? (
        <Text style={[pdfBase.caption, { paddingVertical: 12 }]}>{ar('لا توجد حركات مرحّلة ضمن الفترة المحددة.')}</Text>
      ) : (
        lines.map((l, i) => (
          <View key={i} style={[col.row, i % 2 === 1 ? col.rowAlt : {}]} wrap={false}>
            <View style={col.balance}>
              <PdfMoneyText amount={Number(l.runningBalance)} />
            </View>
            <View style={col.credit}>
              {l.credit > 0 ? <PdfMoneyText amount={Number(l.credit)} /> : <Text style={col.td}>—</Text>}
            </View>
            <View style={col.debit}>
              {l.debit > 0 ? <PdfMoneyText amount={Number(l.debit)} /> : <Text style={col.td}>—</Text>}
            </View>
            <Text style={[col.td, col.desc]}>{ar(l.description ?? '—')}</Text>
            <Text style={[col.tdMuted, col.ref]}>{l.journal_reference ?? '—'}</Text>
            <Text style={[col.tdMuted, col.number]}>{l.journal_number}</Text>
            <Text style={[col.tdMuted, col.date]}>{l.entry_date}</Text>
          </View>
        ))
      )}

      <View style={col.foot} wrap={false}>
        <Text style={[pdfBase.footLabel, { flex: 1, textAlign: 'right' }]}>
          {ar('الإجمالي — مدين: ')}
        </Text>
        <View style={col.debit}>
          <PdfMoneyText amount={totalDebit} style={{ fontSize: 10, fontWeight: 'bold' }} />
        </View>
        <Text style={[pdfBase.footLabel, { width: '12%', textAlign: 'center' }]}>
          {ar('دائن: ')}
        </Text>
        <View style={col.credit}>
          <PdfMoneyText amount={totalCredit} style={{ fontSize: 10, fontWeight: 'bold' }} />
        </View>
        <Text style={[pdfBase.footLabel, { width: '14%', textAlign: 'center' }]}>
          {ar('الختامي: ')}
        </Text>
        <View style={col.balance}>
          <PdfMoneyText amount={closingBalance} style={{ fontSize: 10, fontWeight: 'bold', color: PDF.primary }} />
        </View>
      </View>

      <Text style={pdfBase.caption}>{ar('وثيقة محاسبية مُولَّدة آلياً من منظومة تاج مول')}</Text>
    </ReportShell>
  );
}
