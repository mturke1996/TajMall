import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { JournalEntryPdfModel } from '@/features/pdf/JournalPDF';
import type { JournalEntryRow } from '@/lib/db/journal-queries';

export async function buildJournalEntriesForPdf(
  entriesForPdf: JournalEntryRow[],
): Promise<JournalEntryPdfModel[]> {
  const supabase = createSupabaseBrowserClient();

  type LineRow = {
    debit: string;
    credit: string;
    description: string | null;
    category_name: string | null;
    category_code: string | null;
    sort_order: number;
  };

  return Promise.all(
    entriesForPdf.map(async (e) => {
      const { data: lineRows, error } = await supabase
        .from('journal_lines_with_categories')
        .select('debit, credit, description, category_name, category_code, sort_order')
        .eq('journal_id', e.id)
        .order('sort_order', { ascending: true });
      if (error) throw error;

      const lines = ((lineRows ?? []) as LineRow[]).map((l) => ({
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
    }),
  );
}
