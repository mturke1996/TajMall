'use client';

import { useRef, useState } from 'react';
import { ChevronDown, HandCoins, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CHIP, EmptyBlock, ErrorBlock, LoadingBlock } from '@/components/people';
import { DbUpdateNotice, Lead } from '@/components/employees/profile-shell';
import type { EmployeeProfileData } from '@/components/employees/use-employee-profile';
import { monthsLabel, ReasonDialog } from '@/components/payroll/payroll-dialogs';
import { ADVANCE_STATUS_LABEL, useCancelPayrollAdvance, type PayrollAdvance, type PayrollAdvanceStatus } from '@/lib/db/payroll-queries';
import { cn, formatDate, formatMoney } from '@/lib/utils';

const STATUS_BADGE: Record<PayrollAdvanceStatus, 'warning' | 'success' | 'neutral'> = { OPEN: 'warning', SETTLED: 'success', CANCELLED: 'neutral' };
const num = (v: string | number | null | undefined) => Number(v) || 0;

/** One cell per instalment, filled by what was repaid: the first instalment first, in reading order. */
function InstallmentBar({ advance }: { advance: PayrollAdvance }) {
  const count = Math.max(1, advance.installments);
  const each = num(advance.installment_amount) || num(advance.amount) / count;
  const repaid = num(advance.repaid);
  if (count > 24) {
    const share = num(advance.amount) > 0 ? Math.min(100, (repaid / num(advance.amount)) * 100) : 0;
    return (
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`سُدّد ${Math.round(share)}% من السلفة`}>
        <div className="h-full rounded-full bg-chart-amber" style={{ width: `${share}%` }} />
      </div>
    );
  }
  const paidInstalments = each > 0 ? Math.min(count, Math.floor(repaid / each + 0.0005)) : 0;
  return (
    <div className="flex gap-1" role="img" aria-label={`سُدّد ${paidInstalments} من ${count} أقساط`}>
      {Array.from({ length: count }, (_, i) => {
        const fill = each > 0 ? Math.min(1, Math.max(0, (repaid - i * each) / each)) : 0;
        return (
          <span key={i} className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-chart-amber" style={{ width: `${fill * 100}%` }} />
          </span>
        );
      })}
    </div>
  );
}

function AdvanceCard({ advance, onCancel }: { advance: PayrollAdvance; onCancel?: (e: HTMLElement) => void }) {
  const open = advance.status === 'OPEN';
  return (
    <article className={cn('rounded-xl border border-border bg-card p-4 shadow-whisper sm:p-5', !open && 'bg-canvas-sunken/60 shadow-none')}>
      <div className="flex items-start gap-3">
        <span aria-hidden className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', open ? 'bg-chart-amber/15 text-chart-amber' : 'bg-muted text-ink-mute')}>
          <HandCoins className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[15px] font-bold tabular-nums">{formatMoney(num(advance.amount), 'LYD')}</h3>
            <Badge variant={STATUS_BADGE[advance.status]}>{ADVANCE_STATUS_LABEL[advance.status]}</Badge>
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-mute">
            صُرفت {formatDate(advance.issued_on)} · {advance.reason}
          </p>
          {advance.status === 'CANCELLED' && advance.cancel_reason && <p className="mt-0.5 text-[12.5px] text-ink-mute">سبب الإلغاء: {advance.cancel_reason}</p>}
        </div>
      </div>

      {advance.status !== 'CANCELLED' && (
        <>
          <div className="mt-4">
            <InstallmentBar advance={advance} />
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-[12.5px]">
            <div>
              <dt className="text-ink-mute">سُدّد</dt>
              <dd className="mt-0.5 text-[13.5px] font-semibold tabular-nums">{formatMoney(num(advance.repaid), 'LYD')}</dd>
            </div>
            <div>
              <dt className="text-ink-mute">المتبقي</dt>
              <dd className={cn('mt-0.5 text-[13.5px] font-semibold tabular-nums', open && 'text-warning-ink')}>{formatMoney(num(advance.remaining), 'LYD')}</dd>
            </div>
            <div>
              <dt className="text-ink-mute">القسط</dt>
              <dd className="mt-0.5 text-[13.5px] font-semibold tabular-nums">
                {formatMoney(num(advance.installment_amount), 'LYD')}
                <span className="block text-[12px] font-normal text-ink-mute">{monthsLabel(advance.installments)}</span>
              </dd>
            </div>
          </dl>
        </>
      )}

      {onCancel && open && num(advance.repaid) < 0.0005 && (
        <div className="mt-3 border-t border-border pt-3">
          <Button type="button" size="sm" variant="ghost" className="min-h-11 sm:min-h-8" onClick={(e) => onCancel(e.currentTarget)}>
            ألغِ السلفة
          </Button>
        </div>
      )}
    </article>
  );
}

