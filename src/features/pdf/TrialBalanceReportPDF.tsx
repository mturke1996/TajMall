// @ts-nocheck
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PdfMoneyText, pdfFmtNum } from './pdfBrandKit';
import { PDF_TABLE_ROW } from './pdfTable';

/**
 * أعمدة (يسار ← يمين): رصيد | دائن | مدين | نوع | اسم | رمز
 * → رمز الحساب على يمين الورقة
 */
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
  code: { width: '12%' },
  name: { flex: 1, paddingHorizontal: 4 },
  type: { width: '14%' },
  debit: { width: '16%' },
  credit: { width: '16%' },
  balance: { width: '16%' },
  foot: {
    ...PDF_TABLE_ROW,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 1.5,
    borderTopColor: PDF.primary,
  },
  footHint: {
    fontSize: 7,
    color: PDF.muted,
    textAlign: 'center',
    marginBottom: 2,
  },
  footLabel: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: PDF.text,
    textAlign: 'right',
  },
});

export type TrialBalanceReportPdfProps = {
  year: number;
  rows: Array<{
    code: string;
    name_ar: string;
    type: string;
    total_debit: number;
    total_credit: number;
    balance: number;
  }>;
};

export function TrialBalanceReportPDF({ year, rows }: TrialBalanceReportPdfProps) {
  let totalDebits = 0;
  let totalCredits = 0;
  rows.forEach((r) => {
    totalDebits += Number(r.total_debit || 0);
    totalCredits += Number(r.total_credit || 0);
  });

  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  return (
    <ReportShell
      title={`ميزان المراجعة للسنة المالية ${year}`}
      subtitle={`حالة توازن الدفاتر والحسابات الإجمالية`}
      metaCells={[
        { label: 'عدد البنود', value: pdfFmtNum(rows.length) },
        { label: 'حالة الميزان', value: isBalanced ? 'متوازن بنجاح' : 'غير متوازن!' },
      ]}
    >
      <Text style={pdfBase.sectionTitle}>{ar('أرصدة الحسابات الختامية ومجاميع الحركات')}</Text>

      <View style={col.head} wrap={false}>
        <Text style={[col.th, col.balance]}>{ar('صافي الرصيد')}</Text>
        <Text style={[col.th, col.credit]}>{ar('ختامي دائن')}</Text>
        <Text style={[col.th, col.debit]}>{ar('ختامي مدين')}</Text>
        <Text style={[col.th, col.type]}>{ar('النوع')}</Text>
        <Text style={[col.thAr, col.name]}>{ar('اسم الحساب')}</Text>
        <Text style={[col.th, col.code]}>{ar('الرمز')}</Text>
      </View>

      {rows.map((r, i) => (
        <View key={r.code} style={[col.row, i % 2 === 1 ? col.rowAlt : {}]} wrap={false}>
          <View style={col.balance}>
            <PdfMoneyText amount={Number(r.balance)} />
          </View>
          <View style={col.credit}>
            {r.total_credit > 0 ? (
              <PdfMoneyText amount={Number(r.total_credit)} />
            ) : (
              <Text style={col.tdMuted}>—</Text>
            )}
          </View>
          <View style={col.debit}>
            {r.total_debit > 0 ? (
              <PdfMoneyText amount={Number(r.total_debit)} />
            ) : (
              <Text style={col.tdMuted}>—</Text>
            )}
          </View>
          <Text style={[col.tdMuted, col.type]}>{ar(r.type)}</Text>
          <Text style={[col.td, col.name]}>{ar(r.name_ar)}</Text>
          <Text style={[col.tdMuted, col.code]}>{r.code}</Text>
        </View>
      ))}

      <View style={col.foot} wrap={false}>
        <View style={col.balance}>
          <Text style={col.footHint}>{ar('الحالة')}</Text>
          <Text
            style={{
              fontSize: 9,
              fontWeight: 'bold',
              color: isBalanced ? PDF.primary : '#b91c1c',
              textAlign: 'center',
            }}
          >
            {isBalanced ? ar('متوازن') : ar('غير متوازن')}
          </Text>
        </View>
        <View style={col.credit}>
          <Text style={col.footHint}>{ar('إجمالي دائن')}</Text>
          <PdfMoneyText amount={totalCredits} style={{ fontSize: 10, fontWeight: 'bold' }} />
        </View>
        <View style={col.debit}>
          <Text style={col.footHint}>{ar('إجمالي مدين')}</Text>
          <PdfMoneyText amount={totalDebits} style={{ fontSize: 10, fontWeight: 'bold' }} />
        </View>
        <Text style={[col.tdMuted, col.type]}>—</Text>
        <Text style={[col.footLabel, col.name]}>{ar('الإجمالي العام للدفاتر')}</Text>
        <Text style={[col.tdMuted, col.code]}>{pdfFmtNum(rows.length)}</Text>
      </View>

      <Text style={pdfBase.caption}>{ar('وثيقة محاسبية مُولَّدة آلياً من منظومة تاج مول')}</Text>
    </ReportShell>
  );
}
