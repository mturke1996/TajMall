'use client';

import type { ElementType, ReactNode } from 'react';
import { CalendarClock, CircleAlert, CircleCheck, CircleDashed, Clock3, History, Minus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyBlock, ErrorBlock } from '@/components/people/states';
import type { ObligationMonth, ObligationPayment } from '@/lib/people/obligation-months';
import { cn, formatMoney } from '@/lib/utils';

/** The look of a month. `overdue` is a due month that is already over: red instead of amber. */
type Look = 'paid' | 'before_system' | 'partial' | 'overdue' | 'due' | 'upcoming' | 'idle';

const lookOf = (m: Pick<ObligationMonth, 'status' | 'overdue'>): Look => (m.status === 'due' && m.overdue ? 'overdue' : m.status);

const CELL: Record<Look, string> = {
  paid: 'border-success-line bg-success-soft',
  before_system: 'border-info-line bg-info-soft',
  partial: 'border-warning-line bg-warning-soft',
  overdue: 'border-danger-line bg-danger-soft',
  due: 'border-warning-line bg-warning-soft',
  upcoming: 'border-dashed border-border bg-card',
  idle: 'border-dashed border-border bg-canvas-sunken/60',
};
const INK: Record<Look, string> = {
  paid: 'text-success-ink',
  before_system: 'text-info-ink',
  partial: 'text-warning-ink',
  overdue: 'text-danger-ink',
  due: 'text-warning-ink',
  upcoming: 'text-ink-mute',
  idle: 'text-ink-mute',
};
const ICON: Record<Look, ElementType> = {
  paid: CircleCheck,
  before_system: History,
  partial: Clock3,
  overdue: CircleAlert,
  due: CircleDashed,
  upcoming: CalendarClock,
  idle: Minus,
};
// a little stronger than the cell itself: a 12px square of soft colour barely shows on the page
const SWATCH: Record<Look, string> = {
  paid: 'border-success-ink/45 bg-success-soft',
  before_system: 'border-info-ink/45 bg-info-soft',
  partial: 'border-warning-ink/45 bg-warning-soft',
  overdue: 'border-danger-ink/45 bg-danger-soft',
  due: 'border-warning-ink/45 bg-warning-soft',
  upcoming: 'border-dashed border-ink-mute/70 bg-card',
  idle: 'border-dashed border-ink-mute/50 bg-canvas-sunken',
};
const LEGEND_LABEL: Record<Look, string> = {
  paid: 'مسدّد',
  before_system: 'مسدّد قبل المنظومة',
  partial: 'مسدّد جزئياً',
  overdue: 'متأخر',
  due: 'مستحق',
  upcoming: 'قادم',
  idle: 'لا استحقاق',
};
const LEGEND_ORDER: Look[] = ['paid', 'before_system', 'partial', 'due', 'overdue', 'upcoming', 'idle'];

const COLUMNS = {
  3: 'grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
  6: 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6',
} as const;

/** Every share of the month was paid in an earlier month. */
function paidAhead(m: ObligationMonth<ObligationPayment>): boolean {
  return m.shares.length > 0 && m.shares.every((s) => String(s.tx.tx_date).slice(0, 7) < m.monthKey);
}

function amountLine<T extends ObligationPayment>(m: ObligationMonth<T>): { main: string | null; sub?: string; estimated?: boolean } {
  switch (m.status) {
    case 'paid':
      return { main: formatMoney(m.paid, 'LYD'), sub: m.overpaid > 0 ? `زيادة ${formatMoney(m.overpaid, 'LYD')}` : paidAhead(m) ? 'دُفع مقدماً' : undefined };
    case 'partial':
      return { main: formatMoney(m.paid, 'LYD'), sub: m.expected !== null ? `من ${formatMoney(m.expected, 'LYD')}` : undefined };
    case 'due':
      return m.expected !== null ? { main: formatMoney(m.expected, 'LYD'), estimated: m.estimated } : { main: null };
    case 'upcoming':
      return m.expected !== null ? { main: formatMoney(m.expected, 'LYD'), estimated: m.estimated } : { main: null };
    case 'idle':
      return m.paid > 0 ? { main: formatMoney(m.paid, 'LYD'), sub: 'مدفوع' } : { main: null };
    default:
      return { main: null };
  }
}

/** The name read aloud and used in labels, always with its year. */
function monthName<T extends ObligationPayment>(m: ObligationMonth<T>) {
  return `${m.monthNameAr} ${m.year}`;
}

