"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { qk } from "@/lib/db/queries";

/**
 * Payroll read models and actions (migration 080).
 * Every write goes through a SECURITY DEFINER function, so the screens never insert rows directly:
 * the database checks the role, the period and the amounts, and writes the audit log.
 */

export type PayrollRunStatus = "DRAFT" | "APPROVED" | "POSTED";
export type PayrollAdjustmentKind = "BONUS" | "OVERTIME" | "ABSENCE" | "PENALTY" | "OTHER_DEDUCTION";
export type PayrollAdjustmentStatus = "DRAFT" | "APPROVED" | "CANCELLED";
export type PayrollAdvanceStatus = "OPEN" | "SETTLED" | "CANCELLED";

export type PayrollSalaryStructure = {
  id: string;
  employee_id: string;
  effective_from: string;
  base_salary: string;
  housing_allowance: string;
  transport_allowance: string;
  other_allowance: string;
  notes: string | null;
  created_at: string;
};

export type PayrollRun = {
  id: string;
  period_month: string;
  status: PayrollRunStatus;
  prepared_at: string | null;
  approved_at: string | null;
  posted_at: string | null;
  journal_entry_id: string | null;
  notes: string | null;
};

export type PayrollRunLine = {
  id: string;
  run_id: string;
  employee_id: string;
  employee_name: string;
  job_title: string | null;
  department: string | null;
  period_month: string;
  run_status: PayrollRunStatus;
  base_salary: string;
  allowances: string;
  bonuses: string;
  overtime: string;
  absence_deduction: string;
  penalties: string;
  other_deductions: string;
  advance_repayment: string;
  gross: string;
  net: string;
  paid: string;
  outstanding: string;
};

export type PayrollAdjustment = {
  id: string;
  employee_id: string;
  period_month: string;
  kind: PayrollAdjustmentKind;
  amount: string;
  days: string | null;
  reason: string;
  status: PayrollAdjustmentStatus;
  decided_at: string | null;
  decision_note: string | null;
  run_id: string | null;
  created_at: string;
};

export type PayrollAdvance = {
  id: string;
  employee_id: string;
  employee_name: string;
  issued_on: string;
  amount: string;
  installments: number;
  installment_amount: string;
  reason: string;
  cashbox_id: string;
  status: PayrollAdvanceStatus;
  cancel_reason: string | null;
  repaid: string;
  remaining: string;
  created_at: string;
};

export const ADJUSTMENT_KIND_LABEL: Record<PayrollAdjustmentKind, string> = {
  BONUS: "مكافأة",
  OVERTIME: "عمل إضافي",
  ABSENCE: "خصم غياب",
  PENALTY: "جزاء",
  OTHER_DEDUCTION: "خصم آخر",
};

/** Bonuses and overtime add to the salary; everything else reduces it. */
export const ADJUSTMENT_IS_ADDITION: Record<PayrollAdjustmentKind, boolean> = {
  BONUS: true,
  OVERTIME: true,
  ABSENCE: false,
  PENALTY: false,
  OTHER_DEDUCTION: false,
};

export const RUN_STATUS_LABEL: Record<PayrollRunStatus, string> = {
  DRAFT: "مسودة",
  APPROVED: "معتمد",
  POSTED: "مُرحَّل",
};

export const ADJUSTMENT_STATUS_LABEL: Record<PayrollAdjustmentStatus, string> = {
  DRAFT: "بانتظار الاعتماد",
  APPROVED: "معتمدة",
  CANCELLED: "ملغاة",
};

export const ADVANCE_STATUS_LABEL: Record<PayrollAdvanceStatus, string> = {
  OPEN: "قائمة",
  SETTLED: "مسددة",
  CANCELLED: "ملغاة",
};

export const pqk = {
  all: ["payroll"] as const,
  structures: ["payroll", "structures"] as const,
  runs: ["payroll", "runs"] as const,
  runLines: (runId: string | null) => ["payroll", "run_lines", runId ?? "none"] as const,
  employeeLines: (employeeId: string) => ["payroll", "employee_lines", employeeId] as const,
  adjustments: (month: string | null) => ["payroll", "adjustments", month ?? "ALL"] as const,
  advances: ["payroll", "advances"] as const,
};

type PgError = { code?: string; message?: string };

