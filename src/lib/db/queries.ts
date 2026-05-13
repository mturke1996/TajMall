'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type {
  CategoryRow,
  CashboxRow,
  CashboxBalanceRow,
  TransactionWithRelations,
  NewTransactionInput,
  ProfileRow,
  ContactRow,
  ContactKind,
} from './types';

/**
 * Centralised TanStack Query hooks over Supabase JS.
 * Pages call these instead of touching `supabase.from(...)` directly.
 */

// ── keys ─────────────────────────────────────────────────────────
export const qk = {
  categories: ['categories'] as const,
  cashboxes: ['cashboxes'] as const,
  cashboxBalances: ['cashbox_balances'] as const,
  profiles: ['profiles'] as const,
  contacts: (kind?: ContactKind) => ['contacts', kind ?? 'ALL'] as const,
  tenants: ['contacts', 'TENANT'] as const,
  employees: ['contacts', 'EMPLOYEE'] as const,
  tenantRentSummary: ['tenant_rent_summary'] as const,
  employeeSummary: ['employee_summary'] as const,
  monthlySummary: ['monthly_summary'] as const,
  transactions: (kind?: 'REVENUE' | 'EXPENSE') =>
    ['transactions', kind ?? 'ALL'] as const,
  recentTransactions: ['transactions', 'recent'] as const,
  dashboardStats: ['dashboard_stats'] as const,
  topExpenseCategories: ['top_expense_categories'] as const,
};

// ── categories ───────────────────────────────────────────────────
export function useCategories(kind?: 'REVENUE' | 'EXPENSE') {
  return useQuery<CategoryRow[]>({
    queryKey: kind ? ['categories', kind] : qk.categories,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from('categories')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true });
      if (kind) q = q.eq('kind', kind);
      const { data, error } = await q;
      if (error) throw error;
      return (data as CategoryRow[]) ?? [];
    },
  });
}

// ── cashboxes ────────────────────────────────────────────────────
export function useCashboxes() {
  return useQuery<CashboxRow[]>({
    queryKey: qk.cashboxes,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('cashboxes')
        .select('*')
        .eq('active', true)
        .order('code', { ascending: true });
      if (error) throw error;
      return (data as CashboxRow[]) ?? [];
    },
  });
}

export function useCashboxBalances() {
  return useQuery<CashboxBalanceRow[]>({
    queryKey: qk.cashboxBalances,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('cashbox_balances')
        .select('*')
        .order('code', { ascending: true });
      if (error) throw error;
      return (data as CashboxBalanceRow[]) ?? [];
    },
  });
}

// ── profiles (team) ──────────────────────────────────────────────
export function useProfiles() {
  return useQuery<ProfileRow[]>({
    queryKey: qk.profiles,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as ProfileRow[]) ?? [];
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; role?: string; full_name_ar?: string | null }) => {
      const supabase = createSupabaseBrowserClient();
      const patch: Record<string, string | null> = {};
      if (input.role !== undefined) patch.role = input.role;
      if (input.full_name_ar !== undefined) patch.full_name_ar = input.full_name_ar;
      if (!Object.keys(patch).length) return;
      const { error } = await supabase.from('profiles').update(patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.profiles });
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

// ── contacts (customers, tenants, employees, vendors) ─────────────
export function useContacts(kind?: ContactKind) {
  return useQuery<ContactRow[]>({
    queryKey: qk.contacts(kind),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from('contacts')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (kind) q = q.eq('kind', kind);
      const { data, error } = await q;
      if (error) throw error;
      return (data as ContactRow[]) ?? [];
    },
  });
}

export function useTenants() {
  return useContacts('TENANT');
}

export function useEmployees() {
  return useContacts('EMPLOYEE');
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<ContactRow, 'id' | 'created_at' | 'updated_at'>) => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.from('contacts').insert(input).select().single();
      if (error) throw error;
      return data as ContactRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string } & Partial<ContactRow>) => {
      const supabase = createSupabaseBrowserClient();
      const { id, ...patch } = input;
      const { data, error } = await supabase.from('contacts').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data as ContactRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from('contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: qk.tenantRentSummary });
      qc.invalidateQueries({ queryKey: qk.employeeSummary });
    },
  });
}

// ── views ────────────────────────────────────────────────────────
export type TenantRentSummary = {
  id: string;
  name: string;
  shop_number: string | null;
  floor: string | null;
  monthly_rent: string | null;
  phone: string | null;
  current_month_paid: string;
  current_month_status: 'no_rent_set' | 'paid_full' | 'paid_partial' | 'unpaid';
  last_12_months_revenue: string;
  total_balance: string;
};

export function useTenantRentSummary() {
  return useQuery<TenantRentSummary[]>({
    queryKey: qk.tenantRentSummary,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('tenant_rent_summary')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data as TenantRentSummary[]) ?? [];
    },
  });
}

export type EmployeeSummary = {
  id: string;
  name: string;
  job_title: string | null;
  department: string | null;
  salary: string | null;
  hire_date: string | null;
  phone: string | null;
  last_12_months_salary_paid: string;
  months_with_payment: number;
};

export function useEmployeeSummary() {
  return useQuery<EmployeeSummary[]>({
    queryKey: qk.employeeSummary,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('employee_summary')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data as EmployeeSummary[]) ?? [];
    },
  });
}

export type MonthlySummary = {
  month: string;
  month_label: string;
  revenue_count: number;
  expense_count: number;
  revenue_total: string;
  expense_total: string;
  net_profit: string;
};

