'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { ChartColumn, History, Pencil, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/data/data-table';
import { InfoList, MonthlyBarChart, SectionCard, ErrorBlock, EmptyBlock, type ChartRow } from '@/components/people';
import { DbUpdateNotice } from '@/components/employees/profile-shell';
import type { EmployeeProfileData } from '@/components/employees/use-employee-profile';
import { Amount } from '@/components/payroll/payroll-ui';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { RUN_STATUS_LABEL, type PayrollRunLine } from '@/lib/db/payroll-queries';
import { monthKeyOf, payrollSeries, structureInForce, structureTotalOf } from '@/lib/employees/employee-profile';
import { cn, formatMonthKeyAr, formatMoney } from '@/lib/utils';

const num = (v: string | number | null | undefined) => Number(v) || 0;
const monthName = (key: string) => formatMonthKeyAr(key).split(' ')[0];

/** The month of a line, always "YYYY-MM": a row may carry a date, and the payroll page asks for the month. */
const lineMonth = (l: PayrollRunLine) => monthKeyOf(l.period_month);

function LineStatus({ line, onPay }: { line: PayrollRunLine; onPay?: (line: PayrollRunLine) => void }) {
  if (line.run_status !== 'POSTED') return <Badge variant="neutral">{RUN_STATUS_LABEL[line.run_status]}</Badge>;
  if (num(line.outstanding) < 0.0005) return <Badge variant="success">صُرف</Badge>;
  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      <Badge variant="warning">متبقٍ</Badge>
      <Amount value={line.outstanding} />
      {onPay && (
        <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => onPay(line)}>
          اصرف
        </Button>
      )}
    </span>
  );
}

function Payslip({ line, adjustments }: { line: PayrollRunLine; adjustments: EmployeeProfileData['adjustments'] }) {
  // a payslip needs the breakdown; roles that only see the net do not get one
  if (line.base_salary === null) return null;
  return (
    <TajMallPdfToolbar
      fileName={`قسيمة-راتب-${line.employee_name}-${lineMonth(line)}`}
      shareTitle={`قسيمة راتب ${line.employee_name} — ${formatMonthKeyAr(lineMonth(line))}`}
      cacheKey={`${line.id}-${line.paid}-${line.run_status}`}
      openLabel="القسيمة"
      showDownload={false}
      render={async () => {
        const { PayslipPDF } = await import('@/features/pdf/PayslipPDF');
        return (
          <PayslipPDF
            line={line}
            // only the adjustments this line counted, never later ones of the same month
            adjustments={adjustments.filter((a) => (line.adjustment_ids ?? []).includes(a.id))}
          />
        );
      }}
    />
  );
}

