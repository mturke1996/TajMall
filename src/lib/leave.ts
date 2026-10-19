/**
 * Employee leave and file: the rules and the wording, with no database and no React.
 * The database computes the same numbers (migration 083); this file lets a screen show them before anything is
 * saved (how many working days, what is left, who clashes) and keeps one set of labels. A parity test in
 * scripts/test-leave-scenarios.mjs holds the two implementations to the same answers.
 *
 * Dates are calendar days as "YYYY-MM-DD" and are read as UTC midnights, so the answer never depends on the device's
 * time zone. The weekend is Friday and Saturday (JavaScript day numbers 5 and 6).
 */
import { addDaysISO, daysBetween } from "./mall-dates";
import { normalizeRole } from "./permissions";
import { arabicCount, formatDate } from "./utils";

// ── Vocabulary ──────────────────────────────────────────────────────────────

export const LEAVE_TYPES = ["ANNUAL", "SICK", "UNPAID", "EMERGENCY", "MATERNITY", "OTHER"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** The tone names of `Badge`. */
export type LeaveTone = "success" | "warning" | "danger" | "info" | "plum" | "neutral";
/** The accents of `IconTile` (dashboard-ui). */
export type LeaveAccent = "green" | "red" | "amber" | "blue" | "violet" | "teal";

/** Friday and Saturday, as JavaScript numbers days (Sunday = 0). */
export const DEFAULT_WEEKEND: readonly number[] = [5, 6];

/** A default for an employee with no file yet; the same figure the database falls back to. */
export const DEFAULT_ANNUAL_LEAVE_DAYS = 30;

const TYPE_SHORT: Record<LeaveType, string> = {
  ANNUAL: "سنوية",
  SICK: "مرضية",
  UNPAID: "بدون راتب",
  EMERGENCY: "طارئة",
  MATERNITY: "أمومة",
  OTHER: "أخرى",
};

const TYPE_ACCENT: Record<LeaveType, LeaveAccent> = {
  ANNUAL: "blue",
  SICK: "teal",
  UNPAID: "amber",
  EMERGENCY: "red",
  MATERNITY: "green",
  OTHER: "violet",
};

const STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: "بانتظار القرار",
  APPROVED: "معتمدة",
  REJECTED: "مرفوضة",
  CANCELLED: "ملغاة",
};

const STATUS_TONE: Record<LeaveStatus, LeaveTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: "دوام كامل",
  PART_TIME: "دوام جزئي",
  CONTRACT: "عقد",
  TEMPORARY: "مؤقت",
};

const WEEKDAY_LABEL = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;

export function isLeaveType(value: unknown): value is LeaveType {
  return typeof value === "string" && (LEAVE_TYPES as readonly string[]).includes(value);
}

export function isLeaveStatus(value: unknown): value is LeaveStatus {
  return typeof value === "string" && (LEAVE_STATUSES as readonly string[]).includes(value);
}

export function isEmploymentType(value: unknown): value is EmploymentType {
  return typeof value === "string" && (EMPLOYMENT_TYPES as readonly string[]).includes(value);
}

/** "سنوية", or "إجازة سنوية" with `full`. An unknown value reads as "أخرى" rather than as nothing. */
export function leaveTypeLabel(type: string | null | undefined, full = false): string {
  const short = isLeaveType(type) ? TYPE_SHORT[type] : TYPE_SHORT.OTHER;
  return full ? `إجازة ${short}` : short;
}

export function leaveTypeAccent(type: string | null | undefined): LeaveAccent {
  return isLeaveType(type) ? TYPE_ACCENT[type] : TYPE_ACCENT.OTHER;
}

export function leaveStatusLabel(status: string | null | undefined): string {
  return isLeaveStatus(status) ? STATUS_LABEL[status] : "—";
}

export function leaveStatusTone(status: string | null | undefined): LeaveTone {
  return isLeaveStatus(status) ? STATUS_TONE[status] : "neutral";
}

export function employmentTypeLabel(type: string | null | undefined): string {
  return isEmploymentType(type) ? EMPLOYMENT_LABEL[type] : "—";
}

// ── Calendar days ───────────────────────────────────────────────────────────

const ISO = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Day of week of a calendar day: Sunday 0 … Saturday 6; -1 when the text is not a real date (31 February and
 * month 13 are refused instead of rolling into the next month).
 */
export function weekdayOf(iso: string): number {
  const m = ISO.exec(iso);
  if (!m) return -1;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(t.getTime()) || t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return -1;
  return t.getUTCDay();
}

export function isValidDay(iso: string | null | undefined): boolean {
  return typeof iso === "string" && weekdayOf(iso) >= 0;
}

