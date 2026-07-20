// @ts-nocheck
import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { PDF } from './pdfBase';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';

const W = { amount: '24%', label: '76%' };

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
  documentTitle?: string;
};

function FlowSection({
  title,
  items,
  net,
}: {
  title: string;
  items: Array<{ description: string; amount: number; isPositive: boolean }>;
  net: number;
}) {
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={pdfReportTable.sectionBand}>
        <Text style={pdfReportTable.sectionBandText}>{ar(title)}</Text>
      </View>
      <View style={pdfReportTable.tableWrap}>
        {items.length === 0 ? (
          <View style={{ padding: 14, alignItems: 'center' }}>
            <Text style={pdfReportTable.tdMuted}>{ar('لا توجد بنود')}</Text>
          </View>
        ) : (
          items.map((item, idx) => (
            <View
              key={idx}
              style={[pdfReportTable.tableRow, idx % 2 === 1 ? pdfReportTable.rowAlt : {}]}
            >
              <View style={[pdfReportTable.tdNum, { width: W.amount }]}>
                <PdfReportMoney
                  amount={item.amount}
                  color={item.isPositive ? PDF.success : PDF.danger}
                />
              </View>
              <Text style={[pdfReportTable.tdAr, { width: W.label }]}>
                {ar(item.description)}
              </Text>
            </View>
          ))
        )}
        <View style={[pdfReportTable.tableRow, { backgroundColor: PDF.logoGreenSoft }]}>
          <View style={[pdfReportTable.tdNum, { width: W.amount }]}>
            <PdfReportMoney
              amount={net}
              color={net >= 0 ? PDF.success : PDF.danger}
              bold
            />
          </View>
          <Text style={[pdfReportTable.tdAr, { width: W.label, fontWeight: 'bold' }]}>
            {ar(`صافي ${title}`)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function CashFlowReportPDF({ year, data, documentTitle }: CashFlowReportPdfProps) {
  const s = data.summary || {
    openingBalance: 0,
    closingBalance: 0,
    netOperating: 0,
    netInvesting: 0,
    netFinancing: 0,
    netChange: 0,
  };
  const periodLabel = `السنة المالية ${year}`;

  return (
    <ReportShell
      title="قائمة التدفقات النقدية"
      subtitle={periodLabel}
      documentTitle={documentTitle}
      periodSummary={{
        eyebrow: 'Cash Flow',
        title: periodLabel,
        subtitle: `صافي التغير: ${s.netChange >= 0 ? '+' : ''}${s.netChange}`,
        hint: 'مصادر واستخدامات النقد',
      }}
      metaCells={[
        { label: 'رصيد افتتاحي', moneyAmount: s.openingBalance, adaptiveMoney: true },
        { label: 'رصيد ختامي', moneyAmount: s.closingBalance, adaptiveMoney: true },
      ]}
    >
      <View style={pdfReportTable.hero} wrap={false}>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('افتتاحي')}</Text>
          <PdfReportMoney amount={s.openingBalance} bold />
        </View>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('صافي التغير')}</Text>
          <PdfReportMoney amount={s.netChange} bold />
        </View>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('ختامي')}</Text>
          <PdfReportMoney amount={s.closingBalance} bold />
        </View>
      </View>

      <FlowSection title="الأنشطة التشغيلية" items={data.operating} net={s.netOperating} />
      <FlowSection title="الأنشطة الاستثمارية" items={data.investing} net={s.netInvesting} />
      <FlowSection title="الأنشطة التمويلية" items={data.financing} net={s.netFinancing} />

      <View style={pdfReportTable.totalBar} wrap={false}>
        <View style={pdfReportTable.totalCluster}>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('ختامي')}</Text>
            <PdfReportMoney amount={s.closingBalance} bold />
          </View>
        </View>
        <Text style={pdfReportTable.totalLabel}>{ar('النقد — نهاية الفترة')}</Text>
      </View>

      <PdfReportCaption />
    </ReportShell>
  );
}
