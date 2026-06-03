"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { mqk } from "@/lib/db/mall-queries";
import type {
  CategoryRow,
  CashboxRow,
  CashboxBalanceRow,
  TransactionWithRelations,
  NewTransactionInput,
  ProfileRow,
  ContactRow,
  ContactKind,
  BranchRow,
  TxKind,
  TransactionFormDraftRow,
  SaveTransactionDraftInput,
  DisbursementVoucherWithLines,
  SaveDisbursementVoucherInput,
} from "./types";

/**
 * Centralised TanStack Query hooks over Supabase JS.
 * Pages call these instead of touching `supabase.from(...)` directly.
 */

// ── keys ─────────────────────────────────────────────────────────
export const qk = {
  categories: ["categories"] as const,
  cashboxes: ["cashboxes"] as const,
  cashboxBalances: ["cashbox_balances"] as const,
  profiles: ["profiles"] as const,
  contacts: (kind?: ContactKind) => ["contacts", kind ?? "ALL"] as const,
  contact: (id: string) => ["contacts", "detail", id] as const,
  contactTransactions: (id: string) => ["contacts", id, "transactions"] as const,
  tenants: ["contacts", "TENANT"] as const,
  employees: ["contacts", "EMPLOYEE"] as const,
  tenantRentSummary: ["tenant_rent_summary"] as const,
  employeeSummary: ["employee_summary"] as const,
  monthlySummary: ["monthly_summary"] as const,
  transactions: (kind?: "REVENUE" | "EXPENSE") =>
    ["transactions", kind ?? "ALL"] as const,
  recentTransactions: ["transactions", "recent"] as const,
  dashboardStats: ["dashboard_stats"] as const,
  topExpenseCategories: ["top_expense_categories"] as const,
  branches: ["branches"] as const,
  transactionFormDrafts: (kind: TxKind) =>
    ["transaction_form_drafts", kind] as const,
  disbursementVouchers: ["disbursement_vouchers"] as const,
};

export function useBranches(includeInactive = false) {
  return useQuery<BranchRow[]>({
    queryKey: [...qk.branches, includeInactive],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("branches")
        .select("*")
        .order("code", { ascending: true });
      if (!includeInactive) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data as BranchRow[]) ?? [];
    },
  });
}

// ── categories ───────────────────────────────────────────────────
export function useCategories(kind?: "REVENUE" | "EXPENSE") {
  return useQuery<CategoryRow[]>({
    queryKey: kind ? ["categories", kind] : qk.categories,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("categories")
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (kind) q = q.eq("kind", kind);
      const { data, error } = await q;
      if (error) throw error;
      return (data as CategoryRow[]) ?? [];
    },
  });
}

export type CreateCategoryInput = {
  code: string;
  name: string;
  name_ar: string;
  type: CategoryRow["type"];
  kind: CategoryRow["kind"];
  color?: string | null;
  sort_order?: number;
};

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCategoryInput) => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("categories")
        .insert({
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          name_ar: input.name_ar.trim(),
          type: input.type,
          kind: input.kind,
          color: input.color ?? null,
          sort_order: input.sort_order ?? 100,
          active: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data as CategoryRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.categories });
      toast.success("تم إضافة البند المحاسبي");
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message ?? "تعذّر إضافة البند");
    },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<CreateCategoryInput> & { id: string; active?: boolean }) => {
      const supabase = createSupabaseBrowserClient();
      const patch: Record<string, unknown> = {};
      if (input.code !== undefined) patch.code = input.code.trim().toUpperCase();
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.name_ar !== undefined) patch.name_ar = input.name_ar.trim();
      if (input.type !== undefined) patch.type = input.type;
      if (input.kind !== undefined) patch.kind = input.kind;
      if (input.color !== undefined) patch.color = input.color;
      if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
      if (input.active !== undefined) patch.active = input.active;
      const { data, error } = await supabase
        .from("categories")
        .update(patch)
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;
      return data as CategoryRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.categories });
      toast.success("تم تحديث البند");
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message ?? "تعذّر التحديث");
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
        .from("cashboxes")
        .select("*")
        .eq("active", true)
        .order("code", { ascending: true });
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
        .from("cashbox_balances")
        .select("*")
        .order("code", { ascending: true });
      if (error) throw error;
      return (data as CashboxBalanceRow[]) ?? [];
    },
  });
}

export type CreateCashboxInput = {
  code: string;
  name_ar: string;
  kind: CashboxRow["kind"];
  currency?: string;
  opening_balance?: number;
  bank_name?: string | null;
  account_number?: string | null;
  iban?: string | null;
  color?: string | null;
};