export function weekdayLabel(iso: string): string {
  const d = weekdayOf(iso);
  return d < 0 ? "" : WEEKDAY_LABEL[d];
}

export function isWeekend(iso: string, weekend: readonly number[] = DEFAULT_WEEKEND): boolean {
  const d = weekdayOf(iso);
  return d >= 0 && weekend.includes(d);
}

/**
 * Working days from `start` to `end`, both included, with the weekend taken out. 0 for a range that is backwards,
 * not a date, or only weekend. Counted by whole weeks plus the remainder, so a silly range costs nothing.
 */
export function workingDays(start: string, end: string, weekend: readonly number[] = DEFAULT_WEEKEND): number {
  if (!isValidDay(start) || !isValidDay(end)) return 0;
  const gap = daysBetween(start, end);
  if (gap == null || gap < 0) return 0;
  const off = new Set(weekend.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  const span = gap + 1;
  const first = weekdayOf(start);
  let count = Math.floor(span / 7) * (7 - off.size);
  for (let i = 0; i < span % 7; i += 1) if (!off.has((first + i) % 7)) count += 1;
  return count;
}

/** The first working day after `iso`: the day an employee on leave until `iso` is expected back. */
export function nextWorkingDay(iso: string, weekend: readonly number[] = DEFAULT_WEEKEND): string {
  if (weekdayOf(iso) < 0) return iso;
  let next = addDaysISO(iso, 1);
  for (let i = 0; i < 7 && isWeekend(next, weekend); i += 1) next = addDaysISO(next, 1);
  return next;
}

/**
 * The last day of a leave that starts on `start` and uses `days` working days: the date to fill in when someone
 * types "5 days". The result is always a working day. null for fewer than one day or a start that is not a date.
 */
export function leaveEndForDays(start: string, days: number, weekend: readonly number[] = DEFAULT_WEEKEND): string | null {
  if (weekdayOf(start) < 0 || !Number.isInteger(days) || days < 1 || days > 366) return null;
  if (weekend.length >= 7) return null;
  let cur = start;
  let used = 0;
  for (let i = 0; i < 4000; i += 1) {
    if (!isWeekend(cur, weekend)) {
      used += 1;
      if (used === days) return cur;
    }
    cur = addDaysISO(cur, 1);
  }
  return null;
}

/** "YYYY-MM" of a date. */
export function monthKeyOfDate(iso: string): string {
  return ISO.test(iso) ? iso.slice(0, 7) : "";
}

/** Working days of a leave, split by calendar month (payroll is per month): `{ "2026-10": 3, "2026-11": 2 }`. */
export function workingDaysByMonth(start: string, end: string, weekend: readonly number[] = DEFAULT_WEEKEND): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isValidDay(start) || !isValidDay(end)) return out;
  const gap = daysBetween(start, end);
  if (gap == null || gap < 0 || gap > 3700) return out;
  let cursor = start.slice(0, 10);
  while (cursor <= end.slice(0, 10)) {
    const monthEnd = lastDayOfMonth(cursor);
    const segmentEnd = monthEnd < end.slice(0, 10) ? monthEnd : end.slice(0, 10);
    const n = workingDays(cursor, segmentEnd, weekend);
    if (n > 0) out[monthKeyOfDate(cursor)] = n;
    cursor = addDaysISO(segmentEnd, 1);
  }
  return out;
}

function lastDayOfMonth(iso: string): string {
  const m = ISO.exec(iso);
  if (!m) return iso;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
}

// ── Years ───────────────────────────────────────────────────────────────────

export function leaveYearOf(iso: string): number {
  const m = ISO.exec(iso);
  return m && isValidDay(iso) ? Number(m[1]) : Number.NaN;
}

