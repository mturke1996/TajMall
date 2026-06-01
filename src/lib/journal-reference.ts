/** Matches server format JY-YYYY-NNNNN */
export function formatJournalReference(year: number, sequence: number): string {
  return `JY-${year}-${String(sequence).padStart(5, '0')}`;
}

/** Client-side preview when RPC is not deployed yet */
export function previewJournalReference(
  entryDate: string,
  entries: Array<{ entry_date: string; reference: string | null }>,
): string {
  const year = new Date(entryDate + 'T12:00:00').getFullYear();
  const pattern = new RegExp(`^JY-${year}-(\\d+)$`);
  let maxSeq = 0;
  let yearCount = 0;

  for (const e of entries) {
    const entryYear = new Date(e.entry_date).getFullYear();
    if (entryYear === year) {
      yearCount += 1;
      const m = e.reference?.match(pattern);
      if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    }
  }

  const nextSeq = Math.max(maxSeq, yearCount) + 1;
  return formatJournalReference(year, nextSeq);
}
