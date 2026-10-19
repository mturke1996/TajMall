"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/db/fetch-all";
import { todayISODate } from "@/lib/utils";
import { friendlyError, NEEDS_DB_UPDATE } from "@/lib/user-messages";
import {
  normalizeDetails,
  normalizeIban,
  normalizeOnLeave,
  normalizeRequest,
  parseBalanceRows,
  type EmployeeDetails,
  type EmployeeFileInput,
  type EmploymentType,
  type LeaveBalanceLine,
  type LeaveRequest,
  type LeaveStatus,
  type LeaveType,
  type OnLeaveRow,
} from "@/lib/leave";

/**
 * The employee file and leave (migration 083). Reads come from the tables the signed-in role may see (owner, admin
 * and accountant); every write goes through a database function that checks the role, the dates and the balance and
 * writes the audit log, so the screens never insert rows themselves.
 *
 * Cache keys all start with ["payroll", "leave"]: a payroll invalidation refreshes them too, and a leave change
 * refreshes only them (and the audit feed that shows the employee's history).
 */

export const lqk = {
  all: ["payroll", "leave"] as const,
  details: (employeeId: string) => ["payroll", "leave", "details", employeeId] as const,
  employeeRequests: (employeeId: string) => ["payroll", "leave", "requests", "employee", employeeId] as const,
  requests: (from: string, to: string, statuses: string) => ["payroll", "leave", "requests", "range", from, to, statuses] as const,
  pending: ["payroll", "leave", "requests", "pending"] as const,
  allDetails: ["payroll", "leave", "details", "all"] as const,
  balance: (employeeId: string, year: number) => ["payroll", "leave", "balance", employeeId, year] as const,
  onLeave: (date: string) => ["payroll", "leave", "on_leave", date] as const,
};

type PgError = { code?: string; message?: string };

/**
 * True when the tables or functions are not in the database yet. PostgREST answers PGRST205 for an unknown table
 * and PGRST202 for an unknown function; Postgres itself says 42P01 and 42883.
 */
export function isLeaveSchemaMissing(error: unknown): boolean {
  const code = (error as PgError | null)?.code;
  return code === "PGRST205" || code === "PGRST202" || code === "42P01" || code === "42883";
}

/** The annual balance would go below zero (the database's LV001): an owner or admin may go on with a written reason. */
export function isLeaveBalanceShortage(error: unknown): boolean {
  return (error as PgError | null)?.code === "LV001";
}

/** Two leaves of the same employee share a day (the database's exclusion error). */
export function isLeaveOverlap(error: unknown): boolean {
  return (error as PgError | null)?.code === "23P01";
}

/**
 * One plain Arabic sentence for a failed read or write. The database's own rules already speak Arabic (the clashing
 * dates, the shortage, who may do it) and are kept as they are; a missing table says the database needs an update.
 */
export function leaveErrorMessage(error: unknown): string {
  if (isLeaveSchemaMissing(error)) return NEEDS_DB_UPDATE;
  return friendlyError(error, "تعذّر تنفيذ العملية. حاول مرة أخرى.");
}

/** Retrying a missing table, or a refusal for this role, only delays the notice. */
const noRetryWhenMissing = (count: number, error: unknown) =>
  !isLeaveSchemaMissing(error) && (error as PgError | null)?.code !== "42501" && count < 2;

// ── Reads ───────────────────────────────────────────────────────────────────

/**
 * The employee's file, or null when none was opened yet (leave still works: the allowance is 30 days).
 * Owner, admin and accountant only; pass `enabled: false` for other roles instead of showing an empty file.
 */
export function useEmployeeDetails(employeeId: string | null, enabled = true) {
  return useQuery<EmployeeDetails | null>({
    queryKey: lqk.details(employeeId ?? "none"),
    enabled: Boolean(employeeId) && enabled,
    retry: noRetryWhenMissing,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.from("employee_details").select("*").eq("employee_id", employeeId!).limit(1);
      if (error) throw error;
      return normalizeDetails((data ?? [])[0]);
    },
  });
}

