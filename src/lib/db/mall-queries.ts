'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { chargeBelongsToTenant } from '@/lib/rent-calendar-from-charges';
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
  tenantChargesForTenant: (tenantId: string) =>
    ['tenant_charges', 'tenant', tenantId] as const,
  trialBalance: (year: number) => ['trial_balance', year] as const,
  profitLoss: (year: number, period: string, quarter?: number | null, month?: number | null) => 
    ['profit_loss', year, period, quarter ?? 'none', month ?? 'none'] as const,
  cashFlow: (year: number) => ['cash_flow', year] as const,
  ledger: (categoryId: string, start?: string, end?: string) => ['ledger', categoryId, start ?? '', end ?? ''] as const,
  balanceSheet: (asOf: string) => ['balance_sheet', asOf] as const,
  tenantArAging: (asOf: string) => ['tenant_ar_aging', asOf] as const,
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

export function useTenantLeaseContracts(tenantId: string | undefined) {
  return useQuery<LeaseContractWithRelations[]>({
    queryKey: [...mqk.leaseContracts, 'tenant', tenantId ?? ''],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('lease_contracts')
        .select(`
          *,
          unit:mall_units(id, unit_number, floor, area_sqm),
          tenant:contacts(id, name, phone)
        `)
        .eq('tenant_id', tenantId!)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return (data as LeaseContractWithRelations[]) ?? [];
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
      const { data: unit } = await supabase
        .from('mall_units')
        .select('unit_number, floor')
        .eq('id', input.unit_id)
        .single();

      await supabase
        .from('mall_units')
        .update({ status: 'OCCUPIED' })
        .eq('id', input.unit_id);

      // 2b. مزامنة بيانات الإيجار والمحل على ملف المستأجر
      await supabase
        .from('contacts')
        .update({
          monthly_rent: input.monthly_rent,
          shop_number: unit?.unit_number ?? null,
          floor: unit?.floor ?? null,
        })
        .eq('id', input.tenant_id);

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
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['tenant_rent_summary'] });
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
const TENANT_CHARGE_SELECT = `
  *,
  contract:lease_contracts(
    id,
    tenant_id,
    start_date,
    end_date,
    monthly_rent,
    unit:mall_units(id, unit_number, floor),
    tenant:contacts(id, name, phone)
  ),
  journal:journal_entries(id, number, entry_date, description, status),
  rent_journal_links:tenant_rent_journal_links(
    id,
    amount,
    journal_entry_id,
    journal:journal_entries(id, number, entry_date, description, status)
  )
`;

export function useTenantCharges(contractId?: string) {
  return useQuery<TenantChargeWithRelations[]>({
    queryKey: mqk.tenantCharges(contractId),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from('tenant_charges')
        .select(TENANT_CHARGE_SELECT)
        .order('due_date', { ascending: false });

      if (contractId) q = q.eq('contract_id', contractId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as TenantChargeWithRelations[]) ?? [];
    },
  });
}