/**
 * True when the payroll tables or functions are not in the database yet (migration 080 not applied).
 * PostgREST answers PGRST205 for an unknown table/view and PGRST202 for an unknown function.
 */
export function isPayrollSchemaMissing(error: unknown): boolean {
  const code = (error as PgError | null)?.code;
  return code === "PGRST205" || code === "PGRST202" || code === "42P01" || code === "42883";
}

/** Database messages are already Arabic; fall back to a generic sentence for anything else. */
export function payrollErrorMessage(error: unknown): string {
  if (isPayrollSchemaMissing(error)) return "وحدة الرواتب غير مفعّلة في قاعدة البيانات بعد (الترحيل 080).";
  const e = error as PgError | null;
  if (e?.code === "42501") return e.message ?? "ليست لديك صلاحية لهذه العملية.";
  return e?.message || "تعذّر تنفيذ العملية. حاول مرة أخرى.";
}

/** Retrying a missing table only delays the notice. */
const noRetryWhenMissing = (count: number, error: unknown) => !isPayrollSchemaMissing(error) && count < 2;

export function usePayrollStructures() {
  return useQuery<PayrollSalaryStructure[]>({
    queryKey: pqk.structures,
    retry: noRetryWhenMissing,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("payroll_salary_structures")
        .select("*")
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return (data as PayrollSalaryStructure[]) ?? [];
    },
  });
}

export function usePayrollRuns() {
  return useQuery<PayrollRun[]>({
    queryKey: pqk.runs,
    retry: noRetryWhenMissing,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("payroll_runs")
        .select("*")
        .order("period_month", { ascending: false });
      if (error) throw error;
      return (data as PayrollRun[]) ?? [];
    },
  });
}

export function usePayrollRunLines(runId: string | null) {
  return useQuery<PayrollRunLine[]>({
    queryKey: pqk.runLines(runId),
    enabled: Boolean(runId),
    retry: noRetryWhenMissing,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("payroll_run_lines_status")
        .select("*")
        .eq("run_id", runId!)
        .order("employee_name", { ascending: true });
      if (error) throw error;
      return (data as PayrollRunLine[]) ?? [];
    },
  });
}

/** Every payroll line of one employee, newest month first — the employee's pay history. */
export function useEmployeePayrollLines(employeeId: string | null) {
  return useQuery<PayrollRunLine[]>({
    queryKey: pqk.employeeLines(employeeId ?? "none"),
    enabled: Boolean(employeeId),
    retry: noRetryWhenMissing,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("payroll_run_lines_status")
        .select("*")
        .eq("employee_id", employeeId!)
        .order("period_month", { ascending: false });
      if (error) throw error;
      return (data as PayrollRunLine[]) ?? [];
    },
  });
}

export function usePayrollAdjustments(month: string | null) {
  return useQuery<PayrollAdjustment[]>({
    queryKey: pqk.adjustments(month),
    retry: noRetryWhenMissing,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase.from("payroll_adjustments").select("*").order("created_at", { ascending: false });
      if (month) q = q.eq("period_month", month);
      const { data, error } = await q;
      if (error) throw error;
      return (data as PayrollAdjustment[]) ?? [];
    },
  });
}

export function usePayrollAdvances() {
  return useQuery<PayrollAdvance[]>({
    queryKey: pqk.advances,
    retry: noRetryWhenMissing,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("payroll_advances_status")
        .select("*")
        .order("issued_on", { ascending: false });
      if (error) throw error;
      return (data as PayrollAdvance[]) ?? [];
    },
  });
}

/**
 * One mutation hook per database function. Payroll actions touch cash, the ledger and the
 * employee summary, so a success refreshes all of them.
 */
function usePayrollRpc<TArgs, TResult = unknown>(fn: string, toParams: (args: TArgs) => Record<string, unknown>) {
  const qc = useQueryClient();
  return useMutation<TResult, unknown, TArgs>({
    mutationFn: async (args) => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc(fn, toParams(args));
      if (error) throw error;
      return data as TResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pqk.all });
      qc.invalidateQueries({ queryKey: qk.employeeSummary });
      qc.invalidateQueries({ queryKey: qk.employees });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: qk.cashboxBalances });
    },
  });
}

