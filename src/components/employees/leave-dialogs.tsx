'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Callout } from '@/components/people';
import { FormField } from '@/components/payroll/payroll-ui';
import { ChoiceChips, FIELD_HEIGHT, SummaryBox } from '@/components/employees/form-parts';
import { SheetDialog } from '@/components/employees/sheet-dialog';
import {
  isLeaveBalanceShortage,
  isLeaveSchemaMissing,
  leaveErrorMessage,
  useCancelLeave,
  useDecideLeave,
  useEmployeeDetails,
  useEmployeeLeaveRequests,
  useEndLeaveEarly,
  useRequestLeave,
} from '@/lib/db/leave-queries';
import { evaluateLeaveRequest } from '@/lib/employees/employee-profile';
import {
  LEAVE_TYPES,
  daysLabel,
  formatLeaveRange,
  formatReturnDay,
  leaveTypeLabel,
  nextWorkingDay,
  workingDays,
  workingDaysLabel,
  type LeavePowers,
  type LeaveRequest,
  type LeaveType,
} from '@/lib/leave';
import { addDaysISO } from '@/lib/mall-dates';
import { formatDate, todayISODate } from '@/lib/utils';

const NO_REQUESTS: LeaveRequest[] = [];

export type LeaveEmployee = { id: string; name: string; hire_date: string | null };

/** The first day to offer: today, or the next working day when today is a rest day. */
function firstOffer(today: string): string {
  return workingDays(today, today) > 0 ? today : nextWorkingDay(today);
}

const TYPE_CHOICES = LEAVE_TYPES.map((t) => ({ value: t, label: leaveTypeLabel(t) }));

// ── Request ─────────────────────────────────────────────────────────────────

