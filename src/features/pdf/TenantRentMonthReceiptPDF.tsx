// @ts-nocheck
/**
 * واصل استلام إيجار — شهر واحد (كامل أو جزء من الإيجار)
 */
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar, arDateParts } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PdfMoneyText, pdfFmtDate } from './pdfBrandKit';
import type { TenantRentMonthReceiptModel } from '@/lib/tenant-rent-pdf';

const TONE_BG: Record<string, string> = {
  paid: PDF.logoGreenSoft,
  partial: '#fffbeb',
  unpaid: '#fef2f2',
  neutral: PDF.rowAlt,
};

const TONE_BORDER: Record<string, string> = {
  paid: PDF.primary,
  partial: '#d97706',
  unpaid: '#dc2626',
  neutral: PDF.border,
};

const s = StyleSheet.create({
  statusBar: {
    direction: 'rtl',
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  statusTitle: { fontSize: 10, fontWeight: 'bold', textAlign: 'right', marginBottom: 4 },
  statusSub: { fontSize: 9, color: PDF.muted, textAlign: 'right' },
  grid: {
    direction: 'rtl',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  row: {
    direction: 'rtl',
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  label: { width: '38%', fontSize: 9, color: PDF.muted, textAlign: 'right' },
  value: { flex: 1, fontSize: 10, color: PDF.text, textAlign: 'right', fontWeight: 'bold' },
  amounts: {
    direction: 'rtl',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  amountCard: {
    width: '31%',
    minWidth: 90,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: PDF.border,
    backgroundColor: PDF.rowAlt,
  },
  amountLabel: { fontSize: 8, color: PDF.muted, marginBottom: 4, textAlign: 'right' },
  table: {
    direction: 'rtl',
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 6,
  },
  head: {
    flexDirection: 'row',
    backgroundColor: PDF.primary,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  th: { flex: 1, fontSize: 8.5, color: PDF.white, fontWeight: 'bold', textAlign: 'center' },
  trow: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
  },
  td: { flex: 1, fontSize: 8.5, color: PDF.text, textAlign: 'center' },
  foot: {
    marginTop: 8,
    padding: 10,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 2,
    borderTopColor: PDF.primary,
    alignItems: 'center',
  },
  notes: { marginTop: 6, fontSize: 8, color: PDF.muted, lineHeight: 1.5, textAlign: 'right' },
  // the three section titles sit closer to what they head, so the receipt stays on one page with a few collection entries
  section: { marginTop: 6, marginBottom: 6 },
});

/**
 * Page-break rules for the collection entries table (the table itself is unchanged):
 * - the column titles repeat on every page the table runs over, and a heading never sits alone at the foot of a page;
 * - the table is cut in two: everything above the last TAIL_ROWS entries, and a tail that holds those entries, the
 *   total box and the note as one block, so the total is never alone on a page;
 * - the frame is open at the cut, so the two halves read as one table when they share a page.
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
  marginTop: 0,
};

export type TenantRentMonthReceiptPdfProps = {
  receipt: TenantRentMonthReceiptModel;
};

export function TenantRentMonthReceiptPDF({ receipt }: TenantRentMonthReceiptPdfProps) {
  const dueParts = arDateParts(receipt.due_date);
  const tone = receipt.status_tone;
  const canIssueAsReceipt = receipt.total_paid > 0;

  const entries = receipt.journal_lines.map((line, i) => (
    <View key={i} style={s.trow} wrap={false}>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <PdfMoneyText amount={line.amount} style={s.td} />
      </View>
      <Text style={s.td}>{pdfFmtDate(line.entry_date)}</Text>
      <Text style={s.td}>{ar(`#${line.number}`)}</Text>
    </View>
  ));
  const tailFrom = Math.max(0, entries.length - TAIL_ROWS);
  const tableHead = (
    <View style={s.head} wrap={false} {...(tailFrom > 0 ? { fixed: true } : {})}>
      <Text style={s.th}>{ar('المبلغ')}</Text>
      <Text style={s.th}>{ar('التاريخ')}</Text>
      <Text style={s.th}>{ar('رقم القيد')}</Text>
    </View>
  );

  return (
    <ReportShell
      title="واصل استلام إيجار"
      titleEn="RECEIPT"
      subtitle="مستند تحصيل رسمي — تاج مول"
      summaryPrimaryDateIso={`${receipt.due_date}T12:00:00.000Z`}
      summaryPrimaryDateLabel="شهر الإيجار"
      metaCells={[
        { label: 'المستأجر', value: receipt.tenant_name },
        {
          label: 'المحل',
          value: receipt.shop_number
            ? `محل ${receipt.shop_number}${receipt.unit_floor ? ` · طابق ${receipt.unit_floor}` : ''}`
            : '—',
        },
        { label: 'شهر الإيجار', value: receipt.month_label },
        { label: 'الحالة', value: receipt.status_label },
      ]}
    >
      <View
        style={[
          s.statusBar,
          {
            backgroundColor: TONE_BG[tone] ?? TONE_BG.neutral,
            borderColor: TONE_BORDER[tone] ?? TONE_BORDER.neutral,
          },
        ]}
      >
        <Text
          style={[
            s.statusTitle,
            tone === 'partial' && { color: '#92400e' },
            tone === 'paid' && { color: '#065f46' },
            tone === 'unpaid' && { color: '#991b1b' },
          ]}
        >
          {ar(receipt.status_label)}
        </Text>
        <Text style={s.statusSub}>
          {ar(
            receipt.status_tone === 'partial'
              ? `تم تحصيل جزء من إيجار ${receipt.month_label} — يتبقى على المستأجر مبلغ مستحق`
              : receipt.status_tone === 'paid'
                ? `تم استلام إيجار ${receipt.month_label} بالكامل`
                : `مطالبة إيجار ${receipt.month_label} — لم يُسدَّد بعد`,
          )}
        </Text>
      </View>

      <Text style={[pdfBase.sectionTitle, s.section]}>{ar('بيانات المستأجر')}</Text>
      <View style={s.grid}>
        <View style={s.row}>
          <Text style={s.label}>{ar('البيان')}</Text>
          <Text style={[s.value, { direction: 'rtl' }]}>{ar(receipt.description)}</Text>
        </View>
        {receipt.phone ? (
          <View style={s.row}>
            <Text style={s.label}>{ar('الهاتف')}</Text>
            <Text style={[s.value, pdfBase.phoneText]}>{receipt.phone}</Text>
          </View>
        ) : null}
        <View style={s.row}>
          <Text style={s.label}>{ar('تاريخ الاستحقاق')}</Text>
          <Text style={[s.value, { direction: 'rtl' }]}>
            {dueParts ? `${dueParts.day} ${dueParts.monthYear}` : pdfFmtDate(receipt.due_date)}
          </Text>
        </View>
      </View>

      <Text style={[pdfBase.sectionTitle, s.section]}>{ar('تفاصيل المبالغ')}</Text>
      <View style={s.amounts}>
        <View style={s.amountCard}>
          <Text style={s.amountLabel}>{ar('إيجار الشهر')}</Text>
          <PdfMoneyText amount={receipt.amount} style={{ fontSize: 11, fontWeight: 'bold' }} />
        </View>
        <View style={[s.amountCard, { backgroundColor: '#ecfdf5' }]}>
          <Text style={s.amountLabel}>{ar('المسدّد')}</Text>
          <PdfMoneyText amount={receipt.total_paid} style={{ fontSize: 11, fontWeight: 'bold' }} />
        </View>
        {receipt.remaining > 0 ? (
          <View style={[s.amountCard, { backgroundColor: '#fffbeb', borderColor: '#d97706' }]}>
            <Text style={s.amountLabel}>{ar('المتبقي')}</Text>
            <PdfMoneyText amount={receipt.remaining} style={{ fontSize: 11, fontWeight: 'bold' }} />
          </View>
        ) : null}
      </View>

      {entries.length > 0 ? (
        <Text style={[pdfBase.sectionTitle, s.section]} minPresenceAhead={70}>
          {ar('قيود التحصيل المرتبطة')}
        </Text>
      ) : null}
      {entries.length > 0 && tailFrom > 0 ? (
        <View style={[s.table, FRAME_OPEN_BOTTOM]}>
          {tableHead}
          {entries.slice(0, tailFrom)}
        </View>
      ) : null}
      <View wrap={false}>
        {entries.length > 0 ? (
          <View style={[s.table, tailFrom > 0 ? FRAME_OPEN_TOP : {}]}>
            {tailFrom > 0 ? null : tableHead}
            {entries.slice(tailFrom)}
          </View>
        ) : null}

        {canIssueAsReceipt ? (
          <View style={s.foot}>
            <Text style={{ fontSize: 9, color: PDF.muted }}>{ar('إجمالي المحصّل لهذا الشهر')}</Text>
            <PdfMoneyText
              amount={receipt.total_paid}
              style={{ fontSize: 12, fontWeight: 'bold' }}
            />
          </View>
        ) : null}

        <Text style={s.notes}>
          {ar(
            canIssueAsReceipt
              ? 'هذا الواصل يُثبت المبالغ المسجّلة في نظام تاج مول. عند اكتمال سداد الشهر يُحدَّث الواصل تلقائياً إلى «مدفوع بالكامل».'
              : 'لا يُصدر واصل تحصيل قبل تسجيل دفعة إيجار على هذا الشهر.',
          )}
        </Text>
      </View>
    </ReportShell>
  );
}
