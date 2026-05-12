// @ts-nocheck
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar, arMoney } from './arabicPDF';
import { pdfBase, PDF } from './pdfStyles';

export type TrialBalanceRow = {
  category: string;
  debitTotals: number;
  creditTotals: number;
  debitBalance: number;
  creditBalance: number;
};

const s = StyleSheet.create({
  th_category: { flex: 1, textAlign: 'right' },
  th_num:      { width: 88,  textAlign: 'center' },
  td_num:      { width: 88,  textAlign: 'left' },
  td_zero:     { color: PDF.muted },
  caption: {
    fontSize: 8.5,
    color: PDF.muted,
    marginTop: 14,
    textAlign: 'center',
  },
});

export function TrialBalancePDF({
  rows,
  periodLabel,
  currency = 'د.ل',
}: {
  rows: TrialBalanceRow[];
  periodLabel: string;
  currency?: string;
}) {
  const totalDebitTotals  = rows.reduce((x, r) => x + r.debitTotals, 0);
  const totalCreditTotals = rows.reduce((x, r) => x + r.creditTotals, 0);
  const totalDebitBalance = rows.reduce((x, r) => x + r.debitBalance, 0);
  const totalCreditBalance = rows.reduce((x, r) => x + r.creditBalance, 0);

  return (
    <ReportShell
      title="ميزان المراجعة"
      subtitle={periodLabel}
      metaCells={[
        { label: 'الفترة',       value: periodLabel },
        { label: 'عدد الحسابات', value: String(rows.length) },
      ]}
    >
      {/* Table header */}
      <View style={pdfBase.tableHead}>
        <Text style={[pdfBase.th, s.th_num,  { textAlign: 'left' }]}>{ar('رصيد دائن')}</Text>
        <Text style={[pdfBase.th, s.th_num,  { textAlign: 'left' }]}>{ar('رصيد مدين')}</Text>
        <Text style={[pdfBase.th, s.th_num,  { textAlign: 'left' }]}>{ar('مجموع دائن')}</Text>
        <Text style={[pdfBase.th, s.th_num,  { textAlign: 'left' }]}>{ar('مجموع مدين')}</Text>
        <Text style={[pdfBase.th, s.th_category]}>{ar('البيـان')}</Text>
      </View>

      {rows.length === 0 ? (
        <View style={[pdfBase.tableRow, { justifyContent: 'center', paddingVertical: 24 }]}>
          <Text style={pdfBase.tdMuted}>{ar('لا توجد بيانات للعرض')}</Text>
        </View>
      ) : (
        rows.map((r, i) => (
          <View key={i} style={[pdfBase.tableRow, i % 2 !== 0 && pdfBase.rowEven]}>
            <Text style={[pdfBase.td, s.td_num, !r.creditBalance && s.td_zero]}>
              {r.creditBalance ? arMoney(r.creditBalance, currency) : ar('—')}
            </Text>
            <Text style={[pdfBase.td, s.td_num, !r.debitBalance && s.td_zero]}>
              {r.debitBalance ? arMoney(r.debitBalance, currency) : ar('—')}
            </Text>
            <Text style={[pdfBase.td, s.td_num, !r.creditTotals && s.td_zero]}>
              {r.creditTotals ? arMoney(r.creditTotals, currency) : ar('—')}
            </Text>
            <Text style={[pdfBase.td, s.td_num, !r.debitTotals && s.td_zero]}>
              {r.debitTotals ? arMoney(r.debitTotals, currency) : ar('—')}
            </Text>
            <Text style={[pdfBase.td, s.th_category, { fontWeight: 'bold' }]}>
              {ar(r.category)}
            </Text>
          </View>
        ))
      )}

      {/* Totals */}
      {rows.length > 0 && (
        <View style={pdfBase.tableFoot}>
          <Text style={[pdfBase.footValue, s.td_num]}>
            {arMoney(totalCreditBalance, currency)}
          </Text>
          <Text style={[pdfBase.footValue, s.td_num]}>
            {arMoney(totalDebitBalance, currency)}
          </Text>
          <Text style={[pdfBase.footValue, s.td_num]}>
            {arMoney(totalCreditTotals, currency)}
          </Text>
          <Text style={[pdfBase.footValue, s.td_num]}>
            {arMoney(totalDebitTotals, currency)}
          </Text>
          <Text style={[pdfBase.footLabel, s.th_category]}>
            {ar('الإجمالي')}
          </Text>
        </View>
      )}

      <Text style={s.caption}>
        {ar('هذا التقرير صادر آلياً من منظومة Fluxen، ويمثل تجميعاً مباشراً للقيود المرحّلة.')}
      </Text>
    </ReportShell>
  );
}