export type SetSalaryInput = {
  employeeId: string;
  effectiveFrom: string;
  base: number;
  housing: number;
  transport: number;
  other: number;
  notes?: string;
};

export function useSetSalaryStructure() {
  return usePayrollRpc<SetSalaryInput, string>("payroll_set_salary", (a) => ({
    p_employee_id: a.employeeId,
    p_effective_from: a.effectiveFrom,
    p_base: a.base,
    p_housing: a.housing,
    p_transport: a.transport,
    p_other: a.other,
    p_notes: a.notes ?? null,
  }));
}

export type AddAdjustmentInput = {
  employeeId: string;
  month: string;
  kind: PayrollAdjustmentKind;
  amount: number;
  reason: string;
  days?: number | null;
};

export function useAddPayrollAdjustment() {
  return usePayrollRpc<AddAdjustmentInput, string>("payroll_add_adjustment", (a) => ({
    p_employee_id: a.employeeId,
    p_month: a.month,
    p_kind: a.kind,
    p_amount: a.amount,
    p_reason: a.reason,
    p_days: a.days ?? null,
  }));
}

export function useDecidePayrollAdjustment() {
  return usePayrollRpc<{ id: string; approve: boolean; note?: string }>("payroll_decide_adjustment", (a) => ({
    p_adjustment_id: a.id,
    p_approve: a.approve,
    p_note: a.note ?? null,
  }));
}

export type IssueAdvanceInput = {
  employeeId: string;
  amount: number;
  installments: number;
  cashboxId: string;
  issuedOn: string;
  reason: string;
};

export function useIssuePayrollAdvance() {
  return usePayrollRpc<IssueAdvanceInput, string>("payroll_issue_advance", (a) => ({
    p_employee_id: a.employeeId,
    p_amount: a.amount,
    p_installments: a.installments,
    p_cashbox_id: a.cashboxId,
    p_issued_on: a.issuedOn,
    p_reason: a.reason,
  }));
}

export function useCancelPayrollAdvance() {
  return usePayrollRpc<{ id: string; reason: string }>("payroll_cancel_advance", (a) => ({
    p_advance_id: a.id,
    p_reason: a.reason,
  }));
}

export type PreparedRunSummary = {
  run_id: string;
  month: string;
  employees: number;
  gross: number;
  net: number;
  advance_repayment: number;
};

export function usePreparePayrollRun() {
  return usePayrollRpc<{ month: string }, PreparedRunSummary>("payroll_prepare_run", (a) => ({ p_month: a.month }));
}

export function useApprovePayrollRun() {
  return usePayrollRpc<{ runId: string }>("payroll_approve_run", (a) => ({ p_run_id: a.runId }));
}

export function usePostPayrollRun() {
  return usePayrollRpc<{ runId: string }, string>("payroll_post_run", (a) => ({ p_run_id: a.runId }));
}

export function useReversePayrollRun() {
  return usePayrollRpc<{ runId: string; reason: string }>("payroll_reverse_run", (a) => ({
    p_run_id: a.runId,
    p_reason: a.reason,
  }));
}

export type PayLineInput = {
  lineId: string;
  amount: number;
  cashboxId: string;
  paidOn: string;
  method: "CASH" | "TRANSFER" | "CHEQUE" | "CARD";
};

export function usePayPayrollLine() {
  return usePayrollRpc<PayLineInput, string>("payroll_pay_line", (a) => ({
    p_line_id: a.lineId,
    p_amount: a.amount,
    p_cashbox_id: a.cashboxId,
    p_paid_on: a.paidOn,
    p_method: a.method,
  }));
}

/** The structure in force for a month: the latest one that starts on or before the month's end. */
export function structureForMonth(
  structures: PayrollSalaryStructure[],
  employeeId: string,
  month: string,
): PayrollSalaryStructure | null {
  const monthStart = `${month}-01`;
  return (
    structures
      .filter((s) => s.employee_id === employeeId && s.effective_from <= monthStart)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null
  );
}

export function structureTotal(s: PayrollSalaryStructure | null): number {
  if (!s) return 0;
  return (
    Number(s.base_salary) + Number(s.housing_allowance) + Number(s.transport_allowance) + Number(s.other_allowance)
  );
}

export function currentMonthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return currentMonthKey(d);
}
