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
  journalFormDrafts: ['journal_form_drafts'] as const,
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
  source_type?: string | null;
  source_id?: string | null;
  reversal_of_entry_id?: string | null;
  period_id?: string | null;
};

export type JournalDraftLinePayload = {
  category_id: string;
  side: 'debit' | 'credit';
  amount: string;
  description?: string;
  contact_id?: string;
  cashbox_id?: string;
};

export type JournalDraftPayload = {
  entry_date?: string;
  description?: string;
  notes?: string;
  lines?: JournalDraftLinePayload[];
};

export type JournalFormDraftRow = {
  id: string;
  user_id: string;
  label: string | null;
  payload: JournalDraftPayload;
  created_at: string;
  updated_at: string;
};

export type SaveJournalDraftInput = {
  id?: string;
  label?: string | null;
  payload: JournalDraftPayload;
};

function invalidateJournalCaches(qc: ReturnType<typeof useQueryClient>, journalId?: string) {
  qc.invalidateQueries({ queryKey: qk.journalEntries });
  qc.invalidateQueries({ queryKey: qk.journalSummary });
  qc.invalidateQueries({ queryKey: ['journal_next_reference'] });
  qc.invalidateQueries({ queryKey: ['journal_year_count'] });
  qc.invalidateQueries({ queryKey: ['ledger'] });
  qc.invalidateQueries({ queryKey: ['transactions'] });
  qc.invalidateQueries({ queryKey: ['cashbox_balances'] });
  qc.invalidateQueries({ queryKey: ['monthly_summary'] });
  if (journalId) {
    qc.invalidateQueries({ queryKey: qk.journalEntry(journalId) });
    qc.invalidateQueries({ queryKey: qk.journalLines(journalId) });
  }
}

export type JournalLineRow = {
  id: string;
  journal_id: string;
  category_id: string;
  debit: string;
  credit: string;
  description: string | null;
  sort_order: number;
  category_code: string | null;
  category_name: string | null;
  category_type: string | null;
  category_kind: string | null;
  category_color: string | null;
  contact_id: string | null;
  contact_name: string | null;
  contact_kind: string | null;
  contact_shop_number: string | null;
  cashbox_id: string | null;
  cashbox_name_ar: string | null;
  cashbox_code: string | null;
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
    contact_id?: string | null;
    cashbox_id?: string | null;
  }>;
};

// ── Queries ──────────────────────────────────────────────────────
export function useJournalEntries(filters?: {
  status?: JournalStatus | 'ALL';
  contactId?: string | 'ALL';
  cashboxId?: string | 'ALL';
  search?: string;
}, limit = 100) {
  const status = filters?.status && filters.status !== 'ALL' ? filters.status : null;
  const contactId = filters?.contactId && filters.contactId !== 'ALL' ? filters.contactId : null;
  const cashboxId = filters?.cashboxId && filters.cashboxId !== 'ALL' ? filters.cashboxId : null;
  const search = filters?.search || null;

  return useQuery<JournalEntryRow[]>({
    queryKey: [...qk.journalEntries, { status, contactId, cashboxId, search, limit }],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();

      const { data, error } = await supabase.rpc('get_journal_entries_filtered', {
        p_status: status,
        p_contact_id: contactId,
        p_cashbox_id: cashboxId,
        p_search: search,
        p_limit: limit,
      });

      if (!error) return (data as JournalEntryRow[]) ?? [];

      // Fallback when RPC not deployed (schema cache / missing migration)
      const msg = error.message ?? '';
      const rpcMissing =
        msg.includes('get_journal_entries_filtered') ||
        msg.includes('schema cache') ||
        error.code === 'PGRST202';

      if (!rpcMissing) throw error;

      let q = supabase
        .from('journal_entries_with_totals')
        .select('*')
        .order('entry_date', { ascending: false })
        .order('number', { ascending: false })
        .limit(limit);

      if (status) q = q.eq('status', status);
      if (search?.trim()) {
        const s = search.trim().replace(/[%_,]/g, '');
        q = q.or(`reference.ilike.%${s}%,description.ilike.%${s}%`);
      }

      const { data: rows, error: viewError } = await q;
      if (viewError) throw viewError;

      let list = (rows as JournalEntryRow[]) ?? [];

      if (contactId || cashboxId) {
        const ids = list.map((e) => e.id);
        if (ids.length === 0) return [];

        let lineQ = supabase.from('journal_lines').select('journal_id').in('journal_id', ids);
        if (contactId) lineQ = lineQ.eq('contact_id', contactId);
        if (cashboxId) lineQ = lineQ.eq('cashbox_id', cashboxId);

        const { data: lineRows, error: lineErr } = await lineQ;
        if (lineErr) throw lineErr;
        const allowed = new Set((lineRows ?? []).map((r) => r.journal_id as string));
        list = list.filter((e) => allowed.has(e.id));
      }

      return list;
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

/** Preview next auto reference (JY-YYYY-NNNNN) — single lightweight RPC */
export function useNextJournalReference(entryDate: string, enabled = true) {
  return useQuery<string>({
    queryKey: ['journal_next_reference', entryDate],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('peek_next_journal_reference', {
        p_entry_date: entryDate,
      });
      if (error) throw error;
      return data as string;
    },
    enabled: enabled && !!entryDate,
    staleTime: 30_000,
  });
}

/** Fallback when peek RPC is not deployed — count-only, no row payload */
export function useJournalYearCount(entryDate: string, enabled = true) {
  const year = entryDate ? new Date(entryDate + 'T12:00:00').getFullYear() : 0;
  return useQuery<number>({
    queryKey: ['journal_year_count', year],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { count, error } = await supabase
        .from('journal_entries')
        .select('id', { count: 'exact', head: true })
        .gte('entry_date', `${year}-01-01`)
        .lte('entry_date', `${year}-12-31`);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: enabled && year > 0,
    staleTime: 30_000,
  });
}

// ── Mutations ────────────────────────────────────────────────────
export function useCreateJournalEntry() {
  const qc = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: NewJournalEntryInput) => {
      const supabase = createSupabaseBrowserClient();
      
      const { data, error } = await supabase.rpc('create_journal_entry', {
        p_reference: input.reference?.trim() || null,
        p_entry_date: input.entry_date,
        p_description: input.description || null,
        p_notes: input.notes || null,
        p_lines: input.lines.map((line, index) => ({
          category_id: line.category_id,
          debit: line.debit,
          credit: line.credit,
          description: line.description || null,
          sort_order: index,
          contact_id: line.contact_id || null,
          cashbox_id: line.cashbox_id || null,
        })),
      });
      
      if (error) throw error;
      return data as string; // returns journal entry id
    },
    onSuccess: () => {
      invalidateJournalCaches(qc);
      toast.success('تم إنشاء القيد بنجاح');
    },
    onError: (error: any) => {
      toast.error(error.message || 'فشل إنشاء القيد');
    },
  });
}

