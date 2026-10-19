'use client';

import { useMemo, useState, type ElementType } from 'react';
import Link from 'next/link';
import { Banknote, CalendarDays, CalendarPlus, CircleMinus, CirclePlus, HandCoins, Plus, Search, TrendingUp, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Callout, CHIP, EmptyBlock, ErrorBlock, KpiStrip, PartyAvatar, type KpiCardProps } from '@/components/people';
import { ContactPhoneActions } from '@/components/contacts/contact-phone-actions';
import { NativeSelect } from '@/components/employees/form-parts';
import {
  departmentOptions,
  directoryStats,
  filterCounts,
  filterDirectory,
  type DirectoryFilter,
  type DirectoryRow,
} from '@/lib/employees/employee-profile';
import { leaveTypeLabel, weekdayLabel } from '@/lib/leave';
import { NEEDS_DB_UPDATE } from '@/lib/user-messages';
import { arabicCount, cn, formatDate, formatMoney } from '@/lib/utils';

/** "الأحد 25 أكتوبر": the day an employee is back, without the year. */
function shortDay(iso: string): string {
  const [day, month] = formatDate(iso).split(' ');
  return `${weekdayLabel(iso)} ${day} ${month}`;
}

/** How a source of the figures stands: a failed one is never drawn as zero. */
export type SourceState = 'ready' | 'loading' | 'error' | 'missing' | 'off';
export type DirectorySource = { state: SourceState; retry?: () => void };
export type DirectorySources = Record<'leave' | 'advances' | 'due' | 'pending', DirectorySource> & {
  /** what was paid in the last twelve months: shown to roles that do not see payroll */
  paid?: DirectorySource;
};

export type RowAction = 'bonus' | 'deduction' | 'leave' | 'advance' | 'pay';

export type EmployeesDirectoryProps = {
  rows: DirectoryRow[];
  loading: boolean;
  error: unknown | null;
  onRetry: () => void;
  sources: DirectorySources;
  /** bonus, deduction, leave and advance: owner, admin, accountant */
  canManage: boolean;
  /** salary payment */
  canPay: boolean;
  canAdd: boolean;
  onAction: (action: RowAction, row: DirectoryRow, opener: HTMLElement | null) => void;
  onAddEmployee: () => void;
};

const FILTERS: Array<{ key: DirectoryFilter | 'all'; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'on_leave', label: 'في إجازة اليوم' },
  { key: 'due', label: 'مستحق الصرف' },
  { key: 'advance', label: 'عليهم سلف' },
  { key: 'pending', label: 'بانتظار الاعتماد' },
  { key: 'inactive', label: 'غير نشط' },
];

const ACTIONS: Array<{ key: RowAction; label: string; icon: ElementType; ink: string; manage: boolean }> = [
  { key: 'bonus', label: 'مكافأة', icon: CirclePlus, ink: 'text-success-ink', manage: true },
  { key: 'deduction', label: 'خصم', icon: CircleMinus, ink: 'text-danger-ink', manage: true },
  { key: 'leave', label: 'إجازة', icon: CalendarPlus, ink: 'text-info-ink', manage: true },
  { key: 'advance', label: 'سلفة', icon: HandCoins, ink: 'text-warning-ink', manage: true },
  { key: 'pay', label: 'سداد راتب', icon: Banknote, ink: 'text-foreground', manage: false },
];

const NO_FIGURE = '—';

function ChipPill({ tone, children }: { tone: keyof typeof CHIP; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium leading-5', CHIP[tone])}>{children}</span>;
}

function RowChips({ row, sources }: { row: DirectoryRow; sources: DirectorySources }) {
  const chips: Array<{ key: string; tone: keyof typeof CHIP; text: string }> = [];
  if (row.status.key !== 'working') {
    chips.push({
      key: 'status',
      tone: row.status.tone,
      text: row.onLeave && row.status.key === 'on_leave' ? `في إجازة ${leaveTypeLabel(row.onLeave.type)} · تعود ${shortDay(row.onLeave.returnDate)}` : row.status.label,
    });
  }
  if (sources.advances.state === 'ready' && row.openAdvance > 0) chips.push({ key: 'advance', tone: 'warning', text: `سلفة قائمة ${formatMoney(row.openAdvance, 'LYD')}` });
  if (sources.pending.state === 'ready' && row.pendingItems > 0) {
    chips.push({ key: 'pending', tone: 'warning', text: `${arabicCount(row.pendingItems, ['حركة', 'حركتان', 'حركات', 'حركة'])} بانتظار الاعتماد` });
  }
  if (row.alert) chips.push({ key: 'alert', tone: row.alert.tone, text: row.alert.label });
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-3">
      {chips.map((c) => (
        <ChipPill key={c.key} tone={c.tone}>
          {c.text}
        </ChipPill>
      ))}
    </div>
  );
}