export function LeaveRequestDialog({
  open,
  onOpenChange,
  employee,
  powers,
  defaultType = 'ANNUAL',
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: LeaveEmployee | null;
  powers: LeavePowers;
  defaultType?: LeaveType;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const today = todayISODate();
  const employeeId = employee?.id ?? null;
  const enabled = open && powers.canManage;
  const requestsQuery = useEmployeeLeaveRequests(employeeId, enabled);
  const detailsQuery = useEmployeeDetails(employeeId, enabled);
  const requests = requestsQuery.data ?? NO_REQUESTS;
  const details = detailsQuery.data ?? null;
  const request = useRequestLeave();
  const sending = useRef(false);

  const [type, setType] = useState<LeaveType>(defaultType);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [reason, setReason] = useState('');
  const [approveNow, setApproveNow] = useState(true);
  const [overrideNote, setOverrideNote] = useState('');
  const [serverShort, setServerShort] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const first = useRef({ defaultType });
  useEffect(() => {
    first.current = { defaultType };
  });
  useEffect(() => {
    if (!open) return;
    const offer = firstOffer(todayISODate());
    setType(first.current.defaultType);
    setStart(offer);
    setEnd(offer);
    setReason('');
    setApproveNow(true);
    setOverrideNote('');
    setServerShort(false);
    setError(null);
  }, [open]);

  const missing = isLeaveSchemaMissing(requestsQuery.error) || isLeaveSchemaMissing(detailsQuery.error);
  const checking = requestsQuery.isLoading || detailsQuery.isLoading;
  const unchecked = Boolean(requestsQuery.error || detailsQuery.error) && !missing;

  const ev = useMemo(
    () =>
      evaluateLeaveRequest({
        requests,
        employeeId: employeeId ?? '',
        type,
        start,
        end,
        reason,
        hireDate: employee?.hire_date,
        terminationDate: details?.termination_date,
        today,
        annualDays: details?.annual_leave_days,
        carryOver: details?.leave_carry_over,
        carryOverYear: details?.leave_carry_over_year,
      }),
    [requests, employeeId, type, start, end, reason, employee?.hire_date, details, today],
  );

  const short = ev.short || serverShort;
  const overrideNeeded = short && powers.canApprove;
  const approves = approveNow && powers.canApprove;
  const blocked =
    !employee ||
    missing ||
    checking ||
    Boolean(ev.error) ||
    Boolean(ev.overlap) ||
    (short && !powers.canApprove) ||
    (overrideNeeded && overrideNote.trim().length < 3);

  async function submit() {
    if (!employee || sending.current) return;
    sending.current = true;
    setError(null);
    try {
      await request.mutateAsync({
        employeeId: employee.id,
        type,
        start,
        end,
        reason: reason.trim() || null,
        approve: approves,
        overrideNote: overrideNeeded ? overrideNote.trim() : null,
      });
      toast.success(approves ? 'سُجّلت الإجازة واعتُمدت' : 'سُجّل طلب الإجازة', {
        description: approves ? `${employee.name} — ${workingDaysLabel(ev.days)}` : 'بانتظار قرار المالك أو المدير',
      });
      onOpenChange(false);
    } catch (e) {
      // the database may count the balance differently from the form (a leave approved a moment ago): ask for a reason
      if (isLeaveBalanceShortage(e) && powers.canApprove) setServerShort(true);
      setError(leaveErrorMessage(e));
    } finally {
      sending.current = false;
    }
  }

  const returnDay = !ev.error && ev.days > 0 ? nextWorkingDay(end) : null;
  const annualBalance = ev.annual?.years[0];

  return (
    <SheetDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={request.isPending}
      dirty={reason.trim() !== ''}
      size="lg"
      title="طلب إجازة"
      description={employee ? `${employee.name} — الجمعة والسبت عطلة أسبوعية ولا تُحسب من الإجازة.` : undefined}
      onSubmit={submit}
      submitLabel={approves ? 'سجّل واعتمد' : 'سجّل الطلب'}
      submitDisabled={blocked}
      error={error}
      returnFocusTo={returnFocusTo}
    >
      {missing && <Callout tone="warning">{leaveErrorMessage({ code: 'PGRST205' })}</Callout>}
      {unchecked && <Callout tone="warning">تعذّر قراءة إجازات الموظف. يفحص النظام الرصيد والتقاطع عند الحفظ.</Callout>}

      <FormField label="نوع الإجازة">
        <ChoiceChips label="نوع الإجازة" value={type} onChange={setType} choices={TYPE_CHOICES} columns="grid-cols-3" />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="من" htmlFor="lv-start">
          <Input
            id="lv-start"
            type="date"
            dir="ltr"
            className={FIELD_HEIGHT}
            value={start}
            onChange={(e) => {
              const next = e.target.value;
              setStart(next);
              // moving the start past the end drags the end along, so the range never turns backwards by itself
              if (next && (!end || end < next)) setEnd(next);
            }}
          />
        </FormField>
        <FormField label="إلى" htmlFor="lv-end">
          <Input id="lv-end" type="date" dir="ltr" className={FIELD_HEIGHT} value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
        </FormField>
      </div>

      {ev.error && (
        <p role="alert" className="-mt-2 text-[12.5px] text-danger-ink">
          {ev.error}
        </p>
      )}
      {ev.overlapMessage && <Callout tone="danger">{ev.overlapMessage}</Callout>}

      <FormField label={type === 'OTHER' ? 'السبب' : 'السبب (اختياري)'} htmlFor="lv-reason">
        <Textarea id="lv-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </FormField>

      {type === 'UNPAID' && <Callout tone="info">الإجازة بدون راتب لا تُخصم تلقائياً. بعد اعتمادها اختر «إنشاء خصم» من قائمة الإجازات.</Callout>}

      {short && ev.shortMessage && (
        <Callout tone="warning">
          {ev.shortMessage}
          {!powers.canApprove && '. تجاوز الرصيد يحتاج موافقة المالك أو مدير النظام.'}
        </Callout>
      )}
      {overrideNeeded && (
        <FormField label="سبب تجاوز الرصيد" htmlFor="lv-override" hint="يُحفظ مع الطلب ويظهر في سجل الموظف.">
          <Textarea id="lv-override" rows={2} value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} />
        </FormField>
      )}

      {!ev.error && ev.days > 0 && (
        <SummaryBox
          rows={[
            { label: 'المدة', value: `${workingDaysLabel(ev.days)} (${formatLeaveRange(start, end)})`, strong: true },
            ...(returnDay ? [{ label: 'العودة إلى العمل', value: formatReturnDay(returnDay) }] : []),
            ...(type === 'ANNUAL' && ev.balanceAfter !== null && annualBalance
              ? [
                  { label: 'المتاح قبل الطلب', value: daysLabel(Math.max(0, annualBalance.available)) },
                  {
                    label: 'المتبقي بعد الطلب',
                    value: <span className={ev.balanceAfter < 0 ? 'text-danger-ink' : undefined}>{ev.balanceAfter < 0 ? `تجاوز بمقدار ${daysLabel(-ev.balanceAfter)}` : daysLabel(ev.balanceAfter)}</span>,
                    strong: true,
                  },
                ]
              : []),
          ]}
        />
      )}

      {powers.canApprove && (
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[13px] sm:min-h-9">
          <input type="checkbox" checked={approveNow} onChange={(e) => setApproveNow(e.target.checked)} className="h-4 w-4 accent-foreground" />
          اعتمد الإجازة الآن
          <span className="text-ink-mute">وإلا تبقى بانتظار القرار</span>
        </label>
      )}
    </SheetDialog>
  );
}

// ── Reject, cancel, end early, approve over the balance ─────────────────────

export type LeaveDecisionMode = 'reject' | 'cancel' | 'end_early' | 'approve_over';

