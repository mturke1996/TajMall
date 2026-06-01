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
  code: { width: '18%', textAlign: 'right' },
  name: { flex: 1, textAlign: 'right', paddingRight: 4 },
  balance: { width: '22%', textAlign: 'center' },
  section: {
    marginTop: 12,
    marginBottom: 4,
    fontSize: 10,
    fontWeight: 'bold',
    color: PDF.primary,
  },
  foot: {
    direction: 'rtl',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 1.5,
    borderTopColor: PDF.primary,
  },
});

export type BalanceSheetReportPdfProps = {
  asOf: string;
  assets: Array<{ category_code: string; category_name: string; balance: number }>;
  liabilities: Array<{ category_code: string; category_name: string; balance: number }>;
  equity: Array<{ category_code: string; category_name: string; balance: number }>;
  summary: {
    totalAssets: number;
    totalLiab: number;
    totalEquity: number;
  };
};

function SectionRows({
  title,
  rows,
}: {
  title: string;
  rows: BalanceSheetReportPdfProps['assets'];
}) {
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + Number(r.balance || 0), 0);
  return (
    <>
      <Text style={col.section}>{ar(title)}</Text>
      <View style={col.head} wrap={false}>
        <Text style={[col.th, col.balance]}>{ar('الرصيد')}</Text>
        <Text style={[col.th, col.name]}>{ar('اسم الحساب')}</Text>
        <Text style={[col.th, col.code]}>{ar('الرمز')}</Text>
      </View>
      {rows.map((r, i) => (
        <View key={r.category_code} style={[col.row, i % 2 === 1 ? col.rowAlt : {}]} wrap={false}>
          <View style={col.balance}>
            <PdfMoneyText amount={Number(r.balance)} />
          </View>
          <Text style={[col.td, col.name]}>{ar(r.category_name)}</Text>
          <Text style={[col.td, col.code]}>{r.category_code}</Text>
        </View>
      ))}
      <View style={[col.row, { backgroundColor: PDF.rowAlt }]} wrap={false}>
        <View style={col.balance}>
          <PdfMoneyText amount={total} style={{ fontWeight: 'bold' }} />
        </View>
        <Text style={[col.td, col.name, { fontWeight: 'bold' }]}>{ar('إجمالي ' + title)}</Text>
        <Text style={col.code} />
      </View>
    </>
  );
}

export function BalanceSheetReportPDF({
  asOf,
  assets,
  liabilities,
  equity,
  summary,
}: BalanceSheetReportPdfProps) {
  const balanced =
    Math.abs(summary.totalAssets - (summary.totalLiab + summary.totalEquity)) < 0.01;

  return (
    <ReportShell
      title="الميزانية العمومية"
      subtitle="موقف مالي: الأصول والخصوم وحقوق الملكية"
      summaryPrimaryDateIso={`${asOf}T12:00:00.000Z`}
      summaryPrimaryDateLabel="تاريخ التقرير"
      metaCells={[
        { label: 'إجمالي الأصول', moneyAmount: summary.totalAssets },
        { label: 'الخصوم + حقوق الملكية', moneyAmount: summary.totalLiab + summary.totalEquity },
        { label: 'حالة المعادلة', value: balanced ? 'محققة' : 'فارق موجود' },
      ]}
    >
      <SectionRows title="الأصول" rows={assets} />
      <SectionRows title="الخصوم" rows={liabilities} />
      <SectionRows title="حقوق الملكية" rows={equity} />

      <View style={col.foot} wrap={false}>
        <Text style={pdfBase.footLabel}>{ar('الأصول = الخصوم + حقوق الملكية')}</Text>
        <Text style={{ fontSize: 9, fontWeight: 'bold', color: balanced ? PDF.primary : '#b91c1c' }}>
          {balanced ? ar('متوازنة') : ar('غير متوازنة')}
        </Text>
      </View>

      <Text style={pdfBase.caption}>{ar('وثيقة محاسبية مُولَّدة آلياً من منظومة تاج مول')}</Text>
    </ReportShell>
  );
}
