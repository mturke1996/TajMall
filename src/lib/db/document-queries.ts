'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type {
  CorrespondenceLetterRow,
  ReceiptVoucherWithLines,
  SaveCorrespondenceLetterInput,
  SaveReceiptVoucherInput,
} from '@/lib/db/types';

export const dqk = {
  correspondence: ['correspondence_letters'] as const,
  correspondenceOne: (id: string) => ['correspondence_letter', id] as const,
  receiptVouchers: ['receipt_vouchers'] as const,
  receiptOne: (id: string) => ['receipt_voucher', id] as const,
};

export function useCorrespondenceLetters(type?: 'official' | 'routine') {
  return useQuery<CorrespondenceLetterRow[]>({
    queryKey: [...dqk.correspondence, type ?? 'all'],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from('correspondence_letters')
        .select('*')
        .order('letter_date', { ascending: false });
      if (type) q = q.eq('letter_type', type);
      const { data, error } = await q;
      if (error) throw error;
      return (data as CorrespondenceLetterRow[]) ?? [];
    },
  });
}

export function useCorrespondenceLetter(id: string | null) {
  return useQuery<CorrespondenceLetterRow | null>({
    queryKey: dqk.correspondenceOne(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('correspondence_letters')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as CorrespondenceLetterRow | null;
    },
  });
}

export function useCreateCorrespondenceLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveCorrespondenceLetterInput) => {
      const supabase = createSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error('يجب تسجيل الدخول');

      const { data, error } = await supabase
        .from('correspondence_letters')
        .insert({
          letter_number: input.letter_number.trim(),
          letter_date: input.letter_date,
          letter_type: input.letter_type,
          subject: input.subject.trim(),
          recipient_name: input.recipient_name.trim(),
          recipient_title: input.recipient_title?.trim() || null,
          body: input.body.trim(),
          reference_number: input.reference_number?.trim() || null,
          status: input.status ?? 'draft',
          created_by: uid,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as CorrespondenceLetterRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dqk.correspondence });
      toast.success('تم حفظ المراسلة');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateCorrespondenceLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: SaveCorrespondenceLetterInput & { id: string }) => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('correspondence_letters')
        .update({
          letter_number: input.letter_number.trim(),
          letter_date: input.letter_date,
          letter_type: input.letter_type,
          subject: input.subject.trim(),
          recipient_name: input.recipient_name.trim(),
          recipient_title: input.recipient_title?.trim() || null,
          body: input.body.trim(),
          reference_number: input.reference_number?.trim() || null,
          status: input.status ?? 'draft',
        })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as CorrespondenceLetterRow;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: dqk.correspondence });
      qc.invalidateQueries({ queryKey: dqk.correspondenceOne(row.id) });
      toast.success('تم تحديث المراسلة');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCorrespondenceLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from('correspondence_letters').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: dqk.correspondence });
      qc.removeQueries({ queryKey: dqk.correspondenceOne(id) });
      toast.success('تم حذف المراسلة');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useReceiptVouchers() {
  return useQuery<ReceiptVoucherWithLines[]>({
    queryKey: dqk.receiptVouchers,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('receipt_vouchers')
        .select('*, receipt_voucher_lines (*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as ReceiptVoucherWithLines[]) ?? [];
    },
  });
}

function normalizeReceiptLines(lines: SaveReceiptVoucherInput['lines']) {
  const lineRows = lines
    .map((l) => ({
      description: (l.description ?? '').trim() || '—',
      amount: Math.max(0, Number(l.amount) || 0),
    }))
    .filter((l) => l.amount > 0)
    .map((l, i) => ({
      sort_order: i,
      description: l.description,
      amount: l.amount,
    }));

  const total = lineRows.reduce((s, l) => s + l.amount, 0);
  if (total <= 0) throw new Error('يجب إدخال بند واحد على الأقل بمبلغ أكبر من صفر');
  return { lineRows, total };
}

export function useReceiptVoucher(id: string | null) {
  return useQuery<ReceiptVoucherWithLines | null>({
    queryKey: dqk.receiptOne(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('receipt_vouchers')
        .select('*, receipt_voucher_lines (*)')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as ReceiptVoucherWithLines | null;
    },
  });
}

export function useCreateReceiptVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveReceiptVoucherInput) => {
      const supabase = createSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error('يجب تسجيل الدخول');

      const { lineRows, total } = normalizeReceiptLines(input.lines);

      const { data: row, error: insErr } = await supabase
        .from('receipt_vouchers')
        .insert({
          receipt_number: input.receipt_number.trim(),
          receipt_date: input.receipt_date,
          payer_name: input.payer_name.trim(),
          cashbox_id: input.cashbox_id || null,
          category_id: input.category_id || null,
          method: input.method,
          bank_name: input.bank_name?.trim() || null,
          account_number: input.account_number?.trim() || null,
          notes: input.notes?.trim() || null,
          total_amount: total,
          created_by: uid,
        })
        .select('*')
        .single();
      if (insErr) throw insErr;

      const { error: lineErr } = await supabase.from('receipt_voucher_lines').insert(
        lineRows.map((l) => ({ ...l, receipt_id: row.id })),
      );
      if (lineErr) throw lineErr;

      const { data: full, error: fetchErr } = await supabase
        .from('receipt_vouchers')
        .select('*, receipt_voucher_lines (*)')
        .eq('id', row.id)
        .single();
      if (fetchErr) throw fetchErr;
      return full as ReceiptVoucherWithLines;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dqk.receiptVouchers });
      toast.success('تم حفظ إيصال القبض');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateReceiptVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: SaveReceiptVoucherInput & { id: string }) => {
      const supabase = createSupabaseBrowserClient();
      const { lineRows, total } = normalizeReceiptLines(input.lines);

      const { error: updErr } = await supabase
        .from('receipt_vouchers')
        .update({
          receipt_number: input.receipt_number.trim(),
          receipt_date: input.receipt_date,
          payer_name: input.payer_name.trim(),
          cashbox_id: input.cashbox_id || null,
          category_id: input.category_id || null,
          method: input.method,
          bank_name: input.bank_name?.trim() || null,
          account_number: input.account_number?.trim() || null,
          notes: input.notes?.trim() || null,
          total_amount: total,
        })
        .eq('id', id);
      if (updErr) throw updErr;

      const { error: delErr } = await supabase
        .from('receipt_voucher_lines')
        .delete()
        .eq('receipt_id', id);
      if (delErr) throw delErr;

      const { error: lineErr } = await supabase.from('receipt_voucher_lines').insert(
        lineRows.map((l) => ({ ...l, receipt_id: id })),
      );
      if (lineErr) throw lineErr;

      const { data: full, error: fetchErr } = await supabase
        .from('receipt_vouchers')
        .select('*, receipt_voucher_lines (*)')
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;
      return full as ReceiptVoucherWithLines;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: dqk.receiptVouchers });
      qc.invalidateQueries({ queryKey: dqk.receiptOne(row.id) });
      toast.success('تم تحديث إيصال القبض');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteReceiptVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      // البنود تُحذف تلقائياً عبر ON DELETE CASCADE
      const { error } = await supabase.from('receipt_vouchers').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: dqk.receiptVouchers });
      qc.removeQueries({ queryKey: dqk.receiptOne(id) });
      toast.success('تم حذف إيصال القبض');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