const MODE = {
  reject: {
    title: 'رفض الطلب',
    description: 'يبقى الطلب في السجل بحالة «مرفوضة» ويُعاد ما حجزه من الرصيد.',
    label: 'سبب الرفض',
    submit: 'ارفض الطلب',
    tone: 'danger' as const,
  },
  cancel: {
    title: 'إلغاء الإجازة',
    description: 'تبقى الإجازة في السجل بحالة «ملغاة» ويعود ما حجزته إلى الرصيد.',
    label: 'سبب الإلغاء',
    submit: 'ألغِ الإجازة',
    tone: 'danger' as const,
  },
  end_early: {
    title: 'إنهاء الإجازة مبكراً',
    description: 'تنتهي الإجازة في اليوم المختار، وتعود الأيام اللاحقة إلى الرصيد.',
    label: 'السبب',
    submit: 'أنهِ الإجازة',
    tone: 'default' as const,
  },
  approve_over: {
    title: 'اعتماد مع تجاوز الرصيد',
    description: 'الرصيد السنوي لا يكفي لهذه الإجازة. يُسجَّل السبب مع القرار.',
    label: 'سبب التجاوز',
    submit: 'اعتمد الإجازة',
    tone: 'default' as const,
  },
};

export function LeaveDecisionDialog({
  open,
  onOpenChange,
  mode,
  request,
  employeeName,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: LeaveDecisionMode;
  request: LeaveRequest | null;
  employeeName?: string;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const decide = useDecideLeave();
  const cancel = useCancelLeave();
  const endEarly = useEndLeaveEarly();
  const sending = useRef(false);
  const [note, setNote] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cfg = MODE[mode];

  useEffect(() => {
    if (!open) return;
    setNote('');
    setError(null);
    // the default for "end early" is yesterday: the employee is back today
    setNewEnd(request ? (todayISODate() > request.start_date ? addDaysISO(todayISODate(), -1) : request.start_date) : '');
  }, [open, request]);

  const busy = decide.isPending || cancel.isPending || endEarly.isPending;
  const keptDays = request && newEnd ? workingDays(request.start_date, newEnd) : 0;
  const endProblem =
    mode !== 'end_early' || !request
      ? null
      : !newEnd
        ? 'حدّد آخر يوم في الإجازة'
        : newEnd < request.start_date
          ? 'آخر يوم قبل بداية الإجازة'
          : newEnd >= request.end_date
            ? 'اختر يوماً قبل نهاية الإجازة المعتمدة'
            : keptDays < 1
              ? 'يجب أن يبقى من الإجازة يوم عمل واحد على الأقل. للإلغاء استخدم «ألغِ الإجازة»'
              : null;
  const invalid = !request || note.trim().length < 3 || Boolean(endProblem);

  async function submit() {
    if (!request || sending.current) return;
    sending.current = true;
    setError(null);
    try {
      if (mode === 'reject') await decide.mutateAsync({ id: request.id, approve: false, note: note.trim() });
      else if (mode === 'approve_over') await decide.mutateAsync({ id: request.id, approve: true, note: note.trim(), override: true });
      else if (mode === 'cancel') await cancel.mutateAsync({ id: request.id, reason: note.trim() });
      else await endEarly.mutateAsync({ id: request.id, newEnd, reason: note.trim() });
      toast.success(
        mode === 'reject' ? 'رُفض الطلب' : mode === 'cancel' ? 'أُلغيت الإجازة' : mode === 'end_early' ? 'أُنهيت الإجازة مبكراً' : 'اعتُمدت الإجازة',
      );
      onOpenChange(false);
    } catch (e) {
      setError(leaveErrorMessage(e));
    } finally {
      sending.current = false;
    }
  }

  return (
    <SheetDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      dirty={note.trim() !== ''}
      title={cfg.title}
      description={request ? `${employeeName ? `${employeeName} — ` : ''}${leaveTypeLabel(request.leave_type, true)}، ${formatLeaveRange(request.start_date, request.end_date)}` : cfg.description}
      onSubmit={submit}
      submitLabel={cfg.submit}
      submitDisabled={invalid}
      submitTone={cfg.tone}
      error={error}
      returnFocusTo={returnFocusTo}
    >
      <p className="text-[13px] leading-relaxed text-ink-soft">{cfg.description}</p>
      {mode === 'end_early' && request && (
        <>
          <FormField label="آخر يوم في الإجازة" htmlFor="lv-new-end" hint={`كانت تنتهي في ${formatDate(request.end_date)}`}>
            <Input id="lv-new-end" type="date" dir="ltr" className={FIELD_HEIGHT} value={newEnd} min={request.start_date} max={addDaysISO(request.end_date, -1)} onChange={(e) => setNewEnd(e.target.value)} />
          </FormField>
          {endProblem ? (
            <p role="alert" className="-mt-2 text-[12.5px] text-danger-ink">
              {endProblem}
            </p>
          ) : (
            <SummaryBox
              rows={[
                { label: 'تبقى من الإجازة', value: workingDaysLabel(keptDays) },
                { label: 'يعود إلى الرصيد', value: workingDaysLabel(Math.max(0, request.days - keptDays)), strong: true },
              ]}
            />
          )}
        </>
      )}
      <FormField label={cfg.label} htmlFor="lv-note" hint="يُحفظ مع القرار ويظهر في سجل الموظف.">
        <Textarea id="lv-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
      </FormField>
    </SheetDialog>
  );
}