function Fact({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3">
      <dt className="text-[12px] text-ink-mute">{label}</dt>
      <dd className="mt-0.5 truncate text-[15px] font-semibold tabular-nums">{children}</dd>
      {hint && <p className="mt-0.5 truncate text-[12px] text-ink-mute">{hint}</p>}
    </div>
  );
}

function EmployeeCard({
  row,
  sources,
  canManage,
  canPay,
  payrollOn,
  leaveOn,
  onAction,
}: {
  row: DirectoryRow;
  sources: DirectorySources;
  canManage: boolean;
  canPay: boolean;
  payrollOn: boolean;
  leaveOn: boolean;
  onAction: EmployeesDirectoryProps['onAction'];
}) {
  const active = row.status.key !== 'inactive' && row.status.key !== 'ended';
  const dueKnown = sources.due.state === 'ready';
  // a failed or unfinished read of the paid total is a dash, never a zero
  const paidKnown = !sources.paid || sources.paid.state === 'ready';
  // a role that may not read payroll (or a database without it) sees what was paid instead of what is owed
  const showDue = payrollOn && sources.due.state !== 'off';
  const subtitle = [row.jobTitle, row.department].filter(Boolean).join(' · ');

  const actions = ACTIONS.filter((a) => (a.manage ? canManage : canPay))
    // the payroll actions need payroll, leave needs leave; a salary can always be recorded as an expense
    .filter((a) => (a.key === 'leave' ? leaveOn : a.key === 'pay' ? true : payrollOn))
    .map((a) => {
      let disabled = !active;
      let title: string | undefined = !active ? 'الملف غير نشط' : undefined;
      if (a.key === 'pay' && active) {
        if (payrollOn && dueKnown && !row.dueLineId) {
          disabled = true;
          title = 'لا راتب مستحق: يُصرف الراتب بعد ترحيل كشف الشهر';
        } else if (payrollOn && !dueKnown) {
          disabled = true;
          title = 'تعذّر تحميل المستحقات';
        } else if (!payrollOn && row.salary <= 0) {
          disabled = true;
          title = 'حدّد الراتب في ملف الموظف أولاً';
        }
      }
      return { ...a, disabled, title };
    });

  return (
    <article className={cn('relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-whisper', !active && 'bg-canvas-sunken/60')}>
      <div className="flex items-start gap-3 p-4 pb-3">
        <PartyAvatar name={row.name} role="EMPLOYEE" size="md" inactive={!active} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-snug">
            <Link
              href={`/payroll/employees/${row.id}`}
              className="rounded-sm after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {row.name}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-mute">{subtitle || 'بلا مسمى وظيفي'}</p>
        </div>
        {row.phone && <ContactPhoneActions name={row.name} phone={row.phone} kind="EMPLOYEE" compact className="relative z-10 shrink-0" />}
      </div>

      <RowChips row={row} sources={sources} />

      <dl className="mt-auto grid grid-cols-2 gap-px border-t border-border bg-border">
        <Fact label="الراتب الشهري">{row.salary > 0 ? formatMoney(row.salary, 'LYD') : <span className="font-normal text-ink-mute">لم يُحدَّد</span>}</Fact>
        {showDue ? (
          <Fact
            label="المستحق الآن"
            hint={dueKnown && row.dueNow > 0 ? `${arabicCount(row.dueMonths, ['شهر', 'شهران', 'أشهر', 'شهراً'])} غير مصروفة` : undefined}
          >
            {!dueKnown ? NO_FIGURE : row.dueNow > 0 ? <span className="text-danger-ink">{formatMoney(row.dueNow, 'LYD')}</span> : <span className="font-normal text-ink-mute">لا مستحقات</span>}
          </Fact>
        ) : (
          <Fact label="المدفوع آخر 12 شهراً" hint={paidKnown && row.monthsPaid > 0 ? `${arabicCount(row.monthsPaid, ['شهر', 'شهران', 'أشهر', 'شهراً'])} فيها دفع` : undefined}>
            {paidKnown ? formatMoney(row.paid12, 'LYD') : NO_FIGURE}
          </Fact>
        )}
      </dl>

      {actions.length > 0 && (
        <div className="relative z-10 grid divide-x divide-x-reverse divide-border border-t border-border" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
          {actions.map((a) => {
            const Icon = a.icon;
            const highlight = a.key === 'pay' && !a.disabled && payrollOn && row.dueNow > 0;
            return (
              <button
                key={a.key}
                type="button"
                disabled={a.disabled}
                title={a.title}
                aria-label={`${a.label}: ${row.name}`}
                onClick={(e) => onAction(a.key, row, e.currentTarget)}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11.5px] font-medium text-ink-soft transition-colors',
                  'hover:bg-canvas-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:opacity-40 disabled:hover:bg-transparent',
                  highlight && 'bg-danger-soft text-danger-ink hover:bg-danger-soft',
                )}
              >
                <Icon className={cn('h-[18px] w-[18px]', highlight ? 'text-danger-ink' : a.ink)} aria-hidden />
                <span className="whitespace-nowrap">{a.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
}

function CardsSkeleton() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="جارٍ التحميل">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-start gap-3 p-4">
            <Skeleton className="h-11 w-11 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-16 w-full rounded-none" />
          <Skeleton className="h-14 w-full rounded-none" />
        </li>
      ))}
    </ul>
  );
}

