'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { TenantRentCalendar } from '@/lib/rent-months';
import { currentYear } from '@/lib/rent-months';
import {
  buildMergedTenantRentCalendar,
  normalizeRpcRentCalendar,
} from '@/lib/rent-calendar-from-charges';
import { qk } from '@/lib/db/queries';
import { setTenantRentMonthStatus } from '@/lib/db/set-rent-month-status';
import { useTenantChargesForTenant } from '@/lib/db/mall-queries';
import type { ChargeAllocationInput, TransactionWithRelations } from '@/lib/db/types';

export const rentQk = {
  calendar: (tenantId: string, year: number) =>
    ['tenant_rent_calendar', tenantId, year] as const,
  exemptMonths: (tenantId: string) =>
    ['tenant_rent_exempt_months', tenantId] as const,
  priceBands: (tenantId: string) =>
    ['tenant_rent_price_bands', tenantId] as const,
};

export function useTenantRentCalendar(tenantId: string, year = currentYear()) {
  return useQuery({
    queryKey: rentQk.calendar(tenantId, year),
    queryFn: async (): Promise<TenantRentCalendar> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('get_tenant_rent_calendar', {
        p_tenant_id: tenantId,
        p_year: year,
      });
      if (error) {
        console.warn('[get_tenant_rent_calendar]', error.message);
        throw new Error(
          error.message?.includes('permission') || error.code === '42501'
            ? 'لا صلاحية لعرض تقويم الإيجار'
            : `تعذّر تحميل تقويم الإيجار: ${error.message}`,
        );
      }
      const normalized = normalizeRpcRentCalendar(data, tenantId, year);
      if (normalized) return normalized;
      return {
        year,
        tenant_id: tenantId,
        monthly_rent: 0,
        contract_id: null,
        months: [],
      };
    },
    enabled: !!tenantId,
    staleTime: 20_000,
    retry: false,
  });
}

/** تقويم مدمج: مطالبات + RPC + تحصيلات إيجار */
export function useMergedTenantRentCalendar(
  tenantId: string,
  monthlyRent: number,
  year = currentYear(),
) {
  const { data: charges = [] } = useTenantChargesForTenant(tenantId);
  const { data: rpcData, isLoading: rpcLoading } = useTenantRentCalendar(
    tenantId,
    year,
  );

  const calendar = useMemo(
    () =>
      buildMergedTenantRentCalendar({
        tenantId,
        year,
        monthlyRent,
        charges,
        rpcCalendar: rpcData
          ? normalizeRpcRentCalendar(rpcData, tenantId, year)
          : null,
      }),
    [tenantId, year, monthlyRent, charges, rpcData],
  );

  return { calendar, isLoading: rpcLoading };
}

export function invalidateRentCalendarQueries(
  qc: ReturnType<typeof useQueryClient>,
  tenantId: string,
  months: string[],
) {
  qc.invalidateQueries({ queryKey: ['tenant_charges'] });
  qc.invalidateQueries({ queryKey: ['lease_contracts'] });
  qc.invalidateQueries({
    predicate: (q) => q.queryKey[0] === 'tenant_rent_calendar',
  });
  qc.invalidateQueries({ queryKey: qk.tenantRentSummary });
  qc.invalidateQueries({ queryKey: ['mall_rent_charges_year'] });
  qc.invalidateQueries({ queryKey: rentQk.exemptMonths(tenantId) });
  qc.invalidateQueries({ queryKey: rentQk.priceBands(tenantId) });
  for (const month of months) {
    const y = Number(month.slice(0, 4));
    if (!Number.isNaN(y)) {
      qc.invalidateQueries({ queryKey: rentQk.calendar(tenantId, y) });
    }
  }
}

/** ربط شهر إيجار بقيد يومية (مدفوع) أو إلغاء الربط (غير مدفوع) */
export function useSetTenantRentMonthStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tenantId: string;
      months: string[];
      paid: boolean;
      journalEntryId?: string | null;
      amount?: number | null;
    }) =>
      setTenantRentMonthStatus({
        tenantId: input.tenantId,
        months: input.months,
        paid: input.paid,
        journalEntryId: input.journalEntryId,
        amount: input.amount,
      }),
    onSuccess: (_d, vars) => {
      invalidateRentCalendarQueries(qc, vars.tenantId, vars.months);
      qc.invalidateQueries({ queryKey: ['journal_entries'] });
    },
  });
}

export function useEnsureTenantRentCharges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tenantId: string; months: string[] }) => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('ensure_tenant_rent_charges', {
        p_tenant_id: input.tenantId,
        p_months: input.months,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['tenant_charges'] });
      qc.invalidateQueries({ queryKey: rentQk.calendar(vars.tenantId, currentYear()) });
      qc.invalidateQueries({ queryKey: qk.tenantRentSummary });
    },
  });
}

