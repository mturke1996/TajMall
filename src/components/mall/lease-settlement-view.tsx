'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { DepositFigures, EndPlan, RefundPlan, Settlement, SettlementNote } from '@/lib/lease-settlement';
import { cn, formatMoney } from '@/lib/utils';

const money = (n: number) => formatMoney(n, 'LYD');

/** A long list of months shows its first rows and opens on request. */
const COLLAPSE_FROM = 8;
const FIRST_ROWS = 5;

const H3 = 'text-[13px] font-semibold text-foreground';

export function SettlementLoading() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <div className="surface divide-y divide-border overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The net in one sentence: the anchor of the statement. */
export function SettlementAnchor({ settlement, onRetry, retrying }: { settlement: Settlement; onRetry: () => void; retrying: boolean }) {
  const v = settlement.verdict;
  if (v.kind === 'unknown') {
    return (
      <section role="alert" aria-labelledby="settle-net" className="rounded-xl border border-danger-line bg-danger-soft px-4 py-4 text-danger-ink">
        <p id="settle-net" className="text-[17px] font-semibold leading-snug">
          {v.sentence}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed">{v.detail}</p>
        <Button type="button" variant="outline" className="mt-3 h-11 sm:h-9" disabled={retrying} onClick={onRetry}>
          {retrying && <Loader2 className="animate-spin" aria-hidden />}
          إعادة المحاولة
        </Button>
      </section>
    );
  }
  return (
    <section aria-labelledby="settle-net-label" className="rounded-xl border border-border bg-canvas-sunken px-4 py-4">
      <p id="settle-net-label" className="text-[12.5px] text-ink-mute">
        صافي التصفية
      </p>
      <p className="mt-1 text-[19px] font-semibold leading-snug tabular-nums text-foreground">{v.sentence}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed tabular-nums text-ink-mute">{v.detail}</p>
    </section>
  );
}

function GroupRow({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <th scope="rowgroup" colSpan={2} className="bg-canvas-sunken/50 px-4 py-1.5 text-start text-[12px] font-medium text-ink-mute">
        {children}
      </th>
    </tr>
  );
}

function FigureRow({
  label,
  sub,
  amount,
  tone,
  strong,
}: {
  label: string;
  sub?: string | null;
  amount: number;
  tone?: 'in' | 'out';
  strong?: boolean;
}) {
  return (
    <tr className="border-t border-border">
      <th scope="row" className={cn('px-4 py-2.5 text-start align-top text-foreground', strong ? 'font-semibold' : 'font-normal')}>
        {label}
        {sub && <span className="block text-[12px] font-normal text-ink-mute">{sub}</span>}
      </th>
      <td
        className={cn(
          'whitespace-nowrap px-4 py-2.5 text-end align-top tabular-nums',
          strong && 'font-semibold',
          tone === 'in' && 'text-success-ink',
          tone === 'out' && 'text-danger-ink',
        )}
      >
        {money(amount)}
      </td>
    </tr>
  );
}

function NoteRow({ children, tone = 'mute' }: { children: React.ReactNode; tone?: 'mute' | 'danger' }) {
  return (
    <tr className="border-t border-border">
      <td colSpan={2} className={cn('px-4 py-3 text-[13px]', tone === 'danger' ? 'text-danger-ink' : 'text-ink-mute')}>
        {children}
      </td>
    </tr>
  );
}

function depositSub(d: DepositFigures): string {
  const moved = `المقبوض ${money(d.received)}${d.refunded > 0 ? ` · المردود ${money(d.refunded)}` : ''}`;
  switch (d.state) {
    case 'none':
      return 'لا تأمين مقبوضاً في معاملات المستأجر. التأمين المسجَّل بقيد يومية لا يظهر هنا.';
    case 'unrecorded':
      return `في العقد ${money(d.contractAmount)} ولا قبض له في المعاملات`;
    case 'mismatch':
      return `${moved} · في العقد ${money(d.contractAmount)}`;
    default:
      return moved;
  }
}

