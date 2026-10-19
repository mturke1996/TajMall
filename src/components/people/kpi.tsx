import type { ElementType, ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { IconTile, type Accent } from '@/components/dashboard/dashboard-ui';
import { cn, formatMoney, formatNumber } from '@/lib/utils';

export type KpiTone = 'plain' | 'good' | 'bad' | 'warn' | 'info';
export type KpiContextTone = 'mute' | 'good' | 'bad' | 'warn' | 'info';

const CARD_TONE: Record<KpiTone, string> = {
  plain: '',
  good: 'border-success-line bg-success-soft',
  bad: 'border-danger-line bg-danger-soft',
  warn: 'border-warning-line bg-warning-soft',
  info: 'border-info-line bg-info-soft',
};
const CONTEXT_TONE: Record<KpiContextTone, string> = {
  mute: 'text-ink-mute',
  good: 'text-success-ink',
  bad: 'text-danger-ink',
  warn: 'text-warning-ink',
  info: 'text-info-ink',
};

export type KpiCardProps = {
  label: string;
  icon: ElementType;
  accent: Accent;
  /** a number is a sum of money unless `format` says otherwise; null reads as unknown */
  value?: number | string | null;
  format?: 'money' | 'count' | 'text';
  /** one line under the figure */
  context?: ReactNode;
  contextTone?: KpiContextTone;
  /** tints the whole card: the headline figure only */
  tone?: KpiTone;
  /** a failed load shows a dash and a retry, never zero */
  state?: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  /** makes the whole card a link */
  href?: string;
  className?: string;
};

/** No figure: a dash that is read out as «غير متاح». */
const NoFigure = () => (
  <>
    <span aria-hidden>—</span>
    <span className="sr-only">غير متاح</span>
  </>
);

function Figure({ value, format }: { value: KpiCardProps['value']; format: NonNullable<KpiCardProps['format']> }) {
  if (value === null || value === undefined) return <NoFigure />;
  if (format === 'text') return <>{value}</>;
  const n = Number(value);
  if (!Number.isFinite(n)) return <NoFigure />;
  return <>{format === 'count' ? formatNumber(n) : formatMoney(n, 'LYD')}</>;
}

/** Label with an icon tile, the exact figure, one line of context. Loading and error are variants of the same card. */
export function KpiCard({
  label,
  icon,
  accent,
  value,
  format,
  context,
  contextTone = 'mute',
  tone = 'plain',
  state = 'ready',
  onRetry,
  href,
  className,
}: KpiCardProps) {
  const kind = format ?? (typeof value === 'string' ? 'text' : 'money');
  const negative = kind === 'money' && Number(value) < 0;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 pt-0.5 text-[12.5px] font-medium text-ink-mute">{label}</p>
        <IconTile icon={icon} accent={accent} />
      </div>
      {state === 'loading' ? (
        <div role="status" aria-label="جارٍ التحميل">
          <Skeleton className="mt-3 h-7 w-32 max-w-full" />
          <Skeleton className="mt-2 h-4 w-24 max-w-full" />
        </div>
      ) : state === 'error' ? (
        <>
          <p className="mt-2 text-[20px] font-bold leading-tight text-foreground sm:text-[24px]" aria-hidden>
            —
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-danger-ink">
            <span>تعذّر التحميل</span>
            {onRetry && (
              <Button type="button" variant="ghost" size="sm" className="-ms-2 min-h-11 text-danger-ink sm:min-h-8" onClick={onRetry}>
                إعادة المحاولة
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className={cn('mt-2 break-words text-[19px] font-bold leading-tight tabular-nums text-foreground sm:text-[24px]', negative && 'text-danger-ink')}>
            <Figure value={value} format={kind} />
          </p>
          {context && <p className={cn('mt-1 text-[12px] tabular-nums', CONTEXT_TONE[contextTone])}>{context}</p>}
        </>
      )}
    </>
  );

  const cardClass = cn('min-w-0 p-4 sm:p-5', CARD_TONE[tone], className);
  if (href && state === 'ready') {
    return (
      <Card className={cn(cardClass, 'transition-colors hover:border-ink-mute/40')}>
        <Link href={href} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
          {body}
        </Link>
      </Card>
    );
  }
  return <Card className={cardClass}>{body}</Card>;
}

const COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
};

/** Two across on a phone, up to four on a desktop. */
export function KpiStrip({ items, label, className }: { items: KpiCardProps[]; label: string; className?: string }) {
  return (
    <section aria-label={label} className={cn('grid gap-3 md:gap-4', COLS[Math.min(4, Math.max(1, items.length))], className)}>
      {items.map((item, i) => (
        <KpiCard
          key={item.label}
          {...item}
          // an odd last card takes the whole row on a phone instead of leaving a gap
          className={cn(item.className, items.length >= 3 && items.length % 2 === 1 && i === items.length - 1 && 'col-span-2 lg:col-span-1')}
        />
      ))}
    </section>
  );
}
