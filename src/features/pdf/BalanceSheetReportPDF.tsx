// @ts-nocheck
import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { PDF } from './pdfBase';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';

const W = { balance: '22%', name: '58%', code: '20%' };

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
  documentTitle?: string;
};

function SectionBlock({
  title,
  rows,
}: {
  title: string;
  rows: BalanceSheetReportPdfProps['assets'];
}) {
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + Number(r.balance || 0), 0);
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={pdfReportTable.sectionBand}>
        <Text style={pdfReportTable.sectionBandText}>{ar(title)}</Text>
      </View>
      <View style={pdfReportTable.tableWrap}>
        <View style={pdfReportTable.tableHead} wrap={false}>
          <Text style={[pdfReportTable.th, { width: W.balance }]}>{ar('الرصيد')}</Text>
          <Text style={[pdfReportTable.thAr, { width: W.name }]}>{ar('الحساب')}</Text>
          <Text style={[pdfReportTable.thAr, { width: W.code }]}>{ar('الرمز')}</Text>
        </View>
        {rows.map((r, i) => (
          <View
            key={r.category_code}
            style={[pdfReportTable.tableRow, i % 2 === 1 ? pdfReportTable.rowAlt : {}]}
          >
            <View style={[pdfReportTable.tdNum, { width: W.balance }]}>
              <PdfReportMoney amount={Number(r.balance)} />
            </View>
            <Text style={[pdfReportTable.tdAr, { width: W.name }]}>{ar(r.category_name)}</Text>
            <Text style={[pdfReportTable.tdMuted, { width: W.code }]}>{r.category_code}</Text>
          </View>
        ))}
        <View style={[pdfReportTable.tableRow, { backgroundColor: PDF.logoGreenSoft }]}>
          <View style={[pdfReportTable.tdNum, { width: W.balance }]}>
            <PdfReportMoney amount={total} bold />
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

export function BalanceSheetReportPDF({
  asOf,
  assets,
  liabilities,
  equity,
  summary,
  documentTitle,
}: BalanceSheetReportPdfProps) {
  const balanced =
    Math.abs(summary.totalAssets - (summary.totalLiab + summary.totalEquity)) < 0.01;
  const periodLabel = `حتى ${asOf}`;

  return (
    <ReportShell
      title="الميزانية العمومية"
      subtitle={periodLabel}
      documentTitle={documentTitle}
      periodSummary={{
        eyebrow: 'Balance Sheet',
        title: periodLabel,
        subtitle: 'الأصول = الخصوم + حقوق الملكية',
        hint: balanced ? 'المعادلة محققة' : 'يوجد فارق — مراجعة',
        badge: balanced ? 'متوازنة' : 'مراجعة',
      }}
      metaCells={[
        { label: 'إجمالي الأصول', moneyAmount: summary.totalAssets, adaptiveMoney: true },
        {
          label: 'الخصوم + حقوق الملكية',
          moneyAmount: summary.totalLiab + summary.totalEquity,
          adaptiveMoney: true,
        },
      ]}
    >
      <SectionBlock title="الأصول" rows={assets} />
      <SectionBlock title="الخصوم" rows={liabilities} />
      <SectionBlock title="حقوق الملكية" rows={equity} />

      <View
        style={[pdfReportTable.totalBar, !balanced ? pdfReportTable.totalBarWarn : {}]}
        wrap={false}
      >
        <View style={pdfReportTable.totalCluster}>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('أصول')}</Text>
            <PdfReportMoney amount={summary.totalAssets} bold />
          </View>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('خصوم+ملكية')}</Text>
            <PdfReportMoney amount={summary.totalLiab + summary.totalEquity} bold />
          </View>
        </View>
        <Text style={pdfReportTable.totalLabel}>
          {ar(balanced ? 'الميزانية متوازنة' : 'الميزانية غير متوازنة')}
        </Text>
      </View>

      <PdfReportCaption />
    </ReportShell>
  );
}