/** The files of all employees at once (a directory with contract and probation dates, bank details). Managers only. */
export function useAllEmployeeDetails(enabled = true) {
  return useQuery<EmployeeDetails[]>({
    queryKey: lqk.allDetails,
    enabled,
    retry: noRetryWhenMissing,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const rows = await fetchAllPages<unknown>((from, to) =>
        supabase.from("employee_details").select("*").order("employee_id", { ascending: true }).range(from, to),
      );
      return rows.map(normalizeDetails).filter((d): d is EmployeeDetails => d !== null);
    },
  });
}

/** Every leave of one employee, latest start first, with the cancelled and rejected ones. */
export function useEmployeeLeaveRequests(employeeId: string | null, enabled = true) {
  return useQuery<LeaveRequest[]>({
    queryKey: lqk.employeeRequests(employeeId ?? "none"),
    enabled: Boolean(employeeId) && enabled,
    retry: noRetryWhenMissing,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("employee_leave_requests")
        .select("*")
        .eq("employee_id", employeeId!)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return ((data as unknown[]) ?? []).map(normalizeRequest).filter((r): r is LeaveRequest => r !== null);
    },
  });
}

/**
 * Leave of all employees that touches a date range (it starts on or before `to` and ends on or after `from`), with
 * the employee's name for a calendar or a list. Pass null while the range is not chosen. `statuses` narrows it
 * (the default is every status).
 */
export function useAllLeaveRequests(range: { from: string; to: string } | null, statuses?: readonly LeaveStatus[], enabled = true) {
  const statusKey = statuses?.length ? [...statuses].sort().join(",") : "ALL";
  return useQuery<LeaveRequest[]>({
    queryKey: lqk.requests(range?.from ?? "none", range?.to ?? "none", statusKey),
    enabled: Boolean(range) && enabled,
    retry: noRetryWhenMissing,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const rows = await fetchAllPages<unknown>((from, to) => {
        let q = supabase
          .from("employee_leave_requests")
          .select("*, employee:contacts(id, name, job_title, department)")
          .gte("end_date", range!.from)
          .lte("start_date", range!.to);
        if (statuses?.length) q = q.in("status", [...statuses]);
        return q.order("start_date", { ascending: true }).order("id", { ascending: true }).range(from, to);
      });
      return rows.map(normalizeRequest).filter((r): r is LeaveRequest => r !== null);
    },
  });
}

/** Requests waiting for a decision, oldest start first, with the employee: the queue an owner or admin works through. */
export function usePendingLeaveRequests(enabled = true) {
  return useQuery<LeaveRequest[]>({
    queryKey: lqk.pending,
    enabled,
    retry: noRetryWhenMissing,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const rows = await fetchAllPages<unknown>((from, to) =>
        supabase
          .from("employee_leave_requests")
          .select("*, employee:contacts(id, name, job_title, department)")
          .eq("status", "PENDING")
          .order("start_date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      );
      return rows.map(normalizeRequest).filter((r): r is LeaveRequest => r !== null);
    },
  });
}

/**
 * One line per leave type for a calendar year: entitlement, carry-over, taken, pending and remaining for annual
 * leave, counters for the others. Six lines in the order of LEAVE_TYPES; an empty list means the server sent nothing
 * usable, which a screen must not draw as zeros.
 */
export function useLeaveBalance(employeeId: string | null, year: number, enabled = true) {
  return useQuery<LeaveBalanceLine[]>({
    queryKey: lqk.balance(employeeId ?? "none", year),
    enabled: Boolean(employeeId) && enabled,
    retry: noRetryWhenMissing,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("employee_leave_balance", { p_employee_id: employeeId, p_year: year });
      if (error) throw error;
      return parseBalanceRows(data);
    },
  });
}

/**
 * Who is away on a day (approved leave only), with the day they are expected back. Open to every role that can
 * write; it carries no reasons. Defaults to today in the local calendar.
 */
export function useEmployeesOnLeave(date?: string, enabled = true) {
  const day = date ?? todayISODate();
  return useQuery<OnLeaveRow[]>({
    queryKey: lqk.onLeave(day),
    enabled,
    retry: noRetryWhenMissing,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("employees_on_leave", { p_date: day });
      if (error) throw error;
      return ((data as unknown[]) ?? []).map(normalizeOnLeave).filter((r): r is OnLeaveRow => r !== null);
    },
  });
}

