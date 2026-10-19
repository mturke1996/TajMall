// @ts-nocheck
import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { PDF } from './pdfBase';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';

/**
 * Page-break rules (the table itself is unchanged):
 * - a row never splits across pages, and the column titles repeat on every page the table runs over;
 * - the table is cut in two: everything above the last TAIL_ROWS rows, and a tail that holds those rows, the
 *   total bar and the caption as one block. So the total bar is never alone on a page;
 * - the frame is open at the cut, so the two halves read as one table when they share a page;
 * - the gap under the table belongs to the block that follows it (margin-top), never to the table
 *   (margin-bottom): react-pdf counts a bottom margin as room the block still needs, so a table that fitted the
 *   page by less than 16pt used to be moved whole to the next page and left the rest of this one empty.
 */
const TAIL_ROWS = 2;
const FRAME_OPEN_BOTTOM = {
  borderBottomWidth: 0,
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  marginBottom: 0,
};
const FRAME_OPEN_TOP = {
  borderTopWidth: 0,
  borderTopLeftRadius: 0,
  borderTopRightRadius: 0,
  marginBottom: 0,
};

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

  const body = rows.map((r, i) => (
    <View
      key={`${r.tenant_name}-${i}`}
      style={[pdfReportTable.tableRow, i % 2 === 1 ? pdfReportTable.rowAlt : {}]}
      wrap={false}
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
  ));
  const tailFrom = Math.max(0, body.length - TAIL_ROWS);

  const head = (
    <View style={pdfReportTable.tableHead} wrap={false} {...(tailFrom > 0 ? { fixed: true } : {})}>
      <Text style={[pdfReportTable.th, { width: W.total }]}>{ar('الإجمالي')}</Text>
      <Text style={[pdfReportTable.th, { width: W.b90 }]}>{ar('+60')}</Text>
      <Text style={[pdfReportTable.th, { width: W.b60 }]}>{ar('31–60')}</Text>
      <Text style={[pdfReportTable.th, { width: W.b30 }]}>{ar('1–30')}</Text>
      <Text style={[pdfReportTable.th, { width: W.current }]}>{ar('جاري')}</Text>
      <Text style={[pdfReportTable.th, { width: W.shop }]}>{ar('محل')}</Text>
      <Text style={[pdfReportTable.thAr, { width: W.tenant }]}>{ar('المستأجر')}</Text>
    </View>
  );

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
        { label: 'إجمالي المستحقات', moneyAmount: summary.totalOutstanding, adaptiveMoney: true },
      ]}
    >
      {tailFrom > 0 ? (
        <View style={[pdfReportTable.tableWrap, FRAME_OPEN_BOTTOM]}>
          {head}
          {body.slice(0, tailFrom)}
        </View>
      ) : null}
      <View wrap={false}>
        <View style={[pdfReportTable.tableWrap, tailFrom > 0 ? FRAME_OPEN_TOP : { marginBottom: 0 }]}>
          {tailFrom > 0 ? null : head}
          {body.slice(tailFrom)}
        </View>

        <View style={[pdfReportTable.totalBar, { marginTop: 16 }]}>
          <View style={pdfReportTable.totalCluster}>
            <View style={pdfReportTable.totalMini}>
              <Text style={pdfReportTable.totalMiniLabel}>{ar('مستأجرين')}</Text>
              <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#FBF8F1' }}>
                {ar(String(summary.tenantCount))}
              </Text>
            </View>
            <View style={pdfReportTable.totalMini}>
              <Text style={pdfReportTable.totalMiniLabel}>{ar('إجمالي')}</Text>
              {/* light: the dark digits were unreadable on the dark bar */}
              <PdfReportMoney amount={summary.totalOutstanding} bold light />
            </View>
          </View>
          <Text style={pdfReportTable.totalLabel}>{ar('إجمالي ذمم المستأجرين')}</Text>
        </View>

        <PdfReportCaption />
      </View>
    </ReportShell>
  );
}
