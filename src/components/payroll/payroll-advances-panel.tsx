'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { HandCoins, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { DataTable } from '@/components/data/data-table';
import { EmptyState } from '@/components/data/empty-state';
import type { ContactRow } from '@/lib/db/types';
import { formatDate } from '@/lib/utils';
import {
  ADVANCE_STATUS_LABEL,
  payrollErrorMessage,
  useCancelPayrollAdvance,
  usePayrollAdvances,
  type PayrollAdvance,
  type PayrollAdvanceStatus,
} from '@/lib/db/payroll-queries';
import { Amount, PayrollLoadError, SectionHeading, StatStrip } from './payroll-ui';
import { AdvanceDialog, ReasonDialog, monthsLabel } from './payroll-dialogs';

const STATUS_VARIANT: Record<PayrollAdvanceStatus, 'warning' | 'success' | 'neutral'> = {
  OPEN: 'warning',
  SETTLED: 'success',
  CANCELLED: 'neutral',
};

function repaidShare(a: PayrollAdvance) {
  const amount = Number(a.amount) || 0;
  return amount > 0 ? Math.min(100, (Number(a.repaid) / amount) * 100) : 0;
}

export function PayrollAdvancesPanel({
  employees,
  canManage,
  canApprove,
}: {
  employees: ContactRow[];
  canManage: boolean;
  canApprove: boolean;
}) {
  const { data: rows = [], isLoading, error } = usePayrollAdvances();
  const cancel = useCancelPayrollAdvance();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const open = rows.filter((a) => a.status === 'OPEN');
  const visible = showClosed ? rows : open;
  const outstanding = open.reduce((s, a) => s + Number(a.remaining), 0);
  const monthlyInstalments = open.reduce((s, a) => s + Math.min(Number(a.installment_amount), Number(a.remaining)), 0);

  const columns = useMemo<ColumnDef<PayrollAdvance, any>[]>(
    () => [
      {
        id: 'employee',
        accessorKey: 'employee_name',
        header: 'الموظف',
        meta: { label: 'الموظف', alwaysVisible: true },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <Link href={`/payroll/employees/${row.original.employee_id}`} className="font-medium hover:underline">
              {row.original.employee_name}
            </Link>
            <span className="line-clamp-1 text-[11.5px] text-muted-foreground">{row.original.reason}</span>
          </div>
        ),
      },
      {
        id: 'issued',
        accessorKey: 'issued_on',
        header: 'تاريخ الصرف',
        meta: { label: 'تاريخ الصرف' },
        cell: ({ getValue }) => <span className="tabular-nums text-ink-soft">{formatDate(getValue())}</span>,
      },
      {
        id: 'amount',
        accessorFn: (a) => Number(a.amount),
        header: 'المبلغ',
        meta: { label: 'المبلغ', numeric: true },
        cell: ({ getValue }) => <Amount value={getValue()} />,
      },
      {
        id: 'installment',
        accessorFn: (a) => Number(a.installment_amount),
        header: 'القسط',
        meta: { label: 'القسط', numeric: true },
        cell: ({ row, getValue }) => (
          <div className="flex flex-col items-end">
            <Amount value={getValue()} />
            <span className="text-[11px] text-muted-foreground">{monthsLabel(row.original.installments)}</span>
          </div>
        ),
      },
      {
        id: 'progress',
        accessorFn: repaidShare,
        header: 'السداد',
        meta: { label: 'السداد' },
        cell: ({ row }) => (
          <div className="flex min-w-32 flex-col gap-1">
            <Progress value={repaidShare(row.original)} className="h-1.5" aria-label={`نسبة سداد سلفة ${row.original.employee_name}`} />
            <span className="text-[11.5px] text-muted-foreground">
              سُدّد <Amount value={row.original.repaid} muted className="text-[11.5px]" />
            </span>
          </div>
        ),
      },
      {
        id: 'remaining',
        accessorFn: (a) => Number(a.remaining),
        header: 'المتبقي',
        meta: { label: 'المتبقي', numeric: true, alwaysVisible: true },
        cell: ({ row, getValue }) =>
          row.original.status === 'OPEN' ? <Amount value={getValue()} className="font-semibold" /> : <Badge variant={STATUS_VARIANT[row.original.status]}>{ADVANCE_STATUS_LABEL[row.original.status]}</Badge>,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { alwaysVisible: true, align: 'end' },
        cell: ({ row }) =>
          canApprove && row.original.status === 'OPEN' && Number(row.original.repaid) < 0.0005 ? (
            <Button size="sm" variant="ghost" onClick={() => setCancelId(row.original.id)}>
              ألغِ
            </Button>
          ) : null,
      },
    ],
    [canApprove],
  );

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title="السلف"
        description="تُصرف السلفة من الخزينة فوراً، ويُستقطع قسطها من كشف كل شهر حتى تُسدَّد، على ألا ينزل صافي الراتب تحت الصفر."
        actions={
          canManage ? (
            <Button onClick={() => setDialogOpen(true)} disabled={employees.length === 0}>
              <Plus />
              صرف سلفة
            </Button>
          ) : null
        }
      />

      {rows.length > 0 && (
        <StatStrip
          items={[
            { label: 'سلف قائمة', value: <span className="tabular-nums">{open.length}</span> },
            { label: 'الرصيد المتبقي', value: <Amount value={outstanding} />, emphasis: true },
            { label: 'أقساط الشهر القادم', value: <Amount value={monthlyInstalments} /> },
          ]}
        />
      )}

      {rows.length > open.length && (
        <label className="flex items-center gap-2 self-start text-[12.5px] text-ink-soft">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="h-4 w-4 accent-foreground" />
          إظهار السلف المسددة والملغاة ({rows.length - open.length})
        </label>
      )}

      {error ? (
        <PayrollLoadError message={payrollErrorMessage(error)} />
      ) : (
        <DataTable
          tableId="payroll-advances"
          data={visible}
          columns={columns}
          getRowId={(a) => a.id}
          loading={isLoading}
          isFiltered={!showClosed && rows.length > 0}
          initialSorting={[{ id: 'issued', desc: true }]}
          empty={
            <EmptyState
              icon={HandCoins}
              title="لا توجد سلف"
              description="تظهر السلفة هنا برصيدها المتبقي وأقساطها بعد صرفها."
              action={canManage && employees.length > 0 ? { label: 'صرف سلفة', onClick: () => setDialogOpen(true) } : undefined}
            />
          }
          noResults={<EmptyState icon={HandCoins} title="لا توجد سلف قائمة" description="كل السلف مسددة أو ملغاة." />}
          renderMobileRow={(a) => (
            <div className="flex flex-col gap-2 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col">
                  <Link href={`/payroll/employees/${a.employee_id}`} className="font-medium hover:underline">
                    {a.employee_name}
                  </Link>
                  <span className="text-[11.5px] text-muted-foreground">{formatDate(a.issued_on)}</span>
                </div>
                <Badge variant={STATUS_VARIANT[a.status]}>{ADVANCE_STATUS_LABEL[a.status]}</Badge>
              </div>
              <Progress value={repaidShare(a)} className="h-1.5" aria-label={`نسبة سداد سلفة ${a.employee_name}`} />
              <div className="flex justify-between text-[12px] text-muted-foreground">
                <span>المبلغ <Amount value={a.amount} muted /></span>
                <span>المتبقي <Amount value={a.remaining} /></span>
              </div>
            </div>
          )}
        />
      )}

      <AdvanceDialog open={dialogOpen} onOpenChange={setDialogOpen} employees={employees} />

      <ReasonDialog
        open={Boolean(cancelId)}
        onOpenChange={(o) => !o && setCancelId(null)}
        title="إلغاء السلفة"
        description="تُحذف حركة الصرف من الخزينة ويُعكس قيدها. لا تُلغى سلفة خُصم منها أي قسط."
        confirmLabel="ألغِ السلفة"
        onConfirm={async (reason) => {
          if (!cancelId) return;
          await cancel.mutateAsync({ id: cancelId, reason });
          toast.success('أُلغيت السلفة', { description: 'عاد المبلغ إلى رصيد الخزينة' });
        }}
      />
    </div>
  );
}
