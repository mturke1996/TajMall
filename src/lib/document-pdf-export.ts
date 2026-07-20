import { BRAND } from '@/lib/brand';
import { buildPdfFileName } from '@/lib/report-pdf-export';

export type DocumentPdfExportNames = {
  fileName: string;
  shareTitle: string;
  shareText: string;
  documentTitle: string;
};

export function formatDocumentPdfExportNames(input: {
  docKindAr: string;
  docKindEn: string;
  docNumber: string;
  docDate: string;
  recipientOrParty?: string;
}): DocumentPdfExportNames {
  const dateSlug = input.docDate.replace(/\s+/g, '');
  const fileName = buildPdfFileName(
    input.docKindEn,
    `${dateSlug}-${input.docNumber}`,
  );

  const shareTitle = `${input.docKindAr} ${input.docNumber} · ${BRAND.name}`;
  const shareText = [
    `${input.docKindAr} رقم ${input.docNumber} — تاريخ ${input.docDate}.`,
    input.recipientOrParty ? `الجهة: ${input.recipientOrParty}.` : undefined,
    `${BRAND.fullName} — ${BRAND.tagline}`,
  ]
    .filter(Boolean)
    .join('\n');

  const documentTitle = `${BRAND.name} — ${input.docKindAr} — ${input.docNumber}`;

  return { fileName, shareTitle, shareText, documentTitle };
}

/** اقتراح رقم وثيقة متسلسل للسنة الحالية */
export function formatSuggestedDocNumber(prefix: string, sequence: number): string {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(sequence).padStart(4, '0')}`;
}
