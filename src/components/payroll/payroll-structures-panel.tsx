'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data/data-table';
import { EmptyState } from '@/components/data/empty-state';
import type { ContactRow } from '@/lib/db/types';
import { arabicCount, formatMonthKeyAr } from '@/lib/utils';
import { structureTotal, type PayrollSalaryStructure } from '@/lib/db/payroll-queries';
import { Amount, PHONE_TAP, SectionHeading, StatStrip } from './payroll-ui';
import { SalaryStructureDialog } from './payroll-dialogs';

type Row = {
  employee: ContactRow;
  current: PayrollSalaryStructure | null;
  changes: number;
};

export function PayrollStructuresPanel({
  employees,
  structures,
  canManage,
}: {
  employees: ContactRow[];
  structures: PayrollSalaryStructure[];
  canManage: boolean;
}) {
  const [dialogFor, setDialogFor] = useState<string | null | undefined>(undefined);

  const rows = useMemo<Row[]>(() => {
    const byEmployee = new Map<string, PayrollSalaryStructure[]>();
    for (const s of structures) {
      const list = byEmployee.get(s.employee_id) ?? [];
      list.push(s);
      byEmployee.set(s.employee_id, list);
    }
    return employees.map((employee) => {
      const list = (byEmployee.get(employee.id) ?? []).sort((a, b) => b.effective_from.localeCompare(a.effective_from));
      return { employee, current: list[0] ?? null, changes: list.length };
    });
  }, [employees, structures]);

  const withStructure = rows.filter((r) => r.current);
  const monthlyTotal = withStructure.reduce((s, r) => s + structureTotal(r.current), 0);

  const columns = useMemo<ColumnDef<Row, any>[]>(
    () => [
      {
        id: 'employee',
        accessorFn: (r) => r.employee.name,
        header: 'الموظف',
        meta: { label: 'الموظف', alwaysVisible: true },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <Link href={`/payroll/employees/${row.original.employee.id}`} className="font-medium hover:underline">
              {row.original.employee.name}
            </Link>
            <span className="text-[11.5px] text-muted-foreground">
              {[row.original.employee.job_title, row.original.employee.department].filter(Boolean).join(' · ') || '—'}
            </span>
          </div>
        ),
      },
      {
        id: 'base',
        accessorFn: (r) => Number(r.current?.base_salary ?? -1),
        header: 'الأساسي',
        meta: { label: 'الأساسي', numeric: true },
        cell: ({ row }) => (row.original.current ? <Amount value={row.original.current.base_salary} /> : <span className="text-muted-foreground">—</span>),
      },
      {
        id: 'allowances',
        accessorFn: (r) => (r.current ? structureTotal(r.current) - Number(r.current.base_salary) : -1),
        header: 'البدلات',
        meta: { label: 'البدلات', numeric: true },
        cell: ({ row }) =>
          row.original.current ? (
            <Amount value={structureTotal(row.original.current) - Number(row.original.current.base_salary)} hideZero />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'total',
        accessorFn: (r) => structureTotal(r.current),
        header: 'الإجمالي الشهري',
        meta: { label: 'الإجمالي الشهري', numeric: true, alwaysVisible: true },
        cell: ({ row }) =>
          row.original.current ? (
            <Amount value={structureTotal(row.original.current)} className="font-semibold" />
          ) : (
            <Badge variant="warning">بلا هيكل</Badge>
          ),
      },
      {
        id: 'effective',
        accessorFn: (r) => r.current?.effective_from ?? '',
        header: 'يسري من',
        meta: { label: 'يسري من' },
        cell: ({ row }) =>
          row.original.current ? (
            <span className="text-ink-soft">
              {formatMonthKeyAr(row.original.current.effective_from.slice(0, 7))}
              {row.original.changes > 1 && (
                <span className="ms-1.5 text-[11.5px] text-muted-foreground">({row.original.changes} تغييرات)</span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">إجراءات</span>,
        enableSorting: false,
        meta: { alwaysVisible: true, align: 'end' },
        cell: ({ row }) =>
          canManage ? (
            <Button size="sm" variant={row.original.current ? 'ghost' : 'outline'} className={PHONE_TAP} onClick={() => setDialogFor(row.original.employee.id)}>
              {row.original.current ? <Pencil /> : <Plus />}
              {row.original.current ? 'تعديل' : 'حدّد الراتب'}
            </Button>
          ) : null,
      },
    ],
    [canManage],
  );

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title="هياكل الرواتب"
        description="الراتب الأساسي والبدلات لكل موظف. كل تعديل يسري من شهر محدد ويبقى ما قبله في السجل كما هو."
        actions={
          canManage ? (
            <Button variant="outline" className={PHONE_TAP} onClick={() => setDialogFor(null)} disabled={employees.length === 0}>
              <Plus />
              هيكل راتب
            </Button>
          ) : null
        }
      />

      {employees.length > 0 && (
        <StatStrip
          items={[
            { label: 'الموظفون النشطون', value: <span className="tabular-nums">{employees.length}</span> },
            {
              label: 'بهيكل راتب',
              value: <span className="tabular-nums">{withStructure.length}</span>,
              hint: employees.length > withStructure.length ? `${arabicCount(employees.length - withStructure.length, ['موظف واحد', 'موظفان', 'موظفين', 'موظفاً'])} بلا هيكل` : 'الكل جاهز للكشف',
            },
            { label: 'تكلفة الرواتب الشهرية', value: <Amount value={monthlyTotal} />, emphasis: true },
          ]}
        />
      )}

      <DataTable
        tableId="payroll-structures"
        caption="هياكل رواتب الموظفين"
        data={rows}
        columns={columns}
        getRowId={(r) => r.employee.id}
        initialSorting={[{ id: 'employee', desc: false }]}
        empty={
          <EmptyState
            icon={Wallet}
            title="لا يوجد موظفون نشطون"
            description="أضف الموظفين من دليل الجهات أولاً، ثم حدّد رواتبهم هنا."
            action={{ label: 'دليل الموظفين', href: '/mall?tab=people&segment=EMPLOYEE' }}
          />
        }
        renderMobileRow={(r) => (
          <div className="flex items-center justify-between gap-3 p-3">
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{r.employee.name}</span>
              <span className="truncate text-[11.5px] text-muted-foreground">{r.employee.job_title ?? '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              {r.current ? <Amount value={structureTotal(r.current)} /> : <Badge variant="warning">بلا هيكل</Badge>}
              {canManage && (
                <Button size="icon-sm" variant="ghost" className="max-sm:size-11" onClick={() => setDialogFor(r.employee.id)} aria-label={`تعديل راتب ${r.employee.name}`}>
                  <Pencil />
                </Button>
              )}
            </div>
          </div>
        )}
      />

      <SalaryStructureDialog
        open={dialogFor !== undefined}
        onOpenChange={(o) => !o && setDialogFor(undefined)}
        employees={employees}
        structures={structures}
        employeeId={dialogFor ?? null}
      />
    </div>
  );
}
