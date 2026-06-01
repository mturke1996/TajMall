'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type {
  FiscalPeriodRow,
  MallUnitRow,
  LeaseContractRow,
  LeaseContractWithRelations,
  TenantChargeRow,
  TenantChargeWithRelations,
  AccountMappingRow
} from './types';

export const mqk = {
  fiscalPeriods: ['fiscal_periods'] as const,
  mallUnits: ['mall_units'] as const,
  leaseContracts: ['lease_contracts'] as const,
  tenantCharges: (contractId?: string) => ['tenant_charges', contractId ?? 'ALL'] as const,
  trialBalance: (year: number) => ['trial_balance', year] as const,
  profitLoss: (year: number, period: string, quarter?: number | null, month?: number | null) => 
    ['profit_loss', year, period, quarter ?? 'none', month ?? 'none'] as const,
  cashFlow: (year: number) => ['cash_flow', year] as const,
  ledger: (categoryId: string, start?: string, end?: string) => ['ledger', categoryId, start ?? '', end ?? ''] as const,
};

// ── Fiscal Periods ────────────────────────────────────────────────
export function useFiscalPeriods() {
  return useQuery<FiscalPeriodRow[]>({
    queryKey: mqk.fiscalPeriods,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('fiscal_periods')
        .select('*')
        .order('start_date', { ascending: false });
      if (error) throw error;
      return (data as FiscalPeriodRow[]) ?? [];
    },
  });
}

export function useCreateFiscalPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<FiscalPeriodRow, 'id' | 'created_at' | 'updated_at' | 'closed_at' | 'closed_by'>) => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('fiscal_periods')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as FiscalPeriodRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mqk.fiscalPeriods });
      toast.success('تم إنشاء الفترة المالية بنجاح');
    },
    onError: (err: any) => {
      toast.error(err.message || 'فشل إنشاء الفترة المالية');
    }
  });
}

export function useCloseFiscalPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; closed: boolean }) => {
      const supabase = createSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getUser();
      const patch = vars.closed ? {
        is_closed: true,
        closed_at: new Date().toISOString(),
        closed_by: auth?.user?.id ?? null
      } : {
        is_closed: false,
        closed_at: null,
        closed_by: null
      };

      const { error } = await supabase
        .from('fiscal_periods')
        .update(patch)
        .eq('id', vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mqk.fiscalPeriods });
      qc.invalidateQueries({ queryKey: ['journal_entries'] });
      toast.success('تم تحديث حالة إغلاق الفترة المالية');
    },
    onError: (err: any) => {
      toast.error(err.message || 'فشل تحديث حالة الإغلاق');
    }
  });
}

// ── Mall Units ────────────────────────────────────────────────────
export function useMallUnits() {
  return useQuery<MallUnitRow[]>({
    queryKey: mqk.mallUnits,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('mall_units')
        .select('*')
        .order('unit_number', { ascending: true });
      if (error) throw error;
      return (data as MallUnitRow[]) ?? [];
    },
  });
}

export function useCreateMallUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<MallUnitRow, 'id' | 'created_at' | 'updated_at'>) => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('mall_units')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as MallUnitRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mqk.mallUnits });
      toast.success('تمت إضافة المحل بنجاح');
    },
    onError: (err: any) => {
      toast.error(err.message || 'فشل إضافة المحل');
    }
  });
}

export function useUpdateMallUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string } & Partial<MallUnitRow>) => {
      const supabase = createSupabaseBrowserClient();
      const { id, ...patch } = vars;
      const { data, error } = await supabase
        .from('mall_units')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as MallUnitRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mqk.mallUnits });
      toast.success('تم تحديث بيانات المحل بنجاح');
    },
    onError: (err: any) => {
      toast.error(err.message || 'فشل تحديث بيانات المحل');
    }
  });
}

export function useDeleteMallUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from('mall_units').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mqk.mallUnits });
      toast.success('تم حذف المحل بنجاح');
    },
    onError: (err: any) => {
      toast.error(err.message || 'لا يمكن حذف المحل لوجود عقود مرتبطة به');
    }
  });
}

