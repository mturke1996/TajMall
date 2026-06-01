'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEmployeeSummary, useContacts } from '@/lib/db/queries';
import { EmployeesDirectory } from '@/components/employees/employees-directory';
import type { EnrichedEmployee } from '@/components/employees/employees-directory';
import { RecordSalaryPaymentDialog } from '@/components/employees/record-salary-payment-dialog';
import { peopleSegmentHref } from '@/lib/mall/routes';
import { cn } from '@/lib/utils';
import { MOBILE_PAGE_ACTION_PADDING } from '@/components/layout/mobile-page-action-bar';

export function MallEmployeesPanel({ embedded }: { embedded?: boolean }) {
  const router = useRouter();
  const { data: employees = [], isLoading: summaryLoading } = useEmployeeSummary();
  const { data: contacts = [] } = useContacts('EMPLOYEE');

  const [searchQuery, setSearchQuery] = useState('');
  const [salaryEmployee, setSalaryEmployee] = useState<EnrichedEmployee | null>(null);

  const enrichedEmployees = useMemo((): EnrichedEmployee[] => {
    return employees.map((emp) => {
      const contact = contacts.find((c) => c.id === emp.id);
      return {
        ...emp,
        name: contact?.name ?? emp.name,
        phone: contact?.phone ?? emp.phone,
        job_title: contact?.job_title ?? emp.job_title,
        department: contact?.department ?? emp.department,
        salary: contact?.salary ?? emp.salary,
      };
    });
  }, [employees, contacts]);

  const filteredEmployees = useMemo(() => {
    return enrichedEmployees.filter((e) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        e.name?.toLowerCase().includes(q) ||
        e.job_title?.toLowerCase().includes(q) ||
        e.department?.toLowerCase().includes(q) ||
        e.phone?.toLowerCase().includes(q)
      );
    });
  }, [enrichedEmployees, searchQuery]);

  const stats = useMemo(() => {
    const total = employees.length;
    const totalSalary = employees.reduce((sum, e) => sum + (Number(e.salary) || 0), 0);
    const totalPaid = employees.reduce(
      (sum, e) => sum + Number(e.last_12_months_salary_paid),
      0,
    );
    const avgMonths =
      employees.length > 0
        ? employees.reduce((sum, e) => sum + e.months_with_payment, 0) / employees.length
        : 0;
    return { total, totalSalary, totalPaid, avgMonths };
  }, [employees]);

  return (
    <>
      <div className={cn(!embedded && MOBILE_PAGE_ACTION_PADDING)}>
        <EmployeesDirectory
          employees={enrichedEmployees}
          filteredEmployees={filteredEmployees}
          isLoading={summaryLoading}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          stats={stats}
          onRecordSalary={setSalaryEmployee}
          onAddEmployee={() =>
            router.push(peopleSegmentHref('EMPLOYEE', { add: 'EMPLOYEE' }))
          }
        />
      </div>

      <RecordSalaryPaymentDialog
        employee={salaryEmployee}
        open={!!salaryEmployee}
        onOpenChange={(open) => !open && setSalaryEmployee(null)}
      />
    </>
  );
}
