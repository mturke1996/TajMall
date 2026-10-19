'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isLeaveSchemaMissing } from '@/lib/db/leave-queries';
import { isPayrollSchemaMissing } from '@/lib/db/payroll-queries';

/** The two tables a new employee can also be written to. Each answers «is it in the database yet». */
export type EmployeeSupport = {
  /** salary structures: false when the payroll tables are not in the database yet */
  payroll: boolean;
  /** the employee file (bank, emergency contact, leave allowance): false when it is not there yet */
  file: boolean;
  /** still asking: the form assumes yes and the save reports a missing table */
  checking: boolean;
};

const PROBE = { staleTime: 10 * 60_000, retry: false } as const;

export const PROBE_KEYS = {
  payroll: ['contact-form', 'probe', 'payroll'],
  file: ['contact-form', 'probe', 'employee-file'],
} as const;

/**
 * Looks, without reading any data (one row at most), whether the payroll tables and the employee file exist. The
 * form hides what it could not save and says why in one calm line, so nobody types a bank account that would be dropped.
 * Pass `enabled: false` for a role that cannot write them or a kind that is not an employee.
 */
export function useEmployeeSupport(enabled: boolean): EmployeeSupport {
  const payroll = useQuery({
    queryKey: PROBE_KEYS.payroll,
    enabled,
    ...PROBE,
    queryFn: async () => {
      const { error } = await createSupabaseBrowserClient().from('payroll_salary_structures').select('id').limit(1);
      if (error) throw error;
      return true;
    },
  });
  const file = useQuery({
    queryKey: PROBE_KEYS.file,
    enabled,
    ...PROBE,
    queryFn: async () => {
      const { error } = await createSupabaseBrowserClient().from('employee_details').select('employee_id').limit(1);
      if (error) throw error;
      return true;
    },
  });
  return {
    payroll: !(payroll.isError && isPayrollSchemaMissing(payroll.error)),
    file: !(file.isError && isLeaveSchemaMissing(file.error)),
    checking: enabled && (payroll.isPending || file.isPending),
  };
}
