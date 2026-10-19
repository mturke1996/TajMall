/**
 * What the employee screens show, worked out from the rows the database sends: the five figures at the top of a
 * profile, the merged history, the year of leave as a strip of months, the directory rows with their filters, and
 * the check a leave request goes through before it is sent. No database and no React, so every figure has a test
 * (scripts/verify-employee-profile.mjs).
 *
 * Months are "YYYY-MM". The database stores a payroll month as text in that form; a date such as "2026-10-01" is
 * read the same way, so a screen never depends on which of the two a row carries.
 */
import { matchesSearch } from '../arabic-search';
import {
  annualLine,
  checkAnnualBalance,
  daysLabel,
  fileAlerts,
  findOverlap,
  formatLeaveRange,
  leaveStatusLabel,
  leaveTypeLabel,
  suggestedUnpaidDeduction,
  unpaidDaysByMonth,
  validateLeaveRange,
  workingDays,
  workingDaysByMonth,
  DEFAULT_ANNUAL_LEAVE_DAYS,
  type AnnualCheck,
  type EmployeeDetails,
  type FileAlert,
  type LeaveBalanceLine,
  type LeaveRequest,
  type LeaveType,
} from '../leave';
import type { PayrollAdjustment, PayrollAdvance, PayrollRunLine, PayrollSalaryStructure } from '../db/payroll-queries';

const EPS = 0.0005;
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round3 = (n: number) => Math.round(n * 1000) / 1000;

// ── Months ──────────────────────────────────────────────────────────────────

/** "2026-10" from "2026-10", "2026-10-01" or a timestamp; "" for anything else. */
export function monthKeyOf(value: string | null | undefined): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])/.exec(value ?? '');
  return m ? `${m[1]}-${m[2]}` : '';
}

