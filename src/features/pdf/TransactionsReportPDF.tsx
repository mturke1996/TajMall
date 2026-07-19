// @ts-nocheck
/**
 * قائمة معاملات (إيرادات / مصروفات / الكل) — عربي مع خط Tajawal والنص المنطقي.
 */
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PdfMoneyText, pdfFmtNum, pdfFmtDate } from './pdfBrandKit';
import { PDF_TABLE_ROW } from './pdfTable';
import type { TransactionWithRelations } from '@/lib/db/types';

const METHOD_AR: Record<string, string> = {
  CASH: 'نقدي',
  CHEQUE: 'صك',
  TRANSFER: 'حوالة',
  CARD: 'بطاقة',
};

const KIND_AR: Record<string, string> = {
  REVENUE: 'إيراد',
  EXPENSE: 'مصروف',
  TRANSFER: 'تحويل',
  OPENING: 'افتتاحي',
  ADJUSTMENT: 'تسوية',
};

/** أعمدة: بيان | مبلغ | … | تاريخ | رقم → الرقم يميناً */
const col = StyleSheet.create({
  row: {
    ...PDF_TABLE_ROW,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
  },
  rowAlt: { backgroundColor: PDF.rowAlt },
  head: {
    ...PDF_TABLE_ROW,
    backgroundColor: PDF.headerBg,
    paddingVertical: 7,
    paddingHorizontal: 6,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
  },
  th: { color: PDF.white, fontSize: 8.5, fontWeight: 'bold', textAlign: 'center' },
  thAr: { color: PDF.white, fontSize: 8.5, fontWeight: 'bold', textAlign: 'right' },
  td: { fontSize: 8.5, color: PDF.text, textAlign: 'right' },
  tdMuted: { fontSize: 8, color: PDF.muted, textAlign: 'center' },
  num: { width: '9%' },
  date: { width: '11%' },
  kind: { width: '10%' },
  method: { width: '10%' },
  cat: { width: '20%' },
  box: { width: '14%' },
  amt: { width: '13%' },
  desc: { flex: 1, paddingHorizontal: 4 },
  foot: {
    ...PDF_TABLE_ROW,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 1.5,
    borderTopColor: PDF.primary,
  },
  footLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: PDF.text,
    textAlign: 'right',
  },
});

export type TransactionsReportPdfProps = {
  titleAr: string;
  subtitleAr?: string;
  rows: TransactionWithRelations[];
};

export function TransactionsReportPDF({ titleAr, subtitleAr, rows }: TransactionsReportPdfProps) {
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <ReportShell
      title={titleAr}
      subtitle={subtitleAr}
      metaCells={[
        { label: 'عدد القيود', value: pdfFmtNum(rows.length) },
        { label: 'إجمالي المبالغ', moneyAmount: total },
      ]}
    >
      <Text style={pdfBase.sectionTitle}>{ar('تفاصيل المعاملات')}</Text>

      <View style={col.head} wrap={false}>
        <Text style={[col.thAr, col.desc]}>{ar('البيان')}</Text>
        <Text style={[col.th, col.amt]}>{ar('المبلغ')}</Text>
        <Text style={[col.th, col.method]}>{ar('الطريقة')}</Text>
        <Text style={[col.th, col.kind]}>{ar('النوع')}</Text>
        <Text style={[col.thAr, col.box]}>{ar('الخزينة')}</Text>
        <Text style={[col.thAr, col.cat]}>{ar('البند')}</Text>
        <Text style={[col.th, col.date]}>{ar('التاريخ')}</Text>
        <Text style={[col.th, col.num]}>{ar('الرقم')}</Text>
      </View>

      {rows.map((r, i) => (
        <View key={r.id} style={[col.row, i % 2 === 1 ? col.rowAlt : {}]} wrap={false}>
          <Text style={[col.td, col.desc]}>{ar(r.description ?? '—')}</Text>
          <View style={col.amt}>
            <PdfMoneyText amount={Number(r.amount)} />
          </View>
          <Text style={[col.tdMuted, col.method]}>{ar(METHOD_AR[r.method] ?? r.method)}</Text>
          <Text style={[col.tdMuted, col.kind]}>{ar(KIND_AR[r.kind] ?? r.kind)}</Text>
          <Text style={[col.td, col.box]}>{ar(r.cashbox?.name_ar ?? '—')}</Text>
          <Text style={[col.td, col.cat]}>{ar(r.category?.name_ar ?? '—')}</Text>
          <Text style={[col.tdMuted, col.date]}>{pdfFmtDate(r.tx_date)}</Text>
          <Text style={[col.tdMuted, col.num]}>{pdfFmtNum(r.number)}</Text>
        </View>
      ))}

      <View style={col.foot} wrap={false}>
        <Text style={[col.footLabel, col.desc]}>{ar('الإجمالي')}</Text>
        <View style={col.amt}>
          <PdfMoneyText amount={total} style={{ fontSize: 11, fontWeight: 'bold' }} />
        </View>
        <Text style={col.method} />
        <Text style={col.kind} />
        <Text style={col.box} />
        <Text style={col.cat} />
        <Text style={col.date} />
        <Text style={[col.tdMuted, col.num]}>{pdfFmtNum(rows.length)}</Text>
      </View>

      <Text style={pdfBase.caption}>{ar('وثيقة مُولَّدة آلياً من منظومة تاج مول')}</Text>
    </ReportShell>
  );
}