export function AdvancesTab({ data, onAdd }: { data: EmployeeProfileData; onAdd?: () => void }) {
  const { advances, parts, kpis, powers, canManage } = data;
  const cancel = useCancelPayrollAdvance();
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  const open = advances.filter((a) => a.status === 'OPEN');
  const closed = advances.filter((a) => a.status !== 'OPEN');

  if (parts.advances.missing) return <DbUpdateNotice what="payroll" />;

  const addButton =
    canManage && onAdd ? (
      <Button type="button" className="min-h-11 gap-1.5 sm:min-h-9" onClick={onAdd}>
        <Plus aria-hidden />
        صرف سلفة
      </Button>
    ) : undefined;

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">السلف</h2>
          <Lead>تُصرف السلفة من الخزينة فوراً، ويُستقطع قسطها من كشف كل شهر حتى تُسدَّد.</Lead>
        </div>
        {addButton}
      </div>

      {parts.advances.loading ? (
        <Card>
          <LoadingBlock rows={3} />
        </Card>
      ) : parts.advances.error ? (
        <Card>
          <ErrorBlock message="تعذّر تحميل السلف. أعد المحاولة." onRetry={parts.advances.retry} />
        </Card>
      ) : advances.length === 0 ? (
        <Card>
          <EmptyBlock action={addButton}>لا سلف على هذا الموظف.</EmptyBlock>
        </Card>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className={cn('min-w-0 rounded-xl border p-3 sm:p-4', open.length > 0 ? CHIP.warning : CHIP.neutral)}>
              <dt className="text-[12px]">رصيد السلف</dt>
              <dd className="mt-1 break-words text-[15px] font-bold tabular-nums sm:text-[18px]">{formatMoney(kpis.advance.balance, 'LYD')}</dd>
            </div>
            <div className={cn('min-w-0 rounded-xl border p-3 sm:p-4', CHIP.neutral)}>
              <dt className="text-[12px]">الأقساط الشهرية</dt>
              <dd className="mt-1 break-words text-[15px] font-bold tabular-nums sm:text-[18px]">{formatMoney(kpis.advance.monthly, 'LYD')}</dd>
            </div>
            <div className={cn('min-w-0 rounded-xl border p-3 sm:p-4', CHIP.neutral)}>
              <dt className="text-[12px]">سلف قائمة</dt>
              <dd className="mt-1 text-[15px] font-bold tabular-nums sm:text-[18px]">{kpis.advance.open}</dd>
            </div>
          </dl>

          {open.length === 0 && <p className="text-[13px] text-ink-mute">لا توجد سلف قائمة.</p>}
          <ul className="grid gap-3 lg:grid-cols-2">
            {open.map((a) => (
              <li key={a.id}>
                <AdvanceCard
                  advance={a}
                  onCancel={
                    powers.canApprove
                      ? (el) => {
                          opener.current = el;
                          setCancelId(a.id);
                        }
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>

          {closed.length > 0 && (
            <>
              <button
                type="button"
                aria-expanded={showClosed}
                onClick={() => setShowClosed((v) => !v)}
                className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-md text-[13px] font-medium text-ink-soft hover:text-foreground sm:min-h-8"
              >
                <ChevronDown className={cn('h-4 w-4 transition-transform', showClosed && 'rotate-180')} aria-hidden />
                {showClosed ? 'إخفاء' : 'عرض'} السلف المسددة والملغاة ({closed.length})
              </button>
              {showClosed && (
                <ul className="grid gap-3 lg:grid-cols-2">
                  {closed.map((a) => (
                    <li key={a.id}>
                      <AdvanceCard advance={a} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}

      <ReasonDialog
        open={Boolean(cancelId)}
        onOpenChange={(o) => !o && setCancelId(null)}
        title="إلغاء السلفة"
        description="تُحذف حركة الصرف من الخزينة ويُعكس قيدها. لا تُلغى سلفة خُصم منها أي قسط."
        confirmLabel="ألغِ السلفة"
        returnFocusTo={opener}
        onConfirm={async (reason) => {
          if (!cancelId) return;
          await cancel.mutateAsync({ id: cancelId, reason });
          toast.success('أُلغيت السلفة', { description: 'عاد المبلغ إلى رصيد الخزينة' });
        }}
      />
    </>
  );
}
