// @ts-nocheck
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PdfMoneyText } from './pdfBrandKit';
import { PDF_TABLE_ROW } from './pdfTable';

/** أعمدة: مبلغ | اسم | رمز → الرمز يميناً */
const col = StyleSheet.create({
  sectionHeader: {
    backgroundColor: PDF.headerBg,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginTop: 10,
    marginBottom: 5,
    borderRadius: 2,
  },
  sectionTitle: {
    color: PDF.white,
    fontSize: 9.5,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  row: {
    ...PDF_TABLE_ROW,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
  },
  rowAlt: { backgroundColor: PDF.rowAlt },
  tdName: { flex: 1, textAlign: 'right', fontSize: 9, color: PDF.text, paddingHorizontal: 4 },
  tdCode: { width: '20%', textAlign: 'center', fontSize: 8, color: PDF.muted },
  tdAmt: { width: '25%' },
  summaryRow: {
    ...PDF_TABLE_ROW,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 1,
    borderTopColor: PDF.primary,
    marginTop: 2,
    marginBottom: 10,
  },
  netIncomeRow: {
    ...PDF_TABLE_ROW,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: PDF.primary,
    borderRadius: 4,
    marginTop: 15,
  },
  netLossRow: {
    ...PDF_TABLE_ROW,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#f87171',
    borderRadius: 4,
    marginTop: 15,
  },
});

export type ProfitLossReportPdfProps = {
  year: number;
  periodText: string;
  revenues: Array<{ name_ar: string; code: string; amount: number }>;
  expenses: Array<{ name_ar: string; code: string; amount: number }>;
};

export function ProfitLossReportPDF({ year, periodText, revenues, expenses }: ProfitLossReportPdfProps) {
  const totalRevenues = revenues.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalExpenses = expenses.reduce((s, r) => s + Number(r.amount || 0), 0);
  const netIncome = totalRevenues - totalExpenses;
  const isProfit = netIncome >= 0;

  return (
    <ReportShell
      title={`قائمة الأرباح والخسائر للعام ${year}`}
      subtitle={`الفترة المحددة: ${periodText}`}
      metaCells={[
        { label: 'إجمالي الإيرادات', moneyAmount: totalRevenues },
        { label: 'إجمالي المصروفات', moneyAmount: totalExpenses },
      ]}
    >
      <View style={col.sectionHeader} wrap={false}>
        <Text style={col.sectionTitle}>{ar('الإيرادات التشغيلية')}</Text>
      </View>

      {revenues.length === 0 ? (
        <Text style={[pdfBase.caption, { textAlign: 'center', marginVertical: 10 }]}>
          {ar('لا توجد إيرادات مسجلة')}
        </Text>
      ) : (
        revenues.map((item, idx) => (
          <View key={item.code} style={[col.row, idx % 2 === 1 ? col.rowAlt : {}]} wrap={false}>
            <View style={col.tdAmt}>
              <PdfMoneyText amount={Number(item.amount)} style={{ color: '#15803d' }} />
            </View>
            <Text style={col.tdName}>{ar(item.name_ar)}</Text>
            <Text style={col.tdCode}>{item.code}</Text>
          </View>
        ))
      )}

      <View style={col.summaryRow} wrap={false}>
        <View style={col.tdAmt}>
          <PdfMoneyText
            amount={totalRevenues}
            style={{ fontWeight: 'bold', fontSize: 10, color: '#15803d' }}
          />
        </View>
        <Text style={[col.tdName, { fontWeight: 'bold' }]}>{ar('مجموع الإيرادات')}</Text>
        <Text style={col.tdCode} />
      </View>

      <View style={col.sectionHeader} wrap={false}>
        <Text style={col.sectionTitle}>{ar('المصروفات التشغيلية')}</Text>
      </View>

      {expenses.length === 0 ? (
        <Text style={[pdfBase.caption, { textAlign: 'center', marginVertical: 10 }]}>
          {ar('لا توجد مصروفات مسجلة')}
        </Text>
      ) : (
        expenses.map((item, idx) => (
          <View key={item.code} style={[col.row, idx % 2 === 1 ? col.rowAlt : {}]} wrap={false}>
            <View style={col.tdAmt}>
              <PdfMoneyText amount={Number(item.amount)} style={{ color: '#b91c1c' }} />
            </View>
            <Text style={col.tdName}>{ar(item.name_ar)}</Text>
            <Text style={col.tdCode}>{item.code}</Text>
          </View>
        ))
      )}

      <View style={col.summaryRow} wrap={false}>
        <View style={col.tdAmt}>
          <PdfMoneyText
            amount={totalExpenses}
            style={{ fontWeight: 'bold', fontSize: 10, color: '#b91c1c' }}
          />
        </View>
        <Text style={[col.tdName, { fontWeight: 'bold' }]}>{ar('مجموع المصروفات')}</Text>
        <Text style={col.tdCode} />
      </View>

      <View style={isProfit ? col.netIncomeRow : col.netLossRow} wrap={false}>
        <View style={col.tdAmt}>
          <PdfMoneyText
            amount={Math.abs(netIncome)}
            style={{
              fontWeight: 'bold',
              fontSize: 12,
              color: isProfit ? '#166534' : '#991b1b',
            }}
          />
        </View>
        <Text
          style={[
            col.tdName,
            {
              fontWeight: 'bold',
              fontSize: 11,
              color: isProfit ? '#166534' : '#991b1b',
            },
          ]}
        >
          {isProfit ? ar('صافي الربح التشغيلي') : ar('صافي الخسارة التشغيلية')}
        </Text>
        <Text style={col.tdCode} />
      </View>

      <Text style={pdfBase.caption}>{ar('وثيقة محاسبية مُولَّدة آلياً من منظومة تاج مول')}</Text>
    </ReportShell>
  );
}
