'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Plus, Scale, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data/data-table';
import { EmptyState } from '@/components/data/empty-state';
import type { ContactRow } from '@/lib/db/types';
import { formatMonthKeyAr } from '@/lib/utils';
import {
  ADJUSTMENT_IS_ADDITION,
  ADJUSTMENT_KIND_LABEL,
  ADJUSTMENT_STATUS_LABEL,
  payrollErrorMessage,
  useDecidePayrollAdjustment,
  usePayrollAdjustments,
  type PayrollAdjustment,
  type PayrollAdjustmentStatus,
  type PayrollSalaryStructure,
} from '@/lib/db/payroll-queries';
import { Amount, PayrollLoadError, SectionHeading, StatStrip } from './payroll-ui';
import { AdjustmentDialog, ReasonDialog } from './payroll-dialogs';

const STATUS_VARIANT: Record<PayrollAdjustmentStatus, 'warning' | 'success' | 'neutral'> = {
  DRAFT: 'warning',
  APPROVED: 'success',
  CANCELLED: 'neutral',
};

type Filter = 'ALL' | PayrollAdjustmentStatus;

export function PayrollAdjustmentsPanel({
  month,
  employees,
  structures,
  canManage,
  canApprove,
  monthLocked,
}: {
  month: string;
  employees: ContactRow[];
  structures: PayrollSalaryStructure[];
  canManage: boolean;
  canApprove: boolean;
  /** The month is posted: nothing can be added or decided. */
  monthLocked: boolean;
}) {
  const { data: rows = [], isLoading, error } = usePayrollAdjustments(month);
  const decide = useDecidePayrollAdjustment();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');

  const names = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);
  const filtered = filter === 'ALL' ? rows : rows.filter((r) => r.status === filter);
  const live = rows.filter((r) => r.status !== 'CANCELLED');
  const pending = rows.filter((r) => r.status === 'DRAFT').length;
  const totalAdd = live.filter((r) => ADJUSTMENT_IS_ADDITION[r.kind]).reduce((s, r) => s + Number(r.amount), 0);
  const totalDeduct = live.filter((r) => !ADJUSTMENT_IS_ADDITION[r.kind]).reduce((s, r) => s + Number(r.amount), 0);

  async function approve(row: PayrollAdjustment) {
    try {
      await decide.mutateAsync({ id: row.id, approve: true });
      toast.success('اعتُمدت الحركة', { description: 'تدخل كشف الشهر عند إعداده أو إعادة إعداده' });
    } catch (e) {
      toast.error('لم تُعتمد الحركة', { description: payrollErrorMessage(e) });
    }
  }

  const columns = useMemo<ColumnDef<PayrollAdjustment, any>[]>(
    () => [
      {
        id: 'employee',
        accessorFn: (r) => names.get(r.employee_id) ?? '—',
        header: 'الموظف',
        meta: { label: 'الموظف', alwaysVisible: true },
        cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
      },
      {
        id: 'kind',
        accessorFn: (r) => ADJUSTMENT_KIND_LABEL[r.kind],
        header: 'النوع',
        meta: { label: 'النوع' },
        cell: ({ row }) => (
          <Badge variant={ADJUSTMENT_IS_ADDITION[row.original.kind] ? 'success' : 'danger'}>
            {ADJUSTMENT_KIND_LABEL[row.original.kind]}
            {row.original.days ? ` · ${Number(row.original.days)} يوم` : ''}
          </Badge>
        ),
      },
      {
        id: 'reason',
        accessorKey: 'reason',
        header: 'السبب',
        meta: { label: 'السبب', cellClassName: 'max-w-88' },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="line-clamp-2">{row.original.reason}</span>
            {row.original.decision_note && (
              <span className="text-[11.5px] text-muted-foreground">ملاحظة القرار: {row.original.decision_note}</span>
            )}
          </div>
        ),
      },
      {
        id: 'amount',
        accessorFn: (r) => (ADJUSTMENT_IS_ADDITION[r.kind] ? 1 : -1) * Number(r.amount),
        header: 'المبلغ',
        meta: { label: 'المبلغ', numeric: true, alwaysVisible: true },
        cell: ({ row }) => (
          <Amount
            value={row.original.amount}
            tone={row.original.status === 'CANCELLED' ? 'default' : ADJUSTMENT_IS_ADDITION[row.original.kind] ? 'positive' : 'negative'}
            muted={row.original.status === 'CANCELLED'}
            className={row.original.status === 'CANCELLED' ? 'line-through' : undefined}
          />
        ),
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: 'الحالة',
        meta: { label: 'الحالة' },
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]}>
            {row.original.run_id ? 'دخلت الكشف' : ADJUSTMENT_STATUS_LABEL[row.original.status]}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { alwaysVisible: true, align: 'end' },
        cell: ({ row }) => {
          const r = row.original;
          if (monthLocked || r.run_id || r.status === 'CANCELLED' || !canApprove) return null;
          return (
            <div className="flex justify-end gap-1">
              {r.status === 'DRAFT' && (
                <Button size="sm" variant="outline" onClick={() => approve(r)} disabled={decide.isPending}>
                  <Check />
                  اعتمد
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setCancelId(r.id)} aria-label="ألغِ الحركة" title="ألغِ الحركة">
                <X />
                ألغِ
              </Button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [names, monthLocked, canApprove, decide.isPending],
  );

  const FILTERS: Array<{ key: Filter; label: string }> = [
    { key: 'ALL', label: 'الكل' },
    { key: 'DRAFT', label: `بانتظار الاعتماد${pending ? ` (${pending})` : ''}` },
    { key: 'APPROVED', label: 'معتمدة' },
    { key: 'CANCELLED', label: 'ملغاة' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title={`المكافآت والخصومات — ${formatMonthKeyAr(month)}`}
        description="كل حركة تُسجَّل مسودة، ويعتمدها المالك أو المدير، ثم تدخل كشف الشهر. الحركة المعتمدة لا تُعدَّل؛ تُلغى وتُسجَّل من جديد."
        actions={
          canManage && !monthLocked ? (
            <Button onClick={() => setDialogOpen(true)} disabled={employees.length === 0}>
              <Plus />
              مكافأة أو خصم
            </Button>
          ) : monthLocked ? (
            <span className="text-[12.5px] text-muted-foreground">الشهر مُرحَّل — سجّل الحركات الجديدة في الشهر التالي</span>
          ) : null
        }
      />

      {rows.length > 0 && (
        <StatStrip
          items={[
            { label: 'الحركات', value: <span className="tabular-nums">{rows.length}</span> },
            { label: 'بانتظار الاعتماد', value: <span className="tabular-nums">{pending}</span>, emphasis: pending > 0 },
            { label: 'إضافات', value: <Amount value={totalAdd} tone="positive" /> },
            { label: 'خصومات', value: <Amount value={totalDeduct} tone="negative" /> },
          ]}
        />
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="تصفية حسب الحالة">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={
                'h-8 rounded-full border px-3 text-[12.5px] transition-colors ' +
                (filter === f.key
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-ink-soft hover:bg-canvas-sunken')
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <PayrollLoadError message={payrollErrorMessage(error)} />
      ) : (
        <DataTable
          tableId="payroll-adjustments"
          data={filtered}
          columns={columns}
          getRowId={(r) => r.id}
          loading={isLoading}
          isFiltered={filter !== 'ALL'}
          empty={
            <EmptyState
              icon={Scale}
              title="لا توجد مكافآت أو خصومات لهذا الشهر"
              description="سجّل المكافأة أو العمل الإضافي أو الغياب أو الجزاء قبل إعداد الكشف."
              action={canManage && !monthLocked && employees.length > 0 ? { label: 'مكافأة أو خصم', onClick: () => setDialogOpen(true) } : undefined}
            />
          }
          noResults={<EmptyState icon={Scale} title="لا توجد حركات بهذه الحالة" />}
          renderMobileRow={(r) => (
            <div className="flex flex-col gap-1.5 p-3">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium">{names.get(r.employee_id) ?? '—'}</span>
                <Amount value={r.amount} tone={ADJUSTMENT_IS_ADDITION[r.kind] ? 'positive' : 'negative'} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={ADJUSTMENT_IS_ADDITION[r.kind] ? 'success' : 'danger'}>{ADJUSTMENT_KIND_LABEL[r.kind]}</Badge>
                <Badge variant={STATUS_VARIANT[r.status]}>{ADJUSTMENT_STATUS_LABEL[r.status]}</Badge>
              </div>
              <p className="text-[12.5px] text-muted-foreground">{r.reason}</p>
              {canApprove && !monthLocked && !r.run_id && r.status === 'DRAFT' && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => approve(r)}>
                    <Check />
                    اعتمد
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCancelId(r.id)}>
                    ألغِ
                  </Button>
                </div>
              )}
            </div>
          )}
        />
      )}

      <AdjustmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employees={employees}
        structures={structures}
        month={month}
      />

      <ReasonDialog
        open={Boolean(cancelId)}
        onOpenChange={(o) => !o && setCancelId(null)}
        title="إلغاء الحركة"
        description="تبقى الحركة في السجل بحالة «ملغاة» ولا تدخل الكشف."
        confirmLabel="ألغِ الحركة"
        onConfirm={async (reason) => {
          if (!cancelId) return;
          await decide.mutateAsync({ id: cancelId, approve: false, note: reason });
          toast.success('أُلغيت الحركة');
        }}
      />
    </div>
  );
}