export function yearBounds(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** Every calendar year a leave touches, in order: a leave from 28 December to 5 January touches two. */
export function yearsTouched(start: string, end: string): number[] {
  const a = leaveYearOf(start);
  const b = leaveYearOf(end);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return [];
  const out: number[] = [];
  for (let y = a; y <= b && out.length < 50; y += 1) out.push(y);
  return out;
}

/** The working days of a leave that fall inside one calendar year. */
export function workingDaysInYear(start: string, end: string, year: number, weekend: readonly number[] = DEFAULT_WEEKEND): number {
  const { start: ys, end: ye } = yearBounds(year);
  const from = start.slice(0, 10) > ys ? start.slice(0, 10) : ys;
  const to = end.slice(0, 10) < ye ? end.slice(0, 10) : ye;
  return workingDays(from, to, weekend);
}

// ── Requests ────────────────────────────────────────────────────────────────

export type LeaveEmployeeRef = { id: string; name: string; job_title: string | null; department: string | null };

export type LeaveRequest = {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  /** Working days, Friday and Saturday excluded. */
  days: number;
  status: LeaveStatus;
  reason: string | null;
  decision_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  override_note: string | null;
  original_end_date: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  /** Present when the list was read together with the employee. */
  employee?: LeaveEmployeeRef | null;
};

/** The part of a request the overlap and balance rules need. */
export type LeaveSpan = Pick<LeaveRequest, "id" | "employee_id" | "leave_type" | "start_date" | "end_date" | "status">;

/** True when the two inclusive ranges share at least one calendar day. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart.slice(0, 10) <= bEnd.slice(0, 10) && aEnd.slice(0, 10) >= bStart.slice(0, 10);
}

/** A leave that still holds days: waiting for a decision or approved. */
export function isLive(status: string): boolean {
  return status === "PENDING" || status === "APPROVED";
}

/**
 * The first pending or approved leave of the same employee that shares a day with the range, or null. Pass the
 * request being edited as `excludeId` so it does not clash with itself.
 */
export function findOverlap<T extends LeaveSpan>(
  requests: readonly T[],
  range: { employeeId: string; start: string; end: string; excludeId?: string | null },
): T | null {
  const hits = requests
    .filter(
      (r) =>
        r.employee_id === range.employeeId &&
        isLive(r.status) &&
        r.id !== range.excludeId &&
        rangesOverlap(r.start_date, r.end_date, range.start, range.end),
    )
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  return hits[0] ?? null;
}

/** Why a range cannot be requested, in plain Arabic, or null when it can. Mirrors the checks the database makes. */
export function validateLeaveRange(input: {
  start: string;
  end: string;
  type: LeaveType;
  reason?: string | null;
  hireDate?: string | null;
  terminationDate?: string | null;
  today: string;
  weekend?: readonly number[];
}): string | null {
  const { start, end } = input;
  if (!start || !end || weekdayOf(start) < 0 || weekdayOf(end) < 0) return "حدّد بداية الإجازة ونهايتها";
  if (end < start) return "تاريخ نهاية الإجازة قبل تاريخ بدايتها";
  const gap = daysBetween(start, end);
  if (gap != null && gap > 365) return "مدة الإجازة أطول من سنة. قسّمها على فترتين.";
  if (start < "2020-01-01" || end > addDaysISO(input.today, 730)) return "تاريخ الإجازة غير معقول، راجع السنة";
  if (input.type === "OTHER" && (input.reason ?? "").trim().length < 3) return "اكتب سبب الإجازة";
  if (input.hireDate && start < input.hireDate.slice(0, 10)) return "تبدأ الإجازة قبل تاريخ تعيين الموظف";
  if (input.terminationDate && end > input.terminationDate.slice(0, 10)) return "تنتهي الإجازة بعد تاريخ انتهاء خدمة الموظف";
  if (workingDays(start, end, input.weekend) <= 0) return "الفترة المختارة كلها عطلة أسبوعية (الجمعة والسبت)";
  return null;
}

// ── Balance ─────────────────────────────────────────────────────────────────

export type LeaveBalanceLine = {
  type: LeaveType;
  /** Annual only: the yearly allowance plus the carry-over that belongs to the year. Null for counters. */
  entitlement: number | null;
  carryOver: number;
  /** Approved working days inside the year, including approved leave that has not started yet. */
  taken: number;
  /** Working days still waiting for a decision. */
  pending: number;
  /** Annual only: entitlement − taken − pending. Negative only after an approved over-balance exception. */
  remaining: number | null;
};

export type BalanceInputs = {
  year: number;
  annualDays: number;
  carryOver: number;
  /** The year the carry-over belongs to; it counts only for that year. */
  carryOverYear: number | null;
  weekend?: readonly number[];
};

export function annualEntitlement(inputs: Pick<BalanceInputs, "year" | "annualDays" | "carryOver" | "carryOverYear">): number {
  return inputs.annualDays + (inputs.carryOverYear === inputs.year ? inputs.carryOver : 0);
}

/** Working days of the requests of one type and status that fall inside the year. */
export function usedDays(
  requests: readonly LeaveSpan[],
  year: number,
  type: LeaveType,
  status: LeaveStatus,
  weekend: readonly number[] = DEFAULT_WEEKEND,
  excludeId?: string | null,
): number {
  let total = 0;
  for (const r of requests) {
    if (r.leave_type !== type || r.status !== status || r.id === excludeId) continue;
    total += workingDaysInYear(r.start_date, r.end_date, year, weekend);
  }
  return total;
}

/** One line per leave type for a year, worked out from the employee's own requests (same rules as the database). */
export function computeBalance(requests: readonly LeaveSpan[], inputs: BalanceInputs): LeaveBalanceLine[] {
  const weekend = inputs.weekend ?? DEFAULT_WEEKEND;
  return LEAVE_TYPES.map((type) => {
    const taken = usedDays(requests, inputs.year, type, "APPROVED", weekend);
    const pending = usedDays(requests, inputs.year, type, "PENDING", weekend);
    if (type !== "ANNUAL") return { type, entitlement: null, carryOver: 0, taken, pending, remaining: null };
    const entitlement = annualEntitlement(inputs);
    return {
      type,
      entitlement,
      carryOver: inputs.carryOverYear === inputs.year ? inputs.carryOver : 0,
      taken,
      pending,
      remaining: entitlement - taken - pending,
    };
  });
}

/**
 * The balance table as the `employee_leave_balance` function returns it: six lines in LEAVE_TYPES order, unknown
 * types dropped. An answer with no usable row gives an empty list, which a screen must not draw as zeros.
 */
export function parseBalanceRows(rows: unknown): LeaveBalanceLine[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const byType = new Map<LeaveType, LeaveBalanceLine>();
  const num = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  for (const raw of rows as Array<Record<string, unknown>>) {
    const type = raw?.leave_type;
    if (!isLeaveType(type)) continue;
    byType.set(type, {
      type,
      entitlement: num(raw.entitlement),
      carryOver: num(raw.carry_over) ?? 0,
      taken: num(raw.taken) ?? 0,
      pending: num(raw.pending) ?? 0,
      remaining: num(raw.remaining),
    });
  }
  if (byType.size === 0) return [];
  // one line per type, in the canonical order, so a screen can index by type
  return LEAVE_TYPES.map(
    (type) => byType.get(type) ?? { type, entitlement: null, carryOver: 0, taken: 0, pending: 0, remaining: null },
  );
}

export function annualLine(lines: readonly LeaveBalanceLine[]): LeaveBalanceLine | null {
  return lines.find((l) => l.type === "ANNUAL") ?? null;
}

/** True when the annual balance is below zero (an approved exception took it past the allowance). */
export function isOverLimit(line: LeaveBalanceLine | null | undefined): boolean {
  return line != null && line.remaining != null && line.remaining < -0.0005;
}

/** Share of the annual allowance that is used or promised, 0..1 (for a ring or a bar). 0 with no allowance. */
export function usedShare(line: LeaveBalanceLine | null | undefined): number {
  if (!line || !line.entitlement || line.entitlement <= 0) return 0;
  return Math.min(1, Math.max(0, (line.taken + line.pending) / line.entitlement));
}

export type AnnualCheck = {
  ok: boolean;
  /** One entry per calendar year the leave touches. */
  years: Array<{ year: number; need: number; available: number; short: number }>;
};

/**
 * Can this annual leave be requested without going below zero? A new request counts the employee's other pending
 * leave as already promised; an approval (`countPending: false`) counts approved leave only.
 */
export function checkAnnualBalance(
  requests: readonly LeaveSpan[],
  input: {
    start: string;
    end: string;
    annualDays: number;
    carryOver: number;
    carryOverYear: number | null;
    excludeId?: string | null;
    countPending?: boolean;
    weekend?: readonly number[];
  },
): AnnualCheck {
  const weekend = input.weekend ?? DEFAULT_WEEKEND;
  const countPending = input.countPending ?? true;
  const years = yearsTouched(input.start, input.end)
    .map((year) => {
      const need = workingDaysInYear(input.start, input.end, year, weekend);
      const entitlement = annualEntitlement({ year, annualDays: input.annualDays, carryOver: input.carryOver, carryOverYear: input.carryOverYear });
      const available =
        entitlement -
        usedDays(requests, year, "ANNUAL", "APPROVED", weekend, input.excludeId) -
        (countPending ? usedDays(requests, year, "ANNUAL", "PENDING", weekend, input.excludeId) : 0);
      return { year, need, available, short: Math.max(0, need - available) };
    })
    .filter((y) => y.need > 0);
  return { ok: years.every((y) => y.short <= 0.0005), years };
}

// ── Words ───────────────────────────────────────────────────────────────────

const trim = (n: number) => String(Math.round(n * 10) / 10);

/** "يوم", "يومين", "3 أيام", "11 يوماً". */
export function daysLabel(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0 يوم";
  return arabicCount(Math.round(n * 10) / 10, ["يوم", "يومين", "أيام", "يوماً"]);
}

/** Working days: "يوم عمل", "يومي عمل", "3 أيام عمل", "11 يوم عمل". */
export function workingDaysLabel(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0 يوم عمل";
  return arabicCount(n, ["يوم عمل", "يومي عمل", "أيام عمل", "يوم عمل"]);
}

/** "12 – 16 أكتوبر 2026" within a month, the full dates otherwise, one date for a single day. */
export function formatLeaveRange(start: string, end: string): string {
  if (!start) return "—";
  const a = formatDate(start);
  if (!end || start.slice(0, 10) === end.slice(0, 10)) return a;
  const b = formatDate(end);
  const [da, ma, ya] = a.split(" ");
  const [, mb, yb] = b.split(" ");
  if (ya === yb && ma === mb) return `${da} – ${b}`;
  if (ya === yb) return `${da} ${ma} – ${b}`;
  return `${a} – ${b}`;
}

/** "الأحد 25 أكتوبر 2026" for the day an employee is expected back. */
export function formatReturnDay(iso: string): string {
  return `${weekdayLabel(iso)} ${formatDate(iso)}`.trim();
}

/** One line for a list: "سنوية · 5 أيام عمل · 12 – 16 أكتوبر 2026". */
export function leaveSummaryLine(r: Pick<LeaveRequest, "leave_type" | "days" | "start_date" | "end_date">): string {
  return [leaveTypeLabel(r.leave_type), workingDaysLabel(r.days), formatLeaveRange(r.start_date, r.end_date)].join(" · ");
}

/** Where an approved leave stands against today. */
export type LeavePhase = "upcoming" | "ongoing" | "past";

export function leavePhase(r: Pick<LeaveRequest, "start_date" | "end_date">, today: string): LeavePhase {
  if (r.end_date.slice(0, 10) < today) return "past";
  if (r.start_date.slice(0, 10) > today) return "upcoming";
  return "ongoing";
}

export function leavePhaseLabel(phase: LeavePhase): string {
  return phase === "ongoing" ? "جارية" : phase === "upcoming" ? "قادمة" : "منتهية";
}

/** A short sentence about the annual balance for a card: headline and detail. */
export function describeBalance(line: LeaveBalanceLine | null | undefined): { headline: string; detail: string; over: boolean } {
  if (!line || line.entitlement == null || line.remaining == null) return { headline: "لا يوجد رصيد", detail: "", over: false };
  const over = isOverLimit(line);
  const parts = [`المستحق ${trim(line.entitlement)}`, `المعتمد ${trim(line.taken)}`];
  if (line.pending > 0) parts.push(`بانتظار القرار ${trim(line.pending)}`);
  return {
    headline: over ? `تجاوز بمقدار ${daysLabel(-line.remaining)}` : line.remaining === 0 ? "لا رصيد متبقٍّ" : `المتبقي ${daysLabel(line.remaining)}`,
    detail: parts.join(" · "),
    over,
  };
}

// ── Who may do what (mirrors the database guards) ───────────────────────────

export type LeavePowers = {
  /** Read the file and leave, request leave, withdraw a pending request. Owner, admin, accountant. */
  canManage: boolean;
  /** Decide, cancel an approved leave, end one early, exceed the balance. Owner, admin. */
  canApprove: boolean;
  /** See who is away today (no reasons). Every role that can write. */
  canSeeOnLeave: boolean;
};

export function leavePowers(role: string | null | undefined): LeavePowers {
  const r = normalizeRole(role);
  const canApprove = r === "owner" || r === "admin";
  return { canManage: canApprove || r === "accountant", canApprove, canSeeOnLeave: r !== "viewer" };
}

export type LeaveActions = { decide: boolean; cancel: boolean; endEarly: boolean };

/** Which buttons a request row may show. The database refuses the rest anyway; this keeps the screen honest. */
export function leaveActions(request: Pick<LeaveRequest, "status" | "start_date" | "end_date">, powers: LeavePowers, today: string): LeaveActions {
  const start = request.start_date.slice(0, 10);
  const end = request.end_date.slice(0, 10);
  const pending = request.status === "PENDING";
  const approved = request.status === "APPROVED";
  return {
    decide: pending && powers.canApprove,
    cancel: (pending && powers.canManage) || (approved && powers.canApprove && start >= today),
    endEarly: approved && powers.canApprove && start <= today && end > today && end > start,
  };
}

// ── Unpaid leave and pay ────────────────────────────────────────────────────

const money = (n: number) => Math.round(n * 1000) / 1000;

/** One day of unpaid leave in pay: the monthly pay divided by 30, to the thousandth. 0 for pay that is not a positive number. */
export function unpaidDayRate(monthlyPay: number): number {
  return Number.isFinite(monthlyPay) && monthlyPay > 0 ? money(monthlyPay / 30) : 0;
}

/**
 * What `days` days of unpaid leave could cost in pay: the monthly pay divided by 30 for each day, rounded to the
 * thousandth (the money precision of the books). It is a suggestion for the accountant to confirm, never posted by
 * itself. Pass the monthly total the employee actually earns; it never suggests more than one month's pay, and gives 0
 * for pay or days that are not positive numbers. For a leave with dates use `suggestedUnpaidDeductionsByMonth`: the
 * `days` of a leave request are working days, which leave out the rest days inside the leave and so fall short of
 * a month's pay when the employee is away the whole month.
 */
export function suggestedUnpaidDeduction(monthlyPay: number, days: number): number {
  if (!Number.isFinite(monthlyPay) || !Number.isFinite(days) || monthlyPay <= 0 || days <= 0) return 0;
  return money((monthlyPay * Math.min(days, 30)) / 30);
}

/**
 * The days of an unpaid leave that payroll takes off, per calendar month: from the first to the last working day
 * of the leave, with the rest days between them (a person away from Thursday to Sunday is not paid for Friday and
 * Saturday either), but not a rest day at either end. A month the leave covers from its first to its last day counts
 * 30, so a whole month off takes the whole pay whether the month has 28 or 31 days.
 * `{ "2026-10": 4, "2026-11": 4 }`; empty for a range that is backwards, unreadable or only rest days.
 */
export function unpaidDaysByMonth(start: string, end: string, weekend: readonly number[] = DEFAULT_WEEKEND): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isValidDay(start) || !isValidDay(end)) return out;
  const from = start.slice(0, 10);
  const to = end.slice(0, 10);
  const gap = daysBetween(from, to);
  if (gap == null || gap < 0 || gap > 3700) return out;
  let first = from;
  while (first <= to && isWeekend(first, weekend)) first = addDaysISO(first, 1);
  let last = to;
  while (last >= first && isWeekend(last, weekend)) last = addDaysISO(last, -1);
  if (first > last) return out;
  let cursor = from;
  while (cursor <= to) {
    const monthEnd = lastDayOfMonth(cursor);
    const segmentEnd = monthEnd < to ? monthEnd : to;
    const wholeMonth = cursor.slice(8, 10) === "01" && segmentEnd === monthEnd;
    const a = cursor > first ? cursor : first;
    const b = segmentEnd < last ? segmentEnd : last;
    const days = wholeMonth ? 30 : a <= b ? (daysBetween(a, b) ?? 0) + 1 : 0;
    if (days > 0) out[monthKeyOfDate(cursor)] = Math.min(days, 30);
    cursor = addDaysISO(segmentEnd, 1);
  }
  return out;
}

