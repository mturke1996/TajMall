'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { EmployeesDirectory, type DirectorySource, type DirectorySources, type RowAction } from '@/components/employees/employees-directory';
import { useEmployeeActions } from '@/components/employees/employee-actions';
import { useContacts, useEmployeeSummary } from '@/lib/db/queries';
import { isLeaveSchemaMissing, useAllEmployeeDetails, useEmployeesOnLeave } from '@/lib/db/leave-queries';
import {
  isPayrollSchemaMissing,
  useOutstandingPayrollLines,
  usePayrollAdvances,
  usePendingPayrollAdjustments,
} from '@/lib/db/payroll-queries';
import { buildDirectoryRows, type DirectoryRow } from '@/lib/employees/employee-profile';
import { leavePowers } from '@/lib/leave';
import { peopleSegmentHref } from '@/lib/mall/routes';
import { usePermission } from '@/lib/supabase/use-permission';
import { todayISODate } from '@/lib/utils';

type SourceQuery = { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };

/** How one query stands for the directory: off for a role that may not read it, missing when the database lacks it. */
function sourceOf(query: SourceQuery, enabled: boolean, isMissing: (error: unknown) => boolean): DirectorySource {
  if (!enabled) return { state: 'off' };
  if (query.isError) return isMissing(query.error) ? { state: 'missing' } : { state: 'error', retry: () => void query.refetch() };
  return { state: query.isLoading ? 'loading' : 'ready' };
}

export function MallEmployeesPanel({ embedded: _embedded, onAddEmployee }: { embedded?: boolean; onAddEmployee?: () => void }) {
  const router = useRouter();
  const { role, can, loading: permLoading } = usePermission();
  const powers = leavePowers(role);
  const canManage = !permLoading && powers.canManage;
  const canPay = !permLoading && can('expense.create');
  const canAdd = !permLoading && can('document.create');
  const today = useMemo(() => todayISODate(), []);

  const contacts = useContacts('EMPLOYEE', { includeInactive: true });
  const summary = useEmployeeSummary();
  // the database shows payroll to managers and cashiers, and leave to every role that can write
  const dueEnabled = canManage || canPay;
  const outstanding = useOutstandingPayrollLines(dueEnabled);
  const pending = usePendingPayrollAdjustments(canManage);
  const advances = usePayrollAdvances(canManage);
  const onLeave = useEmployeesOnLeave(undefined, !permLoading && powers.canSeeOnLeave);
  const details = useAllEmployeeDetails(canManage);

  const sources: DirectorySources = {
    due: sourceOf(outstanding, dueEnabled, isPayrollSchemaMissing),
    pending: sourceOf(pending, canManage, isPayrollSchemaMissing),
    advances: sourceOf(advances, canManage, isPayrollSchemaMissing),
    leave: sourceOf(onLeave, !permLoading && powers.canSeeOnLeave, isLeaveSchemaMissing),
    paid: sourceOf(summary, true, () => false),
  };

  const rows = useMemo<DirectoryRow[]>(
    () =>
      buildDirectoryRows({
        contacts: contacts.data ?? [],
        summaries: summary.data,
        outstanding: outstanding.data,
        pendingAdjustments: pending.data,
        advances: advances.data,
        onLeave: onLeave.data,
        // the file (contract dates, end of service) is only an extra: a missing or failed one never hides an employee
        details: details.data,
        today,
      }),
    [contacts.data, summary.data, outstanding.data, pending.data, advances.data, onLeave.data, details.data, today],
  );

  const { open, dialogs } = useEmployeeActions(powers);

  function handleAction(action: RowAction, row: DirectoryRow, opener: HTMLElement | null) {
    const employee = {
      id: row.id,
      name: row.name,
      job_title: row.jobTitle,
      department: row.department,
      salary: row.salary,
      hire_date: row.hireDate,
      last_12_months_salary_paid: row.paid12,
    };
    const returnTo = { current: opener };
    if (action === 'pay') {
      // payroll on: pay the oldest posted month that still owes; payroll off: record the salary as an expense
      const line = sources.due.state === 'missing' ? null : (outstanding.data ?? []).find((l) => l.id === row.dueLineId) ?? null;
      open({ action: 'pay', employee, line, returnTo });
    } else {
      open({ action, employee, returnTo });
    }
  }

  return (
    <>
      <EmployeesDirectory
        rows={rows}
        loading={permLoading || contacts.isLoading}
        error={contacts.isError ? contacts.error : null}
        onRetry={() => void contacts.refetch()}
        sources={sources}
        canManage={canManage}
        canPay={canPay}
        canAdd={canAdd}
        onAction={handleAction}
        onAddEmployee={onAddEmployee ?? (() => router.push(peopleSegmentHref('EMPLOYEE', { add: 'EMPLOYEE' })))}
      />
      {dialogs}
    </>
  );
}
