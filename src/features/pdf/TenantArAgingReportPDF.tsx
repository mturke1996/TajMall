// @ts-nocheck
import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { PDF } from './pdfBase';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';

const W = {
  total: '13%',
  b90: '11%',
  b60: '11%',
  b30: '11%',
  current: '11%',
  shop: '10%',
  tenant: '33%',
};

export type TenantArAgingReportPdfProps = {
  asOf: string;
  rows: Array<{
    tenant_name: string;
    shop_number: string | null;
    total_outstanding: number;
    bucket_current: number;
    bucket_30: number;
    bucket_60: number;
    bucket_90_plus: number;
  }>;
  summary: { totalOutstanding: number; tenantCount: number };
  documentTitle?: string;
};

export function TenantArAgingReportPDF({
  asOf,
  rows,
  summary,
  documentTitle,
}: TenantArAgingReportPdfProps) {
  const periodLabel = `حتى ${asOf}`;

  return (
    <ReportShell
      title="أعمار ذمم المستأجرين"
      subtitle={periodLabel}
      documentTitle={documentTitle}
      periodSummary={{
        eyebrow: 'AR Aging',
        title: periodLabel,
        subtitle: `${summary.tenantCount} مستأجر`,
        hint: 'تحليل المتأخرات حسب العمر',
      }}
      metaCells={[
        { label: 'عدد المستأجرين', value: String(summary.tenantCount) },
        { label: 'إجمالي المتأخرات', moneyAmount: summary.totalOutstanding, adaptiveMoney: true },
      ]}
    >
      <View style={pdfReportTable.tableWrap}>
        <View style={pdfReportTable.tableHead} wrap={false}>
          <Text style={[pdfReportTable.th, { width: W.total }]}>{ar('الإجمالي')}</Text>
          <Text style={[pdfReportTable.th, { width: W.b90 }]}>{ar('+60')}</Text>
          <Text style={[pdfReportTable.th, { width: W.b60 }]}>{ar('31–60')}</Text>
          <Text style={[pdfReportTable.th, { width: W.b30 }]}>{ar('1–30')}</Text>
          <Text style={[pdfReportTable.th, { width: W.current }]}>{ar('جاري')}</Text>
          <Text style={[pdfReportTable.th, { width: W.shop }]}>{ar('محل')}</Text>
          <Text style={[pdfReportTable.thAr, { width: W.tenant }]}>{ar('المستأجر')}</Text>
        </View>

        {rows.map((r, i) => (
          <View
            key={`${r.tenant_name}-${i}`}
            style={[pdfReportTable.tableRow, i % 2 === 1 ? pdfReportTable.rowAlt : {}]}
          >
            <View style={[pdfReportTable.tdNum, { width: W.total }]}>
              <PdfReportMoney amount={Number(r.total_outstanding)} bold />
            </View>
            <View style={[pdfReportTable.tdNum, { width: W.b90 }]}>
              <PdfReportMoney amount={r.bucket_90_plus} color={PDF.danger} />
            </View>
            <View style={[pdfReportTable.tdNum, { width: W.b60 }]}>
              <PdfReportMoney amount={r.bucket_60} />
            </View>
            <View style={[pdfReportTable.tdNum, { width: W.b30 }]}>
              <PdfReportMoney amount={r.bucket_30} />
            </View>
            <View style={[pdfReportTable.tdNum, { width: W.current }]}>
              <PdfReportMoney amount={r.bucket_current} />
            </View>
            <Text style={[pdfReportTable.tdMuted, { width: W.shop, fontSize: 7.5 }]}>
              {r.shop_number || '—'}
            </Text>
            <Text style={[pdfReportTable.tdAr, { width: W.tenant, fontSize: 8 }]}>
              {ar(r.tenant_name)}
            </Text>
          </View>
        ))}
      </View>

      <View style={pdfReportTable.totalBar} wrap={false}>
        <View style={pdfReportTable.totalCluster}>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('مستأجرين')}</Text>
            <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#FBF8F1' }}>
              {ar(String(summary.tenantCount))}
            </Text>
          </View>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('إجمالي')}</Text>
            <PdfReportMoney amount={summary.totalOutstanding} bold />
          </View>
        </View>
        <Text style={pdfReportTable.totalLabel}>{ar('إجمالي ذمم المستأجرين')}</Text>
      </View>

      <PdfReportCaption />
    </ReportShell>
  );
}