/** The `n` months ending with the month of `today`, oldest first. */
export function lastMonthKeys(today: string, n = 12): string[] {
  const current = monthKeyOf(today);
  if (!current) return [];
  const [y, m] = current.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export function shiftMonthKey(month: string, delta: number): string {
  const key = monthKeyOf(month);
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** A local calendar day from a date or a timestamp ("2026-10-15T23:30:00Z" is already 16 October in Libya). */
export function localDayOf(value: string | null | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Salary structure ────────────────────────────────────────────────────────

type StructureLike = Pick<PayrollSalaryStructure, 'effective_from' | 'base_salary' | 'housing_allowance' | 'transport_allowance' | 'other_allowance'>;

export function structureTotalOf(s: StructureLike | null | undefined): number {
  if (!s) return 0;
  return round3(num(s.base_salary) + num(s.housing_allowance) + num(s.transport_allowance) + num(s.other_allowance));
}

/** The structure that pays the month: the latest one starting in or before it. */
export function structureInForce<T extends StructureLike>(structures: readonly T[], month: string): T | null {
  const key = monthKeyOf(month);
  if (!key) return null;
  const hits = structures.filter((s) => monthKeyOf(s.effective_from) && monthKeyOf(s.effective_from) <= key);
  hits.sort((a, b) => monthKeyOf(b.effective_from).localeCompare(monthKeyOf(a.effective_from)));
  return hits[0] ?? null;
}

/** The next structure that has not started yet (a raise that takes effect next month), or null. */
export function structureComingNext<T extends StructureLike>(structures: readonly T[], month: string): T | null {
  const key = monthKeyOf(month);
  if (!key) return null;
  const hits = structures.filter((s) => monthKeyOf(s.effective_from) > key);
  hits.sort((a, b) => monthKeyOf(a.effective_from).localeCompare(monthKeyOf(b.effective_from)));
  return hits[0] ?? null;
}

// ── The five figures ────────────────────────────────────────────────────────

type LineLike = Pick<PayrollRunLine, 'id' | 'period_month' | 'run_status' | 'net' | 'paid' | 'outstanding'>;
type AdvanceLike = Pick<PayrollAdvance, 'status' | 'remaining' | 'installment_amount'>;

/** Lines of posted months with something still to pay, oldest month first. Draft and approved runs owe nothing yet. */
export function outstandingLinesOf<T extends Pick<PayrollRunLine, 'period_month' | 'run_status' | 'outstanding'>>(lines: readonly T[]): T[] {
  return lines
    .filter((l) => l.run_status === 'POSTED' && num(l.outstanding) > EPS)
    .sort((a, b) => monthKeyOf(a.period_month).localeCompare(monthKeyOf(b.period_month)));
}

export type EmployeeKpis = {
  salary: {
    total: number;
    /** "YYYY-MM" the structure in force began, null when the figure comes from the contact card or is unknown */
    since: string | null;
    source: 'structure' | 'card' | 'none';
    coming: { total: number; from: string } | null;
  };
  /** What the posted payroll of the last twelve months came to after deductions. */
  netYear: { total: number; months: number };
  /** What the mall still owes the employee on posted months. */
  due: { total: number; months: number; oldestMonth: string | null; oldestLineId: string | null };
  advance: { balance: number; open: number; monthly: number };
};

export function buildEmployeeKpis(input: {
  structures: readonly StructureLike[];
  lines: readonly LineLike[];
  advances: readonly AdvanceLike[];
  /** contacts.salary: shown only until a structure exists */
  cardSalary?: string | number | null;
  today: string;
}): EmployeeKpis {
  const month = monthKeyOf(input.today);
  const inForce = structureInForce(input.structures, month);
  const next = structureComingNext(input.structures, month);
  const card = num(input.cardSalary);
  const salary: EmployeeKpis['salary'] = inForce
    ? { total: structureTotalOf(inForce), since: monthKeyOf(inForce.effective_from), source: 'structure', coming: null }
    : card > 0
      ? { total: round3(card), since: null, source: 'card', coming: null }
      : { total: 0, since: null, source: 'none', coming: null };
  if (next) salary.coming = { total: structureTotalOf(next), from: monthKeyOf(next.effective_from) };

  const window = new Set(lastMonthKeys(input.today, 12));
  const inYear = input.lines.filter((l) => l.run_status === 'POSTED' && window.has(monthKeyOf(l.period_month)));
  const netYear = { total: round3(inYear.reduce((s, l) => s + num(l.net), 0)), months: new Set(inYear.map((l) => monthKeyOf(l.period_month))).size };

  const owed = outstandingLinesOf(input.lines);
  const due = {
    total: round3(owed.reduce((s, l) => s + num(l.outstanding), 0)),
    months: new Set(owed.map((l) => monthKeyOf(l.period_month))).size,
    oldestMonth: owed[0] ? monthKeyOf(owed[0].period_month) : null,
    oldestLineId: owed[0]?.id ?? null,
  };

  const open = input.advances.filter((a) => a.status === 'OPEN' && num(a.remaining) > EPS);
  const advance = {
    balance: round3(open.reduce((s, a) => s + num(a.remaining), 0)),
    open: open.length,
    monthly: round3(open.reduce((s, a) => s + Math.min(num(a.installment_amount), num(a.remaining)), 0)),
  };
  return { salary, netYear, due, advance };
}

/** The monthly register as bars: net and paid for each of the last twelve months, zero where there is no posted line. */
export function payrollSeries(lines: readonly LineLike[], today: string): Array<{ month: string; net: number; paid: number }> {
  const byMonth = new Map<string, { net: number; paid: number }>();
  for (const l of lines) {
    if (l.run_status !== 'POSTED') continue;
    const key = monthKeyOf(l.period_month);
    const cur = byMonth.get(key) ?? { net: 0, paid: 0 };
    cur.net += num(l.net);
    cur.paid += num(l.paid);
    byMonth.set(key, cur);
  }
  return lastMonthKeys(today, 12).map((month) => {
    const v = byMonth.get(month);
    return { month, net: round3(v?.net ?? 0), paid: round3(v?.paid ?? 0) };
  });
}

// ── Status ──────────────────────────────────────────────────────────────────

export type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';
export type EmployeeStatus = { key: 'working' | 'on_leave' | 'inactive' | 'ended'; label: string; tone: StatusTone };

export function employeeStatus(input: {
  isActive: boolean;
  terminationDate?: string | null;
  onLeave?: boolean;
  today: string;
}): EmployeeStatus {
  const end = input.terminationDate?.slice(0, 10);
  if (end && end < input.today) return { key: 'ended', label: 'انتهت الخدمة', tone: 'danger' };
  if (!input.isActive) return { key: 'inactive', label: 'غير نشط', tone: 'warning' };
  if (input.onLeave) return { key: 'on_leave', label: 'في إجازة اليوم', tone: 'info' };
  return { key: 'working', label: 'على رأس العمل', tone: 'success' };
}

// ── History ─────────────────────────────────────────────────────────────────

type AdjustmentLike = Pick<PayrollAdjustment, 'id' | 'kind' | 'amount' | 'days' | 'reason' | 'status' | 'period_month' | 'decided_at' | 'decision_note' | 'created_at'>;
type AdvanceRow = Pick<PayrollAdvance, 'id' | 'issued_on' | 'amount' | 'installments' | 'reason' | 'status' | 'cancel_reason' | 'created_at'>;
type LeaveRow = Pick<LeaveRequest, 'id' | 'leave_type' | 'start_date' | 'end_date' | 'days' | 'status' | 'reason' | 'decision_note' | 'decided_at' | 'cancelled_at' | 'cancel_reason' | 'original_end_date' | 'created_at'>;

export const ADDITION_KINDS: readonly string[] = ['BONUS', 'OVERTIME'];
export const isAdditionKind = (kind: string) => ADDITION_KINDS.includes(kind);

export type TimelineType = 'hired' | 'salary' | 'adjustment' | 'adjustment_decided' | 'advance' | 'leave' | 'leave_decided' | 'leave_cancelled' | 'leave_shortened';

export type TimelineEntry = {
  key: string;
  type: TimelineType;
  /** a local calendar day */
  day: string;
  /** sort key: the day and, when the row has one, the time of day */
  at: string;
  tone: StatusTone;
  /** money the entry moves, always positive; the direction says which way */
  amount: number | null;
  direction: 'in' | 'out' | null;
  /** salary: how much the total moved against the structure before it */
  delta: number | null;
  adjustment?: AdjustmentLike;
  advance?: AdvanceRow;
  leave?: LeaveRow;
  structure?: StructureLike & { id: string; notes?: string | null };
};

const atOf = (day: string, stamp?: string | null) => {
  const time = stamp && /T(\d{2}:\d{2}:\d{2})/.exec(stamp);
  return `${day}T${time ? time[1] : '00:00:00'}`;
};

/**
 * Everything that happened to the employee, newest first: hiring, each salary structure, each bonus or deduction
 * (when it was recorded and when it was approved or cancelled), each advance, and each leave (requested, then
 * approved, rejected or cancelled). One line per fact, so the list reads as a log.
 */
export function buildTimeline(input: {
  hireDate?: string | null;
  structures: ReadonlyArray<StructureLike & { id: string; notes?: string | null }>;
  adjustments: readonly AdjustmentLike[];
  advances: readonly AdvanceRow[];
  leaves: readonly LeaveRow[];
}): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const push = (e: Omit<TimelineEntry, 'at' | 'delta'> & { stamp?: string | null; delta?: number | null }) => {
    if (!e.day) return;
    const { stamp, delta, ...rest } = e;
    out.push({ ...rest, delta: delta ?? null, at: atOf(e.day, stamp) });
  };

  const hired = localDayOf(input.hireDate);
  if (hired) push({ key: 'hired', type: 'hired', day: hired, tone: 'success', amount: null, direction: null });

  const ordered = [...input.structures].sort((a, b) => monthKeyOf(a.effective_from).localeCompare(monthKeyOf(b.effective_from)));
  ordered.forEach((s, i) => {
    const before = ordered[i - 1];
    const total = structureTotalOf(s);
    const day = `${monthKeyOf(s.effective_from)}-01`;
    push({
      key: `salary-${s.id}`,
      type: 'salary',
      day,
      tone: 'info',
      amount: total,
      direction: null,
      delta: before ? round3(total - structureTotalOf(before)) : null,
      structure: s,
    });
  });

  for (const a of input.adjustments) {
    const adds = isAdditionKind(a.kind);
    const live = a.status !== 'CANCELLED';
    push({
      key: `adj-${a.id}`,
      type: 'adjustment',
      day: localDayOf(a.created_at),
      stamp: a.created_at,
      tone: live ? (adds ? 'success' : 'danger') : 'neutral',
      amount: num(a.amount),
      direction: adds ? 'in' : 'out',
      adjustment: a,
    });
    if (a.decided_at) {
      push({
        key: `adj-decided-${a.id}`,
        type: 'adjustment_decided',
        day: localDayOf(a.decided_at),
        stamp: a.decided_at,
        tone: a.status === 'APPROVED' ? 'success' : 'neutral',
        amount: num(a.amount),
        direction: adds ? 'in' : 'out',
        adjustment: a,
      });
    }
  }

  for (const a of input.advances) {
    push({
      key: `adv-${a.id}`,
      type: 'advance',
      day: localDayOf(a.issued_on),
      stamp: a.created_at && localDayOf(a.created_at) === localDayOf(a.issued_on) ? a.created_at : null,
      tone: a.status === 'CANCELLED' ? 'neutral' : 'warning',
      amount: num(a.amount),
      direction: 'out',
      advance: a,
    });
  }

  for (const l of input.leaves) {
    push({
      key: `leave-${l.id}`,
      type: 'leave',
      day: localDayOf(l.created_at),
      stamp: l.created_at,
      tone: 'info',
      amount: null,
      direction: null,
      leave: l,
    });
    if (l.decided_at && (l.status === 'APPROVED' || l.status === 'REJECTED' || l.status === 'CANCELLED')) {
      push({
        key: `leave-decided-${l.id}`,
        type: 'leave_decided',
        day: localDayOf(l.decided_at),
        stamp: l.decided_at,
        // a rejection is shown after it as «مرفوضة»; a cancelled leave was decided before it was cancelled
        tone: l.status === 'REJECTED' ? 'danger' : 'success',
        amount: null,
        direction: null,
        leave: l,
      });
    }
    // The database keeps no time for an early return, only the end the leave had before (original_end_date), so the
    // entry sits on the last day of leave: the day the employee was expected back is the next working day.
    if (l.original_end_date && l.original_end_date !== l.end_date) {
      push({
        key: `leave-shortened-${l.id}`,
        type: 'leave_shortened',
        day: localDayOf(l.end_date),
        tone: 'neutral',
        amount: null,
        direction: null,
        leave: l,
      });
    }
    if (l.cancelled_at) {
      push({
        key: `leave-cancelled-${l.id}`,
        type: 'leave_cancelled',
        day: localDayOf(l.cancelled_at),
        stamp: l.cancelled_at,
        tone: 'neutral',
        amount: null,
        direction: null,
        leave: l,
      });
    }
  }

  return out.sort((a, b) => b.at.localeCompare(a.at) || b.key.localeCompare(a.key));
}

/** The same entries grouped by month, newest month first, for a log with month headings. */
export function groupTimelineByMonth(entries: readonly TimelineEntry[]): Array<{ month: string; entries: TimelineEntry[] }> {
  const groups: Array<{ month: string; entries: TimelineEntry[] }> = [];
  for (const e of entries) {
    const month = monthKeyOf(e.day);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.entries.push(e);
    else groups.push({ month, entries: [e] });
  }
  return groups;
}

// ── Leave: the year at a glance ─────────────────────────────────────────────

export type LeaveMonthCell = {
  month: string;
  /** approved working days in the month */
  approved: number;
  /** working days still waiting for a decision */
  pending: number;
  byType: Partial<Record<LeaveType, number>>;
  /** the type with the most approved days (or pending ones when nothing is approved yet) */
  topType: LeaveType | null;
};

/** Twelve months of a year with the working days of approved and pending leave in each. Cancelled and rejected leave is left out. */
export function leaveYearStrip(
  requests: ReadonlyArray<Pick<LeaveRequest, 'leave_type' | 'start_date' | 'end_date' | 'status'>>,
  year: number,
): LeaveMonthCell[] {
  const cells: LeaveMonthCell[] = Array.from({ length: 12 }, (_, i) => ({
    month: `${year}-${String(i + 1).padStart(2, '0')}`,
    approved: 0,
    pending: 0,
    byType: {},
    topType: null,
  }));
  const approvedByType = cells.map(() => ({}) as Partial<Record<LeaveType, number>>);
  const pendingByType = cells.map(() => ({}) as Partial<Record<LeaveType, number>>);
  for (const r of requests) {
    if (r.status !== 'APPROVED' && r.status !== 'PENDING') continue;
    for (const [month, days] of Object.entries(workingDaysByMonth(r.start_date, r.end_date))) {
      if (!month.startsWith(`${year}-`)) continue;
      const i = Number(month.slice(5, 7)) - 1;
      const cell = cells[i];
      const bucket = r.status === 'APPROVED' ? approvedByType[i] : pendingByType[i];
      bucket[r.leave_type] = (bucket[r.leave_type] ?? 0) + days;
      if (r.status === 'APPROVED') cell.approved += days;
      else cell.pending += days;
      cell.byType[r.leave_type] = (cell.byType[r.leave_type] ?? 0) + days;
    }
  }
  cells.forEach((cell, i) => {
    const source = Object.keys(approvedByType[i]).length > 0 ? approvedByType[i] : pendingByType[i];
    const top = Object.entries(source).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
    cell.topType = (top?.[0] as LeaveType | undefined) ?? null;
  });
  return cells;
}

// ── Leave: checking a request before it is sent ─────────────────────────────

export type LeaveEvaluation = {
  /** working days the request would use */
  days: number;
  /** the first thing wrong with the dates, in plain Arabic */
  error: string | null;
  /** the leave it runs into */
  overlap: LeaveRequest | null;
  overlapMessage: string | null;
  annual: AnnualCheck | null;
  /** the annual balance does not cover it */
  short: boolean;
  shortMessage: string | null;
  /** annual balance left after this request, for the first year it touches; null for other types */
  balanceAfter: number | null;
};

export function evaluateLeaveRequest(input: {
  requests: readonly LeaveRequest[];
  employeeId: string;
  type: LeaveType;
  start: string;
  end: string;
  reason?: string | null;
  hireDate?: string | null;
  terminationDate?: string | null;
  today: string;
  /** from the employee's file; the allowance falls back to 30 days without one */
  annualDays?: number | null;
  carryOver?: number | null;
  carryOverYear?: number | null;
}): LeaveEvaluation {
  const error = validateLeaveRange({
    start: input.start,
    end: input.end,
    type: input.type,
    reason: input.reason,
    hireDate: input.hireDate,
    terminationDate: input.terminationDate,
    today: input.today,
  });
  const days = error ? 0 : workingDays(input.start, input.end);
  const none: LeaveEvaluation = { days, error, overlap: null, overlapMessage: null, annual: null, short: false, shortMessage: null, balanceAfter: null };
  if (error) return none;

  const overlap = findOverlap(input.requests, { employeeId: input.employeeId, start: input.start, end: input.end });
  const overlapMessage = overlap
    ? `تتقاطع مع إجازة ${leaveTypeLabel(overlap.leave_type)} ${leaveStatusLabel(overlap.status)} (${formatLeaveRange(overlap.start_date, overlap.end_date)})`
    : null;

  let annual: AnnualCheck | null = null;
  let short = false;
  let shortMessage: string | null = null;
  let balanceAfter: number | null = null;
  if (input.type === 'ANNUAL') {
    annual = checkAnnualBalance(input.requests, {
      start: input.start,
      end: input.end,
      annualDays: input.annualDays ?? DEFAULT_ANNUAL_LEAVE_DAYS,
      carryOver: input.carryOver ?? 0,
      carryOverYear: input.carryOverYear ?? null,
    });
    short = !annual.ok;
    const first = annual.years[0];
    balanceAfter = first ? first.available - first.need : null;
    if (short) {
      const parts = annual.years
        .filter((y) => y.short > EPS)
        .map((y) => `${annual!.years.length > 1 ? `${y.year}: ` : ''}المتاح ${daysLabel(Math.max(0, y.available))} والمطلوب ${daysLabel(y.need)}`);
      shortMessage = `رصيد الإجازة السنوية لا يكفي. ${parts.join('، ')}`;
    }
  }
  return { days, error: null, overlap, overlapMessage, annual, short, shortMessage, balanceAfter };
}

export function annualRemaining(lines: readonly LeaveBalanceLine[]): number | null {
  const line = annualLine(lines);
  return line && line.remaining != null ? line.remaining : null;
}

// ── Unpaid leave and the deduction it calls for ─────────────────────────────

/** The reason written on the deduction made for an unpaid leave; the same text is how the leave finds it again. */
export function unpaidLeaveReason(leave: Pick<LeaveRequest, 'start_date' | 'end_date'>): string {
  return `إجازة بدون راتب ${formatLeaveRange(leave.start_date, leave.end_date)}`;
}

/**
 * What the deduction for an unpaid leave comes to in each payroll month it covers, with the salary in force that
 * month (a raise inside the leave changes the rate). A month with no salary structure has total 0: the form leaves
 * the amount for the accountant to type.
 */
export function unpaidDeductionPlan(
  leave: Pick<LeaveRequest, 'start_date' | 'end_date'>,
  structures: readonly StructureLike[],
): Array<{ month: string; days: number; total: number }> {
  return Object.entries(unpaidDaysByMonth(leave.start_date, leave.end_date)).map(([month, days]) => ({
    month,
    days,
    total: suggestedUnpaidDeduction(structureTotalOf(structureInForce(structures, month)), days),
  }));
}

/** True when a deduction made for this leave already exists (a cancelled one does not count). */
export function hasDeductionFor(leave: Pick<LeaveRequest, 'start_date' | 'end_date'>, adjustments: ReadonlyArray<Pick<PayrollAdjustment, 'kind' | 'status' | 'reason'>>): boolean {
  const reason = unpaidLeaveReason(leave);
  return adjustments.some((a) => a.kind === 'ABSENCE' && a.status !== 'CANCELLED' && a.reason.includes(reason));
}

// ── Adjustments: the months a bonus or deduction can still go to ────────────

export type MonthChoice = { month: string; posted: boolean };

/**
 * Months offered when recording a bonus or deduction: a few back and two ahead. A posted month is final in the
 * database, so it is offered greyed out instead of being refused after the form is filled.
 */
export function adjustmentMonthChoices(today: string, postedMonths: ReadonlySet<string>, extra: readonly string[] = []): MonthChoice[] {
  const current = monthKeyOf(today);
  if (!current) return [];
  const keys = new Set<string>();
  for (let d = -3; d <= 2; d += 1) keys.add(shiftMonthKey(current, d));
  for (const e of extra) if (monthKeyOf(e)) keys.add(monthKeyOf(e));
  return [...keys].sort().map((month) => ({ month, posted: postedMonths.has(month) }));
}

/** The month a new adjustment starts on: the preferred month when it is still open, else the first open month after it. */
export function defaultAdjustmentMonth(choices: readonly MonthChoice[], preferred: string): string {
  const want = monthKeyOf(preferred);
  const open = choices.filter((c) => !c.posted);
  return open.find((c) => c.month >= want)?.month ?? open[open.length - 1]?.month ?? want;
}

// ── The directory ───────────────────────────────────────────────────────────

export type DirectoryRow = {
  id: string;
  name: string;
  jobTitle: string | null;
  department: string | null;
  phone: string | null;
  hireDate: string | null;
  isActive: boolean;
  /** the salary on the contact card (kept equal to the current structure) */
  salary: number;
  paid12: number;
  monthsPaid: number;
  dueNow: number;
  dueMonths: number;
  /** the oldest posted line with something left to pay */
  dueLineId: string | null;
  openAdvance: number;
  openAdvances: number;
  pendingItems: number;
  onLeave: { type: LeaveType; end: string; returnDate: string } | null;
  /** the most urgent date on the file: a contract that ends, a probation that ends, an end of service */
  alert: FileAlert | null;
  status: EmployeeStatus;
};

type ContactLike = {
  id: string;
  name: string;
  phone: string | null;
  job_title: string | null;
  department: string | null;
  hire_date: string | null;
  salary: string | number | null;
  is_active: boolean;
};

export function buildDirectoryRows(input: {
  contacts: readonly ContactLike[];
  summaries?: ReadonlyArray<{ id: string; last_12_months_salary_paid: string | number | null; months_with_payment: number | null }>;
  outstanding?: ReadonlyArray<Pick<PayrollRunLine, 'id' | 'employee_id' | 'period_month' | 'outstanding' | 'run_status'>>;
  pendingAdjustments?: ReadonlyArray<{ employee_id: string }>;
  advances?: ReadonlyArray<Pick<PayrollAdvance, 'employee_id' | 'status' | 'remaining' | 'installment_amount'>>;
  onLeave?: ReadonlyArray<{ employee_id: string; leave_type: LeaveType; end_date: string; return_date: string }>;
  details?: readonly EmployeeDetails[];
  today: string;
}): DirectoryRow[] {
  const summaries = new Map((input.summaries ?? []).map((s) => [s.id, s]));
  const detailsBy = new Map((input.details ?? []).map((d) => [d.employee_id, d]));
  const leaveBy = new Map((input.onLeave ?? []).map((l) => [l.employee_id, l]));

  const owed = new Map<string, Array<NonNullable<typeof input.outstanding>[number]>>();
  for (const l of outstandingLinesOf(input.outstanding ?? [])) {
    const list = owed.get(l.employee_id) ?? [];
    list.push(l);
    owed.set(l.employee_id, list);
  }
  const pending = new Map<string, number>();
  for (const a of input.pendingAdjustments ?? []) pending.set(a.employee_id, (pending.get(a.employee_id) ?? 0) + 1);
  const advancesBy = new Map<string, Array<NonNullable<typeof input.advances>[number]>>();
  for (const a of input.advances ?? []) {
    if (a.status !== 'OPEN' || num(a.remaining) <= EPS) continue;
    const list = advancesBy.get(a.employee_id) ?? [];
    list.push(a);
    advancesBy.set(a.employee_id, list);
  }

  const rows = input.contacts.map((c): DirectoryRow => {
    const lines = owed.get(c.id) ?? [];
    const advs = advancesBy.get(c.id) ?? [];
    const leave = leaveBy.get(c.id);
    const details = detailsBy.get(c.id) ?? null;
    const summary = summaries.get(c.id);
    const alerts = fileAlerts(details, input.today).sort((a, b) => a.daysLeft - b.daysLeft);
    return {
      id: c.id,
      name: c.name,
      jobTitle: c.job_title,
      department: c.department,
      phone: c.phone,
      hireDate: c.hire_date,
      isActive: c.is_active,
      salary: num(c.salary),
      paid12: num(summary?.last_12_months_salary_paid),
      monthsPaid: num(summary?.months_with_payment),
      dueNow: round3(lines.reduce((s, l) => s + num(l.outstanding), 0)),
      dueMonths: new Set(lines.map((l) => monthKeyOf(l.period_month))).size,
      dueLineId: lines[0]?.id ?? null,
      openAdvance: round3(advs.reduce((s, a) => s + num(a.remaining), 0)),
      openAdvances: advs.length,
      pendingItems: pending.get(c.id) ?? 0,
      onLeave: leave ? { type: leave.leave_type, end: leave.end_date, returnDate: leave.return_date } : null,
      alert: alerts.find((a) => a.tone === 'danger') ?? alerts[0] ?? null,
      status: employeeStatus({ isActive: c.is_active, terminationDate: details?.termination_date, onLeave: Boolean(leave), today: input.today }),
    };
  });
  return rows.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, 'ar'));
}

