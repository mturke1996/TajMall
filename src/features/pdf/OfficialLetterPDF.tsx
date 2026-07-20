// @ts-nocheck
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar, arDateMedium } from './arabicPDF';
import { PDF } from './pdfBase';
import { pdfReportTable, PdfReportCaption } from './pdfReportTable';
import { BRAND } from '@/lib/brand';

export type OfficialLetterPdfModel = {
  number: string;
  letterDate: string;
  letterType: 'official' | 'routine';
  letterTypeAr: string;
  subject: string;
  recipientName: string;
  recipientTitle?: string;
  body: string;
  referenceNumber?: string;
  status?: string;
  documentTitle?: string;
};

const s = StyleSheet.create({
  metaRow: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
  },
  metaCell: { direction: 'rtl', flex: 1 },
  metaLabel: { fontSize: 8, color: PDF.muted, marginBottom: 3, textAlign: 'right' },
  metaValue: { fontSize: 10, fontWeight: 'bold', color: PDF.text, textAlign: 'right' },
  salutation: {
    fontSize: 11,
    fontWeight: 'bold',
    color: PDF.text,
    textAlign: 'right',
    marginBottom: 10,
    marginTop: 4,
  },
  subjectBox: {
    direction: 'rtl',
    backgroundColor: PDF.logoGreenSoft,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRightWidth: 3,
    borderRightColor: PDF.logoGreen,
    borderRadius: 3,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  subjectLabel: { fontSize: 8, color: PDF.muted, marginBottom: 4, textAlign: 'right' },
  subjectText: { fontSize: 11, fontWeight: 'bold', color: PDF.text, textAlign: 'right', lineHeight: 1.45 },
  body: {
    direction: 'rtl',
    fontSize: 10.5,
    color: PDF.text,
    lineHeight: 1.75,
    textAlign: 'right',
    marginBottom: 8,
  },
  closing: {
    direction: 'rtl',
    marginTop: 24,
    fontSize: 10.5,
    color: PDF.text,
    textAlign: 'right',
    lineHeight: 1.6,
  },
  signBlock: {
    direction: 'rtl',
    marginTop: 36,
    alignItems: 'flex-end',
    minWidth: 180,
  },
  signLine: {
    borderTopWidth: 1,
    borderTopColor: PDF.text,
    width: 160,
    marginTop: 40,
    paddingTop: 6,
  },
  signOrg: { fontSize: 10, fontWeight: 'bold', color: PDF.text, textAlign: 'right' },
  signHint: { fontSize: 8, color: PDF.muted, textAlign: 'right', marginTop: 4 },
});

export function OfficialLetterPDF({ letter }: { letter: OfficialLetterPdfModel }) {
  const paragraphs = letter.body.split(/\n+/).filter(Boolean);
  const isOfficial = letter.letterType === 'official';

  return (
    <ReportShell
      title={letter.letterTypeAr}
      subtitle={`رقم ${letter.number}`}
      documentTitle={letter.documentTitle}
      summaryPrimaryDateIso={letter.letterDate}
      summaryPrimaryDateLabel="تاريخ المراسلة"
      metaCells={[
        { label: 'إلى', value: letter.recipientName },
        {
          label: 'الصفة',
          value: letter.recipientTitle?.trim() || '—',
        },
        {
          label: 'المرجع',
          value: letter.referenceNumber?.trim() || '—',
        },
      ]}
    >
      <View style={s.metaRow} wrap={false}>
        <View style={s.metaCell}>
          <Text style={s.metaLabel}>{ar('التاريخ')}</Text>
          <Text style={s.metaValue}>{arDateMedium(letter.letterDate)}</Text>
        </View>
        <View style={s.metaCell}>
          <Text style={s.metaLabel}>{ar('الرقم')}</Text>
          <Text style={s.metaValue}>{letter.number}</Text>
        </View>
        <View style={s.metaCell}>
          <Text style={s.metaLabel}>{ar('النوع')}</Text>
          <Text style={s.metaValue}>{ar(letter.letterTypeAr)}</Text>
        </View>
      </View>

      <Text style={s.salutation}>
        {ar(
          isOfficial
            ? `إلى السيد/ السيدة ${letter.recipientName}${letter.recipientTitle ? ` — ${letter.recipientTitle}` : ''}`
            : `الأخ/ الأخت ${letter.recipientName}،`,
        )}
      </Text>

      <View style={s.subjectBox} wrap={false}>
        <Text style={s.subjectLabel}>{ar('الموضوع')}</Text>
        <Text style={s.subjectText}>{ar(letter.subject)}</Text>
      </View>

      {paragraphs.map((p, i) => (
        <Text key={i} style={s.body}>
          {ar(p)}
        </Text>
      ))}

      <Text style={s.closing}>
        {ar(
          isOfficial
            ? 'وتفضلوا بقبول فائق الاحترام والتقدير،'
            : 'مع أطيب التحيات،',
        )}
      </Text>

      <View style={s.signBlock} wrap={false}>
        <View style={s.signLine} />
        <Text style={s.signOrg}>{ar(BRAND.fullName)}</Text>
        <Text style={s.signHint}>{ar('الإدارة')}</Text>
      </View>

      <PdfReportCaption />
    </ReportShell>
  );
}