/** The suggestion per payroll month for a leave with dates: `[{ month: "2026-10", days: 4, total: 400 }]`. */
export function suggestedUnpaidDeductionsByMonth(
  monthlyPay: number,
  start: string,
  end: string,
  weekend: readonly number[] = DEFAULT_WEEKEND,
): Array<{ month: string; days: number; total: number }> {
  return Object.entries(unpaidDaysByMonth(start, end, weekend)).map(([month, days]) => ({
    month,
    days,
    total: suggestedUnpaidDeduction(monthlyPay, days),
  }));
}

// ── Reading database values ─────────────────────────────────────────────────

const asNum = (v: unknown, fallback = 0) => (v == null || v === "" || !Number.isFinite(Number(v)) ? fallback : Number(v));
const asStr = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const asDay = (v: unknown): string | null => (typeof v === "string" && ISO.test(v) ? v.slice(0, 10) : null);

// ── Who is away ─────────────────────────────────────────────────────────────

/** One row of `employees_on_leave`: an approved leave that covers the day, with the day the employee is back. */
export type OnLeaveRow = {
  request_id: string;
  employee_id: string;
  employee_name: string;
  job_title: string | null;
  department: string | null;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  return_date: string;
};

export function normalizeOnLeave(raw: unknown): OnLeaveRow | null {
  const r = raw as Record<string, unknown> | null;
  const start = r ? asDay(r.start_date) : null;
  const end = r ? asDay(r.end_date) : null;
  if (!r || typeof r.request_id !== "string" || typeof r.employee_id !== "string" || !start || !end) return null;
  return {
    request_id: r.request_id,
    employee_id: r.employee_id,
    employee_name: asStr(r.employee_name) ?? "",
    job_title: asStr(r.job_title),
    department: asStr(r.department),
    leave_type: isLeaveType(r.leave_type) ? r.leave_type : "OTHER",
    start_date: start,
    end_date: end,
    days: asNum(r.days),
    // an older server may not send it; the weekend rule gives the same day
    return_date: asDay(r.return_date) ?? nextWorkingDay(end),
  };
}

