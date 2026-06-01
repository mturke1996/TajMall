// @ts-nocheck
/**
 * ملف جهة تعامل — معاملات، إيجار، قيود يومية
 */
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PdfMoneyText, pdfFmtNum, pdfFmtDate } from './pdfBrandKit';
import type { ContactRow } from '@/lib/db/types';
import type { TransactionWithRelations } from '@/lib/db/types';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import type { TenantRentSummary } from '@/lib/db/queries';

const KIND_AR: Record<string, string> = {
  TENANT: 'مستأجر',
  CUSTOMER: 'عميل',
  EMPLOYEE: 'موظف',
  VENDOR: 'مورد',
  OTHER: 'أخرى',
};

const TX_KIND_AR: Record<string, string> = {
  REVENUE: 'إيراد',
  EXPENSE: 'مصروف',
};

const J_STATUS_AR: Record<string, string> = {
  DRAFT: 'مسودة',
  POSTED: 'مرحل',
  REVERSED: 'معكوس',
};

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
  th: { color: PDF.white, fontSize: 8.5, fontWeight: 'bold' },
  td: { fontSize: 8.5, color: PDF.text },
  tdMuted: { fontSize: 8, color: PDF.muted },
  infoGrid: {
    direction: 'rtl',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
    padding: 10,
    backgroundColor: PDF.rowAlt,
    borderRadius: 4,
  },
  infoCell: { width: '48%', marginBottom: 4 },
  infoLabel: { fontSize: 8, color: PDF.muted, marginBottom: 2 },
  infoValue: { fontSize: 9.5, color: PDF.text },
  foot: {
    direction: 'ltr',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 1.5,
    borderTopColor: PDF.primary,
  },
  txDate: { width: '14%', textAlign: 'center' },
  txKind: { width: '12%', textAlign: 'center' },
  txCat: { width: '22%', textAlign: 'right', paddingRight: 4 },
  txAmt: { width: '16%', textAlign: 'center' },
  txDesc: { flex: 1, textAlign: 'right', paddingRight: 4 },
  jeNum: { width: '12%', textAlign: 'center' },
  jeDate: { width: '14%', textAlign: 'center' },
  jeStatus: { width: '14%', textAlign: 'center' },
  jeAmt: { width: '18%', textAlign: 'center' },
  jeDesc: { flex: 1, textAlign: 'right', paddingRight: 4 },
});

export type ContactDossierPdfProps = {
  contact: ContactRow;
  rent: TenantRentSummary | null;
  transactions: TransactionWithRelations[];
  journalEntries: JournalEntryRow[];
};

