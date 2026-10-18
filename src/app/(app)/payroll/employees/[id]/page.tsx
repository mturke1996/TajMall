'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, FileText, Pencil, Plus, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable } from '@/components/data/data-table';
import { EmptyState } from '@/components/data/empty-state';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { useContact } from '@/lib/db/queries';
import { usePermission } from '@/lib/supabase/use-permission';
import { formatDate, formatMonthKeyAr } from '@/lib/utils';
import {
  ADJUSTMENT_IS_ADDITION,
  ADJUSTMENT_KIND_LABEL,
  ADJUSTMENT_STATUS_LABEL,
  ADVANCE_STATUS_LABEL,
  RUN_STATUS_LABEL,
  isPayrollSchemaMissing,
  structureTotal,
  useEmployeeAdjustments,
  useEmployeeAdvances,
  useEmployeePayrollLines,
  useEmployeeSalaryStructures,
  currentMonthKey,
  type PayrollRunLine,
} from '@/lib/db/payroll-queries';
import { Amount, PayrollSchemaMissing, SectionHeading, StatStrip } from '@/components/payroll/payroll-ui';
import { AdjustmentDialog, SalaryStructureDialog } from '@/components/payroll/payroll-dialogs';

const num = (v: string | number | null | undefined) => Number(v) || 0;