export function useUpdateJournalEntry() {
  const qc = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: { id: string } & NewJournalEntryInput) => {
      const supabase = createSupabaseBrowserClient();
      
      const { error } = await supabase.rpc('update_journal_entry', {
        p_journal_id: input.id,
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
          contact_id: line.contact_id || null,
          cashbox_id: line.cashbox_id || null,
        })),
      });
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      invalidateJournalCaches(qc, variables.id);
      toast.success('تم تعديل القيد بنجاح');
    },
    onError: (error: any) => {
      toast.error(error.message || 'فشل تعديل القيد');
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
      invalidateJournalCaches(qc, id);
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
      invalidateJournalCaches(qc, id);
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
      invalidateJournalCaches(qc);
      toast.success('تم حذف القيد بنجاح');
    },
    onError: (error: any) => {
      toast.error(error.message || 'فشل حذف القيد - يمكن حذف القيود المسودة فقط');
    },
  });
}

// ── Form drafts ────────────────────────────────────────────────────
export function useJournalFormDrafts(enabled = true) {
  return useQuery<JournalFormDraftRow[]>({
    queryKey: qk.journalFormDrafts,
    enabled,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user?.id) return [];
      const { data, error } = await supabase
        .from('journal_form_drafts')
        .select('*')
        .eq('user_id', auth.user.id)
        .order('updated_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data as JournalFormDraftRow[]) ?? [];
    },
  });
}

export function useSaveJournalFormDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveJournalDraftInput) => {
      const supabase = createSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error('يجب تسجيل الدخول لحفظ المسودة');

      if (input.id) {
        const { data, error } = await supabase
          .from('journal_form_drafts')
          .update({
            label: input.label ?? null,
            payload: input.payload as Record<string, unknown>,
          })
          .eq('id', input.id)
          .eq('user_id', uid)
          .select('*')
          .single();
        if (error) throw error;
        return data as JournalFormDraftRow;
      }

      const { data, error } = await supabase
        .from('journal_form_drafts')
        .insert({
          user_id: uid,
          label: input.label ?? null,
          payload: input.payload as Record<string, unknown>,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as JournalFormDraftRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.journalFormDrafts });
      toast.success('تم حفظ مسودة القيد');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'تعذّر حفظ المسودة');
    },
  });
}

export function useDeleteJournalFormDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error('يجب تسجيل الدخول');
      const { error } = await supabase
        .from('journal_form_drafts')
        .delete()
        .eq('id', id)
        .eq('user_id', uid);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.journalFormDrafts });
      toast.success('تم حذف المسودة');
    },
  });
}

export function useDuplicateJournalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (journalId: string) => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('duplicate_journal_entry', {
        p_journal_id: journalId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      invalidateJournalCaches(qc);
      toast.success('تم إنشاء نسخة كمسودة جديدة');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'تعذّر نسخ القيد');
    },
  });
}