function netCaption(s: Settlement): string {
  switch (s.verdict.kind) {
    case 'refund':
      return 'التأمين ناقص المتأخرات · للمستأجر';
    case 'owed':
      return 'التأمين ناقص المتأخرات · على المستأجر';
    case 'even':
      return 'التأمين ناقص المتأخرات · لا شيء مستحق';
    default:
      return 'غير متاح';
  }
}

/** The figures as a closing statement: arrears month by month, the deposit, the net. */
export function SettlementStatement({ settlement }: { settlement: Settlement }) {
  const [expanded, setExpanded] = useState(false);
  const { arrears, deposit, net } = settlement;
  const rows = arrears?.rows ?? [];
  const collapsible = rows.length >= COLLAPSE_FROM;
  const shown = collapsible && !expanded ? rows.slice(0, FIRST_ROWS) : rows;

  return (
    <section aria-labelledby="settle-statement-h" className="flex flex-col gap-2">
      <h3 id="settle-statement-h" className={H3}>
        كشف التصفية
      </h3>
      <div className="surface overflow-hidden">
        <table className="w-full text-[13.5px]">
          <caption className="sr-only">المتأخرات على المستأجر والتأمين المحتجز وصافي التصفية</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">البند</th>
              <th scope="col">المبلغ</th>
            </tr>
          </thead>

          <tbody>
            <GroupRow>المتأخرات على المستأجر</GroupRow>
            {arrears === null ? (
              <NoteRow tone="danger">تعذّر تحميل المطالبات، فلا تظهر المتأخرات.</NoteRow>
            ) : (
              <>
                {rows.length === 0 && <NoteRow>لا متأخرات على المستأجر.</NoteRow>}
                {shown.map((r) => (
                  <FigureRow key={r.key} label={r.label} sub={r.sub} amount={r.amount} tone="out" />
                ))}
                {collapsible && (
                  <tr className="border-t border-border">
                    <td colSpan={2} className="px-2 py-1">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 w-full justify-start text-[13px] sm:h-9"
                        aria-expanded={expanded}
                        onClick={() => setExpanded((v) => !v)}
                      >
                        {expanded ? 'إخفاء البنود' : `عرض كل البنود (${rows.length})`}
                      </Button>
                    </td>
                  </tr>
                )}
                <FigureRow label="مجموع المتأخرات" amount={arrears.total} tone={arrears.total > 0 ? 'out' : undefined} strong />
              </>
            )}
          </tbody>

          <tbody>
            <GroupRow>التأمين</GroupRow>
            {deposit === null ? (
              <NoteRow tone="danger">تعذّر تحميل المعاملات أو العقود، فلا يظهر التأمين.</NoteRow>
            ) : (
              <FigureRow label="التأمين المحتجز" sub={depositSub(deposit)} amount={deposit.held} tone={deposit.held > 0 ? 'in' : undefined} strong />
            )}
          </tbody>

          <tfoot>
            <tr className="border-t border-border bg-canvas-sunken">
              <th scope="row" className="px-4 py-3 text-start font-semibold text-foreground">
                الصافي
                <span className="block text-[12px] font-normal text-ink-mute">{netCaption(settlement)}</span>
              </th>
              <td className="whitespace-nowrap px-4 py-3 text-end align-top font-semibold tabular-nums text-foreground">
                {net == null ? '—' : money(Math.abs(net))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

/** What needs a look before the lease is ended; the last payment is context, not a fault. */
export function SettlementNotes({ notes }: { notes: SettlementNote[] }) {
  const warnings = notes.filter((n) => n.tone === 'warning');
  const infos = notes.filter((n) => n.tone === 'info');
  if (notes.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="ملاحظات قبل إنهاء العقد">
      {warnings.length > 0 && (
        <>
          <h3 className={H3}>قبل أن تنهي العقد</h3>
          <ul className="divide-y divide-warning-line overflow-hidden rounded-lg border border-warning-line bg-warning-soft">
            {warnings.map((n) => (
              <li key={n.key} className="px-3 py-2.5 text-[13px] leading-relaxed text-warning-ink">
                {n.text}
              </li>
            ))}
          </ul>
        </>
      )}
      {infos.length > 0 && (
        <ul className="flex flex-col gap-1 px-1 text-[12.5px] leading-relaxed text-ink-mute">
          {infos.map((n) => (
            <li key={n.key}>{n.text}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function EndDateSection({ plan }: { plan: EndPlan }) {
  return (
    <section aria-labelledby="settle-end-h" className="flex flex-col gap-1">
      <h3 id="settle-end-h" className={H3}>
        تاريخ الإنهاء
      </h3>
      <p className="text-[13.5px] leading-relaxed text-foreground">{plan.text}</p>
      <p className="text-[12.5px] leading-relaxed text-ink-mute">يصبح المحل متاحاً، ولا تُولَّد للمستأجر مطالبات جديدة بعد الإنهاء.</p>
    </section>
  );
}

export type RefundMode = 'net' | 'full';

/** The refund the transaction dialog is opened with: the deposit left after the arrears, or the whole of it. */
export function RefundSection({
  plan,
  mode,
  onMode,
  blocked,
}: {
  plan: RefundPlan;
  mode: RefundMode;
  onMode: (m: RefundMode) => void;
  /** why the refund cannot be prepared from here, when the figures allow it */
  blocked: string | null;
}) {
  return (
    <section aria-labelledby="settle-refund-h" className="flex flex-col gap-2">
      <h3 id="settle-refund-h" className={H3}>
        رد التأمين
      </h3>
      {!plan.available ? (
        <p className="text-[13.5px] leading-relaxed text-ink-soft">{plan.message}</p>
      ) : (
        <>
          {plan.offset > 0 ? (
            <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0" disabled={blocked != null}>
              <legend className="sr-only">كيف يُرَد التأمين</legend>
              <RefundOption
                checked={mode === 'net'}
                onSelect={() => onMode('net')}
                disabled={blocked != null}
                title={`بعد خصم المتأخرات: يُرَد ${money(plan.amount)}`}
                hint={`يبقى ${money(plan.offset)} من التأمين في الدفاتر مقابل المتأخرات.`}
              />
              <RefundOption
                checked={mode === 'full'}
                onSelect={() => onMode('full')}
                disabled={blocked != null}
                title={`${plan.limited ? 'تأمين هذا العقد كاملاً' : 'التأمين كاملاً'}: يُرَد ${money(plan.full)}`}
                hint="تبقى المتأخرات مطلوبة من المستأجر."
              />
            </fieldset>
          ) : (
            <p className="text-[13.5px] leading-relaxed text-foreground">
              {plan.limited ? 'يُرَد تأمين هذا العقد: ' : 'يُرَد التأمين كله: '}
              <span className="font-semibold tabular-nums">{money(plan.amount)}</span>
            </p>
          )}
          {blocked ? (
            <p id="settle-refund-note" role="status" className="text-[12.5px] leading-relaxed text-warning-ink">
              {blocked}
            </p>
          ) : (
            <p id="settle-refund-note" className="text-[12.5px] leading-relaxed text-ink-mute">
              لا يُرحَّل شيء من هنا. يفتح الزر نافذة المصروف مجهزة، وتراجعها قبل الحفظ.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function RefundOption({
  checked,
  onSelect,
  disabled,
  title,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  /** the refund cannot be prepared from here: the choice is shown but cannot be changed */
  disabled?: boolean;
  title: string;
  hint: string;
}) {
  return (
    <label
      className={cn(
        'flex min-h-11 items-start gap-3 rounded-lg border bg-card px-3 py-2.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/40',
        disabled ? 'cursor-default opacity-60' : 'cursor-pointer',
        checked ? 'border-foreground' : disabled ? 'border-border' : 'border-border hover:bg-canvas-sunken',
      )}
    >
      <input
        type="radio"
        name="settle-refund-mode"
        className="mt-1 size-4 shrink-0 accent-foreground"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-foreground">{title}</span>
        <span className="block text-[12.5px] leading-relaxed text-ink-mute">{hint}</span>
      </span>
    </label>
  );
}
