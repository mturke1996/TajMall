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
import type { TenantRentSummary } from '@/lib/db/queries';

const STATUS_AR: Record<string, string> = {
  paid_full: 'مدفوع',
  paid_partial: 'جزئي',
  unpaid: 'غير مدفوع',
  no_rent_set: 'بلا إيجار',
};

const col = StyleSheet.create({
  row: {
    direction: 'rtl',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
  },
  rowAlt: { backgroundColor: PDF.rowAlt },
  head: {
    direction: 'rtl',
    flexDirection: 'row',
    backgroundColor: PDF.headerBg,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
  },
  th: { color: PDF.white, fontSize: 8.5, fontWeight: 'bold' },
  td: { fontSize: 8.5, color: PDF.text },
  tdMuted: { fontSize: 8, color: PDF.muted },
  
  shop: { width: '13%', textAlign: 'center' },
  tenant: { flex: 1, textAlign: 'right', paddingRight: 4 },
  rent: { width: '14%', textAlign: 'center' },
  paid: { width: '14%', textAlign: 'center' },
  remaining: { width: '14%', textAlign: 'center' },
  status: { width: '15%', textAlign: 'center' },
  phone: { width: '15%', textAlign: 'center' },
  
  foot: {
    direction: 'ltr',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 1.5,
    borderTopColor: PDF.primary,
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

      {/* ترتيب الأعمدة يطابق القراءة من اليمين للشمال */}
      <View style={col.head} wrap={false}>
        <Text style={[col.th, col.phone]}>{ar('الهاتف')}</Text>
        <Text style={[col.th, col.status]}>{ar('الحالة')}</Text>
        <Text style={[col.th, col.remaining]}>{ar('المتبقي')}</Text>
        <Text style={[col.th, col.paid]}>{ar('المسدد')}</Text>
        <Text style={[col.th, col.rent]}>{ar('الإيجار المطلوب')}</Text>
        <Text style={[col.th, col.tenant]}>{ar('المستأجر')}</Text>
        <Text style={[col.th, col.shop]}>{ar('المحل')}</Text>
      </View>

      {rows.map((r, i) => {
        const rent = Number(r.monthly_rent) || 0;
        const paid = Number(r.current_month_paid) || 0;
        const remaining = Math.max(0, rent - paid);
        const shopLabel = r.shop_number 
          ? (r.floor ? `${r.shop_number} (ط ${r.floor})` : r.shop_number) 
          : '—';

        return (
          <View key={r.id} style={[col.row, i % 2 === 1 ? col.rowAlt : {}]} wrap={false}>
            <Text style={[col.tdMuted, col.phone]}>{ar(r.phone ?? '—')}</Text>
            <Text style={[col.td, col.status]}>{ar(STATUS_AR[r.current_month_status] ?? r.current_month_status)}</Text>
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
            <Text style={[col.td, col.shop]}>{ar(shopLabel)}</Text>
          </View>
        );
      })}

      <View style={col.foot} wrap={false}>
        <PdfMoneyText amount={totalCollected} style={{ fontSize: 11, fontWeight: 'bold' }} />
        <Text style={pdfBase.footLabel}>{ar('إجمالي المحصل')}</Text>
      </View>

      <Text style={pdfBase.caption}>{ar('وثيقة مُولَّدة آلياً من منظومة إدارة مول تاج مول')}</Text>
    </ReportShell>
  );
}
