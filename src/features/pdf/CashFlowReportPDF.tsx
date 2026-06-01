// @ts-nocheck
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PdfMoneyText } from './pdfBrandKit';

const col = StyleSheet.create({
  sectionHeader: {
    backgroundColor: PDF.headerBg,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginTop: 10,
    marginBottom: 5,
    borderRadius: 2,
    direction: 'rtl',
  },
  sectionTitle: {
    color: PDF.white,
    fontSize: 9.5,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  row: {
    direction: 'rtl',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
  },
  rowAlt: { backgroundColor: PDF.rowAlt },
  tdName: { flex: 1, textAlign: 'right', fontSize: 9, color: PDF.text },
  tdAmt: { width: '25%', textAlign: 'left', fontSize: 9 },
  summaryRow: {
    direction: 'rtl',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 1,
    borderTopColor: PDF.primary,
    marginTop: 2,
    marginBottom: 10,
  },
  summaryValue: {
    fontWeight: 'bold',
    fontSize: 10,
  },
});

export type CashFlowReportPdfProps = {
  year: number;
  data: {
    operating: Array<{ description: string; amount: number; isPositive: boolean }>;
    investing: Array<{ description: string; amount: number; isPositive: boolean }>;
    financing: Array<{ description: string; amount: number; isPositive: boolean }>;
    summary: {
      openingBalance: number;
      closingBalance: number;
      netOperating: number;
      netInvesting: number;
      netFinancing: number;
      netChange: number;
    };
  };
};

export function CashFlowReportPDF({ year, data }: CashFlowReportPdfProps) {
  const s = data.summary || {
    openingBalance: 0,
    closingBalance: 0,
    netOperating: 0,
    netInvesting: 0,
    netFinancing: 0,
    netChange: 0,
  };

  return (
    <ReportShell
      title={`قائمة التدفقات النقدية للعام ${year}`}
      subtitle={`ملخص مصادر النقد واستخداماته`}
      metaCells={[
        { label: 'الرصيد الافتتاحي للنقد', moneyAmount: s.openingBalance },
        { label: 'الرصيد الختامي للنقد', moneyAmount: s.closingBalance },
      ]}
    >
      {/* ── OPENING CASH BALANCE ── */}
      <View style={[col.summaryRow, { backgroundColor: '#f8fafc', borderTopColor: '#64748b' }]} wrap={false}>
        <View style={col.tdAmt}>
          <PdfMoneyText amount={s.openingBalance} style={col.summaryValue} />
        </View>
        <Text style={[col.tdName, { fontWeight: 'bold' }]}>{ar('النقد وما في حكمه - بداية الفترة')}</Text>
      </View>

      {/* ── OPERATING ACTIVITIES ── */}
      <View style={col.sectionHeader} wrap={false}>
        <Text style={col.sectionTitle}>{ar('تدفقات نقدية من الأنشطة التشغيلية')}</Text>
      </View>

      {data.operating.length === 0 ? (
        <Text style={[pdfBase.caption, { textAlign: 'center', marginVertical: 8 }]}>{ar('لا توجد تدفقات تشغيلية')}</Text>
      ) : (
        data.operating.map((item, idx) => (
          <View key={idx} style={[col.row, idx % 2 === 1 ? col.rowAlt : {}]} wrap={false}>
            <View style={col.tdAmt}>
              <PdfMoneyText amount={item.amount} style={{ color: item.isPositive ? '#166534' : '#991b1b' }} />
            </View>
            <Text style={col.tdName}>{ar(item.description)}</Text>
          </View>
        ))
      )}

      <View style={col.summaryRow} wrap={false}>
        <View style={col.tdAmt}>
          <PdfMoneyText amount={s.netOperating} style={[col.summaryValue, { color: s.netOperating >= 0 ? '#166534' : '#991b1b' }]} />
        </View>
        <Text style={[col.tdName, { fontWeight: 'bold' }]}>{ar('صافي النقد من الأنشطة التشغيلية')}</Text>
      </View>

      {/* ── INVESTING ACTIVITIES ── */}
      <View style={col.sectionHeader} wrap={false}>
        <Text style={col.sectionTitle}>{ar('تدفقات نقدية من الأنشطة الاستثمارية')}</Text>
      </View>

      {data.investing.length === 0 ? (
        <Text style={[pdfBase.caption, { textAlign: 'center', marginVertical: 8 }]}>{ar('لا توجد تدفقات استثمارية')}</Text>
      ) : (
        data.investing.map((item, idx) => (
          <View key={idx} style={[col.row, idx % 2 === 1 ? col.rowAlt : {}]} wrap={false}>
            <View style={col.tdAmt}>
              <PdfMoneyText amount={item.amount} style={{ color: item.isPositive ? '#166534' : '#991b1b' }} />
            </View>
            <Text style={col.tdName}>{ar(item.description)}</Text>
          </View>
        ))
      )}

      <View style={col.summaryRow} wrap={false}>
        <View style={col.tdAmt}>
          <PdfMoneyText amount={s.netInvesting} style={[col.summaryValue, { color: s.netInvesting >= 0 ? '#166534' : '#991b1b' }]} />
        </View>
        <Text style={[col.tdName, { fontWeight: 'bold' }]}>{ar('صافي النقد من الأنشطة الاستثمارية')}</Text>
      </View>

      {/* ── FINANCING ACTIVITIES ── */}
      <View style={col.sectionHeader} wrap={false}>
        <Text style={col.sectionTitle}>{ar('تدفقات نقدية من الأنشطة التمويلية')}</Text>
      </View>

      {data.financing.length === 0 ? (
        <Text style={[pdfBase.caption, { textAlign: 'center', marginVertical: 8 }]}>{ar('لا توجد تدفقات تمويلية')}</Text>
      ) : (
        data.financing.map((item, idx) => (
          <View key={idx} style={[col.row, idx % 2 === 1 ? col.rowAlt : {}]} wrap={false}>
            <View style={col.tdAmt}>
              <PdfMoneyText amount={item.amount} style={{ color: item.isPositive ? '#166534' : '#991b1b' }} />
            </View>
            <Text style={col.tdName}>{ar(item.description)}</Text>
          </View>
        ))
      )}

      <View style={col.summaryRow} wrap={false}>
        <View style={col.tdAmt}>
          <PdfMoneyText amount={s.netFinancing} style={[col.summaryValue, { color: s.netFinancing >= 0 ? '#166534' : '#991b1b' }]} />
        </View>
        <Text style={[col.tdName, { fontWeight: 'bold' }]}>{ar('صافي النقد من الأنشطة التمويلية')}</Text>
      </View>

      {/* ── SUMMARY CLOSING BALANCE ── */}
      <View style={[col.summaryRow, { backgroundColor: '#f0fdf4', borderTopColor: PDF.primary, borderWidth: 1, borderColor: PDF.primary, marginTop: 10 }]} wrap={false}>
        <View style={col.tdAmt}>
          <PdfMoneyText amount={s.closingBalance} style={[col.summaryValue, { fontSize: 11 }]} />
        </View>
        <Text style={[col.tdName, { fontWeight: 'bold', fontSize: 10 }]}>{ar('النقد وما في حكمه - نهاية الفترة')}</Text>
      </View>

      <Text style={pdfBase.caption}>{ar('وثيقة محاسبية مُولَّدة آلياً من منظومة تاج مول')}</Text>
    </ReportShell>
  );
}
