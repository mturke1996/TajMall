'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { TenantRentCalendar } from '@/lib/rent-months';
import { currentYear } from '@/lib/rent-months';
import { normalizeRpcRentCalendar } from '@/lib/rent-calendar-from-charges';
import { qk } from '@/lib/db/queries';
import type { ChargeAllocationInput } from '@/lib/db/types';

export const rentQk = {
  calendar: (tenantId: string, year: number) =>
    ['tenant_rent_calendar', tenantId, year] as const,
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
      if (error) throw error;
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