/** يُنشئ مطالبات الشهور المحددة ويُرجع تخصيصات للمبلغ المدفوع */
export async function buildRentMonthAllocations(
  tenantId: string,
  months: string[],
  paymentAmount: number,
): Promise<ChargeAllocationInput[]> {
  const supabase = createSupabaseBrowserClient();
  const { error: ensureErr } = await supabase.rpc('ensure_tenant_rent_charges', {
    p_tenant_id: tenantId,
    p_months: months,
  });
  if (ensureErr) throw ensureErr;

  let { data: contract, error: contractErr } = await supabase
    .from('lease_contracts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'ACTIVE')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (contractErr) throw contractErr;
  if (!contract?.id) {
    const fallback = await supabase
      .from('lease_contracts')
      .select('id')
      .eq('tenant_id', tenantId)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    contract = fallback.data;
  }
  if (!contract?.id) throw new Error('لا يوجد عقد إيجار لهذا المستأجر');

  let remaining = paymentAmount;
  const allocations: ChargeAllocationInput[] = [];

  for (const month of [...months].sort()) {
    if (remaining <= 0) break;
    const due = `${month}-01`;
    const { data: charge, error } = await supabase
      .from('tenant_charges')
      .select('id, amount, total_paid')
      .eq('contract_id', contract.id)
      .eq('type', 'RENT')
      .eq('due_date', due)
      .maybeSingle();
    if (error) throw error;
    if (!charge?.id) continue;
    const open = Math.max(0, Number(charge.amount) - Number(charge.total_paid));
    if (open <= 0) continue;
    const apply = Math.min(remaining, open);
    allocations.push({ charge_id: charge.id, amount: apply });
    remaining -= apply;
  }

  return allocations;
}

export function useTenantRentExemptMonths(tenantId: string) {
  return useQuery({
    queryKey: rentQk.exemptMonths(tenantId),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('tenant_rent_exempt_months')
        .select('id, tenant_id, month_key, source, notes, created_at')
        .eq('tenant_id', tenantId)
        .order('month_key', { ascending: true });
      if (error) {
        if (error.code === '42P01' || error.message.includes('does not exist')) {
          return [];
        }
        throw error;
      }
      return data ?? [];
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  });
}

export function useSetTenantRentExemptMonths() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tenantId: string;
      exemptMonths: string[];
      removeMonths?: string[];
      claimStart?: string | null;
    }) => {
      const supabase = createSupabaseBrowserClient();

      if (input.removeMonths?.length) {
        const { error: removeErr } = await supabase.rpc(
          'set_tenant_rent_exempt_months',
          {
            p_tenant_id: input.tenantId,
            p_months: input.removeMonths,
            p_exempt: false,
            p_claim_start: null,
          },
        );
        if (removeErr) throw removeErr;
      }

      const { data, error } = await supabase.rpc('set_tenant_rent_exempt_months', {
        p_tenant_id: input.tenantId,
        p_months: input.exemptMonths,
        p_exempt: true,
        p_claim_start: input.claimStart ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      const touched = [...vars.exemptMonths, ...(vars.removeMonths ?? [])];
      invalidateRentCalendarQueries(qc, vars.tenantId, touched);
    },
  });
}

export type TenantRentPriceBandRow = {
  id: string;
  tenant_id: string;
  from_month: string;
  to_month: string;
  amount: number | string;
  notes: string | null;
};

export function useTenantRentPriceBands(tenantId: string) {
  return useQuery({
    queryKey: rentQk.priceBands(tenantId),
    queryFn: async (): Promise<TenantRentPriceBandRow[]> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('tenant_rent_price_bands')
        .select('id, tenant_id, from_month, to_month, amount, notes')
        .eq('tenant_id', tenantId)
        .order('from_month', { ascending: true });
      if (error) {
        if (error.code === '42P01' || error.message.includes('does not exist')) {
          return [];
        }
        throw error;
      }
      return (data as TenantRentPriceBandRow[]) ?? [];
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  });
}

export function useSetTenantRentPriceBands() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tenantId: string;
      bands: Array<{
        from_month: string;
        to_month: string;
        amount: number;
        notes?: string | null;
      }>;
    }) => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('set_tenant_rent_price_bands', {
        p_tenant_id: input.tenantId,
        p_bands: input.bands,
      });
      if (error) throw error;
      return data as {
        ok: boolean;
        bands_count: number;
        unpaid_charges_updated: number;
        sync?: {
          touched?: number;
          amount_changed?: number;
          marked_paid?: number;
          marked_partial?: number;
          marked_unpaid?: number;
          frozen_settled?: number;
        };
      };
    },
    onSuccess: (_d, vars) => {
      invalidateRentCalendarQueries(qc, vars.tenantId, []);
      qc.invalidateQueries({ queryKey: ['tenant_rent_summary_for_month'] });
      qc.invalidateQueries({ queryKey: qk.tenantRentSummary });
    },
  });
}

/** مبلغ الإيجار لشهر عبر الدالة SQL (جدول الأسعار → العقد → جهة الاتصال) */
export async function resolveTenantRentAmountClient(
  tenantId: string,
  monthKey: string,
): Promise<number> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('resolve_tenant_rent_amount', {
    p_tenant_id: tenantId,
    p_month_key: monthKey,
  });
  if (error) {
    if (error.code === '42883' || error.message.includes('does not exist')) {
      return 0;
    }
    throw error;
  }
  return Number(data) || 0;
}