// ── The employee file ───────────────────────────────────────────────────────

export type EmployeeDetails = {
  employee_id: string;
  national_id: string | null;
  birth_date: string | null;
  employment_type: EmploymentType;
  contract_end: string | null;
  probation_end: string | null;
  bank_name: string | null;
  bank_account: string | null;
  iban: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  annual_leave_days: number;
  leave_carry_over: number;
  leave_carry_over_year: number | null;
  termination_date: string | null;
  termination_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * The whole file as the save function takes it: an empty or missing field clears what is stored. Three values keep
 * what is stored when left out (null): the employment type, the yearly allowance and the carry-over. A missing
 * `leaveCarryOverYear` keeps the stored year while the carry-over is unchanged, otherwise it is the current year.
 */
export type EmployeeFileInput = {
  employmentType?: EmploymentType | null;
  nationalId?: string | null;
  birthDate?: string | null;
  contractEnd?: string | null;
  probationEnd?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  iban?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  annualLeaveDays?: number | null;
  leaveCarryOver?: number | null;
  leaveCarryOverYear?: number | null;
  terminationDate?: string | null;
  terminationReason?: string | null;
  notes?: string | null;
};

/**
 * The stored file as a save input. Because a save sends the whole file, a screen that changes one thing (an end of
 * service, the allowance) starts from this and overrides that one field; sending only the changed field would
 * clear the rest of the file. With no file yet the result is empty and the save opens one with the defaults.
 */
export function fileInputFromDetails(details: EmployeeDetails | null | undefined): EmployeeFileInput {
  if (!details) return {};
  return {
    employmentType: details.employment_type,
    nationalId: details.national_id,
    birthDate: details.birth_date,
    contractEnd: details.contract_end,
    probationEnd: details.probation_end,
    bankName: details.bank_name,
    bankAccount: details.bank_account,
    iban: details.iban,
    emergencyName: details.emergency_name,
    emergencyPhone: details.emergency_phone,
    annualLeaveDays: details.annual_leave_days,
    leaveCarryOver: details.leave_carry_over,
    leaveCarryOverYear: details.leave_carry_over_year,
    terminationDate: details.termination_date,
    terminationReason: details.termination_reason,
    notes: details.notes,
  };
}

/** The shape the database accepts: IBAN without spaces, in capitals. */
export function normalizeIban(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

export function isValidIban(value: string | null | undefined): boolean {
  return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(normalizeIban(value));
}

/** "LY83 0020 0000 …" in groups of four, for reading. */
export function formatIban(value: string | null | undefined): string {
  return normalizeIban(value).replace(/(.{4})/g, "$1 ").trim();
}

/** Hides all but the last digits: "•••• 4821". The full value stays one tap away on the screen. */
export function maskTail(value: string | null | undefined, keep = 4): string {
  const v = (value ?? "").replace(/\s+/g, "");
  if (!v) return "";
  return v.length <= keep ? v : `•••• ${v.slice(-keep)}`;
}

/** How long since the hire date: "سنتان و3 أشهر", "5 أشهر", "أقل من شهر". null without a date in the past. */
export function tenureLabel(hireDate: string | null | undefined, today: string): string | null {
  if (!hireDate || !ISO.test(hireDate)) return null;
  const h = ISO.exec(hireDate)!;
  const t = ISO.exec(today);
  if (!t) return null;
  let months = (Number(t[1]) - Number(h[1])) * 12 + (Number(t[2]) - Number(h[2]));
  if (Number(t[3]) < Number(h[3])) months -= 1;
  if (months < 0) return null;
  if (months < 1) return "أقل من شهر";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years > 0 ? arabicCount(years, ["سنة", "سنتان", "سنوات", "سنة"]) : "";
  const m = rest > 0 ? arabicCount(rest, ["شهر", "شهران", "أشهر", "شهراً"]) : "";
  return [y, m].filter(Boolean).join(" و");
}

export type FileAlert = {
  key: "contract_end" | "probation_end" | "termination";
  label: string;
  date: string;
  /** Days from today to the date: negative once it has passed. */
  daysLeft: number;
  tone: "danger" | "warning" | "info";
};

/**
 * Dates on the file that need a look: a contract that ends soon or has ended, a probation period about to end,
 * an end of service. Nothing is returned for an employee whose service has already ended except that date itself.
 */
export function fileAlerts(details: Pick<EmployeeDetails, "contract_end" | "probation_end" | "termination_date"> | null | undefined, today: string): FileAlert[] {
  if (!details) return [];
  const out: FileAlert[] = [];
  const left = (date: string) => daysBetween(today, date) ?? 0;
  if (details.termination_date) {
    const d = left(details.termination_date);
    out.push({
      key: "termination",
      label: d < 0 ? "انتهت الخدمة" : d === 0 ? "آخر يوم في الخدمة اليوم" : `تنتهي الخدمة بعد ${daysLabel(d)}`,
      date: details.termination_date,
      daysLeft: d,
      tone: d < 0 ? "danger" : "warning",
    });
    return out;
  }
  if (details.contract_end) {
    const d = left(details.contract_end);
    if (d <= 60) {
      out.push({
        key: "contract_end",
        label: d < 0 ? `انتهى العقد منذ ${daysLabel(-d)}` : d === 0 ? "ينتهي العقد اليوم" : `ينتهي العقد بعد ${daysLabel(d)}`,
        date: details.contract_end,
        daysLeft: d,
        tone: d < 0 ? "danger" : d <= 30 ? "warning" : "info",
      });
    }
  }
  if (details.probation_end) {
    const d = left(details.probation_end);
    if (d >= 0 && d <= 30) {
      out.push({
        key: "probation_end",
        label: d === 0 ? "تنتهي فترة التجربة اليوم" : `تنتهي فترة التجربة بعد ${daysLabel(d)}`,
        date: details.probation_end,
        daysLeft: d,
        tone: d <= 7 ? "warning" : "info",
      });
    }
  }
  return out;
}

// ── Rows from the database ──────────────────────────────────────────────────

/** A file row with numbers as numbers (PostgREST sends numeric as a number, a test double may send text). */
export function normalizeDetails(raw: unknown): EmployeeDetails | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r.employee_id !== "string") return null;
  return {
    employee_id: r.employee_id,
    national_id: asStr(r.national_id),
    birth_date: asDay(r.birth_date),
    employment_type: isEmploymentType(r.employment_type) ? r.employment_type : "FULL_TIME",
    contract_end: asDay(r.contract_end),
    probation_end: asDay(r.probation_end),
    bank_name: asStr(r.bank_name),
    bank_account: asStr(r.bank_account),
    iban: asStr(r.iban),
    emergency_name: asStr(r.emergency_name),
    emergency_phone: asStr(r.emergency_phone),
    annual_leave_days: asNum(r.annual_leave_days, DEFAULT_ANNUAL_LEAVE_DAYS),
    leave_carry_over: asNum(r.leave_carry_over),
    leave_carry_over_year: r.leave_carry_over_year == null ? null : asNum(r.leave_carry_over_year),
    termination_date: asDay(r.termination_date),
    termination_reason: asStr(r.termination_reason),
    notes: asStr(r.notes),
    created_at: asStr(r.created_at) ?? "",
    updated_at: asStr(r.updated_at) ?? "",
  };
}

