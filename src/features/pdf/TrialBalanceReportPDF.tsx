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
    paddingVertical: 6,
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
  code: { width: '15%', textAlign: 'right', paddingRight: 4 },
  name: { flex: 1, textAlign: 'right', paddingRight: 4 },
  type: { width: '15%', textAlign: 'center' },
  debit: { width: '18%', textAlign: 'center' },
  credit: { width: '18%', textAlign: 'center' },
  balance: { width: '18%', textAlign: 'center' },
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
      <Text style={pdfBase.sectionTitle}>{ar('أرصدة الحسابات ومجاميع الحركات')}</Text>

      <View style={col.head} wrap={false}>
        <Text style={[col.th, col.balance]}>{ar('صافي الرصيد')}</Text>
        <Text style={[col.th, col.credit]}>{ar('مجموع الدائن')}</Text>
        <Text style={[col.th, col.debit]}>{ar('مجموع المدين')}</Text>
        <Text style={[col.th, col.type]}>{ar('نوع الحساب')}</Text>
        <Text style={[col.th, col.name]}>{ar('اسم الحساب')}</Text>
        <Text style={[col.th, col.code]}>{ar('رمز الحساب')}</Text>
      </View>

      {rows.map((r, i) => (
        <View key={r.code} style={[col.row, i % 2 === 1 ? col.rowAlt : {}]} wrap={false}>
          <View style={col.balance}>
            <PdfMoneyText amount={Number(r.balance)} />
          </View>
          <View style={col.credit}>
            {r.total_credit > 0 ? <PdfMoneyText amount={Number(r.total_credit)} /> : <Text style={col.td}>—</Text>}
          </View>
          <View style={col.debit}>
            {r.total_debit > 0 ? <PdfMoneyText amount={Number(r.total_debit)} /> : <Text style={col.td}>—</Text>}
          </View>
          <Text style={[col.td, col.type]}>{ar(r.type)}</Text>
          <Text style={[col.td, col.name]}>{ar(r.name_ar)}</Text>
          <Text style={[col.tdMuted, col.code]}>{r.code}</Text>
        </View>
      ))}

      <View style={col.foot} wrap={false}>
        <Text style={[pdfBase.footLabel, { width: '31%', textAlign: 'right' }]}>{ar('الإجمالي العام للدفاتر:')}</Text>
        <View style={col.debit}>
          <PdfMoneyText amount={totalDebits} style={{ fontSize: 10, fontWeight: 'bold' }} />
        </View>
        <View style={col.credit}>
          <PdfMoneyText amount={totalCredits} style={{ fontSize: 10, fontWeight: 'bold' }} />
        </View>
        <View style={col.balance}>
          <Text style={{ fontSize: 9, fontWeight: 'bold', color: isBalanced ? PDF.primary : '#b91c1c' }}>
            {isBalanced ? ar('متوازن') : ar('غير متوازن')}
          </Text>
        </View>
      </View>

      <Text style={pdfBase.caption}>{ar('وثيقة محاسبية مُولَّدة آلياً من منظومة تاج مول')}</Text>
    </ReportShell>
  );
}