export type DirectoryFilter = 'on_leave' | 'advance' | 'pending' | 'due' | 'inactive';

const ACTIVE = (r: DirectoryRow) => r.status.key !== 'inactive' && r.status.key !== 'ended';

export function matchesFilter(row: DirectoryRow, filter: DirectoryFilter | 'all'): boolean {
  switch (filter) {
    case 'all':
      return ACTIVE(row);
    case 'on_leave':
      return ACTIVE(row) && row.onLeave !== null;
    case 'advance':
      return ACTIVE(row) && row.openAdvance > EPS;
    case 'pending':
      return ACTIVE(row) && row.pendingItems > 0;
    case 'due':
      return ACTIVE(row) && row.dueNow > EPS;
    case 'inactive':
      return !ACTIVE(row);
  }
}

export function filterDirectory(
  rows: readonly DirectoryRow[],
  opts: { query?: string; department?: string | null; filter?: DirectoryFilter | 'all' },
): DirectoryRow[] {
  const dept = opts.department?.trim();
  return rows.filter(
    (r) =>
      matchesFilter(r, opts.filter ?? 'all') &&
      (!dept || (r.department ?? '').trim() === dept) &&
      matchesSearch(opts.query ?? '', [r.name, r.jobTitle, r.department, r.phone]),
  );
}