export function useCreateCashbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCashboxInput) => {
      const supabase = createSupabaseBrowserClient();
      const payload = {
        code: input.code.trim().toUpperCase(),
        name: input.name_ar.trim(),
        name_ar: input.name_ar.trim(),
        kind: input.kind,
        currency: (input.currency ?? "LYD").trim().toUpperCase(),
        opening_balance: Number.isFinite(input.opening_balance)
          ? Number(input.opening_balance ?? 0)
          : 0,
        bank_name: input.bank_name?.trim() || null,
        account_number: input.account_number?.trim() || null,
        iban: input.iban?.trim() || null,
        color: input.color?.trim() || null,
        active: true,
      };
      const { data, error } = await supabase
        .from("cashboxes")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as CashboxRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.cashboxes });
      qc.invalidateQueries({ queryKey: qk.cashboxBalances });
      qc.invalidateQueries({ queryKey: qk.dashboardStats });
      toast.success("تمت إضافة الخزينة بنجاح");
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message ?? "تعذرت إضافة الخزينة");
    },
  });
}

export type UpdateCashboxInput = {
  id: string;
  code?: string;
  name_ar?: string;
  kind?: CashboxRow["kind"];
  currency?: string;
  opening_balance?: number;
  bank_name?: string | null;
  account_number?: string | null;
  iban?: string | null;
  color?: string | null;
};

export function useUpdateCashbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateCashboxInput) => {
      const supabase = createSupabaseBrowserClient();
      const patch: Record<string, unknown> = {};
      if (input.code !== undefined) patch.code = input.code.trim().toUpperCase();
      if (input.name_ar !== undefined) {
        const ar = input.name_ar.trim();
        patch.name_ar = ar;
        patch.name = ar;
      }
      if (input.kind !== undefined) patch.kind = input.kind;
      if (input.currency !== undefined)
        patch.currency = input.currency.trim().toUpperCase();
      if (input.opening_balance !== undefined)
        patch.opening_balance = Number(input.opening_balance);
      if (input.bank_name !== undefined)
        patch.bank_name = input.bank_name?.trim() || null;
      if (input.account_number !== undefined)
        patch.account_number = input.account_number?.trim() || null;
      if (input.iban !== undefined) patch.iban = input.iban?.trim() || null;
      if (input.color !== undefined) patch.color = input.color?.trim() || null;

      const { data, error } = await supabase
        .from("cashboxes")
        .update(patch)
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;
      return data as CashboxRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.cashboxes });
      qc.invalidateQueries({ queryKey: qk.cashboxBalances });
      qc.invalidateQueries({ queryKey: qk.dashboardStats });
      toast.success("تم تحديث الخزينة بنجاح");
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message ?? "تعذرت تحديث الخزينة");
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
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as ProfileRow[]) ?? [];
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      role?: string;
      full_name_ar?: string | null;
    }) => {
      const supabase = createSupabaseBrowserClient();
      const patch: Record<string, string | null> = {};
      if (input.role !== undefined) patch.role = input.role;
      if (input.full_name_ar !== undefined)
        patch.full_name_ar = input.full_name_ar;
      if (!Object.keys(patch).length) return;
      const { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.profiles });
      qc.invalidateQueries({ queryKey: ["profile"] });
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
        .from("contacts")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (kind) q = q.eq("kind", kind);
      const { data, error } = await q;
      if (error) throw error;
      return (data as ContactRow[]) ?? [];
    },
  });
}

export function useContact(id: string) {
  return useQuery<ContactRow>({
    queryKey: qk.contact(id),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as ContactRow;
    },
    enabled: !!id,
  });
}

export function useTenantRentForContact(contactId: string) {
  return useQuery<TenantRentSummary | null>({
    queryKey: [...qk.tenantRentSummary, contactId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("tenant_rent_summary")
        .select("*")
        .eq("id", contactId)
        .maybeSingle();
      if (error) throw error;
      return (data as TenantRentSummary) ?? null;
    },
    enabled: !!contactId,
  });
}

export function useTenants() {
  return useContacts("TENANT");
}

export function useEmployees() {
  return useContacts("EMPLOYEE");
}

