// @ts-nocheck
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar, arMoney, arDate } from './arabicPDF';
import { pdfBase, PDF } from './pdfStyles';

export type JournalLine = {
  category: string;
  debit: number;
  credit: number;
};

export type JournalEntryPdfModel = {
  number: string;
  entryDate: string;
  description?: string[];
  lines: JournalLine[];
};

const s = StyleSheet.create({
  th_account: { flex: 1, textAlign: 'right' },
  th_amount:  { width: 110, textAlign: 'left' },
  block: {
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 6,
    marginBottom: 14,
    overflow: 'hidden',
  },
  blockHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: PDF.rowAlt,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
  },
  blockTitle: { fontSize: 11, fontWeight: 'bold', color: PDF.primary },
  blockMeta:  { fontSize: 9, color: PDF.muted },
  descLine:   {
    fontSize: 9.5,
    color: PDF.muted,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  signRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: PDF.border,
  },
  signBox: { alignItems: 'center', width: '30%' },
  signLabel: { fontSize: 9, color: PDF.muted, marginBottom: 26 },
  signLine: { borderTopWidth: 1, borderTopColor: PDF.text, width: '100%', paddingTop: 4 },
  signName: { fontSize: 9, color: PDF.text },
});

export function JournalPDF({
  entries,
  periodLabel,
  currency = 'د.ل',
}: {
  entries: JournalEntryPdfModel[];
  periodLabel: string;
  currency?: string;
}) {
  return (
    <ReportShell
      title="دفتر اليومية"
      subtitle={periodLabel}
      metaCells={[
        { label: 'الفترة',     value: periodLabel },
        { label: 'عدد القيود', value: String(entries.length) },
      ]}
    >
      {entries.length === 0 && (
        <View style={[pdfBase.tableRow, { justifyContent: 'center', paddingVertical: 24 }]}>
          <Text style={pdfBase.tdMuted}>{ar('لا توجد قيود مرحّلة في هذه الفترة')}</Text>
        </View>
      )}

      {entries.map((j) => {
        const totalDebit = j.lines.reduce((x, l) => x + l.debit, 0);
        const totalCredit = j.lines.reduce((x, l) => x + l.credit, 0);
        return (
          <View key={j.number} style={s.block} wrap={false}>
            <View style={s.blockHead}>
              <Text style={s.blockMeta}>{arDate(j.entryDate)}</Text>
              <Text style={s.blockTitle}>{ar(`قيد رقم ${j.number}`)}</Text>
            </View>

            {/* Lines */}
            <View style={pdfBase.tableHead}>
              <Text style={[pdfBase.th, s.th_amount, { textAlign: 'left' }]}>{ar('دائن')}</Text>
              <Text style={[pdfBase.th, s.th_amount, { textAlign: 'left' }]}>{ar('مدين')}</Text>
              <Text style={[pdfBase.th, s.th_account]}>{ar('البيـان')}</Text>
            </View>

            {j.lines.map((l, i) => (
              <View key={i} style={[pdfBase.tableRow, i % 2 !== 0 && pdfBase.rowEven]}>
                <Text style={[pdfBase.td, s.th_amount, !l.credit && { color: PDF.muted }]}>
                  {l.credit ? arMoney(l.credit, currency) : ar('—')}
                </Text>
                <Text style={[pdfBase.td, s.th_amount, !l.debit && { color: PDF.muted }]}>
                  {l.debit ? arMoney(l.debit, currency) : ar('—')}
                </Text>
                <Text style={[pdfBase.td, s.th_account, { fontWeight: 'bold' }]}>
                  {ar(l.category)}
                </Text>
              </View>
            ))}

            {/* Totals */}
            <View style={pdfBase.tableFoot}>
              <Text style={[pdfBase.footValue, s.th_amount]}>{arMoney(totalCredit, currency)}</Text>
              <Text style={[pdfBase.footValue, s.th_amount]}>{arMoney(totalDebit, currency)}</Text>
              <Text style={[pdfBase.footLabel, s.th_account]}>{ar('الإجمالي')}</Text>
            </View>

            {/* Description */}
            {j.description?.map((d, i) => (
              <Text key={i} style={s.descLine}>
                {ar(`• ${d}`)}
              </Text>
            ))}
          </View>
        );
      })}

      {/* Signatures */}
      {entries.length > 0 && (
        <View style={s.signRow} wrap={false}>
          <View style={s.signBox}>
            <Text style={s.signLabel}>{ar('المحاسب')}</Text>
            <View style={s.signLine}>
              <Text style={s.signName}>{ar('الاسم والتوقيع')}</Text>
            </View>
          </View>
          <View style={s.signBox}>
            <Text style={s.signLabel}>{ar('المراجع')}</Text>
            <View style={s.signLine}>
              <Text style={s.signName}>{ar('الاسم والتوقيع')}</Text>
            </View>
          </View>
          <View style={s.signBox}>
            <Text style={s.signLabel}>{ar('المدير المالي')}</Text>
            <View style={s.signLine}>
              <Text style={s.signName}>{ar('الاسم والتوقيع')}</Text>
            </View>
          </View>
        </View>
      )}
    </ReportShell>
  );
}