export default function EmployeePayrollPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = usePermission();
  const canManage = role === 'owner' || role === 'admin' || role === 'accountant';

  const { data: employee, isLoading: employeeLoading } = useContact(id);
  const { data: structures = [], error: structuresError } = useEmployeeSalaryStructures(id);
  const { data: lines = [], isLoading: linesLoading } = useEmployeePayrollLines(id);
  const { data: adjustments = [] } = useEmployeeAdjustments(id);
  const { data: advances = [] } = useEmployeeAdvances(id);
  const [structureOpen, setStructureOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);

  const current = structures[0] ?? null;

  const yearAgo = currentMonthKey(new Date(new Date().getFullYear() - 1, new Date().getMonth() + 1, 1));
  const lastYear = lines.filter((l) => l.period_month >= yearAgo && l.run_status === 'POSTED');
  const netYear = lastYear.reduce((s, l) => s + num(l.net), 0);
  const outstanding = lines.filter((l) => l.run_status === 'POSTED').reduce((s, l) => s + num(l.outstanding), 0);
  const advanceBalance = advances.filter((a) => a.status === 'OPEN').reduce((s, a) => s + num(a.remaining), 0);

  const employeeForDialogs = employee ? [employee] : [];

  const columns = useMemo<ColumnDef<PayrollRunLine, any>[]>(
    () => [
      {
        id: 'month',
        accessorKey: 'period_month',
        header: 'الشهر',
        meta: { label: 'الشهر', alwaysVisible: true },
        cell: ({ row }) => (
          <Link href={`/payroll?month=${row.original.period_month}`} className="font-medium hover:underline">
            {formatMonthKeyAr(row.original.period_month)}
          </Link>
        ),
      },
      {
        id: 'gross',
        accessorFn: (l) => num(l.base_salary) + num(l.allowances) + num(l.bonuses) + num(l.overtime),
        header: 'المستحقات',
        meta: { label: 'المستحقات', numeric: true },
        cell: ({ getValue }) => <Amount value={getValue()} />,
      },
      {
        id: 'deductions',
        accessorFn: (l) => num(l.absence_deduction) + num(l.penalties) + num(l.other_deductions) + num(l.advance_repayment),
        header: 'الاستقطاعات',
        meta: { label: 'الاستقطاعات', numeric: true },
        cell: ({ getValue }) => <Amount value={getValue()} tone="negative" hideZero />,
      },
      {
        id: 'net',
        accessorFn: (l) => num(l.net),
        header: 'الصافي',
        meta: { label: 'الصافي', numeric: true, alwaysVisible: true },
        cell: ({ getValue }) => <Amount value={getValue()} className="font-semibold" />,
      },
      {
        id: 'status',
        accessorFn: (l) => l.run_status,
        header: 'الحالة',
        meta: { label: 'الحالة' },
        cell: ({ row }) => {
          const l = row.original;
          if (l.run_status !== 'POSTED') return <Badge variant="neutral">{RUN_STATUS_LABEL[l.run_status]}</Badge>;
          if (num(l.outstanding) < 0.0005) return <Badge variant="success">صُرف</Badge>;
          return (
            <span className="flex items-center gap-1.5">
              <Badge variant="warning">متبقٍ</Badge>
              <Amount value={l.outstanding} />
            </span>
          );
        },
      },
      {
        id: 'payslip',
        header: '',
        enableSorting: false,
        meta: { alwaysVisible: true, align: 'end' },
        cell: ({ row }) => (
          <TajMallPdfToolbar
            fileName={`قسيمة-راتب-${row.original.employee_name}-${row.original.period_month}`}
            shareTitle={`قسيمة راتب ${row.original.employee_name} — ${formatMonthKeyAr(row.original.period_month)}`}
            cacheKey={`${row.original.id}-${row.original.paid}-${row.original.run_status}`}
            openLabel="القسيمة"
            showDownload={false}
            render={async () => {
              const { PayslipPDF } = await import('@/features/pdf/PayslipPDF');
              return (
                <PayslipPDF
                  line={row.original}
                  // Only the adjustments this line counted, never later ones of the same month.
                  adjustments={adjustments.filter((a) => (row.original.adjustment_ids ?? []).includes(a.id))}
                />
              );
            }}
          />
        ),
      },
    ],
    [adjustments],
  );

  if (isPayrollSchemaMissing(structuresError)) {
    return (
      <div className="px-4 py-6 sm:px-5 md:px-8">
        <PayrollSchemaMissing />
      </div>
    );
  }

  if (employeeLoading) {
    return (
      <div className="flex flex-col gap-4 px-4 py-6 sm:px-5 md:px-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!employee || employee.kind !== 'EMPLOYEE') {
    return (
      <div className="px-4 py-6 sm:px-5 md:px-8">
        <EmptyState icon={Wallet} title="الموظف غير موجود" action={{ label: 'العودة إلى الرواتب', href: '/payroll' }} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="ملف الراتب"
        title={employee.name}
        description={[employee.job_title, employee.department, employee.hire_date ? `منذ ${formatDate(employee.hire_date)}` : null]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/payroll?tab=structures">
                <ArrowRight />
                الرواتب
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/contacts/${employee.id}`}>
                <FileText />
                بطاقة الجهة
              </Link>
            </Button>
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => setAdjustmentOpen(true)}>
                <Plus />
                مكافأة أو خصم
              </Button>
            )}
            {canManage && (
              <Button size="sm" onClick={() => setStructureOpen(true)}>
                <Pencil />
                {current ? 'تعديل الراتب' : 'حدّد الراتب'}
              </Button>
            )}
          </div>
        }
      />

      <div className="flex min-w-0 flex-col gap-6 px-4 py-5 sm:px-5 md:px-8 md:py-6">
        <StatStrip
          items={[
            {
              label: 'الراتب الشهري',
              value: current ? <Amount value={structureTotal(current)} /> : <span className="text-muted-foreground">بلا هيكل</span>,
              hint: current ? `يسري من ${formatMonthKeyAr(current.effective_from.slice(0, 7))}` : undefined,
              emphasis: true,
            },
            { label: 'صافي آخر 12 شهراً', value: <Amount value={netYear} />, hint: `${lastYear.length} كشف مُرحَّل` },
            { label: 'متبقٍ للصرف', value: <Amount value={outstanding} /> },
            { label: 'رصيد السلف', value: <Amount value={advanceBalance} tone={advanceBalance > 0 ? 'negative' : 'default'} /> },
          ]}
        />

        <section className="flex flex-col gap-3">
          <SectionHeading title="سجل الرواتب الشهرية" description="لكل شهر مُعَدّ: المستحقات والاستقطاعات والصافي وما صُرف، مع قسيمة الراتب." />
          <DataTable
            tableId="employee-payroll-lines"
            data={lines}
            columns={columns}
            getRowId={(l) => l.id}
            loading={linesLoading}
            initialSorting={[{ id: 'month', desc: true }]}
            empty={<EmptyState icon={FileText} title="لم يدخل الموظف أي كشف رواتب بعد" description="يظهر كل شهر هنا بعد إعداد كشفه." />}
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="flex flex-col gap-3">
            <SectionHeading title="تاريخ هيكل الراتب" />
            {structures.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
                لم يُحدَّد هيكل راتب بعد.
              </p>
            ) : (
              <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
                {structures.map((s, i) => {
                  const previous = structures[i + 1];
                  const delta = previous ? structureTotal(s) - structureTotal(previous) : null;
                  return (
                    <li key={s.id} className="flex items-start justify-between gap-4 px-4 py-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[13px] font-medium">
                          من {formatMonthKeyAr(s.effective_from.slice(0, 7))}
                          {i === 0 && <Badge variant="neutral" className="ms-2">الحالي</Badge>}
                        </span>
                        <span className="text-[12px] text-muted-foreground">
                          أساسي <Amount value={s.base_salary} muted className="text-[12px]" /> · بدلات{' '}
                          <Amount value={structureTotal(s) - num(s.base_salary)} muted className="text-[12px]" />
                        </span>
                        {s.notes && <span className="text-[12px] text-muted-foreground">{s.notes}</span>}
                      </div>
                      <div className="flex flex-col items-end">
                        <Amount value={structureTotal(s)} className="font-semibold" />
                        {delta !== null && Math.abs(delta) >= 0.0005 && (
                          <span dir="ltr" className={delta > 0 ? 'text-[11.5px] text-pastel-greenInk' : 'text-[11.5px] text-pastel-redInk'}>
                            {delta > 0 ? '+' : '−'}
                            {Math.abs(delta).toLocaleString('en-US', { maximumFractionDigits: 3 })}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeading title="الحركات والسلف" />
            {adjustments.length === 0 && advances.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
                لا توجد مكافآت أو خصومات أو سلف.
              </p>
            ) : (
              <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
                {advances.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-[13px] font-medium">
                        سلفة
                        <Badge variant={a.status === 'OPEN' ? 'warning' : a.status === 'SETTLED' ? 'success' : 'neutral'}>
                          {ADVANCE_STATUS_LABEL[a.status]}
                        </Badge>
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        {formatDate(a.issued_on)} · {a.reason}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <Amount value={a.amount} />
                      {a.status === 'OPEN' && (
                        <span className="text-[11.5px] text-muted-foreground">
                          متبقٍ <Amount value={a.remaining} muted className="text-[11.5px]" />
                        </span>
                      )}
                    </div>
                  </li>
                ))}
                {adjustments.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-[13px] font-medium">
                        {ADJUSTMENT_KIND_LABEL[a.kind]}
                        <span className="text-[12px] font-normal text-muted-foreground">{formatMonthKeyAr(a.period_month)}</span>
                        <Badge variant={a.status === 'APPROVED' ? 'success' : a.status === 'DRAFT' ? 'warning' : 'neutral'}>
                          {ADJUSTMENT_STATUS_LABEL[a.status]}
                        </Badge>
                      </span>
                      <span className="text-[12px] text-muted-foreground">{a.reason}</span>
                    </div>
                    <Amount
                      value={a.amount}
                      tone={a.status === 'CANCELLED' ? 'default' : ADJUSTMENT_IS_ADDITION[a.kind] ? 'positive' : 'negative'}
                      muted={a.status === 'CANCELLED'}
                    />
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      <SalaryStructureDialog
        open={structureOpen}
        onOpenChange={setStructureOpen}
        employees={employeeForDialogs}
        structures={structures}
        employeeId={employee.id}
      />
      <AdjustmentDialog
        open={adjustmentOpen}
        onOpenChange={setAdjustmentOpen}
        employees={employeeForDialogs}
        structures={structures}
        month={currentMonthKey()}
        employeeId={employee.id}
      />
    </>
  );
}
