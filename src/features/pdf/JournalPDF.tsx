// @ts-nocheck
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar, arMoney, arDateMedium } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';

export type JournalEntryPdfModel = {
  id: string;
  number: number;
  reference: string | null;
  status: 'DRAFT' | 'POSTED' | 'REVERSED';
  entry_date: string;
  description: string | null;
  lines: Array<{
    category_name: string;
    category_code: string;
    debit: number;
    credit: number;
    description: string | null;
  }>;
  total_debit: number;
  total_credit: number;
};

const s = StyleSheet.create({
  entry: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  entryHeader: {
    direction: 'rtl',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: PDF.logoGreenSoft,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
    borderRightWidth: 3,
    borderRightColor: PDF.logoGreen,
  },
  entryNumber: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  entryDate: {
    fontSize: 9,
    color: PDF.muted,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 8,
  },
  statusPosted: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  statusDraft: {
    backgroundColor: '#fef9c3',
    color: '#854d0e',
  },
  statusReversed: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  description: {
    fontSize: 9,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
    color: PDF.text,
  },
  tableHead: {
    direction: 'rtl',
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
  },
  tableRow: {
    direction: 'rtl',
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
  },
  th: {
    fontSize: 8,
    fontWeight: 'bold',
    color: PDF.muted,
  },
  td: {
    fontSize: 9,
  },
  colCategory: { flex: 2, textAlign: 'right' },
  colDebit: { width: 80, textAlign: 'center' },
  colCredit: { width: 80, textAlign: 'center' },
  colDesc: { flex: 1, textAlign: 'right', paddingRight: 8 },
  totalRow: {
    direction: 'rtl',
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#f1f5f9',
    borderTopWidth: 1,
    borderTopColor: PDF.border,
  },
  totalLabel: {
    flex: 3,
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  totalValue: {
    width: 80,
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  caption: {
    fontSize: 8.5,
    color: PDF.muted,
    marginTop: 14,
    textAlign: 'center',
  },
});

export function JournalPDF({
  entries,
  periodLabel,
}: {
  entries: JournalEntryPdfModel[];
  periodLabel: string;
}) {
  const statusConfig = {
    POSTED: { label: 'مرحل', style: s.statusPosted },
    DRAFT: { label: 'مسودة', style: s.statusDraft },
    REVERSED: { label: 'معكوس', style: s.statusReversed },
  };

  return (
    <ReportShell
      title="دفتر اليومية"
      subtitle={periodLabel}
      footerFixed={false}
      metaCells={[
        { label: 'الفترة', value: periodLabel },
        { label: 'عدد القيود', value: String(entries.length) },
      ]}
    >
      {entries.length === 0 ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <Text style={pdfBase.tdMuted}>{ar('لا توجد قيود للعرض')}</Text>
        </View>
      ) : (
        entries.map((entry) => {
          const status = statusConfig[entry.status];
          const isBalanced = entry.total_debit === entry.total_credit;

          return (
            <View key={entry.id} style={s.entry}>
              {/* Header */}
              <View style={s.entryHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={s.entryNumber}>
                    {ar(`قيد رقم ${entry.number}`)}
                  </Text>
                  <Text style={[s.statusBadge, status.style]}>
                    {ar(status.label)}
                  </Text>
                  {!isBalanced && (
                    <Text style={[s.statusBadge, s.statusReversed]}>
                      {ar('غير متوازن')}
                    </Text>
                  )}
                </View>
                <Text style={s.entryDate}>
                  {arDateMedium(entry.entry_date)}
                </Text>
              </View>

              {/* Description */}
              {entry.description && (
                <Text style={s.description}>
                  {ar(entry.description)}
                </Text>
              )}

              {/* Table Header */}
              <View style={s.tableHead}>
                <Text style={[s.th, s.colCategory]}>{ar('الحساب')}</Text>
                <Text style={[s.th, s.colDesc]}>{ar('البيان')}</Text>
                <Text style={[s.th, s.colDebit]}>{ar('مدين')}</Text>
                <Text style={[s.th, s.colCredit]}>{ar('دائن')}</Text>
              </View>

              {/* Lines */}
              {entry.lines.map((line, i) => (
                <View key={i} style={[s.tableRow, i % 2 !== 0 && { backgroundColor: '#fafafa' }]}>
                  <Text style={[s.td, s.colCategory]}>
                    {ar(line.category_name)}
                  </Text>
                  <Text style={[s.td, s.colDesc, { color: PDF.muted, fontSize: 8 }]}>
                    {ar(line.description || '—')}
                  </Text>
                  <Text style={[s.td, s.colDebit, !line.debit && { color: PDF.muted }]}>
                    {line.debit ? arMoney(line.debit) : ar('—')}
                  </Text>
                  <Text style={[s.td, s.colCredit, !line.credit && { color: PDF.muted }]}>
                    {line.credit ? arMoney(line.credit) : ar('—')}
                  </Text>
                </View>
              ))}

              {/* Totals */}
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>{ar('الإجمالي')}</Text>
                <Text style={[s.totalValue, { color: PDF.success }]}>
                  {arMoney(entry.total_debit)}
                </Text>
                <Text style={[s.totalValue, { color: PDF.danger }]}>
                  {arMoney(entry.total_credit)}
                </Text>
              </View>
            </View>
          );
        })
      )}

      {/* Grand Total */}
      {entries.length > 0 && (
        <View style={[s.totalRow, { marginTop: 8, backgroundColor: '#e2e8f0' }]}>
          <Text style={s.totalLabel}>{ar('إجمالي الدفتر')}</Text>
          <Text style={[s.totalValue, { color: PDF.success }]}>
            {arMoney(entries.reduce((s, e) => s + e.total_debit, 0))}
          </Text>
          <Text style={[s.totalValue, { color: PDF.danger }]}>
            {arMoney(entries.reduce((s, e) => s + e.total_credit, 0))}
          </Text>
        </View>
      )}

      <Text style={s.caption}>
        {ar('هذا الدفتر يعرض القيود المحاسبية المزدوجة (المدين والدائن) المرحّلة في النظام.')}
      </Text>
    </ReportShell>
  );
}
