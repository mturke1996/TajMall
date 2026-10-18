'use client';

import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  CircleMinus,
  Clock,
  Contrast,
  type LucideIcon,
} from 'lucide-react';
import type { RentAccountMonth, RentAccountMonthKind } from '@/lib/tenant-rent-account';
import { formatMonthLabelAr, monthNameAr } from '@/lib/rent-months';
import { cn, formatMoney } from '@/lib/utils';

export const RENT_ACCOUNT_KIND: Record<
  RentAccountMonthKind,
  { label: string; icon: LucideIcon; ink: string; cell: string; bar: string; swatch: string }
> = {
  paid: {
    label: 'مدفوع',
    icon: CheckCircle2,
    ink: 'text-success-ink',
    cell: 'border-success-line bg-success-soft/45',
    bar: 'bg-success',
    swatch: 'border-success-line bg-success-soft',
  },
  partial: {
    label: 'جزئي',
    icon: Contrast,
    ink: 'text-warning-ink',
    cell: 'border-warning-line bg-warning-soft/45',
    bar: 'bg-warning',
    swatch: 'border-warning-line bg-warning-soft',
  },
  due: {
    label: 'غير مدفوع',
    icon: AlertCircle,
    ink: 'text-danger-ink',
    cell: 'border-danger-line bg-danger-soft/40',
    bar: 'bg-danger',
    swatch: 'border-danger-line bg-danger-soft',
  },
  uncharged: {
    label: 'مستحق بلا مطالبة مسجّلة',
    icon: CircleDashed,
    ink: 'text-danger-ink',
    cell: 'border-dashed border-danger-line bg-card',
    bar: 'bg-danger',
    swatch: 'border-dashed border-danger-line bg-card',
  },
  upcoming: {
    label: 'قادم',
    icon: Clock,
    ink: 'text-ink-mute',
    cell: 'border-border bg-card',
    bar: 'bg-success',
    swatch: 'border-border bg-card',
  },
  exempt: {
    label: 'مستبعد',
    icon: CircleMinus,
    ink: 'text-ink-mute',
    cell: 'border-dashed border-border bg-canvas-sunken/70',
    bar: 'bg-muted',
    swatch: 'border-dashed border-border bg-canvas-sunken',
  },
  no_price: {
    label: 'بلا سعر',
    icon: CircleMinus,
    ink: 'text-ink-mute',
    cell: 'border-dashed border-border bg-canvas-sunken/70',
    bar: 'bg-muted',
    swatch: 'border-dashed border-border bg-canvas-sunken',
  },
};

const plain = (n: number) => formatMoney(n, '');

/** One short line for a month: what happened to it, in the tenant's terms. */
export function rentAccountMonthStatus(m: RentAccountMonth): string {
  switch (m.kind) {
    case 'paid':
      return m.journalNumbers.length
        ? `مدفوع · ${m.journalNumbers.length > 1 ? 'قيود' : 'قيد'} ${m.journalNumbers.join('، ')}`
        : 'مدفوع';
    case 'partial':
      return `يبقى ${plain(m.remaining)}`;
    case 'due':
      return 'غير مدفوع';
    case 'uncharged':
      return 'لم تُسجَّل مطالبته';
    case 'upcoming':
      return m.paid > 0 ? `يبقى ${plain(m.remaining)}` : 'قادم';
    case 'exempt':
      return m.exemptReason === 'manual' ? 'مستبعد من المطالبة' : 'قبل بدء المطالبة';
    case 'no_price':
      return 'بلا سعر';
  }
}

/** Full sentence for screen readers and the hover title. */
export function rentAccountMonthDescription(m: RentAccountMonth): string {
  const label = formatMonthLabelAr(m.month);
  if (m.kind === 'exempt' || m.kind === 'no_price') return `${label}: ${rentAccountMonthStatus(m)}`;
  const parts = [`${label}: قيمة الشهر ${formatMoney(m.amount, 'LYD')}`];
  if (m.paid > 0) parts.push(`مسدّد ${formatMoney(m.paid, 'LYD')}`);
  if (m.remaining > 0) parts.push(`متبقٍ ${formatMoney(m.remaining, 'LYD')}`);
  if (m.kind === 'uncharged') parts.push('لم تُسجَّل له مطالبة بعد');
  if (m.kind === 'upcoming') parts.push('لم يبدأ بعد');
  if (m.journalNumbers.length) parts.push(`قيد ${m.journalNumbers.join('، ')}`);
  return parts.join(' · ');
}

export function RentAccountMonthCell({
  m,
  onCollect,
}: {
  m: RentAccountMonth;
  /** collect rent for this month (only offered while something is left to pay) */
  onCollect?: (month: string) => void;
}) {
  const meta = RENT_ACCOUNT_KIND[m.kind];
  const Icon = meta.icon;
  const pct = m.amount > 0 ? Math.min(100, (m.paid / m.amount) * 100) : 0;
  const collectable = !!onCollect && m.remaining > 0 && m.amount > 0;
  const description = rentAccountMonthDescription(m);
  const showsMoney = m.kind !== 'exempt' && m.kind !== 'no_price';

  const body = (
    <>
      <span className="flex items-center justify-between gap-1">
        <span className="truncate text-[13px] font-semibold text-foreground">{monthNameAr(m.month)}</span>
        <Icon className={cn('h-3.5 w-3.5 shrink-0', meta.ink)} aria-hidden />
      </span>
      <span
        className={cn(
          'text-[13px] font-semibold leading-tight tabular-nums',
          showsMoney ? 'text-foreground' : 'text-ink-mute',
        )}
      >
        {m.amount > 0 ? formatMoney(m.amount, 'LYD') : '—'}
      </span>
      {showsMoney && (
        <span className="h-1 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
          <span className={cn('block h-full rounded-full', meta.bar)} style={{ width: `${pct}%` }} />
        </span>
      )}
      <span className={cn('text-[11.5px] leading-snug', meta.ink)}>{rentAccountMonthStatus(m)}</span>
      {m.isCurrent && <span className="sr-only">الشهر الحالي</span>}
    </>
  );

  const frame = cn(
    'flex min-h-[5.75rem] w-full flex-col gap-1.5 rounded-xl border p-2.5 text-start',
    meta.cell,
    m.isCurrent && 'outline-2 outline-offset-2 outline-foreground/30',
  );

  if (!collectable) {
    return (
      <div className={frame} title={description} aria-label={description} role="group">
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onCollect(m.month)}
      title={`${description} — اضغط للتحصيل`}
      aria-label={`${description}. تحصيل هذا الشهر`}
      className={cn(
        frame,
        'touch-manipulation transition-colors hover:border-foreground/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      )}
    >
      {body}
    </button>
  );
}
