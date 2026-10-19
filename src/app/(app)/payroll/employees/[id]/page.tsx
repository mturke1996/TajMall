'use client';

import { useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Banknote,
  CalendarDays,
  CalendarPlus,
  CircleDollarSign,
  Ellipsis,
  FileText,
  HandCoins,
  History,
  IdCard,
  Pencil,
  Plus,
  Receipt,
  Scale,
  UserRoundX,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/data/empty-state';
import { CHIP, KpiCard, ProfileHeader, type KpiCardProps } from '@/components/people';
import { ContactWhatsAppButton } from '@/components/contacts/contact-phone-actions';
import { useEmployeeActions } from '@/components/employees/employee-actions';
import { AdjustmentsTab } from '@/components/employees/tab-adjustments';
import { AdvancesTab } from '@/components/employees/tab-advances';
import { DetailsTab } from '@/components/employees/tab-details';
import { HistoryTab } from '@/components/employees/tab-history';
import { LeaveTab } from '@/components/employees/tab-leave';
import { PayrollTab } from '@/components/employees/tab-payroll';
import { AttentionList, EmployeePanel, EmployeeTabs, useEmployeeTab, type AttentionItem, type EmployeeTabDef } from '@/components/employees/profile-shell';
import { useEmployeeProfile } from '@/components/employees/use-employee-profile';
import { SalaryStructureDialog } from '@/components/payroll/payroll-dialogs';
import { unpaidDeductionPlan, unpaidLeaveReason } from '@/lib/employees/employee-profile';
import { daysLabel, employmentTypeLabel, tenureLabel, type LeaveRequest } from '@/lib/leave';
import { contactBackHref } from '@/lib/mall/routes';
import { friendlyError } from '@/lib/user-messages';
import { arabicCount, cn, formatDate, formatMoney, formatMonthKeyAr } from '@/lib/utils';
import type { PayrollRunLine } from '@/lib/db/payroll-queries';

const PAGE = 'flex min-w-0 flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-5 sm:py-6 md:px-8 md:py-7';

function PageSkeleton() {
  return (
    <div className={PAGE} role="status" aria-label="جارٍ التحميل">
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className={cn('h-28 rounded-xl', i === 4 && 'col-span-2 lg:col-span-1')} />
        ))}
      </div>
      <Skeleton className="h-11 w-full max-w-xl rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const initialTab = useSearchParams().get('tab');
  const data = useEmployeeProfile(id);
  const { contact, parts, kpis, powers, canManage, canPay, roleLoading, today } = data;
  const employeeRow = contact.data;

  const actions = useEmployeeActions(powers);
  const [structureOpen, setStructureOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);

  const payrollOn = !(parts.structures.missing || parts.lines.missing);
  const leaveOn = !parts.leaves.missing;
  const pendingAdjustments = data.adjustments.filter((a) => a.status === 'DRAFT').length;
  const pendingLeaves = data.leaves.filter((l) => l.status === 'PENDING').length;

  const tabDefs: Array<EmployeeTabDef | false> = [
    (canManage || canPay) && { id: 'payroll', label: 'الرواتب', icon: Wallet },
    canManage && { id: 'adjustments', label: 'المكافآت والخصومات', icon: Scale, count: pendingAdjustments, alert: true },
    canManage && { id: 'advances', label: 'السلف', icon: HandCoins, count: kpis.advance.open },
    canManage && { id: 'leave', label: 'الإجازات', icon: CalendarDays, count: powers.canApprove ? pendingLeaves : 0, alert: true },
    { id: 'details', label: 'البيانات الوظيفية', icon: IdCard },
    canManage && { id: 'history', label: 'السجل', icon: History },
  ];
  const tabs = tabDefs.filter((t): t is EmployeeTabDef => Boolean(t));
  const [tab, setTab] = useEmployeeTab(
    tabs.map((t) => t.id),
    initialTab,
  );

  if ((contact.isPending && Boolean(id)) || roleLoading) return <PageSkeleton />;

  if (contact.isError || !employeeRow) {
    const missing = !contact.isError || (contact.error as { code?: string } | null)?.code === 'PGRST116';
    return (
      <div className={PAGE}>
        <EmptyState
          icon={UserRoundX}
          title={missing ? 'لم يُعثر على الموظف' : 'تعذّر تحميل ملف الموظف'}
          description={missing ? 'قد يكون الملف قد حُذف أو ليست لديك صلاحية الوصول إليه.' : friendlyError(contact.error, 'تعذّر تحميل الملف. أعد المحاولة، وإن تكرر الخطأ أبلغ مسؤول النظام.')}
          action={missing ? { label: 'العودة إلى الموظفين', href: contactBackHref('EMPLOYEE') } : { label: 'إعادة المحاولة', onClick: () => void contact.refetch() }}
        />
      </div>
    );
  }

  if (employeeRow.kind !== 'EMPLOYEE') {
    return (
      <div className={PAGE}>
        <EmptyState icon={UserRoundX} title="هذا الملف ليس موظفاً" description="تُعرض الرواتب والإجازات لملفات الموظفين فقط." action={{ label: 'فتح بطاقة الجهة', href: `/contacts/${employeeRow.id}` }} />
      </div>
    );
  }

  const employee = {
    id: employeeRow.id,
    name: employeeRow.name,
    job_title: employeeRow.job_title,
    department: employeeRow.department,
    salary: employeeRow.salary,
    hire_date: employeeRow.hire_date,
  };
  const dueLine = data.outstanding[0] ?? null;
  const tenure = tenureLabel(employeeRow.hire_date, today);

  const openAction = (action: 'bonus' | 'leave' | 'advance') => actions.open({ action, employee });
  const paySalary = (line?: PayrollRunLine | null) => actions.open({ action: 'pay', employee, line: payrollOn ? (line ?? dueLine) : null });
  const payDisabled = !canPay || (payrollOn ? !dueLine : Number(employeeRow.salary) <= 0) || !employeeRow.is_active;
  const payTitle = payrollOn
    ? dueLine
      ? undefined
      : parts.lines.loading
        ? 'جارٍ تحميل المستحقات'
        : parts.lines.error
          ? 'تعذّر تحميل المستحقات'
          : 'لا راتب مستحق: يُصرف الراتب بعد ترحيل كشف الشهر'
    : Number(employeeRow.salary) <= 0
      ? 'حدّد الراتب أولاً'
      : undefined;

  const unpaidDeduction = (leave: LeaveRequest) => {
    const plan = unpaidDeductionPlan(leave, data.structures);
    const first = plan[0];
    actions.open({
      action: 'adjustment',
      employee,
      prefill: { kind: 'ABSENCE', month: first?.month, days: first?.days, amount: first?.total, reason: unpaidLeaveReason(leave), choices: plan },
    });
  };

  // ── header ──
  const dueFirst = canPay && payrollOn && Boolean(dueLine);
  const btn = 'min-h-11 flex-1 gap-1.5 sm:min-h-9 sm:flex-none';
  const adjustButton =
    canManage && payrollOn ? (
      <Button key="adjust" type="button" variant={dueFirst ? 'outline' : 'default'} className={btn} onClick={() => openAction('bonus')}>
        <Plus aria-hidden />
        مكافأة أو خصم
      </Button>
    ) : null;
  const payButton = canPay ? (
    <Button key="pay" type="button" variant={dueFirst ? 'default' : 'outline'} className={btn} disabled={payDisabled} title={payTitle} onClick={() => paySalary()}>
      <Banknote aria-hidden />
      سداد راتب
    </Button>
  ) : null;

  const headerActions = (
    <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:flex-nowrap">
      {dueFirst ? [payButton, adjustButton] : [adjustButton, payButton]}
      {canManage && leaveOn && (
        <Button type="button" variant="outline" className={btn} onClick={() => openAction('leave')}>
          <CalendarPlus aria-hidden />
          طلب إجازة
        </Button>
      )}
      {canManage && payrollOn && (
        <Button type="button" variant="outline" className={btn} onClick={() => openAction('advance')}>
          <HandCoins aria-hidden />
          سلفة
        </Button>
      )}
      <ContactWhatsAppButton name={employeeRow.name} phone={employeeRow.phone} kind="EMPLOYEE" iconOnPhone className="shrink-0" />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button ref={moreRef} type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0 sm:h-9 sm:w-9" aria-label="المزيد">
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {canManage && payrollOn && (
            <DropdownMenuItem className="min-h-11 sm:min-h-0" onSelect={() => setStructureOpen(true)}>
              <Pencil aria-hidden />
              {kpis.salary.source === 'structure' ? 'تعديل الراتب' : 'حدّد الراتب'}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild className="min-h-11 sm:min-h-0">
            <Link href={`/contacts/${employeeRow.id}`}>
              <FileText aria-hidden />
              بطاقة الجهة
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
  const stickyAction = dueFirst ? (
    <Button type="button" className="min-h-11 gap-1.5" disabled={payDisabled} onClick={() => paySalary()}>
      <Banknote aria-hidden />
      سداد راتب
    </Button>
  ) : canManage && payrollOn ? (
    <Button type="button" className="min-h-11 gap-1.5" onClick={() => openAction('bonus')}>
      <Plus aria-hidden />
      مكافأة أو خصم
    </Button>
  ) : undefined;

  // ── notes under the header ──
  // a database that lacks payroll or leave is said once, inside the tabs it affects and in the figures that depend on it
  const attention: AttentionItem[] = [];
  if (!roleLoading && !canManage) attention.push({ key: 'role', tone: 'info', text: 'تفاصيل الرواتب والسلف والإجازات متاحة للمحاسب ومدير النظام والمالك.' });
  if (!employeeRow.is_active) attention.push({ key: 'inactive', tone: 'warning', text: 'هذا الملف غير نشط، فلا يدخل كشف الرواتب. يُعاد تفعيله من «تعديل» في بطاقة الجهة.' });
  for (const a of data.alerts) attention.push({ key: a.key, tone: a.tone, text: `${a.label} — ${formatDate(a.date)}` });
  if (canManage && payrollOn && !parts.structures.loading && !parts.structures.error && data.structures.length === 0) {
    attention.push({
      key: 'structure',
      tone: 'warning',
      text: 'لم يُحدَّد هيكل راتب لهذا الموظف، فلا يدخل كشف الرواتب قبل ذلك.',
      action: (
        <Button type="button" variant="outline" onClick={() => setStructureOpen(true)}>
          حدّد الراتب
        </Button>
      ),
    });
  }
  if (powers.canApprove && pendingLeaves > 0) {
    attention.push({
      key: 'pending-leave',
      tone: 'info',
      text: `${arabicCount(pendingLeaves, ['طلب إجازة واحد', 'طلبا إجازة', 'طلبات إجازة', 'طلب إجازة'])} بانتظار قرارك.`,
      action: (
        <Button type="button" variant="outline" onClick={() => setTab('leave')}>
          افتح الإجازات
        </Button>
      ),
    });
  }

  // ── the five figures ──
  const stateOf = (part: { loading: boolean; error: boolean; retry: () => void }): Pick<KpiCardProps, 'state' | 'onRetry'> =>
    part.loading ? { state: 'loading' } : part.error ? { state: 'error', onRetry: part.retry } : { state: 'ready' };
  const offNote = canManage ? 'غير مفعّل بعد' : 'غير متاح لدورك';
  const annual = data.annual;
  const annualOver = annual && annual.remaining != null && annual.remaining < 0;

  const cards: KpiCardProps[] = [
    {
      label: 'الراتب الشهري',
      icon: Wallet,
      accent: 'teal',
      value: kpis.salary.source === 'none' ? null : kpis.salary.total,
      context:
        kpis.salary.source === 'structure' && kpis.salary.since
          ? kpis.salary.coming
            ? `يصبح ${formatMoney(kpis.salary.coming.total, 'LYD')} من ${formatMonthKeyAr(kpis.salary.coming.from)}`
            : `يسري من ${formatMonthKeyAr(kpis.salary.since)}`
          : kpis.salary.source === 'card'
            ? data.structuresReadable
              ? 'من بطاقة الجهة، بلا هيكل'
              : 'من بطاقة الجهة'
            : parts.structures.missing
              ? offNote
              : 'لم يُحدَّد هيكل الراتب',
      contextTone: kpis.salary.source === 'none' || (kpis.salary.source === 'card' && data.structuresReadable) ? 'warn' : 'mute',
      ...(canManage ? stateOf(parts.structures) : {}),
    },
    {
      label: 'صافي 12 شهراً',
      icon: Receipt,
      accent: 'blue',
      value: parts.lines.missing || (!canManage && !canPay) ? null : kpis.netYear.total,
      context: parts.lines.missing || (!canManage && !canPay) ? offNote : arabicCount(kpis.netYear.months, ['كشف مُرحَّل', 'كشفان مُرحَّلان', 'كشوف مُرحَّلة', 'كشفاً مُرحَّلاً']),
      ...(canManage || canPay ? stateOf(parts.lines) : {}),
    },
    {
      label: 'المستحق الآن',
      icon: CircleDollarSign,
      accent: 'red',
      value: parts.lines.missing || (!canManage && !canPay) ? null : kpis.due.total,
      tone: kpis.due.total > 0 ? 'bad' : 'plain',
      context:
        parts.lines.missing || (!canManage && !canPay)
          ? offNote
          : kpis.due.total > 0
            ? `${arabicCount(kpis.due.months, ['شهر', 'شهران', 'أشهر', 'شهراً'])} · أقدمها ${formatMonthKeyAr(kpis.due.oldestMonth ?? '')}`
            : 'لا مستحقات',
      // green says «nothing owed»: a figure that is not available says nothing
      contextTone: parts.lines.missing || (!canManage && !canPay) ? 'mute' : kpis.due.total > 0 ? 'bad' : 'good',
      ...(canManage || canPay ? stateOf(parts.lines) : {}),
    },
    {
      label: 'رصيد السلف',
      icon: HandCoins,
      accent: 'amber',
      value: parts.advances.missing || !canManage ? null : kpis.advance.balance,
      context:
        parts.advances.missing || !canManage
          ? offNote
          : kpis.advance.open > 0
            ? `${arabicCount(kpis.advance.open, ['سلفة قائمة', 'سلفتان قائمتان', 'سلف قائمة', 'سلفة قائمة'])} · القسط ${formatMoney(kpis.advance.monthly, 'LYD')}`
            : 'لا سلف قائمة',
      ...(canManage ? stateOf(parts.advances) : {}),
    },
    {
      label: 'الإجازة السنوية',
      icon: CalendarDays,
      accent: annualOver ? 'red' : 'green',
      format: 'text',
      value: annual && annual.remaining != null ? (annualOver ? `تجاوز بمقدار ${daysLabel(-annual.remaining)}` : daysLabel(annual.remaining)) : null,
      context:
        parts.balance.missing || !canManage
          ? offNote
          : annual && annual.entitlement != null
            ? `من ${daysLabel(annual.entitlement)}${annual.pending > 0 ? ` · ${daysLabel(annual.pending)} بانتظار القرار` : ''}`
            : undefined,
      contextTone: annualOver ? 'bad' : 'mute',
      ...(canManage ? stateOf(parts.balance) : {}),
    },
  ];

  const header = (
    <ProfileHeader
      className="sm:[&>div]:flex-wrap"
      name={employeeRow.name}
      code={employeeRow.code}
      role="EMPLOYEE"
      inactive={!employeeRow.is_active}
      status={{ label: data.status.label, tone: data.status.tone }}
      subtitle={[employeeRow.job_title, employeeRow.department].filter(Boolean).join(' · ') || undefined}
      chips={
        <>
          {data.details && (
            <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12px] font-medium leading-5', CHIP.neutral)}>
              {employmentTypeLabel(data.details.employment_type)}
            </span>
          )}
          {employeeRow.hire_date && (
            <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12px] font-medium leading-5', CHIP.neutral)}>
              منذ {formatDate(employeeRow.hire_date)}
              {tenure ? ` · ${tenure}` : ''}
            </span>
          )}
          {data.onLeaveToday && (
            <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12px] font-medium leading-5', CHIP.info)}>
              تعود {formatDate(data.onLeaveToday.return_date)}
            </span>
          )}
        </>
      }
      contact={employeeRow}
      back={{ href: contactBackHref('EMPLOYEE'), label: 'الموظفون' }}
      actions={headerActions}
      stickyAction={stickyAction}
    />
  );

  return (
    <div className={PAGE}>
      {header}
      <AttentionList items={attention} />

      <section aria-label="ملخص الموظف" className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-5">
        {cards.map((c, i) => (
          <KpiCard key={c.label} {...c} className={cn(c.className, i === cards.length - 1 && 'col-span-2 lg:col-span-1')} />
        ))}
      </section>

      <EmployeeTabs tabs={tabs} value={tab} onValueChange={setTab} label={`ملف ${employeeRow.name}`}>
        <EmployeePanel id="payroll">
          <PayrollTab data={data} onEditSalary={() => setStructureOpen(true)} onPayLine={canPay ? (line) => paySalary(line) : undefined} />
        </EmployeePanel>
        <EmployeePanel id="adjustments">
          <AdjustmentsTab data={data} onAdd={() => openAction('bonus')} />
        </EmployeePanel>
        <EmployeePanel id="advances">
          <AdvancesTab data={data} onAdd={() => openAction('advance')} />
        </EmployeePanel>
        <EmployeePanel id="leave">
          <LeaveTab data={data} employeeName={employeeRow.name} onRequest={() => openAction('leave')} onDeduction={unpaidDeduction} />
        </EmployeePanel>
        <EmployeePanel id="details">
          <DetailsTab data={data} contact={employeeRow} />
        </EmployeePanel>
        <EmployeePanel id="history">
          <HistoryTab data={data} />
        </EmployeePanel>
      </EmployeeTabs>

      <SalaryStructureDialog
        open={structureOpen}
        onOpenChange={setStructureOpen}
        employees={[employee]}
        structures={data.structures}
        employeeId={employee.id}
        returnFocusTo={moreRef}
      />
      {actions.dialogs}
    </div>
  );
}