export function filterCounts(rows: readonly DirectoryRow[]): Record<DirectoryFilter | 'all', number> {
  const filters: Array<DirectoryFilter | 'all'> = ['all', 'on_leave', 'advance', 'pending', 'due', 'inactive'];
  return Object.fromEntries(filters.map((f) => [f, rows.filter((r) => matchesFilter(r, f)).length])) as Record<DirectoryFilter | 'all', number>;
}

export function departmentOptions(rows: readonly DirectoryRow[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const d = (r.department ?? '').trim();
    if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

export type DirectoryStats = {
  headcount: number;
  inactive: number;
  monthlyPayroll: number;
  onLeave: number;
  /** employees with an open advance */
  advanceHolders: number;
  advanceBalance: number;
  dueNow: number;
};

export function directoryStats(rows: readonly DirectoryRow[]): DirectoryStats {
  const active = rows.filter(ACTIVE);
  return {
    headcount: active.length,
    inactive: rows.length - active.length,
    monthlyPayroll: round3(active.reduce((s, r) => s + r.salary, 0)),
    onLeave: active.filter((r) => r.onLeave).length,
    advanceHolders: active.filter((r) => r.openAdvance > EPS).length,
    advanceBalance: round3(active.reduce((s, r) => s + r.openAdvance, 0)),
    dueNow: round3(active.reduce((s, r) => s + r.dueNow, 0)),
  };
}
