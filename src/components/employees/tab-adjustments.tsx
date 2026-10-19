'use client';

import { useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CHIP, EmptyBlock, ErrorBlock, LoadingBlock } from '@/components/people';
import { DbUpdateNotice, LogGroups, Lead } from '@/components/employees/profile-shell';
import type { EmployeeProfileData } from '@/components/employees/use-employee-profile';
import { ReasonDialog } from '@/components/payroll/payroll-dialogs';
import {
  ADJUSTMENT_KIND_LABEL,
  ADJUSTMENT_STATUS_LABEL,
  payrollErrorMessage,
  useDecidePayrollAdjustment,
  type PayrollAdjustment,
  type PayrollAdjustmentStatus,
} from '@/lib/db/payroll-queries';
import { isAdditionKind, localDayOf, monthKeyOf } from '@/lib/employees/employee-profile';
import { arabicCount, cn, formatDate, formatMonthKeyAr, formatMoney } from '@/lib/utils';

type Filter = 'ALL' | PayrollAdjustmentStatus;

const STATUS_BADGE: Record<PayrollAdjustmentStatus, 'warning' | 'success' | 'neutral'> = { DRAFT: 'warning', APPROVED: 'success', CANCELLED: 'neutral' };

export function AdjustmentsTab({ data, onAdd }: { data: EmployeeProfileData; onAdd?: () => void }) {
  const { adjustments, parts, powers, canManage } = data;
  const decide = useDecidePayrollAdjustment();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const cancelOpener = useRef<HTMLElement | null>(null);

  const live = adjustments.filter((a) => a.status !== 'CANCELLED');
  const sum = (rows: PayrollAdjustment[]) => rows.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const approved = adjustments.filter((a) => a.status === 'APPROVED');
  const pending = adjustments.filter((a) => a.status === 'DRAFT');
  const additions = sum(approved.filter((a) => isAdditionKind(a.kind)));
  const deductions = sum(approved.filter((a) => !isAdditionKind(a.kind)));
  const counts: Record<Filter, number> = { ALL: adjustments.length, DRAFT: pending.length, APPROVED: approved.length, CANCELLED: adjustments.length - live.length };

  const shown = useMemo(() => (filter === 'ALL' ? adjustments : adjustments.filter((a) => a.status === filter)), [adjustments, filter]);
  const groups = useMemo(() => {
    const byMonth = new Map<string, PayrollAdjustment[]>();
    for (const a of shown) {
      const key = monthKeyOf(a.period_month);
      byMonth.set(key, [...(byMonth.get(key) ?? []), a]);
    }
    return [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, items]) => ({ key: month, title: `راتب ${formatMonthKeyAr(month)}`, items }));
  }, [shown]);

  async function approve(a: PayrollAdjustment) {
    if (busyId) return;
    setBusyId(a.id);
    try {
      await decide.mutateAsync({ id: a.id, approve: true });
      toast.success('اعتُمدت الحركة', { description: 'تدخل كشف الشهر عند إعداده أو إعادة إعداده' });
    } catch (e) {
      toast.error('لم تُعتمد الحركة', { description: payrollErrorMessage(e) });
    } finally {
      setBusyId(null);
    }
  }

  if (parts.adjustments.missing) return <DbUpdateNotice what="payroll" />;

  const FILTERS: Array<{ key: Filter; label: string }> = [
    { key: 'ALL', label: 'الكل' },
    { key: 'DRAFT', label: 'بانتظار الاعتماد' },
    { key: 'APPROVED', label: 'معتمدة' },
    { key: 'CANCELLED', label: 'ملغاة' },
  ];

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">المكافآت والخصومات</h2>
          <Lead>تُسجَّل كل حركة بانتظار اعتماد المالك أو المدير، وتدخل كشف شهرها بعد اعتمادها.</Lead>
        </div>
        {canManage && onAdd && (
          <Button type="button" className="min-h-11 gap-1.5 sm:min-h-9" onClick={onAdd}>
            <Plus aria-hidden />
            مكافأة أو خصم
          </Button>
        )}
      </div>

      {parts.adjustments.loading ? (
        <Card>
          <LoadingBlock rows={4} />
        </Card>
      ) : parts.adjustments.error ? (
        <Card>
          <ErrorBlock message="تعذّر تحميل المكافآت والخصومات. أعد المحاولة." onRetry={parts.adjustments.retry} />
        </Card>
      ) : adjustments.length === 0 ? (
        <Card>
          {/* the button above already adds one: no second copy of it here */}
          <EmptyBlock>لا توجد مكافآت أو خصومات لهذا الموظف.</EmptyBlock>
        </Card>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className={cn('min-w-0 rounded-xl border p-3 sm:p-4', CHIP.success)}>
              <dt className="text-[12px]">إضافات معتمدة</dt>
              <dd className="mt-1 break-words text-[15px] font-bold tabular-nums sm:text-[18px]">{formatMoney(additions, 'LYD')}</dd>
            </div>
            <div className={cn('min-w-0 rounded-xl border p-3 sm:p-4', CHIP.danger)}>
              <dt className="text-[12px]">خصومات معتمدة</dt>
              <dd className="mt-1 break-words text-[15px] font-bold tabular-nums sm:text-[18px]">{formatMoney(deductions, 'LYD')}</dd>
            </div>
            <div className={cn('min-w-0 rounded-xl border p-3 sm:p-4', pending.length > 0 ? CHIP.warning : CHIP.neutral)}>
              <dt className="text-[12px]">بانتظار الاعتماد</dt>
              <dd className="mt-1 text-[15px] font-bold tabular-nums sm:text-[18px]">{pending.length}</dd>
            </div>
          </dl>

          <div role="group" aria-label="تصفية الحركات" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {FILTERS.filter((f) => f.key === 'ALL' || counts[f.key] > 0 || filter === f.key).map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors sm:min-h-8',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  filter === f.key ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-ink-soft hover:bg-canvas-sunken',
                )}
              >
                {f.label}
                <span className={cn('text-[12px] tabular-nums', filter === f.key ? 'text-background/70' : 'text-ink-mute')}>{counts[f.key]}</span>
              </button>
            ))}
          </div>

          <LogGroups
            groups={groups}
            getKey={(a) => a.id}
            renderRow={(a) => {
              const adds = isAdditionKind(a.kind);
              const cancelled = a.status === 'CANCELLED';
              const locked = Boolean(a.run_id);
              const days = Number(a.days) || 0;
              return (
                <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                  <span
                    aria-hidden
                    className={cn(
                      'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                      cancelled ? 'bg-muted text-ink-mute' : adds ? 'bg-chart-green/15 text-chart-green' : 'bg-chart-red/15 text-chart-red',
                    )}
                  >
                    {adds ? <ArrowUpRight className="h-[18px] w-[18px]" /> : <ArrowDownLeft className="h-[18px] w-[18px]" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[14px] font-semibold">{ADJUSTMENT_KIND_LABEL[a.kind]}</span>
                      {days > 0 && <span className="text-[12.5px] text-ink-mute">{arabicCount(days, ['يوم', 'يومان', 'أيام', 'يوماً'])}</span>}
                      <Badge variant={STATUS_BADGE[a.status]}>{locked ? 'دخلت الكشف' : ADJUSTMENT_STATUS_LABEL[a.status]}</Badge>
                    </div>
                    <p className="mt-1 break-words text-[13px] text-ink-soft">{a.reason}</p>
                    <p className="mt-0.5 text-[12px] text-ink-mute">
                      سُجّلت {formatDate(localDayOf(a.created_at))}
                      {a.decision_note ? ` · ملاحظة القرار: ${a.decision_note}` : ''}
                    </p>
                    {powers.canApprove && !locked && !cancelled && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {a.status === 'DRAFT' && (
                          <Button type="button" size="sm" variant="outline" className="min-h-11 gap-1 sm:min-h-8" disabled={busyId === a.id} onClick={() => void approve(a)}>
                            <Check aria-hidden />
                            اعتمد
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="min-h-11 gap-1 sm:min-h-8"
                          onClick={(e) => {
                            cancelOpener.current = e.currentTarget;
                            setCancelId(a.id);
                          }}
                        >
                          <X aria-hidden />
                          ألغِ
                        </Button>
                      </div>
                    )}
                  </div>
                  <p
                    className={cn(
                      'shrink-0 pt-0.5 text-[14.5px] font-bold tabular-nums',
                      cancelled ? 'text-ink-mute line-through' : adds ? 'text-success-ink' : 'text-danger-ink',
                    )}
                  >
                    {formatMoney(adds ? Number(a.amount) : -Number(a.amount), 'LYD', { signed: adds })}
                  </p>
                </div>
              );
            }}
          />
        </>
      )}

      <ReasonDialog
        open={Boolean(cancelId)}
        onOpenChange={(o) => !o && setCancelId(null)}
        title="إلغاء الحركة"
        description="تبقى الحركة في السجل بحالة «ملغاة» ولا تدخل الكشف."
        confirmLabel="ألغِ الحركة"
        returnFocusTo={cancelOpener}
        onConfirm={async (reason) => {
          if (!cancelId) return;
          await decide.mutateAsync({ id: cancelId, approve: false, note: reason });
          toast.success('أُلغيت الحركة');
        }}
      />
    </>
  );
}
