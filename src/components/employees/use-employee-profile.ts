'use client';

import { useMemo } from 'react';
import { useContact } from '@/lib/db/queries';
import {
  isLeaveSchemaMissing,
  useEmployeeDetails,
  useEmployeeLeaveRequests,
  useEmployeesOnLeave,
  useLeaveBalance,
} from '@/lib/db/leave-queries';
import {
  isPayrollSchemaMissing,
  useEmployeeAdjustments,
  useEmployeeAdvances,
  useEmployeePayrollLines,
  useEmployeeSalaryStructures,
} from '@/lib/db/payroll-queries';
import { buildEmployeeKpis, buildTimeline, employeeStatus, outstandingLinesOf } from '@/lib/employees/employee-profile';
import { annualLine, fileAlerts, leavePowers } from '@/lib/leave';
import { usePermission } from '@/lib/supabase/use-permission';
import { todayISODate } from '@/lib/utils';

type Q = { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };

/** One query as the profile shows it: still loading, failed (with a retry), or the database lacks it. */
export type Part = { loading: boolean; error: boolean; missing: boolean; retry: () => void };

function partOf(query: Q, enabled: boolean, isMissing: (e: unknown) => boolean): Part {
  return {
    loading: enabled && query.isLoading,
    error: enabled && query.isError && !isMissing(query.error),
    missing: enabled && query.isError && isMissing(query.error),
    retry: () => void query.refetch(),
  };
}

/**
 * Everything one employee's page reads, and what it makes of it: the five figures, the status, the history. A
 * role that may not read payroll or leave has those queries switched off (the database would answer with nothing,
 * and an empty list must not be taken for "no payroll").
 */
export function useEmployeeProfile(id: string) {
  const { role, can, loading: roleLoading } = usePermission();
  const powers = leavePowers(role);
  const canManage = !roleLoading && powers.canManage;
  const canPay = !roleLoading && can('expense.create');
  const year = Number(todayISODate().slice(0, 4));

  const contact = useContact(id);
  const structures = useEmployeeSalaryStructures(canManage ? id : null);
  const lines = useEmployeePayrollLines(canManage || canPay ? id : null);
  const adjustments = useEmployeeAdjustments(canManage ? id : null);
  const advances = useEmployeeAdvances(canManage ? id : null);
  const details = useEmployeeDetails(id, canManage);
  const leaves = useEmployeeLeaveRequests(id, canManage);
  const balance = useLeaveBalance(id, year, canManage);
  const onLeave = useEmployeesOnLeave(undefined, !roleLoading && powers.canSeeOnLeave);

  const structureRows = structures.data;
  const lineRows = lines.data;
  const adjustmentRows = adjustments.data;
  const advanceRows = advances.data;
  const leaveRows = leaves.data;

  const today = useMemo(() => todayISODate(), []);

  const kpis = useMemo(
    () =>
      buildEmployeeKpis({
        structures: structureRows ?? [],
        lines: lineRows ?? [],
        advances: advanceRows ?? [],
        cardSalary: contact.data?.salary,
        today,
      }),
    [structureRows, lineRows, advanceRows, contact.data?.salary, today],
  );

  const timeline = useMemo(
    () =>
      buildTimeline({
        hireDate: contact.data?.hire_date,
        structures: structureRows ?? [],
        adjustments: adjustmentRows ?? [],
        advances: advanceRows ?? [],
        leaves: leaveRows ?? [],
      }),
    [contact.data?.hire_date, structureRows, adjustmentRows, advanceRows, leaveRows],
  );

  const onLeaveToday = (onLeave.data ?? []).find((r) => r.employee_id === id) ?? null;
  const detailsRow = details.data ?? null;
  const status = employeeStatus({
    isActive: contact.data?.is_active ?? true,
    terminationDate: detailsRow?.termination_date,
    onLeave: Boolean(onLeaveToday),
    today,
  });

  const annual = annualLine(balance.data ?? []);
  const outstanding = useMemo(() => outstandingLinesOf(lineRows ?? []), [lineRows]);

  const structuresPart = partOf(structures, canManage, isPayrollSchemaMissing);

  return {
    role,
    powers,
    canManage,
    canPay,
    /** the salary structure was read: its absence then means none was set (a role that cannot read it says nothing) */
    structuresReadable: canManage && !structuresPart.missing && !structuresPart.error && !structuresPart.loading,
    roleLoading,
    today,
    year,
    contact,
    structures: structureRows ?? NO_ROWS,
    lines: lineRows ?? NO_ROWS,
    adjustments: adjustmentRows ?? NO_ROWS,
    advances: advanceRows ?? NO_ROWS,
    leaves: leaveRows ?? NO_ROWS,
    details: detailsRow,
    detailsLoaded: details.isSuccess,
    balance: balance.data ?? NO_ROWS,
    annual,
    onLeaveToday,
    outstanding,
    kpis,
    timeline,
    status,
    alerts: fileAlerts(detailsRow, today),
    parts: {
      structures: structuresPart,
      lines: partOf(lines, canManage || canPay, isPayrollSchemaMissing),
      adjustments: partOf(adjustments, canManage, isPayrollSchemaMissing),
      advances: partOf(advances, canManage, isPayrollSchemaMissing),
      details: partOf(details, canManage, isLeaveSchemaMissing),
      leaves: partOf(leaves, canManage, isLeaveSchemaMissing),
      balance: partOf(balance, canManage, isLeaveSchemaMissing),
    },
  };
}

const NO_ROWS: never[] = [];

export type EmployeeProfileData = ReturnType<typeof useEmployeeProfile>;
