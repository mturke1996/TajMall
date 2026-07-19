// @ts-nocheck
/**
 * تقرير شهري لبند محاسبي — إيراد أو مصروف — عربي مع خط Tajawal والنص المنطقي.
 */
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PdfMoneyText, pdfFmtNum, pdfFmtDate } from './pdfBrandKit';
import { PDF_TABLE_ROW } from './pdfTable';
import type { TransactionWithRelations } from '@/lib/db/types';
import type { CategoryRow } from '@/lib/db/types';

const METHOD_AR: Record<string, string> = {
  CASH: 'نقدي',
  CHEQUE: 'صك',
  TRANSFER: 'حوالة',
  CARD: 'بطاقة',
};

const STATUS_AR: Record<string, string> = {
  POSTED: 'مرحّل',
  DRAFT: 'مسودة',
  VOIDED: 'ملغى',
  RECONCILED: 'مُسوّى',
};

const col = StyleSheet.create({
  row: {
    ...PDF_TABLE_ROW,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
  },
  rowAlt: { backgroundColor: PDF.rowAlt },
  head: {
    ...PDF_TABLE_ROW,
    backgroundColor: PDF.headerBg,
    paddingVertical: 7,
    paddingHorizontal: 6,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
  },
  th: { color: PDF.white, fontSize: 8.5, fontWeight: 'bold', textAlign: 'center' },
  thAr: { color: PDF.white, fontSize: 8.5, fontWeight: 'bold', textAlign: 'right' },
  td: { fontSize: 8.5, color: PDF.text, textAlign: 'right' },
  tdMuted: { fontSize: 8, color: PDF.muted, textAlign: 'center' },
  num: { width: '9%' },
  date: { width: '12%' },
  status: { width: '11%' },
  method: { width: '11%' },
  box: { width: '17%' },
  desc: { flex: 1, paddingHorizontal: 4 },
  amt: { width: '15%' },
  foot: {
    ...PDF_TABLE_ROW,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 1.5,
    borderTopColor: PDF.primary,
  },
  footLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: PDF.text,
    textAlign: 'right',
  },
});

export type CategoryMonthReportPdfProps = {
  category: Pick<CategoryRow, 'name_ar' | 'code' | 'type' | 'kind'> | null | undefined;
  monthKey: string;
  monthNameAr: string;
  rows: TransactionWithRelations[];
};

export function CategoryMonthReportPDF({
  category,
  monthKey,
  monthNameAr,
  rows,
}: CategoryMonthReportPdfProps) {
  const posted = rows.filter((r) => r.status === 'POSTED');
  const total = posted.reduce((s, r) => s + Number(r.amount || 0), 0);
  const isRevenue = category?.type === 'REVENUE' || category?.kind === 'REVENUE';
  const kindLabel = isRevenue ? 'إيراد' : 'مصروف';
  const totalLabel = isRevenue ? 'إجمالي الإيراد' : 'إجمالي المصروف';
  const catName = category?.name_ar ?? '—';
  const catCode = category?.code ?? '—';

  return (
    <ReportShell
      title={`تقرير ${kindLabel} شهري`}
      subtitle={`${catName} · ${monthNameAr} ${monthKey.slice(0, 4)}`}
      metaCells={[
        { label: 'البند', value: catName },
        { label: 'كود البند', value: catCode },
        { label: 'عدد المعاملات', value: pdfFmtNum(rows.length) },
        { label: totalLabel, moneyAmount: total },
      ]}
    >
      <Text style={pdfBase.sectionTitle}>{ar('تفاصيل المعاملات')}</Text>

      <View style={col.head} wrap={false}>
        <Text style={[col.thAr, col.desc]}>{ar('البيان')}</Text>
        <Text style={[col.th, col.amt]}>{ar('المبلغ')}</Text>
        <Text style={[col.th, col.method]}>{ar('الطريقة')}</Text>
        <Text style={[col.th, col.status]}>{ar('الحالة')}</Text>
        <Text style={[col.thAr, col.box]}>{ar('الخزينة')}</Text>
        <Text style={[col.th, col.date]}>{ar('التاريخ')}</Text>
        <Text style={[col.th, col.num]}>{ar('الرقم')}</Text>
      </View>

      {rows.length === 0 ? (
        <Text style={[pdfBase.caption, { marginTop: 12 }]}>
          {ar('لا توجد معاملات لهذا البند خلال الشهر المحدد')}
        </Text>
      ) : (
        rows.map((r, i) => (
          <View key={r.id} style={[col.row, i % 2 === 1 ? col.rowAlt : {}]} wrap={false}>
            <Text style={[col.td, col.desc]}>{ar(r.description ?? '—')}</Text>
            <View style={col.amt}>
              <PdfMoneyText amount={Number(r.amount)} />
            </View>
            <Text style={[col.tdMuted, col.method]}>{ar(METHOD_AR[r.method] ?? r.method)}</Text>
            <Text style={[col.tdMuted, col.status]}>{ar(STATUS_AR[r.status] ?? r.status)}</Text>
            <Text style={[col.td, col.box]}>{ar(r.cashbox?.name_ar ?? '—')}</Text>
            <Text style={[col.tdMuted, col.date]}>{pdfFmtDate(r.tx_date)}</Text>
            <Text style={[col.tdMuted, col.num]}>{pdfFmtNum(r.number)}</Text>
          </View>
        ))
      )}

      <View style={col.foot} wrap={false}>
        <Text style={[col.footLabel, col.desc]}>{ar(totalLabel)}</Text>
        <View style={col.amt}>
          <PdfMoneyText amount={total} style={{ fontSize: 11, fontWeight: 'bold' }} />
        </View>
        <Text style={col.method} />
        <Text style={col.status} />
        <Text style={col.box} />
        <Text style={col.date} />
        <Text style={[col.tdMuted, col.num]}>{pdfFmtNum(posted.length)}</Text>
      </View>

      <Text style={pdfBase.caption}>{ar('وثيقة مُولَّدة آلياً من منظومة تاج مول')}</Text>
    </ReportShell>
  );
}