export type ContactUpsertInput = {
  kind: ContactKind;
  name: string;
  phone?: string | null;
  phone2?: string | null;
  email?: string | null;
  address?: string | null;
  shop_number?: string | null;
  floor?: string | null;
  area_sqm?: string | null;
  monthly_rent?: string | null;
  job_title?: string | null;
  department?: string | null;
  salary?: string | null;
  notes?: string | null;
  name_en?: string | null;
  id_number?: string | null;
  tax_number?: string | null;
  contract_start?: string | null;
  contract_end?: string | null;
  hire_date?: string | null;
  is_active?: boolean;
};

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ContactUpsertInput) => {
      const supabase = createSupabaseBrowserClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth?.user) {
        throw new Error("يجب تسجيل الدخول لإضافة جهة تعامل");
      }

      const { data, error } = await supabase
        .from("contacts")
        .insert({ ...input, is_active: input.is_active ?? true })
        .select("*")
        .single();
      if (error) throw error;
      return data as ContactRow;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: qk.tenantRentSummary });
      qc.invalidateQueries({ queryKey: qk.employeeSummary });
      if (data?.id) qc.invalidateQueries({ queryKey: qk.contact(data.id) });
    },
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string } & Partial<ContactRow>) => {
      const supabase = createSupabaseBrowserClient();
      const { id, ...patch } = input;
      const { data, error } = await supabase
        .from("contacts")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ContactRow;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: qk.tenantRentSummary });
      qc.invalidateQueries({ queryKey: qk.employeeSummary });
      qc.invalidateQueries({ queryKey: mqk.leaseContracts });
      qc.invalidateQueries({ queryKey: mqk.mallUnits });
      if (data?.id) {
        qc.invalidateQueries({ queryKey: qk.contact(data.id) });
        qc.invalidateQueries({ queryKey: [...qk.tenantRentSummary, data.id] });
      }
    },
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
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
  current_month_key?: string | null;
  current_month_amount?: string | null;
  current_month_paid: string;
  current_month_status: "no_rent_set" | "paid_full" | "paid_partial" | "unpaid";
  total_rent_paid?: string | null;
  rent_linked_journals_count?: number | null;
  journal_entries_count?: number | null;
  last_12_months_revenue: string;
  total_balance: string;
  open_charges_total?: string | null;
  open_charges_count?: number | null;
};

export function useTenantRentSummary() {
  return useQuery<TenantRentSummary[]>({
    queryKey: qk.tenantRentSummary,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("tenant_rent_summary")
        .select("*")
        .order("name", { ascending: true });
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
        .from("employee_summary")
        .select("*")
        .order("name", { ascending: true });
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
        .from("monthly_summary")
        .select("*")
        .order("month", { ascending: false })
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
        .from("top_expense_categories")
        .select("*")
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
      rent_months?: string[];
      payment_method?: 'CASH' | 'CHEQUE' | 'TRANSFER' | 'CARD';
    }) => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("record_rent_payment", {
        tenant_id: input.tenant_id,
        amount: input.amount,
        payment_date:
          input.payment_date ?? new Date().toISOString().slice(0, 10),
        cashbox_id: input.cashbox_id ?? null,
        description: input.description ?? null,
        rent_months:
          input.rent_months && input.rent_months.length > 0
            ? input.rent_months
            : null,
        payment_method: input.payment_method ?? 'CASH',
      });
      if (error) throw error;
      if (typeof data === 'string') {
        return { transaction_id: data, journal_entry_id: null as string | null };
      }
      const row = data as {
        transaction_id?: string;
        journal_entry_id?: string | null;
      };
      return {
        transaction_id: row.transaction_id ?? '',
        journal_entry_id: row.journal_entry_id ?? null,
      };
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
      qc.invalidateQueries({ queryKey: qk.tenantRentSummary });
      qc.invalidateQueries({ queryKey: qk.cashboxBalances });
      qc.invalidateQueries({ queryKey: qk.dashboardStats });
      qc.invalidateQueries({ queryKey: qk.monthlySummary });
      qc.invalidateQueries({ queryKey: ["tenant_charges"] });
      qc.invalidateQueries({
        queryKey: ["tenant_rent_calendar", variables.tenant_id],
      });
      qc.invalidateQueries({ queryKey: qk.contact(variables.tenant_id) });
      qc.invalidateQueries({
        queryKey: qk.contactTransactions(variables.tenant_id),
      });
    },
  });
}

// ── transactions ─────────────────────────────────────────────────
const TX_SELECT =
  "*, category:categories(id,code,name_ar,kind,color), cashbox:cashboxes(id,code,name_ar,kind,bank_name), creator:profiles(id,full_name_ar,full_name), contact:contacts(id,name,kind,shop_number)";

export function useTransactions(kind?: "REVENUE" | "EXPENSE", limit = 500) {
  return useQuery<TransactionWithRelations[]>({
    queryKey: qk.transactions(kind),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("transactions")
        .select(TX_SELECT)
        .order("created_at", { ascending: false })
        .order("number", { ascending: false })
        .limit(limit);
      if (kind) q = q.eq("kind", kind);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as TransactionWithRelations[]) ?? [];
    },
  });
}

