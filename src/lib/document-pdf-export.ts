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

/** The next number in this year's series: one after the highest PREFIX-YEAR-NNNN already used. */
export function nextDocNumber(prefix: string, used: Array<string | null | undefined>): string {
  const year = new Date().getFullYear();
  const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  let max = 0;
  for (const n of used) {
    const m = n?.trim().match(pattern);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return formatSuggestedDocNumber(prefix, max + 1);
}
