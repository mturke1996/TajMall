'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

// ── Query Keys ───────────────────────────────────────────────────
export const qk = {
  journalEntries: ['journal_entries'] as const,
  journalEntry: (id: string) => ['journal_entry', id] as const,
  journalLines: (journalId: string) => ['journal_lines', journalId] as const,
  journalSummary: ['journal_summary'] as const,
};

// ── Types ────────────────────────────────────────────────────────
export type JournalStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

export type JournalEntryRow = {
  id: string;
  number: number;
  reference: string | null;
  status: JournalStatus;
  entry_date: string;
  description: string | null;
  notes: string | null;
  posted_at: string | null;
  reversed_at: string | null;
  created_at: string;
  updated_at: string;
  total_debit: string;
  total_credit: string;
  line_count: number;
};

export type JournalLineRow = {
  id: string;
  journal_id: string;
  category_id: string;
  debit: string;
  credit: string;
  description: string | null;
  sort_order: number;
  category: {
    id: string;
    code: string;
    name_ar: string;
    type: string;
    kind: string;
  } | null;
};

export type NewJournalEntryInput = {
  reference?: string;
  entry_date: string;
  description?: string;
  notes?: string;
  lines: Array<{
    category_id: string;
    debit: number;
    credit: number;
    description?: string;
  }>;
};

// ── Queries ──────────────────────────────────────────────────────
export function useJournalEntries(status?: JournalStatus, limit = 100) {
  return useQuery<JournalEntryRow[]>({
    queryKey: status ? [...qk.journalEntries, status] : qk.journalEntries,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from('journal_entries_with_totals')
        .select('*')
        .order('entry_date', { ascending: false })
        .order('number', { ascending: false })
        .limit(limit);
      
      if (status) q = q.eq('status', status);
      
      const { data, error } = await q;
      if (error) throw error;
      return (data as JournalEntryRow[]) ?? [];
    },
  });
}

export function useJournalEntry(id: string) {
  return useQuery<JournalEntryRow>({
    queryKey: qk.journalEntry(id),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('journal_entries_with_totals')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data as JournalEntryRow;
    },
    enabled: !!id,
  });
}

export function useJournalLines(journalId: string) {
  return useQuery<JournalLineRow[]>({
    queryKey: qk.journalLines(journalId),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('journal_lines_with_categories')
        .select('*')
        .eq('journal_id', journalId)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      return (data as JournalLineRow[]) ?? [];
    },
    enabled: !!journalId,
  });
}

export type JournalSummary = {
  total_entries: number;
  posted_entries: number;
  draft_entries: number;
  total_debit: string;
  total_credit: string;
  current_month_entries: number;
};

export function useJournalSummary() {
  return useQuery<JournalSummary>({
    queryKey: qk.journalSummary,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('journal_summary')
        .select('*')
        .single();
      
      if (error) throw error;
      return data as JournalSummary;
    },
  });
}

// ── Mutations ────────────────────────────────────────────────────
export function useCreateJournalEntry() {
  const qc = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: NewJournalEntryInput) => {
      const supabase = createSupabaseBrowserClient();
      
      const { data, error } = await supabase.rpc('create_journal_entry', {
        p_reference: input.reference || null,
        p_entry_date: input.entry_date,
        p_description: input.description || null,
        p_notes: input.notes || null,
        p_lines: input.lines.map((line, index) => ({
          category_id: line.category_id,
          debit: line.debit,
          credit: line.credit,
          description: line.description || null,
          sort_order: index,
        })),
      });
      
      if (error) throw error;
      return data as string; // returns journal entry id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.journalEntries });
      qc.invalidateQueries({ queryKey: qk.journalSummary });
      toast.success('تم إنشاء القيد بنجاح');
    },
    onError: (error: any) => {
      toast.error(error.message || 'فشل إنشاء القيد');
    },
  });
}

export function usePostJournalEntry() {
  const qc = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      
      const { data, error } = await supabase.rpc('post_journal_entry', {
        p_journal_id: id,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: qk.journalEntries });
      qc.invalidateQueries({ queryKey: qk.journalEntry(id) });
      qc.invalidateQueries({ queryKey: qk.journalSummary });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['cashbox_balances'] });
      qc.invalidateQueries({ queryKey: ['monthly_summary'] });
      toast.success('تم ترحيل القيد بنجاح');
    },
    onError: (error: any) => {
      toast.error(error.message || 'فشل ترحيل القيد');
    },
  });
}

export function useReverseJournalEntry() {
  const qc = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      
      const { data, error } = await supabase.rpc('reverse_journal_entry', {
        p_journal_id: id,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: qk.journalEntries });
      qc.invalidateQueries({ queryKey: qk.journalEntry(id) });
      qc.invalidateQueries({ queryKey: qk.journalSummary });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['cashbox_balances'] });
      toast.success('تم عكس القيد بنجاح');
    },
    onError: (error: any) => {
      toast.error(error.message || 'فشل عكس القيد');
    },
  });
}

export function useDeleteJournalEntry() {
  const qc = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      
      const { error } = await supabase
        .from('journal_entries')
        .delete()
        .eq('id', id)
        .eq('status', 'DRAFT'); // Only allow deleting draft entries
      
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.journalEntries });
      qc.invalidateQueries({ queryKey: qk.journalSummary });
      toast.success('تم حذف القيد بنجاح');
    },
    onError: (error: any) => {
      toast.error(error.message || 'فشل حذف القيد - يمكن حذف القيود المسودة فقط');
    },
  });
}
