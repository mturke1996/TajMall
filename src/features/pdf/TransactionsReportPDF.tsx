// @ts-nocheck
/**
 * قائمة معاملات (إيرادات / مصروفات / الكل) — عربي مع خط Tajawal والنص المنطقي (مثل debtflow-pro).
 */
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PdfMoneyText, pdfFmtNum, pdfFmtDate } from './pdfBrandKit';
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

const col = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
  },
  rowAlt: { backgroundColor: PDF.rowAlt },
  head: {
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
  num: { width: '9%', textAlign: 'center' },
  date: { width: '11%', textAlign: 'center' },
  kind: { width: '10%', textAlign: 'center' },
  method: { width: '10%', textAlign: 'center' },
  cat: { width: '20%', textAlign: 'right', paddingRight: 4 },
  box: { width: '14%', textAlign: 'right', paddingRight: 4 },
  amt: { width: '13%', textAlign: 'center' },
  desc: { flex: 1, textAlign: 'right', paddingRight: 4 },
  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 1.5,
    borderTopColor: PDF.primary,
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
        { label: 'إجمالي المبالغ', value: `${pdfFmtNum(total)} د.ل` },
      ]}
    >
      <Text style={pdfBase.sectionTitle}>{ar('تفاصيل المعاملات')}</Text>

      <View style={col.head} wrap={false}>
        <Text style={[col.th, col.num]}>{ar('الرقم')}</Text>
        <Text style={[col.th, col.date]}>{ar('التاريخ')}</Text>
        <Text style={[col.th, col.cat]}>{ar('البند')}</Text>
        <Text style={[col.th, col.box]}>{ar('الخزينة')}</Text>
        <Text style={[col.th, col.kind]}>{ar('النوع')}</Text>
        <Text style={[col.th, col.method]}>{ar('الطريقة')}</Text>
        <Text style={[col.th, col.amt]}>{ar('المبلغ')}</Text>
        <Text style={[col.th, col.desc]}>{ar('البيان')}</Text>
      </View>

      {rows.map((r, i) => (
        <View key={r.id} style={[col.row, i % 2 === 1 ? col.rowAlt : {}]} wrap={false}>
          <Text style={[col.tdMuted, col.num]}>{pdfFmtNum(r.number)}</Text>
          <Text style={[col.tdMuted, col.date]}>{pdfFmtDate(r.tx_date)}</Text>
          <Text style={[col.td, col.cat]}>{ar(r.category?.name_ar ?? '—')}</Text>
          <Text style={[col.td, col.box]}>{ar(r.cashbox?.name_ar ?? '—')}</Text>
          <Text style={[col.td, col.kind]}>{ar(KIND_AR[r.kind] ?? r.kind)}</Text>
          <Text style={[col.td, col.method]}>{ar(METHOD_AR[r.method] ?? r.method)}</Text>
          <View style={col.amt}>
            <PdfMoneyText amount={Number(r.amount)} />
          </View>
          <Text style={[col.td, col.desc]}>{ar(r.description ?? '—')}</Text>
        </View>
      ))}

      <View style={col.foot} wrap={false}>
        <Text style={pdfBase.footLabel}>{ar('الإجمالي')}</Text>
        <PdfMoneyText amount={total} style={{ fontSize: 11, fontWeight: 'bold' }} />
      </View>

      <Text style={pdfBase.caption}>{ar('وثيقة مُولَّدة آلياً من منظومة فلاكسن')}</Text>
    </ReportShell>
  );
}
