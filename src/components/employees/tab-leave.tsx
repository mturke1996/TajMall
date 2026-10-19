'use client';

import { useMemo, useRef, useState, type ElementType } from 'react';
import {
  Baby,
  CalendarDays,
  CalendarOff,
  CalendarPlus,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Siren,
  Stethoscope,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ACCENT_FILL, EmptyBlock, ErrorBlock, LoadingBlock, SectionCard } from '@/components/people';
import { ACCENT_VAR } from '@/components/dashboard/dashboard-ui';
import { LeaveDecisionDialog, type LeaveDecisionMode } from '@/components/employees/leave-dialogs';
import { DbUpdateNotice, Lead } from '@/components/employees/profile-shell';
import type { EmployeeProfileData } from '@/components/employees/use-employee-profile';
import { isLeaveBalanceShortage, leaveErrorMessage, useDecideLeave, useLeaveBalance } from '@/lib/db/leave-queries';
import { hasDeductionFor, leaveYearStrip } from '@/lib/employees/employee-profile';
import {
  LEAVE_TYPES,
  annualLine,
  describeBalance,
  daysLabel,
  formatLeaveRange,
  formatReturnDay,
  isOverLimit,
  leaveActions,
  leavePhase,
  leavePhaseLabel,
  leaveStatusLabel,
  leaveStatusTone,
  leaveTypeAccent,
  leaveTypeLabel,
  nextWorkingDay,
  usedShare,
  workingDaysLabel,
  yearsTouched,
  type LeaveBalanceLine,
  type LeaveRequest,
  type LeaveType,
} from '@/lib/leave';
import { arabicCount, cn, formatDate } from '@/lib/utils';

const TYPE_ICON: Record<LeaveType, ElementType> = {
  ANNUAL: CalendarDays,
  SICK: Stethoscope,
  UNPAID: CalendarOff,
  EMERGENCY: Siren,
  MATERNITY: Baby,
  OTHER: CalendarRange,
};

const TILE_BG: Record<ReturnType<typeof leaveTypeAccent>, string> = {
  green: 'bg-chart-green/15 text-chart-green',
  red: 'bg-chart-red/15 text-chart-red',
  amber: 'bg-chart-amber/15 text-chart-amber',
  blue: 'bg-chart-blue/15 text-chart-blue',
  violet: 'bg-chart-violet/15 text-chart-violet',
  teal: 'bg-chart-teal/15 text-chart-teal',
};

const MONTH_SHORT = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
/** Working days in the fullest month of the year: the strip's scale. */
const STRIP_MAX = 23;

