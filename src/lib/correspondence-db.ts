import type { OfficialLetterPdfModel } from '@/features/pdf/OfficialLetterPDF';
import type { CorrespondenceLetterRow } from '@/lib/db/types';

const TYPE_AR: Record<string, string> = {
  official: 'مراسلة رسمية',
  routine: 'مراسلة اعتيادية',
};

export function correspondenceRowToPdfModel(
  row: CorrespondenceLetterRow,
): OfficialLetterPdfModel {
  return {
    number: row.letter_number,
    letterDate: `${row.letter_date}T12:00:00.000Z`,
    letterType: row.letter_type,
    letterTypeAr: TYPE_AR[row.letter_type] ?? row.letter_type,
    subject: row.subject,
    recipientName: row.recipient_name,
    recipientTitle: row.recipient_title ?? undefined,
    body: row.body,
    referenceNumber: row.reference_number ?? undefined,
    status: row.status,
  };
}
