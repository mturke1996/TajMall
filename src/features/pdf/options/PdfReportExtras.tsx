// @ts-nocheck
/**
 * Small react-pdf blocks the options dialogs can switch on in a transactions report: the note that says
 * which filters were applied, the «أعدّه / اعتمده» lines and the «who printed it and when» line. They are
 * drawn with the report's own palette and spacing, and a report that is not given them renders exactly as
 * it did before.
 */
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ar } from '../arabicPDF';
import { PDF } from '../pdfBase';

const s = StyleSheet.create({
  note: {
    fontSize: 7.5,
    color: PDF.muted,
    textAlign: 'right',
    lineHeight: 1.5,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  signRow: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: 24,
    marginTop: 18,
  },
  signBox: {
    direction: 'rtl',
    flex: 1,
    minWidth: 0,
  },
  signLabel: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: PDF.primary,
    textAlign: 'right',
  },
  signLine: {
    borderBottomWidth: 0.8,
    borderBottomColor: PDF.muted,
    height: 30,
  },
  signHint: {
    fontSize: 7,
    color: PDF.muted,
    textAlign: 'right',
    marginTop: 3,
  },
  printLine: {
    fontSize: 7.5,
    color: PDF.muted,
    textAlign: 'center',
    marginTop: 6,
  },
});

/** One muted line under the scope strip: «التصفية: الجهة: … · الخزينة: …». */
export function PdfScopeNote({ text }: { text: string }) {
  return <Text style={s.note}>{ar(text)}</Text>;
}

/** Two lines to sign on, kept in one piece. `preparedBy` is printed under the first one. */
export function PdfSignatureBlock({
  preparedLabel = 'أعدّه',
  approvedLabel = 'اعتمده',
  preparedBy,
}: {
  preparedLabel?: string;
  approvedLabel?: string;
  preparedBy?: string;
}) {
  return (
    <View style={s.signRow} wrap={false}>
      <View style={s.signBox}>
        <Text style={s.signLabel}>{ar(preparedLabel)}</Text>
        <View style={s.signLine} />
        <Text style={s.signHint}>{ar(preparedBy ? preparedBy : 'الاسم والتوقيع')}</Text>
      </View>
      <View style={s.signBox}>
        <Text style={s.signLabel}>{ar(approvedLabel)}</Text>
        <View style={s.signLine} />
        <Text style={s.signHint}>{ar('الاسم والتوقيع')}</Text>
      </View>
    </View>
  );
}

/** «طُبع بواسطة: اسم المستخدم — بتاريخ 19/10/2026 14:30». */
export function PdfPrintLine({ printedBy, printedAt }: { printedBy?: string; printedAt?: string }) {
  const parts = [printedBy ? `طُبع بواسطة: ${printedBy}` : null, printedAt ? `بتاريخ ${printedAt}` : null].filter(Boolean);
  if (parts.length === 0) return null;
  return <Text style={s.printLine}>{ar(parts.join(' — '))}</Text>;
}