/** A request row with a known type and status; null for a row that cannot be read. */
export function normalizeRequest(raw: unknown): LeaveRequest | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r.id !== "string" || typeof r.employee_id !== "string") return null;
  const start = asDay(r.start_date);
  const end = asDay(r.end_date);
  if (!start || !end || !isLeaveType(r.leave_type) || !isLeaveStatus(r.status)) return null;
  const emp = r.employee as Record<string, unknown> | null | undefined;
  return {
    id: r.id,
    employee_id: r.employee_id,
    leave_type: r.leave_type,
    start_date: start,
    end_date: end,
    days: asNum(r.days),
    status: r.status,
    reason: asStr(r.reason),
    decision_note: asStr(r.decision_note),
    decided_by: asStr(r.decided_by),
    decided_at: asStr(r.decided_at),
    override_note: asStr(r.override_note),
    original_end_date: asDay(r.original_end_date),
    cancelled_by: asStr(r.cancelled_by),
    cancelled_at: asStr(r.cancelled_at),
    cancel_reason: asStr(r.cancel_reason),
    created_by: asStr(r.created_by),
    created_at: asStr(r.created_at) ?? "",
    employee:
      emp && typeof emp.id === "string"
        ? { id: emp.id, name: asStr(emp.name) ?? "", job_title: asStr(emp.job_title), department: asStr(emp.department) }
        : null,
  };
}