// ── Writes ──────────────────────────────────────────────────────────────────

/**
 * One mutation hook per database function. A success refreshes the leave data and the audit feed (the employee's
 * history shows each step). The refresh is started, not awaited, so a dialog never waits on it.
 */
function useLeaveRpc<TArgs, TResult = unknown>(fn: string, toParams: (args: TArgs) => Record<string, unknown>) {
  const qc = useQueryClient();
  return useMutation<TResult, unknown, TArgs>({
    mutationFn: async (args) => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc(fn, toParams(args));
      if (error) throw error;
      return data as TResult;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: lqk.all });
      void qc.invalidateQueries({ queryKey: ["audit_log_feed"] });
    },
  });
}

const blank = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

/** The whole file plus the employee. Start from `fileInputFromDetails(stored)` to change one thing without clearing the rest. */
export type UpsertEmployeeDetailsInput = EmployeeFileInput & { employeeId: string };

export function useUpsertEmployeeDetails() {
  return useLeaveRpc<UpsertEmployeeDetailsInput, null>("employee_details_upsert", (a) => ({
    p_employee_id: a.employeeId,
    p_employment_type: a.employmentType ?? null,
    p_national_id: blank(a.nationalId),
    p_birth_date: blank(a.birthDate),
    p_contract_end: blank(a.contractEnd),
    p_probation_end: blank(a.probationEnd),
    p_bank_name: blank(a.bankName),
    p_bank_account: blank(a.bankAccount),
    p_iban: blank(normalizeIban(a.iban)),
    p_emergency_name: blank(a.emergencyName),
    p_emergency_phone: blank(a.emergencyPhone),
    p_annual_leave_days: a.annualLeaveDays ?? null,
    p_leave_carry_over: a.leaveCarryOver ?? null,
    p_leave_carry_over_year: a.leaveCarryOverYear ?? null,
    p_termination_date: blank(a.terminationDate),
    p_termination_reason: blank(a.terminationReason),
    p_notes: blank(a.notes),
  }));
}

export type RequestLeaveInput = {
  employeeId: string;
  type: LeaveType;
  start: string;
  end: string;
  reason?: string | null;
  /** Record it as approved at once. Owner and admin only. */
  approve?: boolean;
  /** Why the annual balance is exceeded. Owner and admin only; required to go over. */
  overrideNote?: string | null;
};

/** Returns the new request's id. A pending request waits for an owner or admin; `approve: true` skips the wait. */
export function useRequestLeave() {
  return useLeaveRpc<RequestLeaveInput, string>("employee_leave_request", (a) => ({
    p_employee_id: a.employeeId,
    p_leave_type: a.type,
    p_start: a.start,
    p_end: a.end,
    p_reason: blank(a.reason),
    p_approve: a.approve ?? false,
    p_override_note: blank(a.overrideNote),
  }));
}

export type DecideLeaveInput = {
  id: string;
  approve: boolean;
  /** Required when rejecting. */
  note?: string | null;
  /** Approve although the annual balance no longer covers it; needs a note. */
  override?: boolean;
};

export function useDecideLeave() {
  return useLeaveRpc<DecideLeaveInput, null>("employee_leave_decide", (a) => ({
    p_request_id: a.id,
    p_approve: a.approve,
    p_note: blank(a.note),
    p_override: a.override ?? false,
  }));
}

/** Withdraw a pending request (accountant and above) or cancel an approved leave that has not started (owner, admin). */
export function useCancelLeave() {
  return useLeaveRpc<{ id: string; reason: string }, null>("employee_leave_cancel", (a) => ({
    p_request_id: a.id,
    p_reason: a.reason,
  }));
}

/** The employee came back early: the approved leave now ends on `newEnd` and the later days return to the balance. */
export function useEndLeaveEarly() {
  return useLeaveRpc<{ id: string; newEnd: string; reason: string }, null>("employee_leave_end_early", (a) => ({
    p_request_id: a.id,
    p_new_end: a.newEnd,
    p_reason: a.reason,
  }));
}
