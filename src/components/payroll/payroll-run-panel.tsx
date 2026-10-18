'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { BookCheck, ClipboardCheck, FileSpreadsheet, HandCoins, RefreshCw, Undo2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/data/data-table';
import { EmptyState } from '@/components/data/empty-state';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { cn, formatDate, formatMonthKeyAr } from '@/lib/utils';
import {
  RUN_STATUS_LABEL,
  payrollErrorMessage,
  shiftMonth,
  useApprovePayrollRun,
  usePayrollRunDifferences,
  usePayrollRunLines,
  usePostPayrollRun,
  usePreparePayrollRun,
  useReversePayrollRun,
  type PayrollRun,
  type PayrollRunLine,
} from '@/lib/db/payroll-queries';
import { Amount, PayrollLoadError, RunSteps, SectionHeading, StatStrip } from './payroll-ui';
import { PayLineDialog, ReasonDialog } from './payroll-dialogs';

const num = (v: string | number | null | undefined) => Number(v) || 0;
const additions = (l: PayrollRunLine) => num(l.bonuses) + num(l.overtime);
const deductions = (l: PayrollRunLine) => num(l.absence_deduction) + num(l.penalties) + num(l.other_deductions);

function sum(lines: PayrollRunLine[], pick: (l: PayrollRunLine) => number) {
  return lines.reduce((s, l) => s + pick(l), 0);
}

