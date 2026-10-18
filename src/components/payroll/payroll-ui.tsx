'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Check, ChevronLeft, ChevronRight, DatabaseZap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, formatMonthKeyAr } from '@/lib/utils';
import { currentMonthKey, shiftMonth, type PayrollRunStatus } from '@/lib/db/payroll-queries';
import type { ContactRow } from '@/lib/db/types';

const amountFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

/** An amount in dinars with tabular digits, kept left-to-right so the sign and currency never flip. */
export function Amount({
  value,
  tone = 'default',
  muted,
  className,
  hideZero,
}: {
  value: number | string | null | undefined;
  tone?: 'default' | 'positive' | 'negative';
  muted?: boolean;
  className?: string;
  /** Shows a dash instead of 0, so columns with few values stay readable. */
  hideZero?: boolean;
}) {
  const n = Number(value) || 0;
  if (hideZero && Math.abs(n) < 0.0005) {
    return <span className={cn('text-ink-mute', className)}>—</span>;
  }
  return (
    <span
      dir="ltr"
      className={cn(
        'inline-block whitespace-nowrap font-medium tabular-nums',
        tone === 'positive' && 'text-pastel-greenInk dark:text-emerald-400',
        tone === 'negative' && 'text-pastel-redInk dark:text-rose-400',
        muted && 'font-normal text-ink-mute',
        className,
      )}
    >
      {amountFormatter.format(n)}
      <span className="ms-1 text-[0.8em] font-normal text-ink-mute">د.ل</span>
    </span>
  );
}

export type StatItem = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  emphasis?: boolean;
};

/** A row of figures separated by hairlines — the numbers carry the screen, not decoration. */
export function StatStrip({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card',
        items.length >= 5 ? 'lg:grid-cols-5' : items.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
        className,
      )}
    >
      {items.map((item, i) => (
        <div
          key={item.label}
          className={cn(
            'flex min-w-0 flex-col gap-1 px-4 py-3.5 sm:px-5',
            // hairline dividers that work for 2 columns on phones and one row on desktop
            i % 2 === 1 && 'border-s border-border',
            i >= 2 && 'border-t border-border lg:border-t-0',
            i > 0 && 'lg:border-s',
            // an odd last figure takes the whole row on phones instead of leaving a gap
            items.length % 2 === 1 && i === items.length - 1 && 'col-span-2 lg:col-span-1',
            item.emphasis && 'bg-canvas-sunken/60',
          )}
        >
          <dt className="text-[12px] text-muted-foreground">{item.label}</dt>
          <dd className={cn('min-w-0 truncate text-[17px] leading-tight sm:text-[19px]', item.emphasis && 'font-semibold')}>
            {item.value}
          </dd>
          {item.hint && <dd className="text-[11.5px] text-muted-foreground">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Previous / next month with the month name between them. Arrows follow the reading direction. */
export function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const isCurrent = month === currentMonthKey();
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="الشهر السابق"
        title="الشهر السابق"
      >
        <ChevronRight />
      </Button>
      <span className="min-w-[7.5rem] text-center text-[13.5px] font-semibold tabular-nums">{formatMonthKeyAr(month)}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onChange(shiftMonth(month, 1))}
        aria-label="الشهر التالي"
        title="الشهر التالي"
      >
        <ChevronLeft />
      </Button>
      {!isCurrent && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(currentMonthKey())}>
          الشهر الحالي
        </Button>
      )}
    </div>
  );
}

const RUN_STEPS: Array<{ key: string; label: string }> = [
  { key: 'prepare', label: 'إعداد الكشف' },
  { key: 'approve', label: 'الاعتماد' },
  { key: 'post', label: 'الترحيل للدفاتر' },
  { key: 'pay', label: 'صرف الرواتب' },
];

/** Where the month stands: prepared → approved → posted → paid. */
export function RunSteps({
  status,
  fullyPaid,
}: {
  status: PayrollRunStatus | null;
  fullyPaid: boolean;
}) {
  const done =
    status === null ? 0 : status === 'DRAFT' ? 1 : status === 'APPROVED' ? 2 : fullyPaid ? 4 : 3;
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[12.5px]" aria-label="مراحل كشف الرواتب">
      {RUN_STEPS.map((step, i) => {
        const complete = i < done;
        const current = i === done;
        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              className={cn(
                'grid h-6 w-6 place-items-center rounded-full border text-[11px] font-semibold tabular-nums',
                complete && 'border-foreground bg-foreground text-background',
                current && 'border-foreground text-foreground',
                !complete && !current && 'border-border text-ink-mute',
              )}
              aria-hidden
            >
              {complete ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn(complete || current ? 'text-foreground' : 'text-ink-mute', current && 'font-semibold')}>
              {step.label}
            </span>
            {i < RUN_STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

export function FormField({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-[12.5px]">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11.5px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function EmployeeSelect({
  employees,
  value,
  onChange,
  id,
  disabled,
}: {
  employees: Pick<ContactRow, 'id' | 'name' | 'job_title'>[];
  value: string;
  onChange: (id: string) => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue placeholder="اختر الموظف" />
      </SelectTrigger>
      <SelectContent>
        {employees.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.name}
            {e.job_title ? <span className="ms-1.5 text-muted-foreground">— {e.job_title}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Shown instead of the payroll screens until migration 080 is applied to the database. */
export function PayrollSchemaMissing() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-5 rounded-xl border border-border bg-card p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-canvas-sunken text-muted-foreground">
          <DatabaseZap className="h-5 w-5 stroke-[1.5]" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[16px] font-semibold">وحدة الرواتب جاهزة في الواجهة ولم تُفعَّل في قاعدة البيانات بعد</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            تعمل هذه الشاشات على جداول ودوال الترحيل <span dir="ltr" className="font-mono">080_payroll</span>، وهو
            مُختبَر على نسخة مطابقة ولم يُطبَّق على قاعدة البيانات الحقيقية. بعد تطبيقه (ويسبقه الترحيل 078) تظهر هنا
            مباشرة دون أي تحديث للتطبيق.
          </p>
        </div>
      </div>
      <ul className="grid gap-2 text-[13px] sm:grid-cols-2">
        {[
          'هيكل راتب لكل موظف بتاريخ سريان وسجل تغييرات',
          'مكافآت وعمل إضافي وخصومات وغياب باعتماد',
          'سلف بأقساط تُستقطع تلقائياً من الكشف',
          'كشف شهري: إعداد ثم اعتماد ثم ترحيل ثم صرف',
          'قيد محاسبي واحد متوازن لكل شهر',
          'قسيمة راتب وكشف مجمع بصيغة PDF',
        ].map((line) => (
          <li key={line} className="flex items-start gap-2 text-ink-soft">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            {line}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/mall?tab=people&segment=EMPLOYEE">دليل الموظفين</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/reports/employee-spend">تقرير إنفاق الموظفين</Link>
        </Button>
      </div>
    </section>
  );
}

/** A quiet inline message for a failed load that is not the missing schema. */
export function PayrollLoadError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-pastel-redInk/20 bg-pastel-red px-4 py-3 text-[13px] text-pastel-redInk dark:bg-rose-950/30 dark:text-rose-300">
      {message}
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description && <p className="text-[12.5px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
