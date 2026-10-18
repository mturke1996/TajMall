'use client';

import { AlertTriangle, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatMonthLabelAr } from '@/lib/rent-months';
import { describeRentIssue, type RentAllocation, type RentMonthBasis } from '@/lib/rent-allocation';
import { cn, formatMoney } from '@/lib/utils';

const money = (n: number) => formatMoney(n, 'LYD');

/**
 * Shows, before saving, exactly what each selected month receives from this payment and what it will
 * read afterwards — and blocks with a one-click fix whatever the database would record wrongly.
 */
export function RentAllocationPreview({
  plan,
  basis,
  onRemoveMonth,
  onAddNextMonth,
  onSetAmount,
  className,
}: {
  plan: RentAllocation;
  basis: RentMonthBasis[];
  /** drop a month from the selection (andLater: and every month after it) */
  onRemoveMonth: (month: string, andLater: boolean) => void;
  onAddNextMonth: () => void;
  onSetAmount: (amount: number) => void;
  className?: string;
}) {
  if (plan.lines.length === 0) return null;
  const repriced = basis.filter((b) => b.repricedFrom != null);
  const applied = plan.lines.reduce((s, l) => s + l.applied, 0);

  return (
    <section className={cn('overflow-hidden rounded-xl border border-border bg-card', className)} aria-label="توزيع الدفعة على الأشهر">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-canvas-sunken/60 px-3 py-2">
        <h3 className="text-[13px] font-semibold text-foreground">توزيع الدفعة على الأشهر</h3>
        <span className="text-[12px] text-ink-mute">
          المستحق للأشهر المحددة <span className="font-semibold tabular-nums text-foreground">{money(plan.totalRemaining)}</span>
        </span>
      </header>

      <ul className="divide-y divide-border">
        {plan.lines.map((line) => {
          const after = line.paidAfter;
          const pct = line.amount > 0 ? Math.min(100, (after / line.amount) * 100) : 0;
          const before = line.amount > 0 ? Math.min(100, (line.paidBefore / line.amount) * 100) : 0;
          return (
            <li key={line.month} className="flex flex-col gap-1.5 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-foreground">{formatMonthLabelAr(line.month)}</span>
                {line.status === 'paid' ? (
                  <Badge variant="success">يُسدَّد بالكامل</Badge>
                ) : line.status === 'partial' ? (
                  <Badge variant="warning">جزئي · يبقى {money(line.amount - after)}</Badge>
                ) : (
                  <Badge variant="neutral">لا يصله شيء</Badge>
                )}
              </div>
              <div
                className="relative h-1.5 overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`${formatMonthLabelAr(line.month)}: مسدّد ${money(after)} من ${money(line.amount)}`}
              >
                <div className="absolute inset-y-0 start-0 bg-success/40" style={{ width: `${before}%` }} />
                <div
                  className={cn('absolute inset-y-0 bg-success', line.status === 'partial' && 'bg-warning')}
                  style={{ insetInlineStart: `${before}%`, width: `${Math.max(pct - before, 0)}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[12px] text-ink-mute tabular-nums">
                <span>
                  قيمة الشهر {money(line.amount)}
                  {line.paidBefore > 0 && <> · مسدّد سابقاً {money(line.paidBefore)}</>}
                </span>
                <span className="font-semibold text-foreground">من هذه الدفعة {money(line.applied)}</span>
              </div>
            </li>
          );
        })}
      </ul>

      {repriced.length > 0 && (
        <p className="flex items-start gap-1.5 border-t border-border px-3 py-2 text-[12px] text-info-ink">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {repriced.map((b) => `${formatMonthLabelAr(b.month)} ${money(b.repricedFrom!)} ← ${money(b.amount)}`).join('، ')} — يُحدَّث
            السعر حسب جدول الأسعار عند التسجيل.
          </span>
        </p>
      )}

      {plan.issues.length > 0 ? (
        <div className="space-y-2 border-t border-danger-line bg-danger-soft/60 px-3 py-2.5" role="alert">
          {plan.issues.map((issue, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <p className="flex items-start gap-1.5 text-[12.5px] text-danger-ink">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{describeRentIssue(issue, formatMonthLabelAr)}</span>
              </p>
              <div className="flex flex-wrap gap-1.5 ps-5">
                {issue.code === 'overpaid' && (
                  <>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={onAddNextMonth}>
                      أضف الشهر التالي
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => onSetAmount(plan.totalRemaining)}>
                      اجعل المبلغ {money(plan.totalRemaining)}
                    </Button>
                  </>
                )}
                {(issue.code === 'does_not_reach' || issue.code === 'already_paid') && (
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => onRemoveMonth(issue.month, issue.code === 'does_not_reach')}>
                    {issue.code === 'does_not_reach' ? `أزل ${formatMonthLabelAr(issue.month)} وما بعده` : `أزل ${formatMonthLabelAr(issue.month)}`}
                  </Button>
                )}
                {issue.code === 'does_not_reach' && plan.totalRemaining > 0 && (
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => onSetAmount(plan.totalRemaining)}>
                    ادفع كامل المستحق {money(plan.totalRemaining)}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="border-t border-border bg-success-soft/50 px-3 py-2 text-[12px] text-success-ink">
          يُربط {money(applied)} بالأشهر أعلاه{plan.leftover > 0 ? '.' : ' في قيد الإيراد نفسه، ولا يبقى شيء بلا شهر.'}
        </p>
      )}
    </section>
  );
}