function Legend({ looks }: { looks: Look[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink-mute" aria-label="دلالة الألوان">
      {looks.map((look) => (
        <li key={look} className="inline-flex items-center gap-1.5">
          <span className={cn('h-3.5 w-3.5 rounded-[4px] border', SWATCH[look])} aria-hidden />
          {LEGEND_LABEL[look]}
        </li>
      ))}
    </ul>
  );
}

/**
 * Twelve months as cells: month, status chip, amount. «مسدّد قبل المنظومة» is blue and calm, distinct from
 * the green of a payment recorded in the system. A month already over and unpaid is red, the current one amber.
 * Cells are buttons when `onSelect` is given; `renderAction` puts one action (e.g. «سدّد») in a month.
 */
export function MonthGrid<T extends ObligationPayment>({
  months,
  columns = 6,
  onSelect,
  renderAction,
  legend = true,
  loading,
  error,
  onRetry,
  footnote,
  className,
}: {
  months: readonly ObligationMonth<T>[];
  columns?: keyof typeof COLUMNS;
  onSelect?: (month: ObligationMonth<T>) => void;
  renderAction?: (month: ObligationMonth<T>) => ReactNode;
  legend?: boolean;
  loading?: boolean;
  /** a failed load: text shown instead of the months */
  error?: string | boolean;
  onRetry?: () => void;
  /** one short line under the legend, e.g. where tracking starts */
  footnote?: ReactNode;
  className?: string;
}) {
  if (error) {
    return <ErrorBlock message={typeof error === 'string' ? error : undefined} onRetry={onRetry} className={className} />;
  }
  if (loading) {
    return (
      <div className={cn('grid gap-2.5', COLUMNS[columns], className)} role="status" aria-label="جارٍ التحميل">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (months.length === 0) return <EmptyBlock className={className}>لا توجد أشهر لعرضها.</EmptyBlock>;

  const withYear = new Set(months.map((m) => m.year)).size > 1;
  const present = new Set(months.map(lookOf));
  const looks = LEGEND_ORDER.filter((l) => present.has(l));

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <ul className={cn('grid gap-2.5', COLUMNS[columns])}>
        {months.map((m) => {
          const look = lookOf(m);
          const Icon = ICON[look];
          const amount = amountLine(m);
          const action = renderAction?.(m);
          const label = `${monthName(m)}: ${m.label}${amount.main ? `، ${amount.main}${amount.estimated ? ' تقديري' : ''}` : ''}${amount.sub ? `، ${amount.sub}` : ''}`;
          const content = (
            <>
              <span className="flex w-full items-start justify-between gap-2">
                {/* the year sits under the name, so every cell of a two-year view has the same shape */}
                <span className="min-w-0 leading-tight">
                  <span className="block whitespace-nowrap text-[13.5px] font-semibold text-foreground sm:text-[14px]">{m.monthNameAr}</span>
                  {withYear && <span className="block text-[11.5px] tabular-nums text-ink-mute">{m.year}</span>}
                </span>
                <Icon className={cn('mt-px h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4', INK[look])} aria-hidden />
              </span>
              <span className={cn('w-full text-[12px] font-medium leading-snug', INK[look])}>{m.label}</span>
              {amount.main ? (
                <span className="mt-auto flex w-full flex-col">
                  <span className={cn('text-[13px] font-semibold tabular-nums', look === 'upcoming' || look === 'idle' ? 'text-ink-mute' : 'text-foreground')}>
                    {amount.main}
                  </span>
                  {(amount.sub || amount.estimated) && (
                    <span className="text-[11.5px] tabular-nums text-ink-mute">{amount.estimated ? 'تقديري' : amount.sub}</span>
                  )}
                </span>
              ) : amount.sub ? (
                <span className="mt-auto text-[11.5px] text-ink-mute">{amount.sub}</span>
              ) : null}
            </>
          );
          const frame = cn(
            'flex min-h-[92px] w-full flex-col items-start gap-1.5 rounded-xl border p-2.5 text-start sm:p-3',
            CELL[look],
            m.current && 'ring-2 ring-foreground/20 ring-offset-2 ring-offset-background',
          );
          return (
            <li key={m.monthKey} className="flex min-w-0 flex-col gap-1.5" aria-current={m.current ? 'date' : undefined}>
              {onSelect ? (
                <button
                  type="button"
                  aria-label={label}
                  onClick={() => onSelect(m)}
                  className={cn(frame, 'cursor-pointer transition-colors hover:border-ink-mute/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring')}
                >
                  {content}
                </button>
              ) : (
                <div className={frame}>{content}</div>
              )}
              {action}
            </li>
          );
        })}
      </ul>
      {(legend || footnote) && (
        <div className="flex flex-col gap-1.5">
          {legend && <Legend looks={looks} />}
          {footnote && <p className="text-[12px] text-ink-mute">{footnote}</p>}
        </div>
      )}
    </div>
  );
}
