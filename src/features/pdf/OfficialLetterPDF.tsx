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
  /** a date or a word is read right to left: react-pdf does not pass the cell's direction down to its text, so the text carries it (otherwise "18 أكتوبر 2026" comes out as "أكتوبر 2026 18") */
  metaValueRtl: { fontSize: 10, fontWeight: 'bold', color: PDF.text, textAlign: 'right', direction: 'rtl' },
  salutation: {
    direction: 'rtl',
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
  subjectText: { direction: 'rtl', fontSize: 11, fontWeight: 'bold', color: PDF.text, textAlign: 'right', lineHeight: 1.45 },
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

/**
 * A recipient's name or title longer than this is left out of the summary card at the top (its cell is a fifth of the width, so a
 * long one wrapped to six lines and made the card a third of the page); the salutation below it prints both in full.
 */
const SUMMARY_TEXT_CHARS = 34;

/** a last paragraph longer than this is left to flow on its own; a shorter one stays with the closing and the signature */
const KEEP_LAST_PARAGRAPH_CHARS = 600;

export function OfficialLetterPDF({ letter }: { letter: OfficialLetterPdfModel }) {
  const paragraphs = letter.body.split(/\n+/).filter(Boolean);
  const isOfficial = letter.letterType === 'official';
  const last = paragraphs[paragraphs.length - 1];
  const keepLast = last != null && last.length <= KEEP_LAST_PARAGRAPH_CHARS;
  const flowParagraphs = keepLast ? paragraphs.slice(0, -1) : paragraphs;

  return (
    <ReportShell
      title={letter.letterTypeAr}
      titleEn="LETTER"
      subtitle={`رقم ${letter.number}`}
      documentTitle={letter.documentTitle}
      summaryPrimaryDateIso={letter.letterDate}
      summaryPrimaryDateLabel="تاريخ المراسلة"
      metaCells={[
        ...((letter.recipientName ?? '').length <= SUMMARY_TEXT_CHARS ? [{ label: 'إلى', value: letter.recipientName }] : []),
        ...((letter.recipientTitle?.trim() || '—').length <= SUMMARY_TEXT_CHARS
          ? [{ label: 'الصفة', value: letter.recipientTitle?.trim() || '—' }]
          : []),
        {
          label: 'المرجع',
          value: letter.referenceNumber?.trim() || '—',
        },
      ]}
    >
      <View style={s.metaRow} wrap={false}>
        <View style={s.metaCell}>
          <Text style={s.metaLabel}>{ar('التاريخ')}</Text>
          <Text style={s.metaValueRtl}>{arDateMedium(letter.letterDate)}</Text>
        </View>
        <View style={s.metaCell}>
          <Text style={s.metaLabel}>{ar('الرقم')}</Text>
          <Text style={s.metaValue}>{letter.number}</Text>
        </View>
        <View style={s.metaCell}>
          <Text style={s.metaLabel}>{ar('النوع')}</Text>
          <Text style={s.metaValueRtl}>{ar(letter.letterTypeAr)}</Text>
        </View>
      </View>

      <Text style={s.salutation}>
        {ar(
          isOfficial
            ? `إلى السيد/ السيدة ${letter.recipientName}${letter.recipientTitle ? ` — ${letter.recipientTitle}` : ''}`
            // not «الأخ/ الأخت»: react-pdf drops all but one of the same lam-alef ligature on a line, and that line printed «اخ/ الأخت»
            : `السيد/ السيدة ${letter.recipientName}،`,
        )}
      </Text>

      <View style={s.subjectBox} wrap={false}>
        <Text style={s.subjectLabel}>{ar('الموضوع')}</Text>
        <Text style={s.subjectText}>{ar(letter.subject)}</Text>
      </View>

      {flowParagraphs.map((p, i) => (
        <Text key={i} style={s.body}>
          {ar(p)}
        </Text>
      ))}

      {/* the last paragraph, the closing line and the signature move together: the signature never stands alone on a page */}
      <View wrap={false}>
        {keepLast ? <Text style={s.body}>{ar(last)}</Text> : null}

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
      </View>
    </ReportShell>
  );
}