export function useMonthlySummary() {
  return useQuery<MonthlySummary[]>({
    queryKey: qk.monthlySummary,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('monthly_summary')
        .select('*')
        .order('month', { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data as MonthlySummary[]) ?? [];
    },
  });
}

export type TopExpenseCategory = {
  id: string;
  name_ar: string;
  color: string | null;
  transaction_count: number;
  total_amount: string;
  percentage: number;
};

export function useTopExpenseCategories() {
  return useQuery<TopExpenseCategory[]>({
    queryKey: qk.topExpenseCategories,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('top_expense_categories')
        .select('*')
        .limit(10);
      if (error) throw error;
      return (data as TopExpenseCategory[]) ?? [];
    },
  });
}

// ── specialized mutations ───────────────────────────────────────
export function useRecordRentPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tenant_id: string;
      amount: number;
      payment_date?: string;
      cashbox_id?: string;
      description?: string;
    }) => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('record_rent_payment', {
        tenant_id: input.tenant_id,
        amount: input.amount,
        payment_date: input.payment_date ?? new Date().toISOString().slice(0, 10),
        cashbox_id: input.cashbox_id ?? null,
        description: input.description ?? null,
      });
      if (error) throw error;
      return data as string; // returns transaction id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: qk.tenantRentSummary });
      qc.invalidateQueries({ queryKey: qk.cashboxBalances });
      qc.invalidateQueries({ queryKey: qk.dashboardStats });
      qc.invalidateQueries({ queryKey: qk.monthlySummary });
    },
  });
}

// ── transactions ─────────────────────────────────────────────────
const TX_SELECT =
  '*, category:categories(id,code,name_ar,kind,color), cashbox:cashboxes(id,code,name_ar,kind), creator:profiles(id,full_name_ar,full_name), contact:contacts(id,name,kind,shop_number)';

export function useTransactions(kind?: 'REVENUE' | 'EXPENSE', limit = 500) {
  return useQuery<TransactionWithRelations[]>({
    queryKey: qk.transactions(kind),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from('transactions')
        .select(TX_SELECT)
        .order('tx_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);
      if (kind) q = q.eq('kind', kind);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as TransactionWithRelations[]) ?? [];
    },
  });
}

export function useRecentTransactions(limit = 8) {
  return useQuery<TransactionWithRelations[]>({
    queryKey: [...qk.recentTransactions, limit],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('transactions')
        .select(TX_SELECT)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as unknown as TransactionWithRelations[]) ?? [];
    },
  });
}

// ── mutations ────────────────────────────────────────────────────
export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewTransactionInput) => {
      const supabase = createSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          ...input,
          status: 'POSTED',
          posted_at: new Date().toISOString(),
          created_by: auth?.user?.id ?? null,
        })
        .select(TX_SELECT)
        .single();
      if (error) throw error;
      return data as unknown as TransactionWithRelations;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: qk.cashboxBalances });
      qc.invalidateQueries({ queryKey: qk.dashboardStats });
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: qk.cashboxBalances });
      qc.invalidateQueries({ queryKey: qk.dashboardStats });
    },
  });
}

// ── dashboard aggregates ─────────────────────────────────────────
export type DashboardStats = {
  totalRevenue: number;
  totalExpense: number;
  netProfit: number;
  totalCashboxBalance: number;
  monthlySeries: { month: string; revenue: number; expense: number }[];
  topExpenseCategories: { label: string; value: number; color: string }[];
};

const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: qk.dashboardStats,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const year = new Date().getFullYear();

      // Pull this year's posted transactions with category info for breakdown.
      const { data, error } = await supabase
        .from('transactions')
        .select('amount, kind, tx_date, category:categories(name_ar, color)')
        .eq('status', 'POSTED')
        .gte('tx_date', `${year}-01-01`)
        .lt('tx_date', `${year + 1}-01-01`);
      if (error) throw error;

      const rows = (data ?? []) as unknown as Array<{
        amount: string;
        kind: 'REVENUE' | 'EXPENSE' | string;
        tx_date: string;
        category: { name_ar: string; color: string | null } | null;
      }>;

      // Cashbox balances for the "treasury" KPI.
      const { data: balances } = await supabase
        .from('cashbox_balances')
        .select('balance');

      let totalRevenue = 0;
      let totalExpense = 0;

      const monthlyR = Array(12).fill(0);
      const monthlyE = Array(12).fill(0);
      const expenseByCat = new Map<string, { value: number; color: string }>();

      for (const r of rows) {
        const n = Number(r.amount);
        const m = new Date(r.tx_date).getMonth();
        if (r.kind === 'REVENUE') {
          totalRevenue += n;
          monthlyR[m] += n;
        } else if (r.kind === 'EXPENSE') {
          totalExpense += n;
          monthlyE[m] += n;
          const label = r.category?.name_ar ?? 'بدون بند';
          const color = r.category?.color ?? '#6E7470';
          const prev = expenseByCat.get(label);
          expenseByCat.set(label, {
            value: (prev?.value ?? 0) + n,
            color,
          });
        }
      }

      const totalCashboxBalance =
        (balances ?? []).reduce((s: number, b: { balance: string }) => s + Number(b.balance), 0);

      const topExpenseCategories = Array.from(expenseByCat.entries())
        .map(([label, { value, color }]) => ({ label, value, color }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);

      const monthlySeries = AR_MONTHS.map((month, i) => ({
        month,
        revenue: monthlyR[i],
        expense: monthlyE[i],
      }));

      return {
        totalRevenue,
        totalExpense,
        netProfit: totalRevenue - totalExpense,
        totalCashboxBalance,
        monthlySeries,
        topExpenseCategories,
      };
    },
  });
}
