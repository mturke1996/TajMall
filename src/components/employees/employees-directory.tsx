'use client';

import Link from 'next/link';
import { Briefcase, Search, Loader2, DollarSign, Plus, ChevronLeft, TrendingUp, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ContactPhoneActions } from '@/components/contacts/contact-phone-actions';
import { cn, formatMoney } from '@/lib/utils';
import type { EmployeeSummary } from '@/lib/db/queries';
import { MobilePageActionBar, MOBILE_PAGE_ACTION_PADDING } from '@/components/layout/mobile-page-action-bar';
import { useTxDialog } from '@/stores/transaction-dialog';
import { usePermission } from '@/lib/supabase/use-permission';

export type EnrichedEmployee = EmployeeSummary & {
  name: string;
  phone: string | null;
  job_title: string | null;
  department: string | null;
  salary: string | null;
};

export type EmployeesDirectoryProps = {
  employees: EnrichedEmployee[];
  filteredEmployees: EnrichedEmployee[];
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  stats: {
    total: number;
    totalSalary: number;
    totalPaid: number;
  };
  onRecordSalary: (emp: EnrichedEmployee) => void;
  onAddEmployee: () => void;
};

const monthsAr = (n: number) => (n === 1 ? 'شهر واحد' : n === 2 ? 'شهران' : n <= 10 ? `${n} أشهر` : `${n} شهراً`);

function figures(emp: EnrichedEmployee) {
  const salary = Number(emp.salary) || 0;
  const paid = Number(emp.last_12_months_salary_paid) || 0;
  const months = emp.months_with_payment || 0;
  return { salary, paid, months };
}

