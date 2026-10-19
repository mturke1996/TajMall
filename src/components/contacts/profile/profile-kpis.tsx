'use client';

import { useMemo } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, CalendarCheck, ChartColumn, Receipt } from 'lucide-react';
import { KpiStrip, type KpiCardProps } from '@/components/people';
import { arabicCount, formatDate } from '@/lib/utils';
import { buildProfileFigures, DIRECTION_WORDS } from '@/lib/people/party-profile';
import type { Direction, PartyStats } from '@/lib/people/party-stats';

const VOUCHERS = {
  out: ['سند صرف واحد', 'سندا صرف', 'سندات صرف', 'سند صرف'],
  in: ['سند قبض واحد', 'سندا قبض', 'سندات قبض', 'سند قبض'],
} as Record<Direction, [string, string, string, string]>;

/**
 * Four figures under the header: the leading side over twelve months, the last one, how many movements, the
 * usual month. A failed load shows dashes with a retry in each card, never zeros.
 */
export function ProfileKpis({
  stats,
  direction,
  loading,
  error,
  onRetry,
  label = 'ملخص الحركة',
}: {
  stats: PartyStats | null;
  direction: Direction;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  label?: string;
}) {
  const items = useMemo<KpiCardProps[]>(() => {
    const w = DIRECTION_WORDS[direction];
    const state: KpiCardProps['state'] = loading ? 'loading' : error || !stats ? 'error' : 'ready';
    const f = stats ? buildProfileFigures(stats, direction) : null;
    const other = DIRECTION_WORDS[direction === 'out' ? 'in' : 'out'];

    const countContext = !f
      ? undefined
      : f.totalCount === 0
        ? 'لا حركة بعد'
        : [f.count > 0 && arabicCount(f.count, VOUCHERS[direction]), f.other.count > 0 && `${f.other.count} ${other.countOf}`].filter(Boolean).join(' · ');

    // a failed load says so in every card; one retry is enough
    return [
      {
        label: w.total,
        icon: direction === 'out' ? ArrowUpFromLine : ArrowDownToLine,
        accent: direction === 'out' ? 'red' : 'green',
        value: f?.twelveMonths ?? null,
        context: f ? 'آخر 12 شهراً' : undefined,
        state,
        onRetry,
      },
      {
        label: w.last,
        icon: CalendarCheck,
        accent: 'amber',
        value: f?.last?.amount ?? null,
        context: f ? (f.last ? formatDate(f.last.date) : w.lastNone) : undefined,
        state,
      },
      {
        label: 'عدد الحركات',
        icon: Receipt,
        accent: 'blue',
        format: 'count',
        value: f?.totalCount ?? null,
        context: countContext,
        state,
      },
      {
        label: 'المتوسط الشهري',
        icon: ChartColumn,
        accent: 'teal',
        value: f && f.activeMonths > 0 ? f.average : null,
        context: f ? (f.activeMonths > 0 ? `أشهر الحركة: ${f.activeMonths}` : 'لا حركة بعد') : undefined,
        state,
      },
    ];
  }, [stats, direction, loading, error, onRetry]);

  return <KpiStrip items={items} label={label} />;
}

/** Under the figures, when some rows are left out of them. */
export function UncountedNote({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p className="-mt-1 px-1 text-[12px] text-ink-mute">
      {arabicCount(count, ['حركة واحدة', 'حركتان', 'حركات', 'حركة'])} مسودة أو ملغاة لا تدخل في الأرقام.
    </p>
  );
}
