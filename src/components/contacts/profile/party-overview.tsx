'use client';

import { useMemo, type ReactNode } from 'react';
import { ChartColumn, ChevronLeft, PieChart, Plus, Receipt, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DonutBreakdown, ErrorBlock, MonthlyBarChart, SectionCard, type ChartRow } from '@/components/people';
import { MovementRow } from '@/components/contacts/profile/movement-row';
import { useRepeatTransaction } from '@/components/transactions/use-repeat-transaction';
import {
  accountSlices,
  barsRange,
  buildProfileFigures,
  DIRECTION_WORDS,
  monthBars,
  peakMonth,
  profileNotes,
  recentMovements,
} from '@/lib/people/party-profile';
import type { Direction, PartyStats } from '@/lib/people/party-stats';
import { formatMonthLabelAr } from '@/lib/rent-months';
import { friendlyError } from '@/lib/user-messages';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import type { TransactionWithRelations } from '@/lib/db/types';

/** The first tab: twelve months, the split by account, the last five movements, the notes. */
export function PartyOverview({
  stats,
  direction,
  transactions,
  loading,
  error,
  onRetry,
  notes,
  extra,
  onOpenMovements,
  onAdd,
}: {
  stats: PartyStats | null;
  direction: Direction;
  transactions: TransactionWithRelations[];
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  notes?: string | null;
  /** a card shown after the movements (the supply facts of a utility supplier) */
  extra?: ReactNode;
  onOpenMovements: () => void;
  /** the voucher button of an empty profile; absent when the user may not create one */
  onAdd?: () => void;
}) {
  const words = DIRECTION_WORDS[direction];
  const { canRepeat, repeat } = useRepeatTransaction();
  const f = useMemo(() => (stats ? buildProfileFigures(stats, direction) : null), [stats, direction]);
  const bars = useMemo(() => (f ? monthBars(f.side) : []), [f]);
  const peak = useMemo(() => peakMonth(bars), [bars]);
  const slices = useMemo(() => (f ? accountSlices(f.side) : []), [f]);
  const latest = useMemo(() => recentMovements(transactions, 5), [transactions]);
  const noteText = profileNotes(notes);
  const accent = direction === 'out' ? 'red' : 'green';
  const failed = !loading && (!!error || !stats);
  const errorText = error ? friendlyError(error, 'تعذّر تحميل حركات الجهة.') : undefined;
  const nothingYet = !loading && !failed && transactions.length === 0;

  const rows = useMemo<ChartRow[]>(() => bars.map((b) => ({ label: b.label, amount: b.amount })), [bars]);

  const movementsCard = (
    <SectionCard
      title="آخر الحركات"
      icon={Receipt}
      accent="blue"
      status={loading ? 'loading' : failed ? 'error' : 'ready'}
      errorText={errorText}
      onRetry={onRetry}
      skeletonRows={4}
      actions={
        transactions.length > 5 ? (
          <Button type="button" variant="ghost" className="-me-2 min-h-11 gap-1 px-2 text-[12.5px] text-ink-mute sm:min-h-9" onClick={onOpenMovements}>
            كل الحركات
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </Button>
        ) : undefined
      }
    >
      <ul className="divide-y divide-border" aria-label="آخر الحركات">
        {latest.map((tx) => (
          <MovementRow key={tx.id} tx={tx} onRepeat={canRepeat(tx) ? repeat : undefined} />
        ))}
      </ul>
    </SectionCard>
  );

  const notesCard = noteText ? (
    <SectionCard title="ملاحظات" icon={StickyNote} accent="violet">
      <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-soft">{noteText}</p>
    </SectionCard>
  ) : null;

  if (failed) {
    return (
      <div className="grid min-w-0 gap-4 lg:grid-cols-3 lg:gap-5">
        <Card className="lg:col-span-3">
          <ErrorBlock message={errorText} onRetry={onRetry} />
        </Card>
        {extra}
        {notesCard}
      </div>
    );
  }

  if (nothingYet) {
    return (
      <div className="grid min-w-0 gap-4 lg:grid-cols-3 lg:gap-5">
        <Card className="flex flex-col items-center gap-3 px-4 py-12 text-center lg:col-span-3">
          <p className="text-[14px] font-medium text-foreground">لا حركات لهذه الجهة بعد.</p>
          {onAdd && (
            <Button type="button" className="min-h-11 gap-1.5 sm:min-h-9" onClick={onAdd}>
              <Plus aria-hidden />
              {words.voucher}
            </Button>
          )}
        </Card>
        {extra}
        {notesCard}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-3 lg:gap-5">
      <SectionCard
        title={words.chartTitle}
        description={barsRange(bars)}
        icon={ChartColumn}
        accent={accent}
        className="lg:col-span-2"
        status={loading ? 'loading' : failed ? 'error' : 'ready'}
        errorText={errorText}
        onRetry={onRetry}
        skeletonRows={5}
      >
        <MonthlyBarChart
          data={rows}
          series={[{ key: 'amount', label: words.total, accent }]}
          title={words.chartTitle}
          summary={
            f && (
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border pt-3 text-[12.5px]">
                <div>
                  <dt className="text-ink-mute">{f.side.first ? `الإجمالي منذ ${formatDate(f.side.first.date)}` : 'الإجمالي'}</dt>
                  <dd className={cn('mt-0.5 text-[14px] font-semibold tabular-nums', direction === 'out' ? 'text-danger-ink' : 'text-success-ink')}>
                    {formatMoney(f.allTime, 'LYD')}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-mute">أعلى شهر</dt>
                  <dd className="mt-0.5 text-[14px] font-semibold tabular-nums">
                    {peak ? (
                      <>
                        {formatMonthLabelAr(peak.monthKey)} · {formatMoney(peak.amount, 'LYD')}
                      </>
                    ) : (
                      <span className="font-normal text-ink-mute">لا حركة في هذه الفترة</span>
                    )}
                  </dd>
                </div>
              </dl>
            )
          }
        />
      </SectionCard>

      <SectionCard
        title={words.accountsTitle}
        icon={PieChart}
        accent="violet"
        status={loading ? 'loading' : failed ? 'error' : 'ready'}
        errorText={errorText}
        onRetry={onRetry}
        skeletonRows={4}
      >
        <DonutBreakdown slices={slices} total={f?.side.total} centerLabel={words.centre} lead={accent} emptyText="لا حركات على هذا الجانب." />
      </SectionCard>

      <div className="min-w-0 lg:col-span-2">{movementsCard}</div>
      <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
        {extra}
        {notesCard}
      </div>
    </div>
  );
}
