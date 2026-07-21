'use client';

import Link from 'next/link';
import {
  Briefcase,
  Search,
  Loader2,
  DollarSign,
  Plus,
  ChevronLeft,
  Users,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ContactPhoneActions } from '@/components/contacts/contact-phone-actions';
import { cn, formatMoney } from '@/lib/utils';
import type { EmployeeSummary } from '@/lib/db/queries';
import {
  MobilePageActionBar,
  MOBILE_PAGE_ACTION_PADDING,
} from '@/components/layout/mobile-page-action-bar';

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
    avgMonths: number;
  };
  onRecordSalary: (emp: EnrichedEmployee) => void;
  onAddEmployee: () => void;
};

export function EmployeesDirectory({
  filteredEmployees,
  isLoading,
  searchQuery,
  onSearchChange,
  stats,
  onRecordSalary,
  onAddEmployee,
}: EmployeesDirectoryProps) {
  const statCards = [
    {
      key: 'total',
      label: 'عدد الموظفين',
      value: String(stats.total),
      icon: Users,
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      valueColor: 'text-purple-700',
      cardClass: 'border-purple-200 bg-purple-50/80',
    },
    {
      key: 'salary',
      label: 'إجمالي الرواتب',
      value: formatMoney(stats.totalSalary, 'LYD'),
      icon: DollarSign,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      valueColor: 'text-blue-700',
      cardClass: 'border-blue-200 bg-blue-50/80',
    },
    {
      key: 'paid',
      label: 'المدفوع (12 شهر)',
      value: formatMoney(stats.totalPaid, 'LYD'),
      icon: TrendingUp,
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      valueColor: 'text-green-700',
      cardClass: 'border-green-200 bg-green-50/80',
    },
    {
      key: 'avg',
      label: 'متوسط شهور الدفع',
      value: stats.avgMonths.toFixed(1),
      icon: Calendar,
      iconBg: 'bg-sage-100',
      iconColor: 'text-sage-600',
      valueColor: 'text-sage-700',
      cardClass: 'border-sage-200 bg-sage-50/80',
    },
  ];

  return (
    <div className={cn('flex flex-col gap-4 md:gap-6', MOBILE_PAGE_ACTION_PADDING)}>
      <div className="-mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex gap-2.5 overflow-x-auto pb-1 snap-x snap-mandatory no-scrollbar md:grid md:grid-cols-2 md:gap-3 md:overflow-visible lg:grid-cols-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.key}
                className={cn(
                  'min-w-[10rem] shrink-0 snap-center p-3 md:min-w-0',
                  card.cardClass,
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12',
                      card.iconBg,
                    )}
                  >
                    <Icon className={cn('h-5 w-5 sm:h-6 sm:w-6', card.iconColor)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-ink-mute sm:text-sm">{card.label}</p>
                    <p
                      className={cn(
                        'text-base font-bold tabular-nums leading-tight sm:text-xl',
                        card.valueColor,
                      )}
                    >
                      {card.value}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-canvas/95 px-4 py-3 backdrop-blur-md md:static md:mx-0 md:z-auto md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <Input
            placeholder="بحث: الاسم، المسمى، القسم، الهاتف…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-11 pr-10 text-base md:h-10 md:text-sm"
          />
        </div>
      </div>

      {!isLoading && (
        <p className="text-[12px] text-ink-mute">{filteredEmployees.length} موظف</p>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center gap-2 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-sage-600" />
          <p className="text-sm text-ink-mute">جارٍ التحميل…</p>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <Card className="p-8 text-center">
          <Briefcase className="mx-auto h-8 w-8 text-ink-mute" />
          <p className="mt-2 text-ink-mute">لا يوجد موظفين</p>
          <Button className="mt-4" size="sm" onClick={onAddEmployee}>
            إضافة موظف
          </Button>
        </Card>
      ) : (
        <>
          <div className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-3">
            {filteredEmployees.map((emp) => (
              <EmployeeCard
                key={emp.id}
                emp={emp}
                onRecordSalary={onRecordSalary}
              />
            ))}
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border sm:hidden">
            {filteredEmployees.map((emp) => {
              const salary = Number(emp.salary) || 0;
              const paidLastYear = Number(emp.last_12_months_salary_paid) || 0;
              const monthsPaid = emp.months_with_payment || 0;
              const avgMonthlyPaid = monthsPaid > 0 ? paidLastYear / monthsPaid : 0;

              return (
                <li key={emp.id} className="bg-card">
                  <Link
                    href={`/contacts/${emp.id}`}
                    className="flex min-h-[72px] items-center gap-3 px-3 py-3.5 active:bg-secondary/50 touch-manipulation"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-100">
                      <Briefcase className="h-6 w-6 text-purple-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-[15px]">{emp.name}</p>
                      <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-mute">
                        {emp.job_title || '—'}
                        {emp.department ? ` · ${emp.department}` : ''}
                      </p>
                      {salary > 0 && (
                        <p className="mt-1 text-[12px] tabular-nums">
                          <span className="text-ink-mute">راتب </span>
                          <span className="font-medium">{formatMoney(salary, 'LYD')}</span>
                          {avgMonthlyPaid > 0 && (
                            <span className="text-green-600 mr-1">
                              {' '}
                              · متوسط {formatMoney(avgMonthlyPaid, 'LYD')}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <ChevronLeft className="h-5 w-5 shrink-0 text-ink-mute" aria-hidden />
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
                    {emp.phone ? (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <ContactPhoneActions
                          name={emp.name}
                          phone={emp.phone}
                          kind="EMPLOYEE"
                          compact
                        />
                      </div>
                    ) : null}
                    <Button
                      variant="ghost"
                      className="h-10 flex-1 min-w-[5rem] gap-1.5 text-[13px] touch-manipulation"
                      disabled={salary === 0}
                      onClick={() => onRecordSalary(emp)}
                    >
                      <Plus className="h-4 w-4" />
                      راتب
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-10 flex-1 min-w-[5rem] gap-1.5 text-[13px] touch-manipulation"
                      asChild
                    >
                      <Link href={`/contacts/${emp.id}`}>الملف</Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <MobilePageActionBar>
        <Button
          className="h-12 w-full gap-2 text-base font-semibold shadow-sm touch-manipulation"
          onClick={onAddEmployee}
        >
          <Plus className="h-5 w-5" />
          إضافة موظف
        </Button>
      </MobilePageActionBar>
    </div>
  );
}

function EmployeeCard({
  emp,
  onRecordSalary,
}: {
  emp: EnrichedEmployee;
  onRecordSalary: (e: EnrichedEmployee) => void;
}) {
  const salary = Number(emp.salary) || 0;
  const paidLastYear = Number(emp.last_12_months_salary_paid) || 0;
  const monthsPaid = emp.months_with_payment || 0;
  const avgMonthlyPaid = monthsPaid > 0 ? paidLastYear / monthsPaid : 0;

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <div className="p-4">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-100">
            <Briefcase className="h-6 w-6 text-purple-600" />
          </div>
          <div className="min-w-0 flex-1">
            <Link
              href={`/contacts/${emp.id}`}
              className="block truncate text-lg font-semibold hover:text-sage-700"
            >
              {emp.name}
            </Link>
            <p className="text-sm text-ink-mute">
              {emp.job_title || '—'}
              {emp.department ? ` · ${emp.department}` : ''}
            </p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between border-b border-dashed border-border py-1">
            <span className="text-ink-mute">الراتب الشهري</span>
            <span className="font-medium tabular-nums">
              {salary > 0 ? formatMoney(salary, 'LYD') : '—'}
            </span>
          </div>
          <div className="flex justify-between border-b border-dashed border-border py-1">
            <span className="text-ink-mute">متوسط الدفع الفعلي</span>
            <span
              className={cn(
                'font-medium tabular-nums',
                avgMonthlyPaid > 0 && 'text-green-600',
              )}
            >
              {avgMonthlyPaid > 0 ? formatMoney(avgMonthlyPaid, 'LYD') : '—'}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-ink-mute">المدفوع (12 شهر)</span>
            <span className="font-medium text-sage-600 tabular-nums">
              {formatMoney(paidLastYear, 'LYD')}
            </span>
          </div>
          {emp.phone ? (
            <div className="pt-1" onClick={(e) => e.stopPropagation()}>
              <ContactPhoneActions
                name={emp.name}
                phone={emp.phone}
                kind="EMPLOYEE"
              />
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex gap-2 border-t border-border pt-3">
          <Button
            size="sm"
            className="h-10 flex-1 touch-manipulation"
            disabled={salary === 0}
            onClick={() => onRecordSalary(emp)}
          >
            <Plus className="h-4 w-4 ml-1" />
            تسجيل راتب
          </Button>
          <Button size="sm" variant="outline" className="h-10 flex-1 touch-manipulation" asChild>
            <Link href={`/contacts/${emp.id}`}>الملف</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