/** Employees with what they earn and what was actually paid to them over the last year. */
export function EmployeesDirectory({
  filteredEmployees,
  isLoading,
  searchQuery,
  onSearchChange,
  stats,
  onRecordSalary,
  onAddEmployee,
}: EmployeesDirectoryProps) {
  const openTx = useTxDialog((s) => s.open);
  const { can, loading: permLoading } = usePermission();
  const canExpense = !permLoading && can('expense.create');
  const canAdd = !permLoading && can('document.create');

  return (
    <div className={cn('flex flex-col gap-4', MOBILE_PAGE_ACTION_PADDING)}>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
          <div className="bg-card p-4">
            <p className="text-[12.5px] text-ink-mute">عدد الموظفين</p>
            <p className="mt-0.5 text-[20px] font-semibold tabular-nums">{stats.total}</p>
          </div>
          <div className="bg-card p-4">
            <p className="text-[12.5px] text-ink-mute">الرواتب الشهرية</p>
            <p className="mt-0.5 text-[20px] font-semibold tabular-nums">{formatMoney(stats.totalSalary, 'LYD')}</p>
          </div>
          <div className="col-span-2 bg-card p-4 sm:col-span-1">
            <p className="text-[12.5px] text-ink-mute">المدفوع آخر 12 شهراً</p>
            <p className="mt-0.5 text-[20px] font-semibold tabular-nums">{formatMoney(stats.totalPaid, 'LYD')}</p>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute inset-s-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
          <Input
            placeholder="بحث بالاسم أو المسمى أو القسم أو الهاتف…"
            aria-label="بحث في الموظفين"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-10 ps-9"
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-10 flex-1 gap-1.5 sm:flex-none" asChild>
            <Link href="/payroll">
              <DollarSign className="h-4 w-4" aria-hidden />
              الرواتب الشهرية
            </Link>
          </Button>
          <Button size="sm" variant="outline" className="h-10 flex-1 gap-1.5 sm:flex-none" asChild>
            <Link href="/reports/employee-spend">
              <TrendingUp className="h-4 w-4" aria-hidden />
              تقرير الإنفاق
            </Link>
          </Button>
          {canAdd && (
            <Button size="sm" className="hidden h-10 gap-1.5 md:inline-flex" onClick={onAddEmployee}>
              <Plus className="h-4 w-4" aria-hidden />
              إضافة موظف
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center gap-2 py-16">
          <Loader2 className="h-7 w-7 animate-spin text-ink-soft" aria-hidden />
          <p className="text-sm text-ink-mute">جارٍ التحميل…</p>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <Card className="p-8 text-center">
          <Briefcase className="mx-auto h-8 w-8 text-ink-mute" aria-hidden />
          <p className="mt-2 text-ink-mute">{searchQuery ? 'لا أحد يطابق البحث' : 'لا يوجد موظفون بعد'}</p>
          {canAdd && !searchQuery && (
            <Button className="mt-4" size="sm" onClick={onAddEmployee}>
              إضافة موظف
            </Button>
          )}
        </Card>
      ) : (
        <>
          <p className="px-1 text-[12.5px] text-ink-mute">
            {filteredEmployees.length} موظف · المدفوع من المعاملات المُرحّلة آخر 12 شهراً
          </p>

          <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-canvas-sunken text-[12.5px] text-ink-mute">
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">الموظف</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">الراتب الشهري</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">المدفوع (12 شهراً)</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">التواصل</th>
                  <th scope="col" className="px-4 py-2.5 text-end font-medium">
                    <span className="sr-only">إجراءات</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredEmployees.map((emp) => {
                  const { salary, paid, months } = figures(emp);
                  return (
                    <tr key={emp.id} className="align-top hover:bg-canvas-sunken/50">
                      <td className="px-4 py-3">
                        <Link href={`/contacts/${emp.id}`} className="font-semibold text-foreground hover:underline">
                          {emp.name}
                        </Link>
                        <p className="mt-0.5 text-[12px] text-ink-mute">
                          {[emp.job_title, emp.department].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-medium tabular-nums">{salary > 0 ? formatMoney(salary, 'LYD') : '—'}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium tabular-nums">{formatMoney(paid, 'LYD')}</span>
                        <p className="mt-0.5 text-[12px] text-ink-mute">
                          {months > 0 ? `${monthsAr(months)} فيها دفع` : 'لا دفعات'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {emp.phone ? (
                          <ContactPhoneActions name={emp.name} phone={emp.phone} kind="EMPLOYEE" compact />
                        ) : (
                          <span className="text-ink-mute">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {canExpense && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1 px-2.5 text-[12.5px]"
                              disabled={salary === 0}
                              title={salary === 0 ? 'حدّد الراتب في ملف الموظف أولاً' : undefined}
                              onClick={() => onRecordSalary(emp)}
                            >
                              <Plus className="h-3.5 w-3.5" aria-hidden />
                              راتب
                            </Button>
                          )}
                          {canExpense && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2.5 text-[12.5px]"
                              onClick={() => openTx({ kind: 'EXPENSE', contactId: emp.id, contactKind: 'EMPLOYEE' })}
                            >
                              مصروف
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-8 gap-1 px-2.5 text-[12.5px]" asChild>
                            <Link href={`/payroll/employees/${emp.id}`}>
                              <FileText className="h-3.5 w-3.5" aria-hidden />
                              ملف الراتب
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border md:hidden">
            {filteredEmployees.map((emp) => {
              const { salary, paid, months } = figures(emp);
              return (
                <li key={emp.id} className="bg-card">
                  <Link href={`/contacts/${emp.id}`} className="flex items-center gap-3 px-3 py-3 touch-manipulation active:bg-canvas-sunken">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-canvas-sunken text-ink-mute" aria-hidden>
                      <Briefcase className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{emp.name}</span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-ink-mute">
                        {[emp.job_title, emp.department].filter(Boolean).join(' · ') || '—'}
                      </span>
                      <span className="mt-1 block text-[12.5px] tabular-nums text-ink-mute">
                        راتب <span className="font-medium text-foreground">{salary > 0 ? formatMoney(salary, 'LYD') : '—'}</span>
                        {' · '}مدفوع {formatMoney(paid, 'LYD')}
                        {months > 0 && ` (${monthsAr(months)})`}
                      </span>
                    </span>
                    <ChevronLeft className="h-5 w-5 shrink-0 text-ink-mute" aria-hidden />
                  </Link>
                  <div className="flex items-center gap-2 border-t border-border px-3 py-2">
                    {emp.phone && <ContactPhoneActions name={emp.name} phone={emp.phone} kind="EMPLOYEE" compact />}
                    <div className="ms-auto flex gap-1.5">
                      {canExpense && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1 text-[13px] touch-manipulation"
                          disabled={salary === 0}
                          onClick={() => onRecordSalary(emp)}
                        >
                          <Plus className="h-4 w-4" aria-hidden />
                          راتب
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-9 text-[13px] touch-manipulation" asChild>
                        <Link href={`/payroll/employees/${emp.id}`}>ملف الراتب</Link>
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {canAdd && (
        <MobilePageActionBar>
          <Button className="h-12 w-full gap-2 text-base font-semibold touch-manipulation" onClick={onAddEmployee}>
            <Plus className="h-5 w-5" aria-hidden />
            إضافة موظف
          </Button>
        </MobilePageActionBar>
      )}
    </div>
  );
}
