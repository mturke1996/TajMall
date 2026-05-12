// @ts-nocheck
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar, arMoney } from './arabicPDF';
import { pdfBase, PDF } from './pdfStyles';

export type GenericReportSection = {
  title: string;
  rows: { label: string; amount: number; emphasis?: boolean }[];
  total?: { label: string; amount: number };
};

const s = StyleSheet.create({
  th_label:  { flex: 1, textAlign: 'right' },
  th_amount: { width: 140, textAlign: 'left' },
  sectionGap: { height: 14 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: PDF.rowAlt,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: PDF.primary,
  },
  sectionTitle: { fontSize: 10.5, fontWeight: 'bold', color: PDF.primary },
});

/**
 * Generic two-column financial report (Profit & Loss, Cash Flow, etc.).
 * Each section renders as a labelled block with an optional subtotal.
 */
export function GenericReportPDF({
  title,
  subtitle,
  periodLabel,
  sections,
  finalTotal,
  currency = 'د.ل',
}: {
  title: string;
  subtitle?: string;
  periodLabel: string;
  sections: GenericReportSection[];
  finalTotal?: { label: string; amount: number };
  currency?: string;
}) {
  return (
    <ReportShell
      title={title}
      subtitle={subtitle}
      metaCells={[{ label: 'الفترة', value: periodLabel }]}
    >
      {sections.length === 0 ? (
        <View style={[pdfBase.tableRow, { justifyContent: 'center', paddingVertical: 30 }]}>
          <Text style={pdfBase.tdMuted}>{ar('لا توجد بيانات للعرض')}</Text>
        </View>
      ) : (
        sections.map((section, idx) => (
          <View key={idx} wrap={false}>
            <View style={s.sectionHead}>
              <View />
              <Text style={s.sectionTitle}>{ar(section.title)}</Text>
            </View>
            {section.rows.map((row, i) => (
              <View key={i} style={[pdfBase.tableRow, i % 2 !== 0 && pdfBase.rowEven]}>
                <Text
                  style={[
                    row.emphasis ? pdfBase.tdMono : pdfBase.td,
                    s.th_amount,
                    row.emphasis && { fontWeight: 'bold' },
                  ]}
                >
                  {arMoney(row.amount, currency)}
                </Text>
                <Text
                  style={[
                    pdfBase.td,
                    s.th_label,
                    row.emphasis && { fontWeight: 'bold' },
                  ]}
                >
                  {ar(row.label)}
                </Text>
              </View>
            ))}
            {section.total && (
              <View style={pdfBase.tableFoot}>
                <Text style={[pdfBase.footValue, s.th_amount]}>
                  {arMoney(section.total.amount, currency)}
                </Text>
                <Text style={[pdfBase.footLabel, s.th_label]}>
                  {ar(section.total.label)}
                </Text>
              </View>
            )}
            <View style={s.sectionGap} />
          </View>
        ))
      )}

      {finalTotal && (
        <View style={[pdfBase.tableFoot, { backgroundColor: PDF.primary }]} wrap={false}>
          <Text style={[pdfBase.footValue, s.th_amount, { color: '#FBF8F1' }]}>
            {arMoney(finalTotal.amount, currency)}
          </Text>
          <Text style={[pdfBase.footLabel, s.th_label, { color: '#FBF8F1' }]}>
            {ar(finalTotal.label)}
          </Text>
        </View>
      )}
    </ReportShell>
  );
}