export function useTenantChargesForTenant(tenantId: string) {
  return useQuery<TenantChargeWithRelations[]>({
    queryKey: mqk.tenantChargesForTenant(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('tenant_charges')
        .select(TENANT_CHARGE_SELECT)
        .order('due_date', { ascending: false });
      if (error) throw error;
      return ((data as TenantChargeWithRelations[]) ?? []).filter((c) =>
        chargeBelongsToTenant(c, tenantId),
      );
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
      qc.invalidateQueries({ queryKey: ['mall_rent_charges_year'] });
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
      qc.invalidateQueries({ queryKey: ['mall_rent_charges_year'] });
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

export type GeneralLedgerLineRow = {
  debit: number;
  credit: number;
  description: string | null;
  entry_date: string;
  journal_number: number;
  journal_reference: string | null;
  journal_id: string;
};

export type GeneralLedgerResult = {
  openingDebit: number;
  openingCredit: number;
  lines: GeneralLedgerLineRow[];
};

export function useGeneralLedger(categoryId: string, startDate?: string, endDate?: string) {
  return useQuery<GeneralLedgerResult>({
    queryKey: mqk.ledger(categoryId, startDate, endDate),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();

      const { data, error } = await supabase.rpc('get_general_ledger_lines', {
        p_category_id: categoryId,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
      });

      if (!error && data) {
        const obj = data as Record<string, unknown>;
        const lines = ((obj.lines as Array<Record<string, unknown>>) ?? []).map((row) => ({
          debit: Number(row.debit ?? 0),
          credit: Number(row.credit ?? 0),
          description: (row.line_description as string) ?? null,
          entry_date: row.entry_date as string,
          journal_number: Number(row.journal_number ?? 0),
          journal_reference: (row.journal_reference as string) ?? null,
          journal_id: row.journal_id as string,
        }));
        return {
          openingDebit: Number(obj.opening_debit ?? 0),
          openingCredit: Number(obj.opening_credit ?? 0),
          lines,
        };
      }

      if (error) {
        const msg = error.message ?? '';
        const rpcMissing =
          msg.includes('get_general_ledger_lines') ||
          msg.includes('schema cache') ||
          error.code === 'PGRST202';

        if (!rpcMissing) throw error;

        // Fallback: manual join via two queries
        const { data: lines, error: linesErr } = await supabase
          .from('journal_lines')
          .select('debit, credit, description, journal_id')
          .eq('category_id', categoryId);

        if (linesErr) throw linesErr;
        if (!lines?.length) return { openingDebit: 0, openingCredit: 0, lines: [] };

        const journalIds = [...new Set(lines.map((l) => l.journal_id as string))];
        let jq = supabase
          .from('journal_entries')
          .select('id, number, reference, entry_date, status')
          .in('id', journalIds)
          .eq('status', 'POSTED');

        if (startDate) jq = jq.gte('entry_date', startDate);
        if (endDate) jq = jq.lte('entry_date', endDate);

        const { data: journals, error: jErr } = await jq;
        if (jErr) throw jErr;

        const jMap = new Map((journals ?? []).map((j) => [j.id as string, j]));

        const merged: GeneralLedgerLineRow[] = [];
        for (const l of lines) {
          const j = jMap.get(l.journal_id as string);
          if (!j) continue;
          merged.push({
            debit: Number(l.debit ?? 0),
            credit: Number(l.credit ?? 0),
            description: l.description as string | null,
            entry_date: j.entry_date as string,
            journal_number: Number(j.number ?? 0),
            journal_reference: (j.reference as string) ?? null,
            journal_id: j.id as string,
          });
        }

        merged.sort((a, b) => {
          const da = new Date(a.entry_date).getTime();
          const db = new Date(b.entry_date).getTime();
          if (da !== db) return da - db;
          return a.journal_number - b.journal_number;
        });

        return { openingDebit: 0, openingCredit: 0, lines: merged };
      }

      // No error and no data — return an empty ledger.
      return { openingDebit: 0, openingCredit: 0, lines: [] };
    },
    enabled: !!categoryId,
  });
}

export function useBalanceSheet(asOf: string) {
  return useQuery({
    queryKey: mqk.balanceSheet(asOf),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('get_balance_sheet', { p_as_of: asOf });
      if (error) throw error;
      return data;
    },
    enabled: !!asOf,
  });
}

export function useTenantArAging(asOf: string) {
  return useQuery({
    queryKey: mqk.tenantArAging(asOf),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('get_tenant_ar_aging', { p_as_of: asOf });
      if (error) throw error;
      return data;
    },
    enabled: !!asOf,
  });
}

export function useBackfillTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('backfill_existing_transactions_to_ledger');
      if (error) throw error;
      return data as string;
    },
    onSuccess: (res) => {
      toast.success(res);
      qc.invalidateQueries({ queryKey: ['trial_balance'] });
      qc.invalidateQueries({ queryKey: ['profit_loss'] });
      qc.invalidateQueries({ queryKey: ['cash_flow'] });
      qc.invalidateQueries({ queryKey: ['ledger'] });
      qc.invalidateQueries({ queryKey: ['journal_entries'] });
      qc.invalidateQueries({ queryKey: ['journal_summary'] });
      qc.invalidateQueries({ queryKey: ['balance_sheet'] });
      qc.invalidateQueries({ queryKey: ['tenant_ar_aging'] });
      qc.invalidateQueries({ queryKey: ['tenant_charges'] });
      qc.invalidateQueries({ queryKey: ['mall_rent_charges_year'] });
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || 'فشل الترحيل التراكمي');
    },
  });
}
