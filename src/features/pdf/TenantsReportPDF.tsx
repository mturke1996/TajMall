// @ts-nocheck
/**
 * تقرير المستأجرين وإيجارات المحلات — عربي مع خط Tajawal والنص المنطقي.
 */
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PdfMoneyText, pdfFmtNum } from './pdfBrandKit';
import { PDF_TABLE_ROW } from './pdfTable';
import type { TenantRentSummary } from '@/lib/db/queries';

const STATUS_AR: Record<string, string> = {
  paid_full: 'مدفوع',
  paid_partial: 'جزئي',
  unpaid: 'غير مدفوع',
  no_rent_set: 'بلا إيجار',
};

/** أعمدة: هاتف | حالة | متبقي | مسدد | إيجار | مستأجر | محل → المحل يميناً */
const col = StyleSheet.create({
  row: {
    ...PDF_TABLE_ROW,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
  },
  rowAlt: { backgroundColor: PDF.rowAlt },
  head: {
    ...PDF_TABLE_ROW,
    backgroundColor: PDF.headerBg,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
  },
  th: { color: PDF.white, fontSize: 8.5, fontWeight: 'bold', textAlign: 'center' },
  thAr: { color: PDF.white, fontSize: 8.5, fontWeight: 'bold', textAlign: 'right' },
  td: { fontSize: 8.5, color: PDF.text, textAlign: 'right' },
  tdMuted: { fontSize: 8, color: PDF.muted, textAlign: 'center' },
  shop: { width: '13%' },
  tenant: { flex: 1, paddingHorizontal: 4 },
  rent: { width: '14%' },
  paid: { width: '14%' },
  remaining: { width: '14%' },
  status: { width: '15%' },
  phone: { width: '15%' },
  foot: {
    ...PDF_TABLE_ROW,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 1.5,
    borderTopColor: PDF.primary,
  },
  footHint: {
    fontSize: 7,
    color: PDF.muted,
    textAlign: 'center',
    marginBottom: 2,
  },
  footLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: PDF.text,
    textAlign: 'right',
  },
});

export type TenantsReportPdfProps = {
  titleAr: string;
  subtitleAr?: string;
  rows: TenantRentSummary[];
};

export function TenantsReportPDF({ titleAr, subtitleAr, rows }: TenantsReportPdfProps) {
  const totalExpected = rows.reduce((s, r) => s + (Number(r.monthly_rent) || 0), 0);
  const totalCollected = rows.reduce((s, r) => s + (Number(r.current_month_paid) || 0), 0);
  const totalOutstanding = Math.max(0, totalExpected - totalCollected);
  const collectionRate = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0;

  return (
    <ReportShell
      title={titleAr}
      subtitle={subtitleAr}
      metaCells={[
        { label: 'عدد المستأجرين', value: pdfFmtNum(rows.length) },
        { label: 'معدل التحصيل', value: `${collectionRate.toFixed(1)}%` },
        { label: 'إجمالي المتأخرات', moneyAmount: totalOutstanding },
        { label: 'إجمالي المحصل', moneyAmount: totalCollected },
      ]}
    >
      <Text style={pdfBase.sectionTitle}>{ar('تفاصيل إيجارات المستأجرين')}</Text>

      <View style={col.head} wrap={false}>
        <Text style={[col.th, col.phone]}>{ar('الهاتف')}</Text>
        <Text style={[col.th, col.status]}>{ar('الحالة')}</Text>
        <Text style={[col.th, col.remaining]}>{ar('المتبقي')}</Text>
        <Text style={[col.th, col.paid]}>{ar('المسدد')}</Text>
        <Text style={[col.th, col.rent]}>{ar('الإيجار')}</Text>
        <Text style={[col.thAr, col.tenant]}>{ar('المستأجر')}</Text>
        <Text style={[col.th, col.shop]}>{ar('المحل')}</Text>
      </View>

      {rows.map((r, i) => {
        const rent = Number(r.monthly_rent) || 0;
        const paid = Number(r.current_month_paid) || 0;
        const remaining = Math.max(0, rent - paid);
        const shopLabel = r.shop_number
          ? r.floor
            ? `${r.shop_number} (ط ${r.floor})`
            : r.shop_number
          : '—';

        return (
          <View key={r.id} style={[col.row, i % 2 === 1 ? col.rowAlt : {}]} wrap={false}>
            <Text style={[col.tdMuted, col.phone]}>{ar(r.phone ?? '—')}</Text>
            <Text style={[col.tdMuted, col.status]}>
              {ar(STATUS_AR[r.current_month_status] ?? r.current_month_status)}
            </Text>
            <View style={col.remaining}>
              <PdfMoneyText amount={remaining} />
            </View>
            <View style={col.paid}>
              <PdfMoneyText amount={paid} />
            </View>
            <View style={col.rent}>
              <PdfMoneyText amount={rent} />
            </View>
            <Text style={[col.td, col.tenant]}>{ar(r.name)}</Text>
            <Text style={[col.tdMuted, col.shop]}>{ar(shopLabel)}</Text>
          </View>
        );
      })}

      <View style={col.foot} wrap={false}>
        <Text style={col.phone} />
        <Text style={col.status} />
        <View style={col.remaining}>
          <Text style={col.footHint}>{ar('متبقي')}</Text>
          <PdfMoneyText amount={totalOutstanding} style={{ fontSize: 10, fontWeight: 'bold' }} />
        </View>
        <View style={col.paid}>
          <Text style={col.footHint}>{ar('محصّل')}</Text>
          <PdfMoneyText amount={totalCollected} style={{ fontSize: 10, fontWeight: 'bold' }} />
        </View>
        <View style={col.rent}>
          <Text style={col.footHint}>{ar('مطلوب')}</Text>
          <PdfMoneyText amount={totalExpected} style={{ fontSize: 10, fontWeight: 'bold' }} />
        </View>
        <Text style={[col.footLabel, col.tenant]}>{ar('إجمالي الفترة')}</Text>
        <Text style={[col.tdMuted, col.shop]}>{pdfFmtNum(rows.length)}</Text>
      </View>

      <Text style={pdfBase.caption}>{ar('وثيقة مُولَّدة آلياً من منظومة إدارة مول تاج مول')}</Text>
    </ReportShell>
  );
}
