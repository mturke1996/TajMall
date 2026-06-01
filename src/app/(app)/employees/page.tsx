'use client';

import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useEmployeeSummary, useContacts } from '@/lib/db/queries';
import { EmployeesDirectory } from '@/components/employees/employees-directory';
import type { EnrichedEmployee } from '@/components/employees/employees-directory';
import { RecordSalaryPaymentDialog } from '@/components/employees/record-salary-payment-dialog';

export default function EmployeesPage() {
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
      <PageHeader
        eyebrow="إدارة الموظفين"
        title="الموظفين والرواتب"
        description="متابعة الرواتب وتسجيل المدفوعات"
        actions={
          <Button size="sm" className="hidden md:inline-flex" asChild>
            <Link href="/contacts?add=EMPLOYEE">
              <Plus className="h-4 w-4 ml-1" />
              إضافة موظف
            </Link>
          </Button>
        }
      />

      <div className="px-4 py-4 sm:px-5 sm:py-6 md:px-8 md:py-8">
        <EmployeesDirectory
          employees={enrichedEmployees}
          filteredEmployees={filteredEmployees}
          isLoading={summaryLoading}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          stats={stats}
          onRecordSalary={setSalaryEmployee}
          onAddEmployee={() => router.push('/contacts?add=EMPLOYEE')}
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
