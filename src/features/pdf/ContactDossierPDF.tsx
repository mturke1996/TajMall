// @ts-nocheck
/**
 * ملف جهة اتصال — مستأجر (إيجار) أو عميل/مورد/موظف (حركة مالية مربوطة).
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
import { contactKindLabelAr } from '@/lib/party-contacts';
import { extractContactBusinessRole, CONTACT_ROLES } from '@/lib/contacts/contact-roles';
import type { ContactRow } from '@/lib/db/types';
import type { TransactionWithRelations } from '@/lib/db/types';
import type { TenantRentSummary } from '@/lib/db/queries';


const s = StyleSheet.create({
  summaryRow: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  summaryCard: {
    width: '31%',
    minWidth: 100,
    padding: 10,
    backgroundColor: PDF.logoGreenSoft,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: PDF.border,
    direction: 'rtl',
  },
  summaryLabel: { fontSize: 8, color: PDF.muted, marginBottom: 4, textAlign: 'right' },
  summaryValue: { fontSize: 11, color: PDF.text, fontWeight: 'bold', textAlign: 'right' },
  infoGrid: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
    padding: 12,
    backgroundColor: PDF.rowAlt,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: PDF.border,
  },
  infoCell: { width: '48%', direction: 'rtl' },
  infoLabel: { fontSize: 8, color: PDF.muted, marginBottom: 2, textAlign: 'right' },
  infoValue: { fontSize: 10, color: PDF.text, textAlign: 'right' },
  table: {
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 4,
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
  rowAlt: { backgroundColor: PDF.rowAlt },
  td: { fontSize: 8.5, color: PDF.text, textAlign: 'center' },
  tdRight: { textAlign: 'right', paddingRight: 4 },
  colDate: { width: '14%' },
  colAmt: { width: '16%' },
  colMethod: { width: '12%' },
  colKind: { width: '12%' },
  colBank: { width: '18%' },
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

const KIND_AR: Record<string, string> = {
  REVENUE: 'إيراد',
  EXPENSE: 'مصروف',
  TRANSFER: 'تحويل',
  OPENING: 'افتتاحي',
  ADJUSTMENT: 'تسوية',
};

export type ContactDossierPdfProps = {
  contact: ContactRow;
  rent: TenantRentSummary | null;
  transactions: TransactionWithRelations[];
};

export function ContactDossierPDF({ contact, rent, transactions }: ContactDossierPdfProps) {
  const role = extractContactBusinessRole(contact);
  const roleMeta = CONTACT_ROLES[role] || CONTACT_ROLES.OTHER;
  const isTenant = role === 'TENANT';
  const isLandlord = role === 'LANDLORD';
  const kindLabel = roleMeta.label;

  const posted = transactions
    .filter((t) => t.status === 'POSTED')
    .sort((a, b) => (b.tx_date > a.tx_date ? 1 : -1));

  const rentPayments = isTenant
    ? posted
        .filter((t) => t.kind === 'REVENUE')
        .filter(
          (t) =>
            isRentCategoryCode(t.category?.code) ||
            !t.category?.code,
        )
    : [];

  const partyRows = isTenant ? rentPayments : posted;

  const revenueTotal = posted
    .filter((t) => t.kind === 'REVENUE')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const expenseTotal = posted
    .filter((t) => t.kind === 'EXPENSE')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalPaid = partyRows.reduce((sum, t) => sum + Number(t.amount || 0), 0);
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

  const title = isTenant
    ? `ملف المستأجر — ${contact.name}`
    : isLandlord
      ? `ملف المؤجر للمول — ${contact.name}`
      : `ملف ${kindLabel} — ${contact.name}`;

  const subtitle = isLandlord
    ? `${contact.shop_number ? `موقع: ${contact.shop_number} · ` : ''}إيجار مستحق: ${pdfFormatAmountRaw(Number(contact.monthly_rent) || 0)} د.ل/شهر`
    : contact.shop_number
      ? `محل ${contact.shop_number}${contact.floor ? ` · طابق ${contact.floor}` : ''}`
      : contact.job_title
        ? `${contact.job_title}${contact.department ? ` · ${contact.department}` : ''}`
        : kindLabel;


  const metaCells = isTenant
    ? [
        { label: 'الهاتف', value: contact.phone ?? '—' },
        { label: 'الإيجار الشهري', moneyAmount: Number(contact.monthly_rent) || 0 },
        { label: 'إجمالي التحصيلات', moneyAmount: totalPaid },
        { label: 'عدد الدفعات', value: pdfFmtNum(partyRows.length) },
      ]
    : [
        { label: 'النوع', value: kindLabel },
        { label: 'الهاتف', value: contact.phone ?? '—' },
        { label: 'إجمالي الإيراد', moneyAmount: revenueTotal },
        { label: 'إجمالي المصروف', moneyAmount: expenseTotal },
        {
          label: 'صافي الحركة',
          moneyAmount: revenueTotal - expenseTotal,
          adaptiveMoney: true,
        },
      ];

  return (
    <ReportShell
      title={ar(title)}
      subtitle={ar(subtitle)}
      documentTitle={title}
      metaCells={metaCells}
    >
      {isTenant && rent ? (
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
      ) : null}

      {!isTenant ? (
        <View style={s.summaryRow}>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>{ar('إيرادات مرتبطة')}</Text>
            <PdfMoneyText amount={revenueTotal} style={s.summaryValue} />
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>{ar('مصروفات مرتبطة')}</Text>
            <PdfMoneyText amount={expenseTotal} style={s.summaryValue} />
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>{ar('عدد الحركات')}</Text>
            <Text style={s.summaryValue}>{ar(pdfFmtNum(partyRows.length))}</Text>
          </View>
        </View>
      ) : null}

      <Text style={pdfBase.sectionTitle}>{ar('البيانات الأساسية')}</Text>
      <View style={s.infoGrid}>
        <View style={s.infoCell}>
          <Text style={s.infoLabel}>{ar('النوع')}</Text>
          <Text style={s.infoValue}>{ar(kindLabel)}</Text>
        </View>
        {contact.phone ? (
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>{ar('الهاتف')}</Text>
            <Text style={s.infoValue}>{contact.phone}</Text>
          </View>
        ) : null}
        {contact.code ? (
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>{ar('الرمز')}</Text>
            <Text style={s.infoValue}>{contact.code}</Text>
          </View>
        ) : null}
        {isTenant && contact.monthly_rent ? (
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>{ar('الإيجار الشهري')}</Text>
            <PdfMoneyText amount={Number(contact.monthly_rent)} style={s.infoValue} />
          </View>
        ) : null}
        {contact.kind === 'EMPLOYEE' && contact.salary ? (
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>{ar('الراتب الشهري')}</Text>
            <PdfMoneyText amount={Number(contact.salary)} style={s.infoValue} />
          </View>
        ) : null}
        {contact.notes ? (
          <View style={[s.infoCell, { width: '100%' }]}>
            <Text style={s.infoLabel}>{ar('ملاحظات')}</Text>
            <Text style={s.infoValue}>{ar(contact.notes)}</Text>
          </View>
        ) : null}
      </View>

      <Text style={pdfBase.sectionTitle}>
        {ar(isTenant ? 'دفعات الإيجار والتحصيل' : 'المعاملات المرتبطة')}
      </Text>

      {partyRows.length === 0 ? (
        <View style={s.table}>
          <Text style={s.empty}>
            {ar(isTenant ? 'لا توجد دفعات إيجار مسجّلة' : 'لا توجد معاملات مرتبطة بهذه الجهة')}
          </Text>
        </View>
      ) : (
        <View style={s.table}>
          <View style={s.head} wrap={false}>
            <Text style={[s.th, s.colDesc]}>{ar(isTenant ? 'البيان / الشهر' : 'البيان')}</Text>
            {!isTenant ? <Text style={[s.th, s.colKind]}>{ar('النوع')}</Text> : null}
            <Text style={[s.th, s.colBank]}>{ar(isTenant ? 'المصرف / الخزينة' : 'البند')}</Text>
            <Text style={[s.th, s.colMethod]}>{ar('الدفع')}</Text>
            <Text style={[s.th, s.colAmt]}>{ar('المبلغ')}</Text>
            <Text style={[s.th, s.colDate]}>{ar('التاريخ')}</Text>
          </View>
          {partyRows.map((tx, i) => (
            <View
              key={tx.id}
              style={[s.row, i % 2 === 1 ? s.rowAlt : {}]}
              wrap={false}
            >
              <Text style={[s.td, s.colDesc, s.tdRight]}>
                {ar(tx.description || tx.category?.name_ar || (isTenant ? 'إيجار' : '—'))}
              </Text>
              {!isTenant ? (
                <Text style={[s.td, s.colKind]}>
                  {ar(KIND_AR[tx.kind] ?? tx.kind)}
                </Text>
              ) : null}
              <Text style={[s.td, s.colBank, s.tdRight]}>
                {ar(
                  isTenant
                    ? formatPaymentBankOrSource(tx)
                    : tx.category?.name_ar || tx.cashbox?.name_ar || '—',
                )}
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
            <Text style={[s.footLabel, s.colDesc]}>
              {ar(isTenant ? 'إجمالي الدفعات' : 'إجمالي الحركات')}
            </Text>
            {!isTenant ? <Text style={s.colKind} /> : null}
            <Text style={s.colBank} />
            <Text style={s.colMethod} />
            <View style={s.colAmt}>
              <PdfMoneyText amount={totalPaid} style={{ fontSize: 10, fontWeight: 'bold' }} />
            </View>
            <Text style={s.colDate} />
          </View>
        </View>
      )}

      <Text style={pdfBase.caption}>
        {ar('وثيقة مُولَّدة آلياً من منظومة تاج مول')}
      </Text>
    </ReportShell>
  );
}