export function PayrollTab({
  data,
  onEditSalary,
  onPayLine,
}: {
  data: EmployeeProfileData;
  onEditSalary?: () => void;
  onPayLine?: (line: PayrollRunLine) => void;
}) {
  const { lines, structures, adjustments, kpis, parts, today, canManage } = data;
  const missing = parts.lines.missing || parts.structures.missing;
  const failed = parts.lines.error;

  const series = useMemo(() => payrollSeries(lines, today), [lines, today]);
  const chartData = useMemo<ChartRow[]>(() => series.map((s) => ({ label: monthName(s.month), net: s.net, paid: s.paid })), [series]);
  const inForce = structureInForce(structures, today);
  const history = useMemo(() => [...structures].sort((a, b) => monthKeyOf(b.effective_from).localeCompare(monthKeyOf(a.effective_from))), [structures]);

  const columns = useMemo<ColumnDef<PayrollRunLine, any>[]>(
    () => [
      {
        id: 'month',
        accessorFn: lineMonth,
        header: 'الشهر',
        meta: { label: 'الشهر', alwaysVisible: true },
        cell: ({ row }) => (
          <Link href={`/payroll?month=${lineMonth(row.original)}`} className="font-medium hover:underline">
            {formatMonthKeyAr(lineMonth(row.original))}
          </Link>
        ),
      },
      {
        id: 'gross',
        // null when this role does not see the breakdown (cashier): shown as «—», never as 0
        accessorFn: (l) => (l.base_salary === null ? null : num(l.base_salary) + num(l.allowances) + num(l.bonuses) + num(l.overtime)),
        header: 'المستحقات',
        meta: { label: 'المستحقات', numeric: true },
        cell: ({ getValue }) => <Amount value={getValue()} />,
      },
      {
        id: 'deductions',
        accessorFn: (l) => (l.absence_deduction === null ? null : num(l.absence_deduction) + num(l.penalties) + num(l.other_deductions) + num(l.advance_repayment)),
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
        meta: { label: 'الحالة', align: 'end' },
        cell: ({ row }) => <LineStatus line={row.original} onPay={onPayLine} />,
      },
      {
        id: 'payslip',
        header: '',
        enableSorting: false,
        meta: { alwaysVisible: true, align: 'end' },
        cell: ({ row }) => <Payslip line={row.original} adjustments={adjustments} />,
      },
    ],
    [adjustments, onPayLine],
  );

  if (missing) return <DbUpdateNotice what="payroll" />;

  const totalNet = series.reduce((s, p) => s + p.net, 0);
  const totalPaid = series.reduce((s, p) => s + p.paid, 0);

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="صافي الراتب والمصروف"
          description="آخر 12 شهراً من الكشوف المُرحَّلة"
          icon={ChartColumn}
          accent="teal"
          status={parts.lines.loading ? 'loading' : failed ? 'error' : 'ready'}
          errorText="تعذّر تحميل كشوف الرواتب. أعد المحاولة."
          onRetry={parts.lines.retry}
          skeletonRows={4}
        >
          <MonthlyBarChart
            data={chartData}
            series={[
              { key: 'net', label: 'الصافي', accent: 'blue' },
              { key: 'paid', label: 'المصروف', accent: 'green' },
            ]}
            title="صافي الراتب والمصروف لكل شهر"
            height={210}
            emptyText="لا كشوف مُرحَّلة لهذا الموظف بعد."
            summary={
              totalNet > 0 ? (
                <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 text-[12.5px] text-ink-mute">
                  <span>
                    الصافي <span className="font-semibold tabular-nums text-foreground">{formatMoney(totalNet, 'LYD')}</span>
                  </span>
                  <span>
                    المصروف <span className="font-semibold tabular-nums text-foreground">{formatMoney(totalPaid, 'LYD')}</span>
                  </span>
                </p>
              ) : undefined
            }
          />
        </SectionCard>

        <SectionCard
          title="هيكل الراتب الحالي"
          description={inForce ? `يسري من ${formatMonthKeyAr(monthKeyOf(inForce.effective_from))}` : undefined}
          icon={Wallet}
          accent="teal"
          status={parts.structures.loading ? 'loading' : parts.structures.error ? 'error' : 'ready'}
          errorText="تعذّر تحميل هيكل الراتب. أعد المحاولة."
          onRetry={parts.structures.retry}
          skeletonRows={4}
          actions={
            canManage && onEditSalary ? (
              <Button type="button" variant="outline" size="sm" className="min-h-11 gap-1.5 sm:min-h-8" onClick={onEditSalary}>
                <Pencil aria-hidden />
                {inForce ? 'تعديل' : 'حدّد الراتب'}
              </Button>
            ) : undefined
          }
        >
          {inForce ? (
            <>
              <InfoList
                items={[
                  { label: 'الراتب الأساسي', value: <Amount value={inForce.base_salary} /> },
                  { label: 'بدل السكن', value: <Amount value={inForce.housing_allowance} hideZero /> },
                  { label: 'بدل النقل', value: <Amount value={inForce.transport_allowance} hideZero /> },
                  { label: 'بدلات أخرى', value: <Amount value={inForce.other_allowance} hideZero /> },
                  { label: 'الإجمالي', value: <Amount value={structureTotalOf(inForce)} className="font-bold" /> },
                ]}
              />
              {kpis.salary.coming && (
                <p className="mt-3 rounded-lg border border-info-line bg-info-soft px-3 py-2 text-[12.5px] text-info-ink">
                  يصبح الراتب <span className="font-semibold tabular-nums">{formatMoney(kpis.salary.coming.total, 'LYD')}</span> من {formatMonthKeyAr(kpis.salary.coming.from)}.
                </p>
              )}
            </>
          ) : (
            <EmptyBlock className="py-6">
              {!data.structuresReadable
                ? 'هيكل الراتب متاح للمحاسب ومدير النظام والمالك.'
                : kpis.salary.source === 'card'
                  ? `الراتب المسجَّل في بطاقة الجهة ${formatMoney(kpis.salary.total, 'LYD')} ولا هيكل له. حدّد الهيكل ليدخل الكشوف.`
                  : 'لا هيكل راتب بعد.'}
            </EmptyBlock>
          )}
        </SectionCard>
      </div>

      <section className="flex min-w-0 flex-col gap-3" aria-label="كشوف الرواتب">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold">كشوف الرواتب</h2>
        </div>
        {failed ? (
          <Card>
            <ErrorBlock message="تعذّر تحميل كشوف الرواتب. أعد المحاولة." onRetry={parts.lines.retry} />
          </Card>
        ) : (
          <DataTable
            tableId="employee-payroll-lines"
            data={lines}
            columns={columns}
            getRowId={(l) => l.id}
            loading={parts.lines.loading}
            initialSorting={[{ id: 'month', desc: true }]}
            caption="كشوف رواتب الموظف"
            empty={
              <Card>
                <EmptyBlock>لم يدخل الموظف كشف رواتب بعد. يظهر كل شهر هنا بعد إعداد كشفه.</EmptyBlock>
              </Card>
            }
            renderMobileRow={(l) => (
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3.5">
                <div className="flex items-start justify-between gap-3">
                  {/* padding and a matching negative margin make the tap area 44px high without growing the card */}
                  <Link href={`/payroll?month=${lineMonth(l)}`} className="-my-3 inline-block py-3 text-[14.5px] font-semibold hover:underline">
                    {formatMonthKeyAr(lineMonth(l))}
                  </Link>
                  <Amount value={l.net} className="text-[15px] font-bold" />
                </div>
                <div className={cn('flex flex-wrap items-center justify-between gap-2')}>
                  <LineStatus line={l} onPay={onPayLine} />
                  <Payslip line={l} adjustments={adjustments} />
                </div>
              </div>
            )}
          />
        )}
      </section>

      {history.length > 0 && (
        <SectionCard title="تاريخ هيكل الراتب" description="كل تعديل يبقى محفوظاً" icon={History} accent="blue" flush>
          <ol className="divide-y divide-border">
            {history.map((s, i) => {
              const before = history[i + 1];
              const delta = before ? structureTotalOf(s) - structureTotalOf(before) : null;
              return (
                <li key={s.id} className="flex items-start justify-between gap-4 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium">
                      من {formatMonthKeyAr(monthKeyOf(s.effective_from))}
                      {inForce?.id === s.id && (
                        <Badge variant="neutral" className="ms-2">
                          الحالي
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-ink-mute">
                      أساسي {formatMoney(num(s.base_salary), 'LYD')} · بدلات {formatMoney(structureTotalOf(s) - num(s.base_salary), 'LYD')}
                    </p>
                    {s.notes && <p className="mt-0.5 text-[12.5px] text-ink-mute">{s.notes}</p>}
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="text-[14px] font-semibold tabular-nums">{formatMoney(structureTotalOf(s), 'LYD')}</p>
                    {delta !== null && Math.abs(delta) >= 0.0005 && (
                      <p className={cn('text-[12px] tabular-nums', delta > 0 ? 'text-success-ink' : 'text-danger-ink')}>{formatMoney(delta, 'LYD', { signed: true })}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </SectionCard>
      )}
    </>
  );
}