// ── Lease Contracts ───────────────────────────────────────────────
export function useLeaseContracts() {
  return useQuery<LeaseContractWithRelations[]>({
    queryKey: mqk.leaseContracts,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('lease_contracts')
        .select(`
          *,
          unit:mall_units(id, unit_number, floor, area_sqm),
          tenant:contacts(id, name, phone)
        `)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}

export function useCreateLeaseContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<LeaseContractRow, 'id' | 'created_at' | 'updated_at'>) => {
      const supabase = createSupabaseBrowserClient();
      
      // 1. Insert contract
      const { data: contract, error: err } = await supabase
        .from('lease_contracts')
        .insert(input)
        .select()
        .single();
      if (err) throw err;

      // 2. Mark unit as occupied
      await supabase
        .from('mall_units')
        .update({ status: 'OCCUPIED' })
        .eq('id', input.unit_id);

      // 3. For security deposits: if deposit_amount > 0, generate a deposit transaction
      // and let the DB triggers post it to journal_entries.
      if (Number(input.deposit_amount) > 0) {
        const depositCategoryCode = 'LIA-DEP';
        const { data: cat } = await supabase
          .from('categories')
          .select('id')
          .eq('code', depositCategoryCode)
          .single();

        const { data: cashbox } = await supabase
          .from('cashboxes')
          .select('id')
          .eq('active', true)
          .order('created_at')
          .limit(1)
          .single();

        if (cat && cashbox) {
          const { data: auth } = await supabase.auth.getUser();
          await supabase.from('transactions').insert({
            kind: 'REVENUE',
            status: 'POSTED',
            method: 'CASH',
            amount: Number(input.deposit_amount),
            currency: 'LYD',
            tx_date: input.start_date,
            description: `تأمين مستحق العقد رقم ${contract.id.slice(0,8)} للمستأجر`,
            category_id: cat.id,
            cashbox_id: cashbox.id,
            contact_id: input.tenant_id,
            contact_type: 'PAYER',
            created_by: auth?.user?.id ?? null,
            posted_at: new Date().toISOString()
          });
        }
      }

      return contract as LeaseContractRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mqk.leaseContracts });
      qc.invalidateQueries({ queryKey: mqk.mallUnits });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['journal_entries'] });
      qc.invalidateQueries({ queryKey: ['cashbox_balances'] });
      toast.success('تم توثيق عقد الإيجار بنجاح وتأمين المحل');
    },
    onError: (err: any) => {
      toast.error(err.message || 'فشل إنشاء عقد الإيجار');
    }
  });
}

export function useTerminateLeaseContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; unitId: string }) => {
      const supabase = createSupabaseBrowserClient();
      
      const { error } = await supabase
        .from('lease_contracts')
        .update({ status: 'TERMINATED', end_date: new Date().toISOString().slice(0,10) })
        .eq('id', vars.id);
      if (error) throw error;

      await supabase
        .from('mall_units')
        .update({ status: 'AVAILABLE' })
        .eq('id', vars.unitId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mqk.leaseContracts });
      qc.invalidateQueries({ queryKey: mqk.mallUnits });
      toast.success('تم إنهاء عقد الإيجار وتفريغ المحل');
    },
    onError: (err: any) => {
      toast.error(err.message || 'فشل إنهاء العقد');
    }
  });
}

// ── Tenant Charges ────────────────────────────────────────────────
export function useTenantCharges(contractId?: string) {
  return useQuery<TenantChargeWithRelations[]>({
    queryKey: mqk.tenantCharges(contractId),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from('tenant_charges')
        .select(`
          *,
          contract:lease_contracts(
            id,
            start_date,
            end_date,
            monthly_rent,
            unit:mall_units(id, unit_number, floor),
            tenant:contacts(id, name)
          )
        `)
        .order('due_date', { ascending: false });
      
      if (contractId) q = q.eq('contract_id', contractId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}

export function useCreateTenantCharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<TenantChargeRow, 'id' | 'created_at' | 'updated_at' | 'status' | 'total_paid' | 'journal_entry_id'>) => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('tenant_charges')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as TenantChargeRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant_charges'] });
      qc.invalidateQueries({ queryKey: ['journal_entries'] });
      toast.success('تم تسجيل المطالبة المالية بنجاح وصبها بالدفتر اليومي');
    },
    onError: (err: any) => {
      toast.error(err.message || 'فشل تسجيل المطالبة');
    }
  });
}

