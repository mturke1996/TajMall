// @ts-nocheck
/**
 * ملف مستأجر — دفعات الإيجار فقط (بدون قيود يومية)
 */
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PdfMoneyText, pdfFmtNum, pdfFmtDate } from './pdfBrandKit';
import { PDF_TABLE_ROW } from './pdfTable';
import { pdfFormatAmountRaw } from './pdfMoney';
import {
  formatPaymentBankOrSource,
  formatPaymentMethodAr,
} from './pdf-payment';
import { isRentCategoryCode } from '@/lib/charge-invoice';
import type { ContactRow } from '@/lib/db/types';
import type { TransactionWithRelations } from '@/lib/db/types';
import type { TenantRentSummary } from '@/lib/db/queries';

const s = StyleSheet.create({
  summaryRow: {
    direction: 'rtl',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  summaryCard: {
    width: '31%',
    minWidth: 100,
    padding: 10,
    backgroundColor: PDF.logoGreenSoft,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: PDF.border,
  },
  summaryLabel: { fontSize: 8, color: PDF.muted, marginBottom: 4, textAlign: 'right' },
  summaryValue: { fontSize: 11, color: PDF.text, fontWeight: 'bold', textAlign: 'right' },
  infoGrid: {
    direction: 'rtl',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
    padding: 12,
    backgroundColor: PDF.rowAlt,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: PDF.border,
  },
  infoCell: { width: '48%' },
  infoLabel: { fontSize: 8, color: PDF.muted, marginBottom: 2, textAlign: 'right' },
  infoValue: { fontSize: 10, color: PDF.text, textAlign: 'right' },
  table: {
    direction: 'rtl',
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  head: {
    ...PDF_TABLE_ROW,
    backgroundColor: PDF.primary,
    paddingVertical: 9,
    paddingHorizontal: 8,
  },
  th: { color: PDF.white, fontSize: 8.5, fontWeight: 'bold', textAlign: 'center' },
  row: {
    ...PDF_TABLE_ROW,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
  },
  rowAlt: { backgroundColor: '#f8faf8' },
  td: { fontSize: 8.5, color: PDF.text, textAlign: 'center' },
  tdRight: { textAlign: 'right', paddingRight: 4 },
  colDate: { width: '14%' },
  colAmt: { width: '16%' },
  colMethod: { width: '14%' },
  colBank: { width: '22%' },
  colDesc: { flex: 1 },
  foot: {
    ...PDF_TABLE_ROW,
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 2,
    borderTopColor: PDF.primary,
  },
  footLabel: { fontSize: 10, color: PDF.text, fontWeight: 'bold', textAlign: 'right' },
  empty: {
    padding: 20,
    textAlign: 'center',
    fontSize: 9,
    color: PDF.muted,
  },
});

export type ContactDossierPdfProps = {
  contact: ContactRow;
  rent: TenantRentSummary | null;
  transactions: TransactionWithRelations[];
};

export function ContactDossierPDF({ contact, rent, transactions }: ContactDossierPdfProps) {
  const payments = transactions
    .filter((t) => t.kind === 'REVENUE' && t.status === 'POSTED')
    .filter(
      (t) =>
        isRentCategoryCode(t.category?.code) ||
        contact.kind !== 'TENANT' ||
        !t.category?.code,
    )
    .sort((a, b) => (b.tx_date > a.tx_date ? 1 : -1));

  const totalPaid = payments.reduce((s, t) => s + Number(t.amount || 0), 0);
  const openCount = Number(rent?.open_charges_count ?? 0);
  const openTotal = Number(rent?.open_charges_total ?? 0);

  const rentStatusAr =
    rent?.current_month_status === 'paid_full'
      ? 'مسدد'
      : rent?.current_month_status === 'paid_partial'
        ? 'جزئي'
        : rent?.current_month_status === 'no_rent_set'
          ? '—'
          : 'غير مسدد';

  return (
    <ReportShell
      title={ar(`ملف المستأجر — ${contact.name}`)}
      subtitle={ar(
        contact.shop_number
          ? `محل ${contact.shop_number}${contact.floor ? ` · طابق ${contact.floor}` : ''}`
          : 'تاج مول',
      )}
      metaCells={[
        { label: 'الهاتف', value: contact.phone ?? '—' },
        { label: 'الإيجار الشهري', moneyAmount: Number(contact.monthly_rent) || 0 },
        { label: 'إجمالي التحصيلات', moneyAmount: totalPaid },
        { label: 'عدد الدفعات', value: pdfFmtNum(payments.length) },
      ]}
    >
      {rent && (
        <View style={s.summaryRow}>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>{ar('حالة شهر الإيجار')}</Text>
            <Text style={s.summaryValue}>{ar(rentStatusAr)}</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>{ar('المسدد هذا الشهر')}</Text>
            <PdfMoneyText
              amount={Number(rent.current_month_paid) || 0}
              style={s.summaryValue}
            />
          </View>
          {openCount > 0 ? (
            <View style={[s.summaryCard, { backgroundColor: '#fef2f2' }]}>
              <Text style={s.summaryLabel}>{ar('مطالبات مفتوحة')}</Text>
              <Text style={[s.summaryValue, { color: '#b91c1c' }]}>
                {ar(`${pdfFormatAmountRaw(openCount)} مطالبة`)}
              </Text>
              <PdfMoneyText
                amount={openTotal}
                style={{ fontSize: 11, fontWeight: 'bold', color: '#b91c1c' }}
                currStyle={{ color: '#b91c1c', fontSize: 9 }}
                containerStyle={{ marginTop: 4 }}
                align="right"
              />
            </View>
          ) : null}
        </View>
      )}

      <Text style={pdfBase.sectionTitle}>{ar('البيانات الأساسية')}</Text>
      <View style={s.infoGrid}>
        {contact.phone ? (
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>{ar('الهاتف')}</Text>
            <Text style={s.infoValue}>{contact.phone}</Text>
          </View>
        ) : null}
        {contact.monthly_rent ? (
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>{ar('الإيجار الشهري')}</Text>
            <PdfMoneyText amount={Number(contact.monthly_rent)} style={s.infoValue} />
          </View>
        ) : null}
        {contact.notes ? (
          <View style={[s.infoCell, { width: '100%' }]}>
            <Text style={s.infoLabel}>{ar('ملاحظات')}</Text>
            <Text style={s.infoValue}>{contact.notes}</Text>
          </View>
        ) : null}
      </View>

      <Text style={pdfBase.sectionTitle}>{ar('دفعات الإيجار والتحصيل')}</Text>

      {payments.length === 0 ? (
        <View style={s.table}>
          <Text style={s.empty}>{ar('لا توجد دفعات إيجار مسجّلة')}</Text>
        </View>
      ) : (
        <View style={s.table}>
          <View style={s.head} wrap={false}>
            <Text style={[s.th, s.colDesc]}>{ar('البيان / الشهر')}</Text>
            <Text style={[s.th, s.colBank]}>{ar('المصرف / الخزينة')}</Text>
            <Text style={[s.th, s.colMethod]}>{ar('نوع الدفع')}</Text>
            <Text style={[s.th, s.colAmt]}>{ar('المبلغ')}</Text>
            <Text style={[s.th, s.colDate]}>{ar('التاريخ')}</Text>
          </View>
          {payments.map((tx, i) => (
            <View
              key={tx.id}
              style={[s.row, i % 2 === 1 ? s.rowAlt : {}]}
              wrap={false}
            >
              <Text style={[s.td, s.colDesc, s.tdRight]}>
                {tx.description || tx.category?.name_ar || 'إيجار'}
              </Text>
              <Text style={[s.td, s.colBank, s.tdRight]}>
                {ar(formatPaymentBankOrSource(tx))}
              </Text>
              <Text style={[s.td, s.colMethod]}>
                {ar(formatPaymentMethodAr(tx.method))}
              </Text>
              <View style={s.colAmt}>
                <PdfMoneyText amount={Number(tx.amount)} style={s.td} />
              </View>
              <Text style={[s.td, s.colDate]}>{pdfFmtDate(tx.tx_date)}</Text>
            </View>
          ))}
          <View style={s.foot} wrap={false}>
            <Text style={[s.footLabel, s.colDesc]}>{ar('إجمالي الدفعات')}</Text>
            <Text style={s.colBank} />
            <Text style={s.colMethod} />
            <View style={s.colAmt}>
              <PdfMoneyText amount={totalPaid} style={{ fontSize: 10, fontWeight: 'bold' }} />
            </View>
            <Text style={s.colDate} />
          </View>
        </View>
      )}
    </ReportShell>
  );
}