export function useContactTransactions(contactId: string, limit = 200) {
  return useQuery<TransactionWithRelations[]>({
    queryKey: qk.contactTransactions(contactId),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("transactions")
        .select(TX_SELECT)
        .eq("contact_id", contactId)
        .order("tx_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as unknown as TransactionWithRelations[]) ?? [];
    },
    enabled: !!contactId,
  });
}

export function useRecentTransactions(limit = 8) {
  return useQuery<TransactionWithRelations[]>({
    queryKey: [...qk.recentTransactions, limit],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("transactions")
        .select(TX_SELECT)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as unknown as TransactionWithRelations[]) ?? [];
    },
  });
}

export function useTransactionFormDrafts(kind: TxKind, enabled = true) {
  return useQuery<TransactionFormDraftRow[]>({
    queryKey: qk.transactionFormDrafts(kind),
    enabled,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user?.id) return [];
      const { data, error } = await supabase
        .from("transaction_form_drafts")
        .select("*")
        .eq("kind", kind)
        .eq("user_id", auth.user.id)
        .order("updated_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data as TransactionFormDraftRow[]) ?? [];
    },
  });
}

export function useSaveTransactionFormDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveTransactionDraftInput) => {
      const supabase = createSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error("يجب تسجيل الدخول لحفظ المسودة");

      if (input.id) {
        const { data, error } = await supabase
          .from("transaction_form_drafts")
          .update({
            label: input.label ?? null,
            payload: input.payload as Record<string, unknown>,
            kind: input.kind,
          })
          .eq("id", input.id)
          .eq("user_id", uid)
          .select("*")
          .single();
        if (error) throw error;
        return data as TransactionFormDraftRow;
      }

      const { data, error } = await supabase
        .from("transaction_form_drafts")
        .insert({
          user_id: uid,
          kind: input.kind,
          label: input.label ?? null,
          payload: input.payload as Record<string, unknown>,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as TransactionFormDraftRow;
    },
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: qk.transactionFormDrafts(vars.kind) });
    },
  });
}

export function useDeleteTransactionFormDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; kind: TxKind }) => {
      const supabase = createSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error("يجب تسجيل الدخول");
      const { error } = await supabase
        .from("transaction_form_drafts")
        .delete()
        .eq("id", vars.id)
        .eq("user_id", uid);
      if (error) throw error;
    },
    onSuccess: (_void, vars) => {
      qc.invalidateQueries({ queryKey: qk.transactionFormDrafts(vars.kind) });
    },
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewTransactionInput) => {
      const supabase = createSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getUser();
      const { charge_allocations, auto_allocate_charges, ...rest } = input;
      const manualAlloc = (charge_allocations?.length ?? 0) > 0;

      const { data, error } = await supabase
        .from("transactions")
        .insert({
          ...rest,
          auto_allocate_charges: manualAlloc ? false : (auto_allocate_charges ?? true),
          status: "POSTED",
          posted_at: new Date().toISOString(),
          created_by: auth?.user?.id ?? null,
        })
        .select(TX_SELECT)
        .single();
      if (error) throw error;

      if (manualAlloc && data?.id) {
        const { error: allocErr } = await supabase.rpc("apply_charge_allocations", {
          p_transaction_id: data.id,
          p_allocations: charge_allocations,
        });
        if (allocErr) throw allocErr;
      }

      return data as unknown as TransactionWithRelations;
    },
    onMutate: async (input) => {
      // Cancel outgoing queries for transactions
      await qc.cancelQueries({ queryKey: ["transactions"] });

      // Get previous data for rollback
      const previousTx = qc.getQueryData(["transactions"]);

      // Optimistically update the transaction list
      const optimisticTx: TransactionWithRelations = {
        id: `temp-${Date.now()}`,
        organization_id: "",
        created_by: "",
        status: "POSTED",
        posted_at: new Date().toISOString(),
        ...input,
      } as any;

      qc.setQueryData(["transactions"], (old: any) =>
        old ? [optimisticTx, ...old] : [optimisticTx],
      );

      return { previousTx };
    },
    onError: (err, variables, context) => {
      if (context?.previousTx) {
        qc.setQueryData(["transactions"], context.previousTx);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: qk.cashboxBalances });
      qc.invalidateQueries({ queryKey: qk.dashboardStats });
      qc.invalidateQueries({ queryKey: ["tenant_charges"] });
      qc.invalidateQueries({ queryKey: ["tenant_ar_aging"] });
      qc.invalidateQueries({ queryKey: ["tenant_rent_calendar"] });
      qc.invalidateQueries({ queryKey: qk.tenantRentSummary });
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
      qc.invalidateQueries({ queryKey: ["audit_log_feed"] });
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: qk.cashboxBalances });
      qc.invalidateQueries({ queryKey: qk.dashboardStats });
      qc.invalidateQueries({ queryKey: qk.employeeSummary });
      qc.invalidateQueries({ queryKey: qk.monthlySummary });
      qc.invalidateQueries({ queryKey: qk.topExpenseCategories });
      qc.invalidateQueries({ queryKey: ["audit_log_feed"] });
    },
  });
}

