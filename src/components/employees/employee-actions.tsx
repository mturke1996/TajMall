'use client';

import { useCallback, useMemo, useState, type ReactNode, type RefObject } from 'react';
import { RecordSalaryPaymentDialog } from '@/components/employees/record-salary-payment-dialog';
import { LeaveRequestDialog } from '@/components/employees/leave-dialogs';
import { AdjustmentDialog, AdvanceDialog, PayLineDialog, type AdjustmentPrefill } from '@/components/payroll/payroll-dialogs';
import { currentMonthKey, useEmployeeSalaryStructures, type PayrollRunLine } from '@/lib/db/payroll-queries';
import type { LeavePowers, LeaveType } from '@/lib/leave';

export type EmployeeActionKind = 'bonus' | 'deduction' | 'adjustment' | 'leave' | 'advance' | 'pay';

/** What the action dialogs need to know about the employee they are opened for. */
export type ActionEmployee = {
  id: string;
  name: string;
  job_title: string | null;
  department: string | null;
  salary: string | number | null;
  hire_date: string | null;
  last_12_months_salary_paid?: string | number | null;
};

export type OpenEmployeeAction = {
  action: EmployeeActionKind;
  employee: ActionEmployee;
  /** «سداد راتب»: the posted payroll line to pay; without one the salary is recorded as a plain expense */
  line?: PayrollRunLine | null;
  /** an adjustment that starts filled in (the deduction for an unpaid leave) */
  prefill?: AdjustmentPrefill;
  leaveType?: LeaveType;
  /** where focus goes back when the dialog closes, if the opener is a menu item that no longer exists */
  returnTo?: RefObject<HTMLElement | null>;
};

/** The bonus and deduction dialog for one employee; loads that employee's salary structure for the day rate. */
function AdjustmentFor({ request, open, onOpenChange }: { request: OpenEmployeeAction; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: structures = NO_STRUCTURES } = useEmployeeSalaryStructures(request.employee.id);
  return (
    <AdjustmentDialog
      open={open}
      onOpenChange={onOpenChange}
      employees={[request.employee]}
      structures={structures}
      month={currentMonthKey()}
      employeeId={request.employee.id}
      defaultKind={request.action === 'deduction' ? 'ABSENCE' : 'BONUS'}
      prefill={request.prefill}
      returnFocusTo={request.returnTo}
    />
  );
}
const NO_STRUCTURES: never[] = [];

/**
 * One place for the five things done to an employee from a list or a profile: a bonus, a deduction, a leave
 * request, an advance, a salary payment. `open()` starts one for an employee and `dialogs` goes anywhere in the
 * page. Each dialog is built the first time it is needed, so a page that never uses one does not read its data.
 */
export function useEmployeeActions(callerPowers: LeavePowers): { open: (request: OpenEmployeeAction) => void; dialogs: ReactNode } {
  // the caller builds a fresh object on every render; the dialogs only care about what is in it
  const { canManage, canApprove, canSeeOnLeave } = callerPowers;
  const powers = useMemo<LeavePowers>(() => ({ canManage, canApprove, canSeeOnLeave }), [canManage, canApprove, canSeeOnLeave]);
  const [request, setRequest] = useState<OpenEmployeeAction | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [built, setBuilt] = useState<ReadonlySet<'adjust' | 'leave' | 'advance' | 'pay'>>(new Set());

  const open = useCallback((next: OpenEmployeeAction) => {
    const group = next.action === 'bonus' || next.action === 'deduction' || next.action === 'adjustment' ? 'adjust' : next.action;
    setBuilt((prev) => (prev.has(group) ? prev : new Set(prev).add(group)));
    setRequest(next);
    setIsOpen(true);
  }, []);

  const dialogs = useMemo(() => {
    if (!request) return null;
    const active = (group: string) =>
      group === 'adjust' ? ['bonus', 'deduction', 'adjustment'].includes(request.action) : request.action === group;
    const forGroup = (group: 'adjust' | 'leave' | 'advance' | 'pay') => isOpen && active(group);
    const e = request.employee;
    return (
      <>
        {built.has('adjust') && <AdjustmentFor request={request} open={forGroup('adjust')} onOpenChange={setIsOpen} />}
        {built.has('leave') && (
          <LeaveRequestDialog
            open={forGroup('leave')}
            onOpenChange={setIsOpen}
            employee={{ id: e.id, name: e.name, hire_date: e.hire_date }}
            powers={powers}
            defaultType={request.leaveType}
            returnFocusTo={request.returnTo}
          />
        )}
        {built.has('advance') && (
          <AdvanceDialog open={forGroup('advance')} onOpenChange={setIsOpen} employees={[e]} employeeId={e.id} returnFocusTo={request.returnTo} />
        )}
        {built.has('pay') &&
          (request.line ? (
            <PayLineDialog line={request.line} open={forGroup('pay')} onOpenChange={setIsOpen} returnFocusTo={request.returnTo} />
          ) : (
            <RecordSalaryPaymentDialog
              employee={{
                id: e.id,
                name: e.name,
                job_title: e.job_title,
                department: e.department,
                salary: e.salary == null ? null : String(e.salary),
                last_12_months_salary_paid: String(e.last_12_months_salary_paid ?? 0),
              }}
              open={forGroup('pay')}
              onOpenChange={setIsOpen}
              returnFocusTo={request.returnTo}
            />
          ))}
      </>
    );
  }, [request, isOpen, built, powers]);

  return { open, dialogs };
}
