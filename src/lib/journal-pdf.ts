import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { JournalEntryPdfModel } from '@/features/pdf/JournalPDF';
import type { JournalEntryRow } from '@/lib/db/journal-queries';

type LineRow = {
  journal_id: string;
  debit: string;
  credit: string;
  description: string | null;
  category_name: string | null;
  category_code: string | null;
  sort_order: number;
};

/**
 * يجهّز نماذج PDF للقيود مع بنودها — دفعة واحدة (بدون N+1).
 */
export async function buildJournalEntriesForPdf(
  entriesForPdf: JournalEntryRow[],
): Promise<JournalEntryPdfModel[]> {
  if (entriesForPdf.length === 0) return [];

  const supabase = createSupabaseBrowserClient();
  const ids = entriesForPdf.map((e) => e.id);
  const linesByJournal = new Map<string, LineRow[]>();

  // تجزئة لتجنب حدود URL عند كثرة القيود في الشهر
  const chunkSize = 80;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data: lineRows, error } = await supabase
      .from('journal_lines_with_categories')
      .select(
        'journal_id, debit, credit, description, category_name, category_code, sort_order',
      )
      .in('journal_id', chunk)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    for (const row of (lineRows ?? []) as LineRow[]) {
      const list = linesByJournal.get(row.journal_id) ?? [];
      list.push(row);
      linesByJournal.set(row.journal_id, list);
    }
  }

  return entriesForPdf.map((e) => {
    const lines = (linesByJournal.get(e.id) ?? []).map((l) => ({
      category_name: l.category_name ?? '—',
      category_code: l.category_code ?? '',
      debit: Number(l.debit),
      credit: Number(l.credit),
      description: l.description,
    }));

    return {
      id: e.id,
      number: e.number,
      reference: e.reference,
      status: e.status,
      entry_date: e.entry_date,
      description: e.description,
      lines,
      total_debit: Number(e.total_debit),
      total_credit: Number(e.total_credit),
    };
  });
}
