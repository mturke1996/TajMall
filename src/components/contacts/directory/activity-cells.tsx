import { MiniBars, ROLE_ACCENT } from '@/components/people';
import { Skeleton } from '@/components/ui/skeleton';
import type { ActivityState } from '@/components/contacts/use-contacts-directory';
import type { Accent } from '@/components/dashboard/dashboard-ui';
import type { DirectoryRow } from '@/lib/contacts/directory';
import { arabicCount, cn, formatDate, formatMoney } from '@/lib/utils';

const MOVEMENTS: [string, string, string, string] = ['حركة واحدة', 'حركتان', 'حركات', 'حركة'];

export const directionWord = (row: Pick<DirectoryRow, 'direction'>) => (row.direction === 'out' ? 'مدفوع' : 'مقبوض');

/** The colour of a row's bars: the colour of its role, so avatar, badge and bars read as one. */
export function rowAccent(row: Pick<DirectoryRow, 'role'>): Accent {
  const accent = ROLE_ACCENT[row.role];
  return accent === 'neutral' ? 'blue' : accent;
}

/** "No movements" is only true once the money has loaded: while loading it is a bar, after a failure a dash. */
function Unavailable({ state, className }: { state: Exclude<ActivityState, 'ready'>; className?: string }) {
  if (state === 'loading') {
    return (
      <span className={cn('flex flex-col gap-1.5', className)} role="status" aria-label="جارٍ تحميل الحركات">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3.5 w-16" />
      </span>
    );
  }
  return (
    <span className={cn('text-ink-mute', className)} title="تعذّر تحميل الحركات">
      —<span className="sr-only">تعذّر تحميل الحركات</span>
    </span>
  );
}

/** The latest day with money on the side the row leads with, and what it came to. */
export function LastMovement({ row, state, className }: { row: DirectoryRow; state: ActivityState; className?: string }) {
  if (state !== 'ready') return <Unavailable state={state} className={className} />;
  const last = row.main.last ?? row.other.last;
  if (!last) return <span className={cn('text-[13px] text-ink-mute', className)}>لا حركات</span>;
  const side = row.main.last ? row.main : row.other;
  const word = row.main.last ? directionWord(row) : row.direction === 'out' ? 'مقبوض' : 'مدفوع';
  return (
    <span className={cn('flex flex-col gap-0.5', className)}>
      <span className="text-[13px] text-foreground">{formatDate(last.date)}</span>
      <span className="text-[12px] tabular-nums text-ink-mute">
        {word} {formatMoney(side.last?.amount ?? last.amount, 'LYD')}
      </span>
    </span>
  );
}

/** The total of the last twelve months on the side the row leads with, with its monthly bars. */
export function TwelveMonths({
  row,
  state,
  monthLabels,
  className,
}: {
  row: DirectoryRow;
  state: ActivityState;
  monthLabels: readonly string[];
  className?: string;
}) {
  if (state !== 'ready') return <Unavailable state={state} className={className} />;
  if (row.main.count === 0) return <span className={cn('text-[13px] text-ink-mute', className)}>لا حركات</span>;
  const points = row.main.series.map((value, i) => ({ label: monthLabels[i] ?? '', value }));
  return (
    <span className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-[14px] font-semibold tabular-nums text-foreground">{formatMoney(row.main.total, 'LYD')}</span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <MiniBars points={points} accent={rowAccent(row)} title={`${directionWord(row)} آخر 12 شهراً`} height={22} className="w-20 shrink-0" />
        <span className="whitespace-nowrap text-[12px] text-ink-mute">{arabicCount(row.main.count, MOVEMENTS)}</span>
      </span>
    </span>
  );
}
