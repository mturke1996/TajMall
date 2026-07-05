'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export const auditQk = {
  feed: (params: AuditFeedParams) => ['audit_log_feed', params] as const,
};

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

export type AuditLogRow = {
  id: string;
  created_at: string;
  actor_name_ar: string | null;
  actor_role: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  entity_label_ar: string | null;
  summary_ar: string;
  business_date: string | null;
  amount_delta: number | null;
  currency: string;
  balance_total_after: number | null;
  cashbox_balance_after: number | null;
  severity: 'info' | 'success' | 'warning' | 'danger';
  metadata: Record<string, unknown>;
};

export type AuditFeedParams = {
  limit?: number;
  offset?: number;
  entityType?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
};

type AuditFeedResponse = {
  rows: AuditLogRow[];
  total: number;
};

export function useAuditLogFeed(params: AuditFeedParams = {}) {
  const limit = params.limit ?? 60;
  const offset = params.offset ?? 0;

  return useQuery({
    queryKey: auditQk.feed({ ...params, limit, offset }),
    queryFn: async (): Promise<AuditFeedResponse> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('get_audit_log_feed', {
        p_limit: limit,
        p_offset: offset,
        p_entity_type: params.entityType ?? null,
        p_from_date: params.fromDate ?? null,
        p_to_date: params.toDate ?? null,
      });
      if (error) throw error;
      const payload = data as { rows?: AuditLogRow[]; total?: number } | null;
      return {
        rows: payload?.rows ?? [],
        total: Number(payload?.total ?? 0),
      };
    },
    staleTime: 30_000,
  });
}

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  transaction: 'معاملة مالية',
  cashbox: 'خزينة',
  cash_transfer: 'تحويل خزينة',
  journal_entry: 'قيد يومية',
  tenant_charge: 'مطالبة مستأجر',
  disbursement_voucher: 'إذن صرف',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  INSERT: 'إضافة',
  UPDATE: 'تعديل',
  DELETE: 'حذف',
};