function kpiState(s: DirectorySource): Pick<KpiCardProps, 'state' | 'onRetry'> {
  return s.state === 'loading' ? { state: 'loading' } : s.state === 'error' ? { state: 'error', onRetry: s.retry } : { state: 'ready' };
}

/**
 * The people on the payroll as cards: who they are, what they earn, what is owed to them, what needs a decision,
 * and the five things done most often (a bonus, a deduction, a leave, an advance, a salary payment) one tap away.
 */
export function EmployeesDirectory({ rows, loading, error, onRetry, sources, canManage, canPay, canAdd, onAction, onAddEmployee }: EmployeesDirectoryProps) {
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [filter, setFilter] = useState<DirectoryFilter | 'all'>('all');

  const stats = useMemo(() => directoryStats(rows), [rows]);
  const counts = useMemo(() => filterCounts(rows), [rows]);
  const departments = useMemo(() => departmentOptions(rows), [rows]);
  const shown = useMemo(() => filterDirectory(rows, { query, department, filter }), [rows, query, department, filter]);
  const payrollOn = sources.due.state !== 'missing' && sources.advances.state !== 'missing';
  const leaveOn = sources.leave.state !== 'missing';
  const filtering = query.trim() !== '' || department !== '' || filter !== 'all';

  const onLeaveNames = rows.filter((r) => r.onLeave && r.status.key !== 'inactive' && r.status.key !== 'ended').map((r) => r.name);

  const kpis: KpiCardProps[] = [
    {
      label: 'عدد الموظفين',
      icon: Users,
      accent: 'teal',
      value: stats.headcount,
      format: 'count',
      context: stats.inactive > 0 ? `و${arabicCount(stats.inactive, ['ملف غير نشط', 'ملفان غير نشطين', 'ملفات غير نشطة', 'ملفاً غير نشط'])}` : 'على رأس العمل',
      state: loading ? 'loading' : error ? 'error' : 'ready',
      onRetry,
    },
    {
      label: 'الرواتب الشهرية',
      icon: Wallet,
      accent: 'red',
      value: stats.monthlyPayroll,
      context: stats.dueNow > 0 && sources.due.state === 'ready' ? `مستحق الصرف الآن ${formatMoney(stats.dueNow, 'LYD')}` : 'مجموع رواتب الموظفين النشطين',
      contextTone: stats.dueNow > 0 && sources.due.state === 'ready' ? 'bad' : 'mute',
      state: loading ? 'loading' : error ? 'error' : 'ready',
      onRetry,
    },
    {
      label: 'في إجازة اليوم',
      icon: CalendarDays,
      accent: 'blue',
      value: sources.leave.state === 'ready' ? stats.onLeave : null,
      format: 'count',
      context:
        sources.leave.state === 'missing'
          ? 'غير مفعّلة بعد'
          : sources.leave.state === 'off'
            ? 'غير متاح لدورك'
            : stats.onLeave === 0
              ? 'لا أحد في إجازة'
              : onLeaveNames.slice(0, 2).join('، ') + (onLeaveNames.length > 2 ? ` و${arabicCount(onLeaveNames.length - 2, ['موظف آخر', 'موظفان آخران', 'موظفين آخرين', 'موظفاً آخر'])}` : ''),
      ...kpiState(loading ? { state: 'loading' } : error ? { state: 'error', retry: onRetry } : sources.leave),
    },
    {
      label: 'رصيد السلف القائمة',
      icon: HandCoins,
      accent: 'amber',
      value: sources.advances.state === 'ready' ? stats.advanceBalance : null,
      context:
        sources.advances.state === 'missing'
          ? 'غير مفعّلة بعد'
          : sources.advances.state === 'off'
            ? 'غير متاح لدورك'
            : stats.advanceHolders === 0
              ? 'لا سلف قائمة'
              : `على ${arabicCount(stats.advanceHolders, ['موظف واحد', 'موظفين', 'موظفين', 'موظفاً'])}`,
      ...kpiState(loading ? { state: 'loading' } : error ? { state: 'error', retry: onRetry } : sources.advances),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <KpiStrip label="ملخص الموظفين" items={kpis} />

      {(sources.due.state === 'missing' || sources.leave.state === 'missing') && (
        <Callout tone="warning">
          {NEEDS_DB_UPDATE}{' '}
          {sources.due.state === 'missing' && sources.leave.state === 'missing'
            ? 'المتأثر: الرواتب والسلف والإجازات.'
            : sources.due.state === 'missing'
              ? 'المتأثر: الرواتب والسلف.'
              : 'المتأثر: الإجازات.'}
        </Callout>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute inset-s-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
          <Input
            placeholder="ابحث بالاسم أو المسمى أو القسم أو الهاتف"
            aria-label="بحث في الموظفين"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 ps-9 sm:h-10"
          />
        </div>
        <div className="flex gap-2">
          {departments.length > 1 && (
            <NativeSelect aria-label="القسم" value={department} onChange={(e) => setDepartment(e.target.value)} className="min-w-0 flex-1 sm:h-10 sm:w-44 sm:flex-none">
              <option value="">كل الأقسام</option>
              {departments.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name} ({d.count})
                </option>
              ))}
            </NativeSelect>
          )}
          <Button variant="outline" className="min-h-11 shrink-0 gap-1.5 sm:min-h-10" asChild>
            <Link href="/payroll">
              <Wallet aria-hidden />
              الرواتب
            </Link>
          </Button>
          <Button variant="outline" className="hidden min-h-10 gap-1.5 lg:inline-flex" asChild>
            <Link href="/reports/employee-spend">
              <TrendingUp aria-hidden />
              تقرير الإنفاق
            </Link>
          </Button>
        </div>
      </div>

      {!loading && !error && rows.length > 0 && (
        <div role="group" aria-label="تصفية الموظفين" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTERS.filter((f) => f.key === 'all' || counts[f.key] > 0 || filter === f.key).map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors sm:min-h-8',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                filter === f.key ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-ink-soft hover:bg-canvas-sunken',
              )}
            >
              {f.label}
              <span className={cn('tabular-nums text-[12px]', filter === f.key ? 'text-background/70' : 'text-ink-mute')}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <CardsSkeleton />
      ) : error ? (
        <Card>
          <ErrorBlock message="تعذّر تحميل قائمة الموظفين. أعد المحاولة، وإن تكرر الخطأ أبلغ مسؤول النظام." onRetry={onRetry} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyBlock
            action={
              canAdd ? (
                <Button className="min-h-11 gap-1.5 sm:min-h-9" onClick={onAddEmployee}>
                  <Plus aria-hidden />
                  إضافة موظف
                </Button>
              ) : undefined
            }
          >
            لا يوجد موظفون بعد.
          </EmptyBlock>
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyBlock
            action={
              filtering ? (
                <Button
                  variant="outline"
                  className="min-h-11 sm:min-h-9"
                  onClick={() => {
                    setQuery('');
                    setDepartment('');
                    setFilter('all');
                  }}
                >
                  امسح التصفية
                </Button>
              ) : undefined
            }
          >
            لا أحد يطابق هذه التصفية.
          </EmptyBlock>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={arabicCount(shown.length, ['موظف واحد', 'موظفان', 'موظفين', 'موظفاً'])}>
          {shown.map((row) => (
            <li key={row.id} className="min-w-0">
              <EmployeeCard row={row} sources={sources} canManage={canManage} canPay={canPay} payrollOn={payrollOn} leaveOn={leaveOn} onAction={onAction} />
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}