function TypeTile({ type, className }: { type: LeaveType; className?: string }) {
  const Icon = TYPE_ICON[type];
  return (
    <span aria-hidden className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', TILE_BG[leaveTypeAccent(type)], className)}>
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

// ── The balance, one card per type ──────────────────────────────────────────

function AnnualCard({ line }: { line: LeaveBalanceLine }) {
  const info = describeBalance(line);
  const over = isOverLimit(line);
  const share = Math.round(usedShare(line) * 100);
  return (
    <Card className="col-span-full p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <TypeTile type="ANNUAL" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-ink-mute">الإجازة السنوية</p>
          <p className={cn('mt-0.5 text-[22px] font-bold leading-tight tabular-nums sm:text-[24px]', over && 'text-danger-ink')}>{info.headline}</p>
        </div>
      </div>
      <Progress
        value={share}
        className={cn('mt-4 h-2 bg-muted [&>div]:bg-chart-blue', over && '[&>div]:bg-chart-red')}
        aria-label={`المستخدم والمحجوز من الرصيد السنوي: ${share}%`}
      />
      <p className="mt-2 text-[12.5px] tabular-nums text-ink-mute">
        {info.detail}
        {line.carryOver > 0 && ` · منها ${daysLabel(line.carryOver)} مُرحَّلة من السنة السابقة`}
      </p>
    </Card>
  );
}

function CounterCard({ line, className }: { line: LeaveBalanceLine; className?: string }) {
  const idle = line.taken === 0 && line.pending === 0;
  return (
    <Card className={cn('flex items-center gap-3 p-3.5', idle && 'bg-canvas-sunken/60 shadow-none', className)}>
      <TypeTile type={line.type} className={cn('h-9 w-9 rounded-lg', idle && 'opacity-60')} />
      <div className="min-w-0">
        <p className="truncate text-[12.5px] text-ink-mute">{leaveTypeLabel(line.type, true)}</p>
        <p className={cn('text-[15px] font-bold tabular-nums', idle && 'font-medium text-ink-mute')}>{idle ? 'لا إجازات' : daysLabel(line.taken)}</p>
        {line.pending > 0 && <p className="text-[12px] text-warning-ink">{daysLabel(line.pending)} بانتظار القرار</p>}
      </div>
    </Card>
  );
}

// ── The year as twelve bars ─────────────────────────────────────────────────

function YearStrip({ requests, year }: { requests: LeaveRequest[]; year: number }) {
  const cells = useMemo(() => leaveYearStrip(requests, year), [requests, year]);
  const total = cells.reduce((s, c) => s + c.approved, 0);
  const pending = cells.reduce((s, c) => s + c.pending, 0);
  return (
    <div>
      {/* left to right with January first, like the charts on the dashboard */}
      <ol dir="ltr" className="grid grid-cols-6 gap-x-2 gap-y-4 sm:grid-cols-12">
        {cells.map((c, i) => {
          const accent = c.topType ? leaveTypeAccent(c.topType) : 'blue';
          const approvedH = Math.min(100, (c.approved / STRIP_MAX) * 100);
          const pendingH = Math.min(100 - approvedH, (c.pending / STRIP_MAX) * 100);
          const label = `${MONTH_SHORT[i]}: ${c.approved > 0 ? `${workingDaysLabel(c.approved)} معتمدة` : 'لا إجازة معتمدة'}${c.pending > 0 ? `، ${workingDaysLabel(c.pending)} بانتظار القرار` : ''}`;
          return (
            <li key={c.month} className="flex min-w-0 flex-col items-center gap-1.5" aria-label={label}>
              <div className="relative h-16 w-full overflow-hidden rounded-md bg-canvas-sunken">
                {c.approved > 0 && <span className={cn('absolute inset-x-0 bottom-0 rounded-sm', ACCENT_FILL[accent])} style={{ height: `${Math.max(approvedH, 6)}%` }} />}
                {c.pending > 0 && (
                  <span
                    className="absolute inset-x-0 rounded-sm border border-dashed"
                    style={{ bottom: `${approvedH}%`, height: `${Math.max(pendingH, 6)}%`, borderColor: ACCENT_VAR[accent] }}
                  />
                )}
              </div>
              <span className="text-[11.5px] text-ink-mute">{MONTH_SHORT[i]}</span>
              <span className={cn('text-[12.5px] font-semibold tabular-nums', c.approved === 0 && 'text-ink-mute')} dir="rtl">
                {c.approved > 0 ? c.approved : '—'}
                {c.pending > 0 && <span className="text-[11.5px] font-normal text-ink-mute"> +{c.pending}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border pt-3 text-[12px] text-ink-mute">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-chart-blue" aria-hidden />
          معتمدة: {workingDaysLabel(total)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-chart-blue" aria-hidden />
          بانتظار القرار: {workingDaysLabel(pending)}
        </span>
      </p>
    </div>
  );
}

// ── One request ─────────────────────────────────────────────────────────────

function RequestRow({
  request,
  today,
  data,
  busy,
  onApprove,
  onDecision,
  onDeduction,
}: {
  request: LeaveRequest;
  today: string;
  data: EmployeeProfileData;
  busy: boolean;
  onApprove: (r: LeaveRequest) => void;
  onDecision: (mode: LeaveDecisionMode, r: LeaveRequest, opener: HTMLElement) => void;
  onDeduction?: (r: LeaveRequest) => void;
}) {
  const actions = leaveActions(request, data.powers, today);
  const approved = request.status === 'APPROVED';
  const phase = approved ? leavePhase(request, today) : null;
  const deducted = request.leave_type === 'UNPAID' && hasDeductionFor(request, data.adjustments);
  const wantsDeduction = approved && request.leave_type === 'UNPAID' && onDeduction;
  const back = approved ? formatReturnDay(nextWorkingDay(request.end_date)) : null;
  const dim = request.status === 'REJECTED' || request.status === 'CANCELLED';
  const btn = 'min-h-11 gap-1 sm:min-h-8';

  return (
    <div className={cn('flex items-start gap-3 px-4 py-3.5 sm:px-5', dim && 'bg-canvas-sunken/50')}>
      <TypeTile type={request.leave_type} className={cn('mt-0.5 h-9 w-9 rounded-lg', dim && 'opacity-60')} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn('text-[14px] font-semibold', dim && 'text-ink-soft')}>{leaveTypeLabel(request.leave_type, true)}</span>
          <span className="text-[12.5px] text-ink-mute">{workingDaysLabel(request.days)}</span>
          <Badge variant={leaveStatusTone(request.status)}>{leaveStatusLabel(request.status)}</Badge>
          {phase && phase !== 'past' && <Badge variant={phase === 'ongoing' ? 'info' : 'neutral'}>{leavePhaseLabel(phase)}</Badge>}
          {deducted && <Badge variant="neutral">أُنشئ الخصم</Badge>}
        </div>
        <p className="mt-1 text-[13px] tabular-nums text-ink-soft">
          {formatLeaveRange(request.start_date, request.end_date)}
          {back && phase !== 'past' && <span className="text-ink-mute"> · تعود {back}</span>}
        </p>
        {request.reason && <p className="mt-0.5 break-words text-[12.5px] text-ink-mute">{request.reason}</p>}
        {request.override_note && <p className="mt-0.5 text-[12.5px] text-warning-ink">تجاوز الرصيد: {request.override_note}</p>}
        {request.decision_note && <p className="mt-0.5 text-[12.5px] text-ink-mute">{request.status === 'REJECTED' ? 'سبب الرفض' : 'ملاحظة القرار'}: {request.decision_note}</p>}
        {request.cancel_reason && <p className="mt-0.5 text-[12.5px] text-ink-mute">سبب الإلغاء: {request.cancel_reason}</p>}
        {request.original_end_date && request.original_end_date !== request.end_date && (
          <p className="mt-0.5 text-[12.5px] text-ink-mute">كانت تنتهي في {formatDate(request.original_end_date)}</p>
        )}

        {(actions.decide || actions.cancel || actions.endEarly || wantsDeduction) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {actions.decide && (
              <>
                <Button type="button" size="sm" variant="outline" className={btn} disabled={busy} onClick={() => onApprove(request)}>
                  <Check aria-hidden />
                  اعتمد
                </Button>
                <Button type="button" size="sm" variant="ghost" className={btn} onClick={(e) => onDecision('reject', request, e.currentTarget)}>
                  <X aria-hidden />
                  ارفض
                </Button>
              </>
            )}
            {actions.cancel && (
              <Button type="button" size="sm" variant="ghost" className={btn} onClick={(e) => onDecision('cancel', request, e.currentTarget)}>
                {request.status === 'PENDING' ? 'اسحب الطلب' : 'ألغِ الإجازة'}
              </Button>
            )}
            {actions.endEarly && (
              <Button type="button" size="sm" variant="ghost" className={btn} onClick={(e) => onDecision('end_early', request, e.currentTarget)}>
                أنهِ مبكراً
              </Button>
            )}
            {wantsDeduction && (
              <Button type="button" size="sm" variant={deducted ? 'ghost' : 'outline'} className={btn} onClick={() => onDeduction(request)}>
                <Plus aria-hidden />
                {deducted ? 'خصم آخر' : 'إنشاء خصم'}
              </Button>
            )}
          </div>
        )}
        {wantsDeduction && !deducted && <p className="mt-1.5 text-[12px] text-ink-mute">الإجازة بدون راتب لا تُخصم تلقائياً: أنشئ الخصم ليدخل كشف الشهر بعد اعتماده.</p>}
      </div>
    </div>
  );
}

// ── The tab ─────────────────────────────────────────────────────────────────

export function LeaveTab({
  data,
  onRequest,
  onDeduction,
  employeeName,
}: {
  data: EmployeeProfileData;
  onRequest?: () => void;
  /** opens the bonus and deduction form for an unpaid leave, already filled in */
  onDeduction?: (leave: LeaveRequest) => void;
  employeeName: string;
}) {
  const { leaves, parts, powers, canManage, today } = data;
  const [year, setYear] = useState(data.year);
  const balance = useLeaveBalance(data.contact.data?.id ?? null, year, canManage);
  const decide = useDecideLeave();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ mode: LeaveDecisionMode; request: LeaveRequest } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  const lines = balance.data ?? [];
  const annual = annualLine(lines);
  const inYear = useMemo(() => leaves.filter((l) => yearsTouched(l.start_date, l.end_date).includes(year)), [leaves, year]);
  // what waits for a decision comes first, then the latest start
  const ordered = useMemo(
    () => [...inYear].sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING') || b.start_date.localeCompare(a.start_date)),
    [inYear],
  );
  const elsewhere = leaves.length - inYear.length;

  function openDialog(mode: LeaveDecisionMode, request: LeaveRequest, el: HTMLElement | null) {
    opener.current = el;
    setDialog({ mode, request });
    setDialogOpen(true);
  }

  async function approve(request: LeaveRequest) {
    if (busyId) return;
    setBusyId(request.id);
    try {
      await decide.mutateAsync({ id: request.id, approve: true });
      toast.success('اعتُمدت الإجازة', { description: `${employeeName} · ${workingDaysLabel(request.days)}` });
    } catch (e) {
      // the balance no longer covers it: an owner or admin may approve with a written reason
      if (isLeaveBalanceShortage(e) && powers.canApprove) openDialog('approve_over', request, null);
      else toast.error('لم تُعتمد الإجازة', { description: leaveErrorMessage(e) });
    } finally {
      setBusyId(null);
    }
  }

  const missing = parts.leaves.missing || parts.balance.missing || parts.details.missing;
  if (missing) return <DbUpdateNotice what="leave" />;

  const requestButton =
    canManage && onRequest ? (
      <Button type="button" className="min-h-11 gap-1.5 sm:min-h-9" onClick={onRequest}>
        <CalendarPlus aria-hidden />
        طلب إجازة
      </Button>
    ) : undefined;

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">الإجازات</h2>
          <Lead>الجمعة والسبت عطلة أسبوعية ولا تُحسب من الإجازة. السنة الإجازية هي السنة الميلادية.</Lead>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5" role="group" aria-label="السنة">
            <Button type="button" variant="ghost" size="icon-sm" className="size-11 sm:size-8" aria-label="السنة السابقة" onClick={() => setYear((y) => y - 1)}>
              <ChevronRight />
            </Button>
            <span className="min-w-14 text-center text-[14px] font-semibold tabular-nums" aria-live="polite">
              {year}
            </span>
            <Button type="button" variant="ghost" size="icon-sm" className="size-11 sm:size-8" aria-label="السنة التالية" onClick={() => setYear((y) => y + 1)}>
              <ChevronLeft />
            </Button>
          </div>
          {requestButton}
        </div>
      </div>

      {balance.isLoading ? (
        <Card>
          <LoadingBlock rows={3} />
        </Card>
      ) : balance.isError ? (
        <Card>
          <ErrorBlock message="تعذّر تحميل رصيد الإجازات. أعد المحاولة." onRetry={() => void balance.refetch()} />
        </Card>
      ) : lines.length === 0 ? (
        <Card>
          <EmptyBlock>لا يتوفر رصيد لهذه السنة.</EmptyBlock>
        </Card>
      ) : (
        <section aria-label={`رصيد إجازات ${year}`} className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {annual && <AnnualCard line={annual} />}
          {LEAVE_TYPES.filter((t) => t !== 'ANNUAL').map((t, i, all) => {
            const line = lines.find((l) => l.type === t);
            // five cards in two columns: the last one takes the whole row on a phone
            return line ? <CounterCard key={t} line={line} className={i === all.length - 1 ? 'col-span-2 lg:col-span-1' : undefined} /> : null;
          })}
        </section>
      )}

      <SectionCard
        title={`إجازات ${year} شهراً بشهر`}
        description="أيام العمل المعتمدة لكل شهر"
        icon={CalendarDays}
        accent="blue"
        status={parts.leaves.loading ? 'loading' : parts.leaves.error ? 'error' : 'ready'}
        errorText="تعذّر تحميل الإجازات. أعد المحاولة."
        onRetry={parts.leaves.retry}
        skeletonRows={3}
      >
        <YearStrip requests={leaves} year={year} />
      </SectionCard>

      <section className="flex min-w-0 flex-col gap-3" aria-label="طلبات الإجازة">
        <h2 className="text-[15px] font-semibold">طلبات الإجازة</h2>
        {parts.leaves.loading ? (
          <Card>
            <LoadingBlock rows={3} />
          </Card>
        ) : parts.leaves.error ? (
          <Card>
            <ErrorBlock message="تعذّر تحميل طلبات الإجازة. أعد المحاولة." onRetry={parts.leaves.retry} />
          </Card>
        ) : ordered.length === 0 ? (
          <Card>
            <EmptyBlock>{leaves.length === 0 ? 'لا طلبات إجازة لهذا الموظف.' : `لا إجازات في ${year}.`}</EmptyBlock>
          </Card>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-whisper">
            {ordered.map((r) => (
              <li key={r.id}>
                <RequestRow
                  request={r}
                  today={today}
                  data={data}
                  busy={busyId === r.id}
                  onApprove={(req) => void approve(req)}
                  onDecision={(mode, req, el) => openDialog(mode, req, el)}
                  onDeduction={canManage ? onDeduction : undefined}
                />
              </li>
            ))}
          </ul>
        )}
        {elsewhere > 0 && ordered.length > 0 && <p className="text-[12.5px] text-ink-mute">{arabicCount(elsewhere, ['طلب آخر', 'طلبان آخران', 'طلبات أخرى', 'طلباً آخر'])} في سنوات أخرى. غيّر السنة لعرضها.</p>}
      </section>

      <LeaveDecisionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialog?.mode ?? 'reject'}
        request={dialog?.request ?? null}
        employeeName={employeeName}
        returnFocusTo={opener}
      />
    </>
  );
}
