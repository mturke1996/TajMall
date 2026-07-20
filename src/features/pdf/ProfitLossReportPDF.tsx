// @ts-nocheck
import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { PDF } from './pdfBase';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';

const W = { amount: '22%', name: '58%', code: '20%' };

export type ProfitLossReportPdfProps = {
  year: number;
  periodText: string;
  revenues: Array<{ name_ar: string; code: string; amount: number }>;
  expenses: Array<{ name_ar: string; code: string; amount: number }>;
  documentTitle?: string;
};

function LineSection({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: Array<{ name_ar: string; code: string; amount: number }>;
  tone: 'revenue' | 'expense';
}) {
  const color = tone === 'revenue' ? PDF.success : PDF.danger;
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={pdfReportTable.sectionBand}>
        <Text style={pdfReportTable.sectionBandText}>{ar(title)}</Text>
      </View>
      <View style={pdfReportTable.tableWrap}>
        {rows.length === 0 ? (
          <View style={{ padding: 16, alignItems: 'center' }}>
            <Text style={pdfReportTable.tdMuted}>{ar('لا توجد بنود')}</Text>
          </View>
        ) : (
          rows.map((item, idx) => (
            <View
              key={item.code}
              style={[pdfReportTable.tableRow, idx % 2 === 1 ? pdfReportTable.rowAlt : {}]}
            >
              <View style={[pdfReportTable.tdNum, { width: W.amount }]}>
                <PdfReportMoney amount={Number(item.amount)} color={color} />
              </View>
              <Text style={[pdfReportTable.tdAr, { width: W.name }]}>{ar(item.name_ar)}</Text>
              <Text style={[pdfReportTable.tdMuted, { width: W.code }]}>{item.code}</Text>
            </View>
          ))
        )}
        <View style={[pdfReportTable.tableRow, { backgroundColor: PDF.logoGreenSoft }]}>
          <View style={[pdfReportTable.tdNum, { width: W.amount }]}>
            <PdfReportMoney amount={total} color={color} bold />
          </View>
          <Text style={[pdfReportTable.tdAr, { width: W.name, fontWeight: 'bold' }]}>
            {ar(`إجمالي ${title}`)}
          </Text>
          <Text style={{ width: W.code }} />
        </View>
      </View>
    </View>
  );
}

export function ProfitLossReportPDF({
  year,
  periodText,
  revenues,
  expenses,
  documentTitle,
}: ProfitLossReportPdfProps) {
  const totalRevenues = revenues.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalExpenses = expenses.reduce((s, r) => s + Number(r.amount || 0), 0);
  const netIncome = totalRevenues - totalExpenses;
  const isProfit = netIncome >= 0;

  return (
    <ReportShell
      title="قائمة الأرباح والخسائر"
      subtitle={`${periodText} · ${year}`}
      documentTitle={documentTitle}
      periodSummary={{
        eyebrow: 'Profit & Loss',
        title: periodText,
        subtitle: `${revenues.length + expenses.length} بند`,
        hint: isProfit ? 'صافي ربح' : 'صافي خسارة',
        badge: isProfit ? 'ربح' : 'خسارة',
      }}
      metaCells={[
        { label: 'إجمالي الإيرادات', moneyAmount: totalRevenues, adaptiveMoney: true },
        { label: 'إجمالي المصروفات', moneyAmount: totalExpenses, adaptiveMoney: true },
      ]}
    >
      <LineSection title="الإيرادات" rows={revenues} tone="revenue" />
      <LineSection title="المصروفات" rows={expenses} tone="expense" />

      <View
        style={[
          pdfReportTable.totalBar,
          !isProfit ? pdfReportTable.totalBarWarn : {},
        ]}
        wrap={false}
      >
        <View style={pdfReportTable.totalCluster}>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('صافي')}</Text>
            <PdfReportMoney amount={Math.abs(netIncome)} bold />
          </View>
        </View>
        <Text style={pdfReportTable.totalLabel}>
          {ar(isProfit ? 'صافي الربح التشغيلي' : 'صافي الخسارة التشغيلية')}
        </Text>
      </View>

      <PdfReportCaption />
    </ReportShell>
  );
}