export function ContactDossierPDF({
  contact,
  rent,
  transactions,
  journalEntries,
}: ContactDossierPdfProps) {
  const totalRevenue = transactions
    .filter((t) => t.kind === 'REVENUE')
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const totalExpense = transactions
    .filter((t) => t.kind === 'EXPENSE')
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  const metaCells = [
    { label: 'النوع', value: ar(KIND_AR[contact.kind] ?? contact.kind) },
    { label: 'عدد المعاملات', value: pdfFmtNum(transactions.length) },
    { label: 'إجمالي الإيرادات', moneyAmount: totalRevenue },
    { label: 'إجمالي المصروفات', moneyAmount: totalExpense },
  ];

  if (rent) {
    metaCells.push({
      label: 'إيجار الشهر',
      moneyAmount: Number(rent.current_month_paid) || 0,
    });
  }

  return (
    <ReportShell
      title={ar(`ملف ${contact.name}`)}
      subtitle={ar(
        contact.shop_number
          ? `محل ${contact.shop_number}${contact.floor ? ` · طابق ${contact.floor}` : ''}`
          : KIND_AR[contact.kind] ?? '',
      )}
      metaCells={metaCells}
    >
      <Text style={pdfBase.sectionTitle}>{ar('البيانات الأساسية')}</Text>
      <View style={col.infoGrid}>
        {contact.phone ? (
          <View style={col.infoCell}>
            <Text style={col.infoLabel}>{ar('الهاتف')}</Text>
            <Text style={col.infoValue}>{contact.phone}</Text>
          </View>
        ) : null}
        {contact.monthly_rent ? (
          <View style={col.infoCell}>
            <Text style={col.infoLabel}>{ar('الإيجار الشهري')}</Text>
            <PdfMoneyText amount={Number(contact.monthly_rent)} style={col.infoValue} />
          </View>
        ) : null}
        {rent ? (
          <View style={col.infoCell}>
            <Text style={col.infoLabel}>{ar('حالة إيجار الشهر')}</Text>
            <Text style={col.infoValue}>
              {ar(
                rent.current_month_status === 'paid_full'
                  ? 'مسدد'
                  : rent.current_month_status === 'paid_partial'
                    ? 'جزئي'
                    : rent.current_month_status === 'no_rent_set'
                      ? '—'
                      : 'غير مسدد',
              )}
            </Text>
          </View>
        ) : null}
        {contact.notes ? (
          <View style={[col.infoCell, { width: '100%' }]}>
            <Text style={col.infoLabel}>{ar('ملاحظات')}</Text>
            <Text style={col.infoValue}>{contact.notes}</Text>
          </View>
        ) : null}
      </View>

      {transactions.length > 0 ? (
        <>
          <Text style={pdfBase.sectionTitle}>{ar('المعاملات المالية')}</Text>
          <View style={col.head} wrap={false}>
            <Text style={[col.th, col.txDesc]}>{ar('البيان')}</Text>
            <Text style={[col.th, col.txAmt]}>{ar('المبلغ')}</Text>
            <Text style={[col.th, col.txKind]}>{ar('النوع')}</Text>
            <Text style={[col.th, col.txCat]}>{ar('الحساب')}</Text>
            <Text style={[col.th, col.txDate]}>{ar('التاريخ')}</Text>
          </View>
          {transactions.map((tx, i) => (
            <View
              key={tx.id}
              style={[col.row, i % 2 === 1 ? col.rowAlt : {}]}
              wrap={false}
            >
              <Text style={[col.td, col.txDesc]}>{tx.description || '—'}</Text>
              <View style={col.txAmt}>
                <PdfMoneyText amount={Number(tx.amount)} style={col.td} />
              </View>
              <Text style={[col.td, col.txKind]}>{ar(TX_KIND_AR[tx.kind] ?? tx.kind)}</Text>
              <Text style={[col.td, col.txCat]}>
                {tx.category?.name_ar ?? '—'}
              </Text>
              <Text style={[col.tdMuted, col.txDate]}>{pdfFmtDate(tx.tx_date)}</Text>
            </View>
          ))}
          <View style={col.foot}>
            <Text style={col.td}>{ar('صافي المعاملات')}</Text>
            <PdfMoneyText amount={totalRevenue - totalExpense} style={col.td} />
          </View>
        </>
      ) : (
        <Text style={pdfBase.muted}>{ar('لا توجد معاملات مرتبطة')}</Text>
      )}

      {journalEntries.length > 0 ? (
        <>
          <Text style={[pdfBase.sectionTitle, { marginTop: 14 }]}>
            {ar('قيود اليومية المرتبطة')}
          </Text>
          <View style={col.head} wrap={false}>
            <Text style={[col.th, col.jeDesc]}>{ar('البيان')}</Text>
            <Text style={[col.th, col.jeAmt]}>{ar('مدين')}</Text>
            <Text style={[col.th, col.jeStatus]}>{ar('الحالة')}</Text>
            <Text style={[col.th, col.jeDate]}>{ar('التاريخ')}</Text>
            <Text style={[col.th, col.jeNum]}>{ar('رقم')}</Text>
          </View>
          {journalEntries.map((je, i) => (
            <View
              key={je.id}
              style={[col.row, i % 2 === 1 ? col.rowAlt : {}]}
              wrap={false}
            >
              <Text style={[col.td, col.jeDesc]}>{je.description || '—'}</Text>
              <View style={col.jeAmt}>
                <PdfMoneyText amount={Number(je.total_debit)} style={col.td} />
              </View>
              <Text style={[col.td, col.jeStatus]}>
                {ar(J_STATUS_AR[je.status] ?? je.status)}
              </Text>
              <Text style={[col.tdMuted, col.jeDate]}>{pdfFmtDate(je.entry_date)}</Text>
              <Text style={[col.tdMuted, col.jeNum]}>{pdfFmtNum(je.number)}</Text>
            </View>
          ))}
        </>
      ) : null}
    </ReportShell>
  );
}
