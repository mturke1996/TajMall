'use client';

import { useMemo, type ElementType } from 'react';
import { ArrowDownLeft, ArrowUpRight, Ban, CalendarCheck, CalendarX, CalendarPlus, HandCoins, Wallet, UserCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/components/people';
import { DbUpdateNotice, LogGroups } from '@/components/employees/profile-shell';
import type { EmployeeProfileData } from '@/components/employees/use-employee-profile';
import { ADJUSTMENT_KIND_LABEL, ADJUSTMENT_STATUS_LABEL, ADVANCE_STATUS_LABEL } from '@/lib/db/payroll-queries';
import { groupTimelineByMonth, structureTotalOf, type TimelineEntry } from '@/lib/employees/employee-profile';
import { formatLeaveRange, leaveTypeLabel, workingDaysLabel } from '@/lib/leave';
import { arabicCount, cn, formatDate, formatMoney, formatMonthKeyAr } from '@/lib/utils';

type Accent = 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'teal';

const TILE: Record<Accent | 'neutral', string> = {
  green: 'bg-chart-green/15 text-chart-green',
  red: 'bg-chart-red/15 text-chart-red',
  amber: 'bg-chart-amber/15 text-chart-amber',
  blue: 'bg-chart-blue/15 text-chart-blue',
  violet: 'bg-chart-violet/15 text-chart-violet',
  teal: 'bg-chart-teal/15 text-chart-teal',
  neutral: 'bg-muted text-ink-mute',
};

type Line = { icon: ElementType; accent: Accent | 'neutral'; title: string; detail?: string; badge?: { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' | 'info' } };

/** The words of one history entry. Dates and amounts come from the entry; nothing here is computed. */
function describe(e: TimelineEntry): Line {
  const a = e.adjustment;
  const adv = e.advance;
  const l = e.leave;
  switch (e.type) {
    case 'hired':
      return { icon: UserCheck, accent: 'green', title: 'التعيين', detail: 'بداية الخدمة' };
    case 'salary':
      return {
        icon: Wallet,
        accent: 'teal',
        title: e.delta === null ? 'تحديد الراتب' : e.delta >= 0 ? 'زيادة في الراتب' : 'تخفيض في الراتب',
        detail: `الإجمالي ${formatMoney(structureTotalOf(e.structure), 'LYD')}${e.structure?.notes ? ` · ${e.structure.notes}` : ''}`,
      };
    case 'adjustment':
      return {
        icon: e.direction === 'in' ? ArrowUpRight : ArrowDownLeft,
        accent: e.tone === 'neutral' ? 'neutral' : e.direction === 'in' ? 'green' : 'red',
        title: `${ADJUSTMENT_KIND_LABEL[a!.kind]} لراتب ${formatMonthKeyAr(a!.period_month.slice(0, 7))}`,
        detail: a!.reason,
        badge: { label: ADJUSTMENT_STATUS_LABEL[a!.status], variant: a!.status === 'APPROVED' ? 'success' : a!.status === 'DRAFT' ? 'warning' : 'neutral' },
      };
    case 'adjustment_decided':
      return {
        icon: a!.status === 'APPROVED' ? CalendarCheck : Ban,
        accent: a!.status === 'APPROVED' ? 'green' : 'neutral',
        title: `${a!.status === 'APPROVED' ? 'اعتُمدت' : 'أُلغيت'} ${ADJUSTMENT_KIND_LABEL[a!.kind]}`,
        detail: a!.decision_note ?? undefined,
      };
    case 'advance':
      return {
        icon: HandCoins,
        accent: adv!.status === 'CANCELLED' ? 'neutral' : 'amber',
        title: 'صرف سلفة',
        detail: `${arabicCount(adv!.installments, ['قسط واحد', 'قسطان', 'أقساط', 'قسطاً'])} · ${adv!.reason}`,
        badge: { label: ADVANCE_STATUS_LABEL[adv!.status], variant: adv!.status === 'OPEN' ? 'warning' : adv!.status === 'SETTLED' ? 'success' : 'neutral' },
      };
    case 'leave':
      return {
        icon: CalendarPlus,
        accent: 'blue',
        title: `طلب ${leaveTypeLabel(l!.leave_type, true)}`,
        detail: `${workingDaysLabel(l!.days)} · ${formatLeaveRange(l!.start_date, l!.end_date)}${l!.reason ? ` · ${l!.reason}` : ''}`,
      };
    case 'leave_decided':
      return {
        icon: l!.status === 'REJECTED' ? CalendarX : CalendarCheck,
        accent: l!.status === 'REJECTED' ? 'red' : 'green',
        title: `${l!.status === 'REJECTED' ? 'رُفضت' : 'اعتُمدت'} ${leaveTypeLabel(l!.leave_type, true)}`,
        detail: [formatLeaveRange(l!.start_date, l!.end_date), l!.decision_note].filter(Boolean).join(' · '),
      };
    case 'leave_cancelled':
      return {
        icon: CalendarX,
        accent: 'neutral',
        title: `أُلغيت ${leaveTypeLabel(l!.leave_type, true)}`,
        detail: [formatLeaveRange(l!.start_date, l!.end_date), l!.cancel_reason].filter(Boolean).join(' · '),
      };
    case 'leave_shortened':
      return {
        icon: CalendarX,
        accent: 'neutral',
        title: `أُنهيت مبكراً ${leaveTypeLabel(l!.leave_type, true)}`,
        detail: `تنتهي في ${formatDate(l!.end_date)} بدلاً من ${formatDate(l!.original_end_date!)}`,
      };
  }
}

function Entry({ entry }: { entry: TimelineEntry }) {
  const line = describe(entry);
  const Icon = line.icon;
  const moves = entry.amount !== null && entry.direction !== null && entry.type !== 'adjustment_decided';
  return (
    <div className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <span aria-hidden className={cn('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg', TILE[line.accent])}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[13.5px] font-semibold">{line.title}</p>
          {line.badge && <Badge variant={line.badge.variant}>{line.badge.label}</Badge>}
        </div>
        {line.detail && <p className="mt-0.5 break-words text-[12.5px] text-ink-mute">{line.detail}</p>}
        <p className="mt-0.5 text-[12px] text-ink-mute">{formatDate(entry.day)}</p>
      </div>
      {moves && (
        <p className={cn('shrink-0 pt-0.5 text-[14px] font-bold tabular-nums', entry.tone === 'neutral' ? 'text-ink-mute line-through' : entry.direction === 'in' ? 'text-success-ink' : 'text-danger-ink')}>
          {formatMoney(entry.direction === 'in' ? entry.amount! : -entry.amount!, 'LYD', { signed: entry.direction === 'in' })}
        </p>
      )}
      {entry.type === 'salary' && entry.delta !== null && Math.abs(entry.delta) >= 0.0005 && (
        <p className={cn('shrink-0 pt-0.5 text-[14px] font-bold tabular-nums', entry.delta > 0 ? 'text-success-ink' : 'text-danger-ink')}>{formatMoney(entry.delta, 'LYD', { signed: true })}</p>
      )}
    </div>
  );
}

/** Salary changes, bonuses and deductions, advances and leave in one list, newest first, grouped by month. */
export function HistoryTab({ data }: { data: EmployeeProfileData }) {
  const { timeline, parts } = data;
  const groups = useMemo(() => groupTimelineByMonth(timeline).map((g) => ({ key: g.month, title: formatMonthKeyAr(g.month), items: g.entries })), [timeline]);
  const loading = parts.structures.loading || parts.adjustments.loading || parts.advances.loading || parts.leaves.loading;
  // a part that failed is named: a history with a hole in it must not read as complete
  const failed = [
    parts.structures.error && 'الرواتب',
    parts.adjustments.error && 'المكافآت والخصومات',
    parts.advances.error && 'السلف',
    parts.leaves.error && 'الإجازات',
  ].filter(Boolean) as string[];
  const retryAll = () => {
    for (const p of [parts.structures, parts.adjustments, parts.advances, parts.leaves]) if (p.error) p.retry();
  };

  return (
    <>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold">السجل</h2>
        <p className="text-[13px] text-ink-mute">تغييرات الراتب والمكافآت والخصومات والسلف والإجازات، الأحدث أولاً.</p>
      </div>
      {(parts.structures.missing || parts.adjustments.missing || parts.advances.missing) && <DbUpdateNotice what="payroll" />}
      {parts.leaves.missing && <DbUpdateNotice what="leave" />}
      {failed.length > 0 && (
        <Card>
          <ErrorBlock message={`تعذّر تحميل ${failed.join(' و')}، فالسجل ناقص. أعد المحاولة.`} onRetry={retryAll} />
        </Card>
      )}
      {loading && timeline.length === 0 ? (
        <Card>
          <LoadingBlock rows={5} />
        </Card>
      ) : timeline.length === 0 && failed.length === 0 ? (
        <Card>
          <EmptyBlock>لا أحداث مسجّلة لهذا الموظف بعد.</EmptyBlock>
        </Card>
      ) : (
        timeline.length > 0 && <LogGroups groups={groups} getKey={(e) => e.key} renderRow={(e) => <Entry entry={e} />} />
      )}
    </>
  );
}