export function useGenerateMonthlyCharges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targetMonth: string) => {
      const supabase = createSupabaseBrowserClient();
      // Get all active lease contracts
      const { data: contracts, error: cErr } = await supabase
        .from('lease_contracts')
        .select('*')
        .eq('status', 'ACTIVE');
      if (cErr) throw cErr;

      let generatedCount = 0;
      const targetDate = `${targetMonth}-01`;
      
      for (const contract of contracts) {
        // Check if charge already exists for this contract and month
        const { data: existing } = await supabase
          .from('tenant_charges')
          .select('id')
          .eq('contract_id', contract.id)
          .eq('type', 'RENT')
          .eq('due_date', targetDate);

        if (existing && existing.length > 0) continue;

        // Create Rent Charge
        if (Number(contract.monthly_rent) > 0) {
          await supabase.from('tenant_charges').insert({
            contract_id: contract.id,
            amount: Number(contract.monthly_rent),
            due_date: targetDate,
            type: 'RENT',
            description: `إيجار شهر ${targetMonth}`,
            status: 'UNPAID'
          });
          generatedCount++;
        }

        // Create Service Charge if any
        if (Number(contract.services_amount) > 0) {
          await supabase.from('tenant_charges').insert({
            contract_id: contract.id,
            amount: Number(contract.services_amount),
            due_date: targetDate,
            type: 'SERVICE',
            description: `رسوم خدمات وصيانة شهر ${targetMonth}`,
            status: 'UNPAID'
          });
        }
      }

      return generatedCount;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ['tenant_charges'] });
      qc.invalidateQueries({ queryKey: ['journal_entries'] });
      toast.success(`تم توليد عدد ${count} مطالبة إيجار وخدمات بنجاح للمستأجرين`);
    },
    onError: (err: any) => {
      toast.error(err.message || 'فشل توليد المطالبات الشهرية');
    }
  });
}

// ── Financial Reports Hooks ───────────────────────────────────────
export function useTrialBalance(year: number) {
  return useQuery({
    queryKey: mqk.trialBalance(year),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('get_trial_balance', { p_year: year });
      if (error) throw error;
      return data;
    },
  });
}

export function useProfitLoss(year: number, period: string, quarter?: number | null, month?: number | null) {
  return useQuery({
    queryKey: mqk.profitLoss(year, period, quarter, month),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('get_profit_loss', {
        p_year: year,
        p_period: period,
        p_quarter: quarter || null,
        p_month: month !== undefined && month !== null ? month : null
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useCashFlow(year: number) {
  return useQuery({
    queryKey: mqk.cashFlow(year),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('get_cash_flow', { p_year: year });
      if (error) throw error;
      return data;
    },
  });
}

export function useGeneralLedger(categoryId: string, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: mqk.ledger(categoryId, startDate, endDate),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let query = supabase
        .from('journal_lines_with_categories')
        .select(`
          debit,
          credit,
          description,
          journal:journal_entries(number, entry_date, reference, status)
        `)
        .eq('category_id', categoryId)
        .eq('journal.status', 'POSTED'); // only show posted entries
      
      if (startDate) {
        query = query.gte('journal.entry_date', startDate);
      }
      if (endDate) {
        query = query.lte('journal.entry_date', endDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Filter out rows where journal is null (due to date filtering on join)
      const filtered = (data as any[] ?? []).filter(item => item.journal !== null);
      
      // Sort by date and entry number
      filtered.sort((a, b) => {
        const dateA = new Date(a.journal.entry_date).getTime();
        const dateB = new Date(b.journal.entry_date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return a.journal.number - b.journal.number;
      });

      return filtered;
    },
    enabled: !!categoryId,
  });
}

export function useBackfillTransactions() {
  return useMutation({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('backfill_existing_transactions_to_ledger');
      if (error) throw error;
      return data as string;
    },
    onSuccess: (res) => {
      toast.success(res);
    },
    onError: (err: any) => {
      toast.error(err.message || 'فشل الترحيل التراكمي');
    }
  });
}