/** إذونات الصرف المحفوظة في Supabase (ملخص الوثيقة + بنود) */
export function useDisbursementVouchers() {
  return useQuery<DisbursementVoucherWithLines[]>({
    queryKey: qk.disbursementVouchers,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("disbursement_vouchers")
        .select(
          `
          *,
          disbursement_voucher_lines (*)
        `,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as DisbursementVoucherWithLines[]) ?? [];
    },
  });
}

export function useCreateDisbursementVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveDisbursementVoucherInput) => {
      const supabase = createSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error("يجب تسجيل الدخول");

      const lineRows = input.lines
        .map((l) => ({
          description: (l.description ?? "").trim() || "—",
          amount: Math.max(0, Number(l.amount) || 0),
        }))
        .filter((l) => l.amount > 0)
        .map((l, i) => ({
          sort_order: i,
          description: l.description,
          amount: l.amount,
        }));

      const total = lineRows.reduce((s, l) => s + l.amount, 0);
      if (total <= 0) {
        throw new Error("يجب إدخال بند واحد على الأقل بمبلغ أكبر من صفر");
      }

      const { data: row, error: insErr } = await supabase
        .from("disbursement_vouchers")
        .insert({
          voucher_number: input.voucher_number.trim(),
          voucher_date: input.voucher_date,
          payee: input.payee.trim(),
          bank_name: input.bank_name?.trim() || null,
          account_number: input.account_number?.trim() || null,
          method: input.method,
          notes: input.notes?.trim() || null,
          total_amount: total,
          cashbox_id: input.cashbox_id || null,
          category_id: input.category_id || null,
          created_by: uid,
        })
        .select("id")
        .single();

      if (insErr) throw insErr;

      const voucherId = row!.id as string;

      const { error: linesErr } = await supabase.from("disbursement_voucher_lines").insert(
        lineRows.map((l) => ({
          voucher_id: voucherId,
          sort_order: l.sort_order,
          description: l.description,
          amount: l.amount,
        })),
      );

      if (linesErr) {
        await supabase.from("disbursement_vouchers").delete().eq("id", voucherId);
        throw linesErr;
      }

      return voucherId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.disbursementVouchers });
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
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
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: qk.dashboardStats,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const year = new Date().getFullYear();

      // Pull this year's posted transactions with category info for breakdown.
      const { data, error } = await supabase
        .from("transactions")
        .select("amount, kind, tx_date, category:categories(name_ar, color)")
        .eq("status", "POSTED")
        .gte("tx_date", `${year}-01-01`)
        .lt("tx_date", `${year + 1}-01-01`);
      if (error) throw error;

      const rows = (data ?? []) as unknown as Array<{
        amount: string;
        kind: "REVENUE" | "EXPENSE" | string;
        tx_date: string;
        category: { name_ar: string; color: string | null } | null;
      }>;

      // Cashbox balances for the "treasury" KPI.
      const { data: balances } = await supabase
        .from("cashbox_balances")
        .select("balance");

      let totalRevenue = 0;
      let totalExpense = 0;

      const monthlyR = Array(12).fill(0);
      const monthlyE = Array(12).fill(0);
      const expenseByCat = new Map<string, { value: number; color: string }>();

      for (const r of rows) {
        const n = Number(r.amount);
        const m = new Date(r.tx_date).getMonth();
        if (r.kind === "REVENUE") {
          totalRevenue += n;
          monthlyR[m] += n;
        } else if (r.kind === "EXPENSE") {
          totalExpense += n;
          monthlyE[m] += n;
          const label = r.category?.name_ar ?? "بدون بند";
          const color = r.category?.color ?? "#6E7470";
          const prev = expenseByCat.get(label);
          expenseByCat.set(label, {
            value: (prev?.value ?? 0) + n,
            color,
          });
        }
      }

      const totalCashboxBalance = (balances ?? []).reduce(
        (s: number, b: { balance: string }) => s + Number(b.balance),
        0,
      );

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