export function PayrollRunPanel({
  month,
  runs,
  canManage,
  canApprove,
  canPay,
  employeeCount,
  employeesWithoutStructure,
}: {
  month: string;
  runs: PayrollRun[];
  canManage: boolean;
  canApprove: boolean;
  canPay: boolean;
  employeeCount: number;
  employeesWithoutStructure: number;
}) {
  const run = runs.find((r) => r.period_month === month) ?? null;
  const previousRun = runs.find((r) => r.period_month === shiftMonth(month, -1)) ?? null;
  const { data: lines = [], isLoading, error } = usePayrollRunLines(run?.id ?? null);
  const { data: previousLines = [] } = usePayrollRunLines(previousRun?.id ?? null);

  const prepare = usePreparePayrollRun();
  const approve = useApprovePayrollRun();
  const post = usePostPayrollRun();
  const reverse = useReversePayrollRun();

  const [confirm, setConfirm] = useState<null | 'prepare' | 'approve' | 'post'>(null);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [payLine, setPayLine] = useState<PayrollRunLine | null>(null);

  const { data: staleCount = 0 } = usePayrollRunDifferences(
    run?.id ?? null,
    canManage && (run?.status === 'DRAFT' || run?.status === 'APPROVED'),
  );
  const stale = staleCount > 0;

  const previousNet = useMemo(() => new Map(previousLines.map((l) => [l.employee_id, num(l.net)])), [previousLines]);

  const totals = useMemo(
    () => ({
      gross: sum(lines, (l) => num(l.gross)),
      deductions: sum(lines, (l) => num(l.penalties) + num(l.other_deductions)),
      advances: sum(lines, (l) => num(l.advance_repayment)),
      net: sum(lines, (l) => num(l.net)),
      paid: sum(lines, (l) => num(l.paid)),
      outstanding: sum(lines, (l) => num(l.outstanding)),
    }),
    [lines],
  );
  const previousTotalNet = sum(previousLines, (l) => num(l.net));
  const fullyPaid = run?.status === 'POSTED' && lines.length > 0 && totals.outstanding < 0.0005;
  const status = run?.status ?? null;

  const columns = useMemo<ColumnDef<PayrollRunLine, any>[]>(
    () => [
      {
        id: 'employee',
        accessorFn: (l) => l.employee_name,
        header: 'الموظف',
        meta: { label: 'الموظف', alwaysVisible: true },
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <Link
              href={`/payroll/employees/${row.original.employee_id}`}
              className="truncate font-medium hover:underline"
            >
              {row.original.employee_name}
            </Link>
            {(row.original.job_title || row.original.department) && (
              <span className="truncate text-[11.5px] text-muted-foreground">
                {[row.original.job_title, row.original.department].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
        ),
        footer: () => <span className="font-semibold">الإجمالي</span>,
      },
      {
        id: 'base',
        accessorFn: (l) => num(l.base_salary),
        header: 'الأساسي',
        meta: { label: 'الأساسي', numeric: true },
        cell: ({ getValue }) => <Amount value={getValue()} />,
        footer: () => <Amount value={sum(lines, (l) => num(l.base_salary))} />,
      },
      {
        id: 'allowances',
        accessorFn: (l) => num(l.allowances),
        header: 'البدلات',
        meta: { label: 'البدلات', numeric: true },
        cell: ({ getValue }) => <Amount value={getValue()} hideZero />,
        footer: () => <Amount value={sum(lines, (l) => num(l.allowances))} hideZero />,
      },
      {
        id: 'additions',
        accessorFn: additions,
        header: 'مكافآت وإضافي',
        meta: { label: 'مكافآت وإضافي', numeric: true },
        cell: ({ getValue }) => <Amount value={getValue()} tone="positive" hideZero />,
        footer: () => <Amount value={sum(lines, additions)} tone="positive" hideZero />,
      },
      {
        id: 'deductions',
        accessorFn: deductions,
        header: 'خصومات وغياب',
        meta: { label: 'خصومات وغياب', numeric: true },
        cell: ({ getValue }) => <Amount value={getValue()} tone="negative" hideZero />,
        footer: () => <Amount value={sum(lines, deductions)} tone="negative" hideZero />,
      },
      {
        id: 'advance',
        accessorFn: (l) => num(l.advance_repayment),
        header: 'قسط سلفة',
        meta: { label: 'قسط سلفة', numeric: true },
        cell: ({ getValue }) => <Amount value={getValue()} tone="negative" hideZero />,
        footer: () => <Amount value={totals.advances} tone="negative" hideZero />,
      },
      {
        id: 'net',
        accessorFn: (l) => num(l.net),
        header: 'الصافي',
        meta: { label: 'الصافي', numeric: true, alwaysVisible: true },
        cell: ({ row, getValue }) => {
          const prev = previousNet.get(row.original.employee_id);
          const delta = prev === undefined ? null : getValue() - prev;
          return (
            <div className="flex flex-col items-end">
              <Amount value={getValue()} className="font-semibold" />
              {delta !== null && Math.abs(delta) >= 0.0005 && (
                <span
                  dir="ltr"
                  className={cn('text-[11px] tabular-nums', delta > 0 ? 'text-pastel-greenInk' : 'text-pastel-redInk')}
                  title="الفرق عن الشهر السابق"
                >
                  {delta > 0 ? '+' : '−'}
                  {Math.abs(delta).toLocaleString('en-US', { maximumFractionDigits: 3 })}
                </span>
              )}
            </div>
          );
        },
        footer: () => <Amount value={totals.net} className="font-semibold" />,
      },
      {
        id: 'outstanding',
        accessorFn: (l) => num(l.outstanding),
        header: 'المتبقي للصرف',
        meta: { label: 'المتبقي للصرف', numeric: true },
        cell: ({ row, getValue }) =>
          row.original.run_status !== 'POSTED' ? (
            <span className="text-[12px] text-muted-foreground">بعد الترحيل</span>
          ) : getValue() < 0.0005 ? (
            <Badge variant="success">صُرف</Badge>
          ) : (
            <Amount value={getValue()} />
          ),
        footer: () => (status === 'POSTED' ? <Amount value={totals.outstanding} /> : null),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { alwaysVisible: true, align: 'end' },
        cell: ({ row }) =>
          canPay && row.original.run_status === 'POSTED' && num(row.original.outstanding) >= 0.0005 ? (
            <Button size="sm" variant="outline" onClick={() => setPayLine(row.original)}>
              <HandCoins />
              صرف
            </Button>
          ) : null,
      },
    ],
    [lines, previousNet, totals, status, canPay],
  );

  async function runConfirmed() {
    try {
      if (confirm === 'prepare') {
        const res = await prepare.mutateAsync({ month });
        toast.success(`أُعدّ كشف ${formatMonthKeyAr(month)}`, { description: `${res?.employees ?? 0} موظف` });
      } else if (confirm === 'approve' && run) {
        await approve.mutateAsync({ runId: run.id });
        toast.success('اعتُمد الكشف', { description: 'يمكن الآن ترحيله إلى الدفاتر' });
      } else if (confirm === 'post' && run) {
        await post.mutateAsync({ runId: run.id });
        toast.success('رُحّل الكشف', { description: 'سُجّل قيد الرواتب، ويمكن الآن صرف الرواتب' });
      }
    } catch (e) {
      toast.error('لم تكتمل العملية', { description: payrollErrorMessage(e) });
      throw e; // keeps the confirmation open
    }
  }

  const confirmCopy = {
    prepare: {
      title: run ? `إعادة إعداد كشف ${formatMonthKeyAr(month)}` : `إعداد كشف ${formatMonthKeyAr(month)}`,
      description: run
        ? 'يُعاد حساب كل الأسطر من هياكل الرواتب والحركات المعتمدة والسلف. يعود الكشف مسودة ويحتاج اعتماداً جديداً.'
        : 'يُحسب راتب كل موظف نشط من هيكل راتبه، وتُضاف المكافآت والخصومات المعتمدة لهذا الشهر وتُستقطع أقساط السلف.',
      label: run ? 'أعد الإعداد' : 'أعدّ الكشف',
    },
    approve: {
      title: `اعتماد كشف ${formatMonthKeyAr(month)}`,
      description: 'بعد الاعتماد لا تتغير الأسطر إلا بإعادة الإعداد. راجع الصافي لكل موظف قبل الاعتماد.',
      label: 'اعتمد الكشف',
    },
    post: {
      title: `ترحيل كشف ${formatMonthKeyAr(month)} إلى الدفاتر`,
      description:
        'يُنشأ قيد واحد متوازن: مصروف الرواتب والمكافآت مديناً، والرواتب المستحقة والسلف والجزاءات دائنة. لا يُعدَّل الشهر بعد الترحيل إلا بعكسه.',
      label: 'رحّل الكشف',
    },
  } as const;

  const nextAction = (() => {
    if (!canManage) return null;
    if (!run)
      return (
        <Button onClick={() => setConfirm('prepare')} disabled={employeeCount === 0}>
          <FileSpreadsheet />
          أعدّ كشف الشهر
        </Button>
      );
    if (status === 'DRAFT')
      return (
        <>
          <Button variant="outline" onClick={() => setConfirm('prepare')}>
            <RefreshCw />
            أعد الإعداد
          </Button>
          {canApprove ? (
            <Button onClick={() => setConfirm('approve')} disabled={lines.length === 0 || stale}>
              <ClipboardCheck />
              اعتمد الكشف
            </Button>
          ) : (
            <span className="text-[12.5px] text-muted-foreground">بانتظار اعتماد المالك أو المدير</span>
          )}
        </>
      );
    if (status === 'APPROVED')
      return (
        <>
          <Button variant="outline" onClick={() => setConfirm('prepare')}>
            <RefreshCw />
            أعد الإعداد
          </Button>
          <Button onClick={() => setConfirm('post')} disabled={stale}>
            <BookCheck />
            رحّل إلى الدفاتر
          </Button>
        </>
      );
    if (status === 'POSTED' && canApprove && totals.paid < 0.0005)
      return (
        <Button variant="ghost" onClick={() => setReverseOpen(true)}>
          <Undo2 />
          اعكس الترحيل
        </Button>
      );
    return null;
  })();

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold">كشف رواتب {formatMonthKeyAr(month)}</h2>
              {status && (
                <Badge variant={status === 'POSTED' ? (fullyPaid ? 'success' : 'info') : status === 'APPROVED' ? 'warning' : 'neutral'}>
                  {fullyPaid ? 'مُرحَّل ومصروف' : RUN_STATUS_LABEL[status]}
                </Badge>
              )}
            </div>
            <RunSteps status={status} fullyPaid={fullyPaid} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lines.length > 0 && (
              <TajMallPdfToolbar
                fileName={`كشف-رواتب-${month}`}
                shareTitle={`كشف رواتب ${formatMonthKeyAr(month)}`}
                cacheKey={`payroll-${run?.id}-${status}-${totals.net}-${totals.paid}`}
                openLabel="الكشف PDF"
                render={async () => {
                  const { PayrollRegisterPDF } = await import('@/features/pdf/PayrollRegisterPDF');
                  return <PayrollRegisterPDF month={month} status={status} lines={lines} />;
                }}
              />
            )}
            {nextAction}
          </div>
        </div>
        {stale && (
          <div className="flex flex-col gap-2 rounded-lg border border-warning-line bg-warning-soft px-3 py-2.5 text-[12.5px] text-warning-ink sm:flex-row sm:items-center sm:justify-between">
            <p>
              تغيّرت بيانات {staleCount === 1 ? 'موظف واحد' : `${staleCount} موظفين`} بعد إعداد الكشف (حركة اعتُمدت أو أُلغيت،
              سلفة، أو تعديل راتب). أعد إعداد الكشف ليعكس البيانات الحالية قبل الاعتماد أو الترحيل.
            </p>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => setConfirm('prepare')}>
              <RefreshCw />
              أعد الإعداد
            </Button>
          </div>
        )}
        {employeesWithoutStructure > 0 && canManage && (!run || status === 'DRAFT') && (
          <p className="rounded-lg border border-pastel-yellowInk/20 bg-pastel-yellow px-3 py-2 text-[12.5px] text-pastel-yellowInk">
            {employeesWithoutStructure === 1 ? 'موظف واحد نشط' : `${employeesWithoutStructure} موظفين نشطين`} بلا هيكل راتب لن
            {employeesWithoutStructure === 1 ? ' يدخل' : ' يدخلوا'} الكشف. حدّد هياكلهم من تبويب «هياكل الرواتب».
          </p>
        )}
        {run?.posted_at && run.journal_entry_id && (
          <p className="text-[12.5px] text-muted-foreground">
            رُحّل في {formatDate(run.posted_at)} ·{' '}
            <Link href={`/journals?highlight=${run.journal_entry_id}`} className="underline underline-offset-2 hover:text-foreground">
              عرض القيد
            </Link>
          </p>
        )}
      </section>

      {lines.length > 0 && (
        <StatStrip
          items={[
            { label: 'الموظفون في الكشف', value: <span className="tabular-nums">{lines.length}</span> },
            { label: 'إجمالي المستحق', value: <Amount value={totals.gross} /> },
            { label: 'جزاءات وأقساط', value: <Amount value={totals.deductions + totals.advances} tone="negative" /> },
            {
              label: 'صافي الرواتب',
              value: <Amount value={totals.net} />,
              emphasis: true,
              hint:
                previousLines.length > 0 ? (
                  <>
                    الشهر السابق <Amount value={previousTotalNet} muted className="text-[11.5px]" />
                  </>
                ) : undefined,
            },
            {
              label: status === 'POSTED' ? 'المتبقي للصرف' : 'المصروف',
              value: status === 'POSTED' ? <Amount value={totals.outstanding} /> : <span className="text-muted-foreground">بعد الترحيل</span>,
              hint: status === 'POSTED' ? <>صُرف <Amount value={totals.paid} muted className="text-[11.5px]" /></> : undefined,
            },
          ]}
        />
      )}

      {error ? (
        <PayrollLoadError message={payrollErrorMessage(error)} />
      ) : !run ? (
        <EmptyState
          icon={Users}
          title={`لم يُعدّ كشف ${formatMonthKeyAr(month)} بعد`}
          description={
            employeeCount === 0
              ? 'لا يوجد موظف بهيكل راتب. ابدأ بتحديد هياكل الرواتب.'
              : `${employeeCount} ${employeeCount === 1 ? 'موظف جاهز' : 'موظفين جاهزين'} للكشف. سجّل المكافآت والخصومات واعتمدها أولاً، ثم أعدّ الكشف.`
          }
          action={canManage && employeeCount > 0 ? { label: 'أعدّ كشف الشهر', onClick: () => setConfirm('prepare') } : undefined}
        />
      ) : (
        <>
          <SectionHeading title="تفاصيل الكشف" description="الفرق الصغير تحت الصافي مقارنة بالشهر السابق." />
          <DataTable
            tableId="payroll-run-lines"
            data={lines}
            columns={columns}
            getRowId={(l) => l.id}
            loading={isLoading}
            initialSorting={[{ id: 'employee', desc: false }]}
            empty={<EmptyState icon={Users} title="الكشف فارغ" description="لا يوجد موظف نشط بهيكل راتب لهذا الشهر." />}
            renderMobileRow={(l) => (
              <div className="flex flex-col gap-2 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{l.employee_name}</span>
                    <span className="truncate text-[11.5px] text-muted-foreground">{l.job_title ?? '—'}</span>
                  </div>
                  <Amount value={l.net} className="font-semibold" />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                  <span>أساسي وبدلات <Amount value={num(l.base_salary) + num(l.allowances)} muted /></span>
                  {additions(l) > 0 && <span>إضافات <Amount value={additions(l)} tone="positive" /></span>}
                  {deductions(l) + num(l.advance_repayment) > 0 && (
                    <span>استقطاعات <Amount value={deductions(l) + num(l.advance_repayment)} tone="negative" /></span>
                  )}
                </div>
                {canPay && l.run_status === 'POSTED' && num(l.outstanding) >= 0.0005 && (
                  <Button size="sm" variant="outline" className="self-start" onClick={() => setPayLine(l)}>
                    <HandCoins />
                    صرف <Amount value={l.outstanding} />
                  </Button>
                )}
              </div>
            )}
          />
        </>
      )}

      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title={confirmCopy[confirm].title}
          description={confirmCopy[confirm].description}
          details={
            confirm !== 'prepare' && lines.length > 0
              ? [
                  { label: 'عدد الموظفين', value: lines.length },
                  { label: 'صافي الرواتب', value: <Amount value={totals.net} /> },
                  { label: 'أقساط السلف', value: <Amount value={totals.advances} /> },
                ]
              : undefined
          }
          confirmLabel={confirmCopy[confirm].label}
          tone="default"
          onConfirm={runConfirmed}
        />
      )}

      <ReasonDialog
        open={reverseOpen}
        onOpenChange={setReverseOpen}
        title={`عكس ترحيل ${formatMonthKeyAr(month)}`}
        description="يُعكس قيد الرواتب، وتعود أقساط السلف والحركات إلى حالتها، ويرجع الكشف مسودة. لا يُسمح بالعكس بعد صرف أي راتب من الكشف."
        confirmLabel="اعكس الترحيل"
        onConfirm={async (reason) => {
          if (!run) return;
          await reverse.mutateAsync({ runId: run.id, reason });
          toast.success('عُكس الترحيل', { description: 'الكشف الآن مسودة' });
        }}
      />

      <PayLineDialog line={payLine} open={Boolean(payLine)} onOpenChange={(o) => !o && setPayLine(null)} />
    </div>
  );
}
