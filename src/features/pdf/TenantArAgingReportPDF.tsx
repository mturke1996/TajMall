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
  th: { color: PDF.white, fontSize: 8, fontWeight: 'bold' },
  td: { fontSize: 8, color: PDF.text },
  tenant: { flex: 1, textAlign: 'right', paddingRight: 4 },
  shop: { width: '12%', textAlign: 'center' },
  bucket: { width: '13%', textAlign: 'center' },
  total: { width: '15%', textAlign: 'center' },
  foot: {
    direction: 'rtl',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 1.5,
    borderTopColor: PDF.primary,
  },
});

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
};

export function TenantArAgingReportPDF({ asOf, rows, summary }: TenantArAgingReportPdfProps) {
  return (
    <ReportShell
      title="تقرير أعمار ذمم المستأجرين"
      subtitle="تحليل المتأخرات حسب فترات الاستحقاق"
      summaryPrimaryDateIso={`${asOf}T12:00:00.000Z`}
      summaryPrimaryDateLabel="تاريخ التقرير"
      metaCells={[
        { label: 'عدد المستأجرين', value: pdfFmtNum(summary.tenantCount) },
        { label: 'إجمالي المتأخرات', moneyAmount: summary.totalOutstanding },
      ]}
    >
      <Text style={pdfBase.sectionTitle}>{ar('تفصيل الذمم المستحقة')}</Text>

      <View style={col.head} wrap={false}>
        <Text style={[col.th, col.total]}>{ar('الإجمالي')}</Text>
        <Text style={[col.th, col.bucket]}>{ar('+60 يوم')}</Text>
        <Text style={[col.th, col.bucket]}>{ar('31–60')}</Text>
        <Text style={[col.th, col.bucket]}>{ar('1–30')}</Text>
        <Text style={[col.th, col.bucket]}>{ar('جاري')}</Text>
        <Text style={[col.th, col.shop]}>{ar('المحل')}</Text>
        <Text style={[col.th, col.tenant]}>{ar('المستأجر')}</Text>
      </View>

      {rows.map((r, i) => (
        <View key={`${r.tenant_name}-${i}`} style={[col.row, i % 2 === 1 ? col.rowAlt : {}]} wrap={false}>
          <View style={col.total}>
            <PdfMoneyText amount={Number(r.total_outstanding)} />
          </View>
          <View style={col.bucket}>
            {r.bucket_90_plus > 0 ? <PdfMoneyText amount={r.bucket_90_plus} /> : <Text>—</Text>}
          </View>
          <View style={col.bucket}>
            {r.bucket_60 > 0 ? <PdfMoneyText amount={r.bucket_60} /> : <Text>—</Text>}
          </View>
          <View style={col.bucket}>
            {r.bucket_30 > 0 ? <PdfMoneyText amount={r.bucket_30} /> : <Text>—</Text>}
          </View>
          <View style={col.bucket}>
            {r.bucket_current > 0 ? <PdfMoneyText amount={r.bucket_current} /> : <Text>—</Text>}
          </View>
          <Text style={[col.td, col.shop]}>{r.shop_number || '—'}</Text>
          <Text style={[col.td, col.tenant]}>{ar(r.tenant_name)}</Text>
        </View>
      ))}

      <View style={col.foot} wrap={false}>
        <Text style={pdfBase.footLabel}>{ar('إجمالي الذمم:')}</Text>
        <PdfMoneyText amount={summary.totalOutstanding} style={{ fontSize: 10, fontWeight: 'bold' }} />
      </View>

      <Text style={pdfBase.caption}>{ar('وثيقة محاسبية مُولَّدة آلياً من منظومة تاج مول')}</Text>
    </ReportShell>
  );
}
