'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MonthField } from '@/components/people';
import { ChoiceChips, FIELD_HEIGHT, NativeSelect, SummaryBox } from '@/components/employees/form-parts';
import { SheetDialog } from '@/components/employees/sheet-dialog';
import { useCashboxes } from '@/lib/db/queries';
import type { CashboxRow, ContactRow } from '@/lib/db/types';
import {
  ADJUSTMENT_IS_ADDITION,
  ADJUSTMENT_KIND_LABEL,
  payrollErrorMessage,
  useAddPayrollAdjustment,
  useIssuePayrollAdvance,
  usePayPayrollLine,
  usePayPayrollLines,
  usePayrollRuns,
  useSetSalaryStructure,
  type PayLineInput,
  type PayrollAdjustmentKind,
  type PayrollRunLine,
  type PayrollSalaryStructure,
} from '@/lib/db/payroll-queries';
import { adjustmentMonthChoices, defaultAdjustmentMonth, monthKeyOf, structureInForce, structureTotalOf } from '@/lib/employees/employee-profile';
import { suggestedUnpaidDeduction, unpaidDayRate } from '@/lib/leave';
import { formatMonthKeyAr, parseAmountInput, preferredCashboxId, todayISODate, arabicCount } from '@/lib/utils';
import { Amount, EmployeeSelect, FormField } from './payroll-ui';

type Employee = Pick<ContactRow, 'id' | 'name' | 'job_title'>;

/**
 * Parses a typed amount; empty means zero, anything else invalid means NaN. Goes through the shared
 * parser so "1250,5" is 1250.5 (not 12505) and Arabic-Indic digits are accepted, as in the other forms.
 */
function parseAmount(raw: string): number {
  return parseAmountInput(raw);
}

export function monthsLabel(n: number) {
  return arabicCount(n, ['شهر واحد', 'شهران', 'أشهر', 'شهراً']);
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

/** The shell of every payroll form: a card on a desktop, a full-height sheet with the buttons in reach on a phone. */
function DialogShell({
  open,
  onOpenChange,
  busy,
  title,
  description,
  children,
  submitLabel,
  onSubmit,
  submitDisabled,
  tone = 'default',
  wide,
  error,
  dirty,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  submitLabel: string;
  onSubmit: () => void;
  submitDisabled?: boolean;
  tone?: 'default' | 'danger';
  wide?: boolean;
  error?: string | null;
  dirty?: boolean;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  return (
    <SheetDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      dirty={dirty}
      title={title}
      description={description}
      size={wide ? 'lg' : 'md'}
      onSubmit={onSubmit}
      submitLabel={submitLabel}
      submitDisabled={submitDisabled}
      submitTone={tone}
      cancelLabel="تراجع"
      error={error}
      returnFocusTo={returnFocusTo}
    >
      {children}
    </SheetDialog>
  );
}

function MoneyInput({
  id,
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <Input
      id={id}
      inputMode="decimal"
      dir="ltr"
      className={`${FIELD_HEIGHT} text-end tabular-nums`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0.000"
      autoFocus={autoFocus}
    />
  );
}

const Summary = SummaryBox;

// ── Salary structure ─────────────────────────────────────────────────────────

export function SalaryStructureDialog({
  open,
  onOpenChange,
  employees,
  structures,
  employeeId: fixedEmployeeId,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  structures: PayrollSalaryStructure[];
  /** Opens the dialog for one employee; otherwise the user picks. */
  employeeId?: string | null;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const setSalary = useSetSalaryStructure();
  const sending = useRef(false);
  const [employeeId, setEmployeeId] = useState('');
  const [effective, setEffective] = useState('');
  const [base, setBase] = useState('');
  const [housing, setHousing] = useState('');
  const [transport, setTransport] = useState('');
  const [other, setOther] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const latest = useMemo(
    () =>
      structures
        .filter((s) => s.employee_id === employeeId)
        .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null,
    [structures, employeeId],
  );

  useEffect(() => {
    if (!open) return;
    setEmployeeId(fixedEmployeeId ?? '');
    setEffective(todayISODate().slice(0, 7));
    setNotes('');
    setError(null);
  }, [open, fixedEmployeeId]);

  // Start from the current structure, so a raise only changes the field that moves.
  useEffect(() => {
    if (!open) return;
    setBase(latest ? String(Number(latest.base_salary)) : '');
    setHousing(latest ? String(Number(latest.housing_allowance)) : '');
    setTransport(latest ? String(Number(latest.transport_allowance)) : '');
    setOther(latest ? String(Number(latest.other_allowance)) : '');
  }, [open, latest]);

  const values = [base, housing, transport, other].map(parseAmount);
  const invalid = values.some((v) => !Number.isFinite(v) || v < 0) || !employeeId || !effective || base.trim() === '';
  const total = values.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);

  async function submit() {
    if (sending.current) return;
    sending.current = true;
    setError(null);
    try {
      await setSalary.mutateAsync({
        employeeId,
        effectiveFrom: `${effective}-01`,
        base: values[0],
        housing: values[1],
        transport: values[2],
        other: values[3],
        notes: notes.trim() || undefined,
      });
      toast.success('حُفظ هيكل الراتب', { description: `يسري من ${formatMonthKeyAr(effective)}` });
      onOpenChange(false);
    } catch (e) {
      setError(payrollErrorMessage(e));
    } finally {
      sending.current = false;
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      busy={setSalary.isPending}
      dirty
      title={latest ? 'تعديل هيكل الراتب' : 'تحديد هيكل الراتب'}
      description="يسري الهيكل من أول الشهر المختار، ويبقى الهيكل السابق محفوظاً في السجل."
      submitLabel="احفظ الهيكل"
      onSubmit={submit}
      submitDisabled={invalid}
      error={error}
      returnFocusTo={returnFocusTo}
      wide
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="الموظف" htmlFor="ss-employee">
          <EmployeeSelect
            id="ss-employee"
            employees={employees}
            value={employeeId}
            onChange={setEmployeeId}
            disabled={Boolean(fixedEmployeeId)}
          />
        </FormField>
        <MonthField label="يسري من شهر" value={effective} onChange={setEffective} minYear={Number(todayISODate().slice(0, 4)) - 3} clearLabel="اختر" />
        <FormField label="الراتب الأساسي" htmlFor="ss-base">
          <MoneyInput id="ss-base" value={base} onChange={setBase} autoFocus />
        </FormField>
        <FormField label="بدل السكن" htmlFor="ss-housing">
          <MoneyInput id="ss-housing" value={housing} onChange={setHousing} />
        </FormField>
        <FormField label="بدل النقل" htmlFor="ss-transport">
          <MoneyInput id="ss-transport" value={transport} onChange={setTransport} />
        </FormField>
        <FormField label="بدلات أخرى" htmlFor="ss-other">
          <MoneyInput id="ss-other" value={other} onChange={setOther} />
        </FormField>
      </div>
      <FormField label="ملاحظة (اختياري)" htmlFor="ss-notes">
        <Input id="ss-notes" className={FIELD_HEIGHT} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: زيادة سنوية" />
      </FormField>
      <Summary
        rows={[
          ...(latest ? [{ label: 'الإجمالي الحالي', value: <Amount value={structureTotalOf(latest)} muted /> }] : []),
          { label: 'الإجمالي الشهري الجديد', value: <Amount value={total} />, strong: true },
        ]}
      />
    </DialogShell>
  );
}

// ── Bonus / deduction / absence ──────────────────────────────────────────────

const ADDITION_CHOICES: PayrollAdjustmentKind[] = ['BONUS', 'OVERTIME'];
const DEDUCTION_CHOICES: PayrollAdjustmentKind[] = ['ABSENCE', 'PENALTY', 'OTHER_DEDUCTION'];

/** What a new bonus or deduction starts with, e.g. the deduction for an unpaid leave. */
export type AdjustmentPrefill = {
  kind?: PayrollAdjustmentKind;
  /** "YYYY-MM" */
  month?: string;
  amount?: number;
  days?: number;
  reason?: string;
  /** one choice per payroll month an unpaid leave covers: choosing a month sets its days and amount */
  choices?: Array<{ month: string; days: number; total: number }>;
};

export function AdjustmentDialog({
  open,
  onOpenChange,
  employees,
  structures,
  month,
  defaultKind = 'BONUS',
  employeeId: fixedEmployeeId,
  prefill,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  structures: PayrollSalaryStructure[];
  /** The month the screen is showing; the dialog starts on it (or on the next open month). */
  month: string;
  defaultKind?: PayrollAdjustmentKind;
  employeeId?: string;
  prefill?: AdjustmentPrefill;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const add = useAddPayrollAdjustment();
  const { data: runs } = usePayrollRuns();
  const sending = useRef(false);
  const [employeeId, setEmployeeId] = useState('');
  const [kind, setKind] = useState<PayrollAdjustmentKind>(defaultKind);
  const [pickedMonth, setPickedMonth] = useState('');
  const [amount, setAmount] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  // The form starts from what the caller asked for at the moment it opens; later renders of the caller must not reset it.
  const start = useRef({ defaultKind, fixedEmployeeId, prefill });
  useEffect(() => {
    start.current = { defaultKind, fixedEmployeeId, prefill };
  });
  useEffect(() => {
    if (!open) return;
    const { defaultKind: k, fixedEmployeeId: e, prefill: p } = start.current;
    setEmployeeId(e ?? '');
    setKind(p?.kind ?? k);
    setPickedMonth(p?.month ?? '');
    setAmount(p?.amount != null && p.amount > 0 ? String(p.amount) : '');
    setAmountTouched(p?.amount != null && p.amount > 0);
    setDays(p?.days != null ? String(p.days) : '');
    setReason(p?.reason ?? '');
    setError(null);
  }, [open]);

  const postedMonths = useMemo(
    () => new Set((runs ?? []).filter((r) => r.status === 'POSTED').map((r) => monthKeyOf(r.period_month))),
    [runs],
  );
  const choices = useMemo(
    () => adjustmentMonthChoices(todayISODate(), postedMonths, [monthKeyOf(month), prefill?.month ?? '', ...(prefill?.choices ?? []).map((c) => c.month)]),
    [postedMonths, month, prefill],
  );
  const selectedMonth =
    pickedMonth && choices.some((c) => c.month === pickedMonth && !c.posted) ? pickedMonth : defaultAdjustmentMonth(choices, prefill?.month ?? month);

  const inForce = employeeId ? structureInForce(structures.filter((s) => s.employee_id === employeeId), selectedMonth) : null;
  const pay = structureTotalOf(inForce);
  const dayRate = unpaidDayRate(pay);
  const daysNumber = days.trim() === '' ? null : Number(days);
  const autoAmount = kind === 'ABSENCE' && daysNumber !== null && Number.isFinite(daysNumber) && daysNumber > 0 ? suggestedUnpaidDeduction(pay, daysNumber) : 0;
  // an amount worked out from the days follows them until the accountant types one of their own
  const amountText = !amountTouched && autoAmount > 0 ? String(autoAmount) : amount;

  const amountValue = parseAmount(amountText);
  const invalid =
    !employeeId ||
    !selectedMonth ||
    !Number.isFinite(amountValue) ||
    amountValue <= 0 ||
    reason.trim().length < 3 ||
    (kind === 'ABSENCE' && daysNumber !== null && (!Number.isFinite(daysNumber) || daysNumber <= 0));

  const adds = ADJUSTMENT_IS_ADDITION[kind];

  function pickMonth(next: string) {
    setPickedMonth(next);
    const leaveChoice = prefill?.choices?.find((c) => c.month === next);
    if (leaveChoice) {
      setDays(String(leaveChoice.days));
      // no salary for that month: the amount is left for the accountant to type
      setAmount(leaveChoice.total > 0 ? String(leaveChoice.total) : '');
      setAmountTouched(leaveChoice.total > 0);
    }
  }

  async function submit() {
    if (sending.current) return;
    sending.current = true;
    setError(null);
    try {
      await add.mutateAsync({
        employeeId,
        month: selectedMonth,
        kind,
        amount: amountValue,
        reason: reason.trim(),
        days: kind === 'ABSENCE' ? daysNumber : null,
      });
      toast.success(`سُجّلت ${ADJUSTMENT_KIND_LABEL[kind]}`, { description: 'بانتظار اعتماد المالك أو المدير' });
      onOpenChange(false);
    } catch (e) {
      setError(payrollErrorMessage(e));
    } finally {
      sending.current = false;
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      busy={add.isPending}
      dirty={reason.trim() !== '' || amount.trim() !== ''}
      title="مكافأة أو خصم"
      description="تُسجَّل الحركة بانتظار اعتماد المالك أو المدير، وتدخل كشف الشهر بعد اعتمادها."
      submitLabel="سجّل الحركة"
      onSubmit={submit}
      submitDisabled={invalid}
      error={error}
      returnFocusTo={returnFocusTo}
    >
      <FormField label="الموظف" htmlFor="adj-employee">
        <EmployeeSelect id="adj-employee" employees={employees} value={employeeId} onChange={setEmployeeId} disabled={Boolean(fixedEmployeeId)} />
      </FormField>

      <div className="flex flex-col gap-3">
        <FormField label="إضافة إلى الراتب">
          <ChoiceChips
            label="إضافة إلى الراتب"
            value={ADDITION_CHOICES.includes(kind) ? kind : ('' as PayrollAdjustmentKind)}
            onChange={setKind}
            columns="grid-cols-2"
            choices={ADDITION_CHOICES.map((k) => ({ value: k, label: ADJUSTMENT_KIND_LABEL[k], tone: 'success' as const }))}
          />
        </FormField>
        <FormField label="خصم من الراتب">
          <ChoiceChips
            label="خصم من الراتب"
            value={DEDUCTION_CHOICES.includes(kind) ? kind : ('' as PayrollAdjustmentKind)}
            onChange={setKind}
            columns="grid-cols-3"
            choices={DEDUCTION_CHOICES.map((k) => ({ value: k, label: ADJUSTMENT_KIND_LABEL[k], tone: 'danger' as const }))}
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="شهر الراتب" htmlFor="adj-month" hint="لا تُضاف حركة إلى شهر رواتبه مُرحَّل.">
          <NativeSelect id="adj-month" value={selectedMonth} onChange={(e) => pickMonth(e.target.value)}>
            {choices.map((c) => {
              const covered = prefill?.choices?.find((x) => x.month === c.month);
              return (
                <option key={c.month} value={c.month} disabled={c.posted}>
                  {formatMonthKeyAr(c.month)}
                  {c.posted ? ' (مُرحَّل)' : covered ? ` (${arabicCount(covered.days, ['يوم', 'يومان', 'أيام', 'يوماً'])})` : ''}
                </option>
              );
            })}
          </NativeSelect>
        </FormField>
        {kind === 'ABSENCE' && (
          <FormField
            label="أيام الغياب"
            htmlFor="adj-days"
            hint={dayRate > 0 ? <>أجر اليوم <Amount value={dayRate} className="text-[11.5px]" /> (الراتب ÷ 30)</> : 'لا هيكل راتب للموظف في هذا الشهر، فاكتب المبلغ بنفسك.'}
          >
            <Input id="adj-days" inputMode="decimal" dir="ltr" className={`${FIELD_HEIGHT} text-end tabular-nums`} value={days} onChange={(e) => setDays(e.target.value)} />
          </FormField>
        )}
        <FormField label="المبلغ" htmlFor="adj-amount" className={kind === 'ABSENCE' ? 'sm:col-span-2' : undefined}>
          <MoneyInput
            id="adj-amount"
            value={amountText}
            onChange={(v) => {
              setAmount(v);
              setAmountTouched(true);
            }}
          />
        </FormField>
      </div>

      <FormField label="السبب" htmlFor="adj-reason" hint="يظهر في سجل الموظف وفي قسيمة الراتب.">
        <Textarea id="adj-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </FormField>

      {Number.isFinite(amountValue) && amountValue > 0 && (
        <Summary
          rows={[
            ...(pay > 0 ? [{ label: 'الراتب الشهري', value: <Amount value={pay} muted /> }] : []),
            {
              label: adds ? 'يُضاف إلى راتب الشهر' : 'يُخصم من راتب الشهر',
              value: <Amount value={amountValue} tone={adds ? 'positive' : 'negative'} />,
              strong: pay <= 0,
            },
            ...(pay > 0
              ? [{ label: 'الراتب بعد الحركة، قبل أقساط السلف', value: <Amount value={round3(pay + (adds ? amountValue : -amountValue))} />, strong: true }]
              : []),
          ]}
        />
      )}
    </DialogShell>
  );
}

// ── Advance ──────────────────────────────────────────────────────────────────

export function AdvanceDialog({
  open,
  onOpenChange,
  employees,
  employeeId: fixedEmployeeId,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  /** Opens the dialog for one employee; otherwise the user picks. */
  employeeId?: string;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const issue = useIssuePayrollAdvance();
  const { data: cashboxes = NO_CASHBOXES } = useCashboxes();
  const sending = useRef(false);
  const [employeeId, setEmployeeId] = useState('');
  const [amount, setAmount] = useState('');
  const [installments, setInstallments] = useState('3');
  const [cashboxChoice, setCashboxChoice] = useState('');
  const [issuedOn, setIssuedOn] = useState(todayISODate());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmployeeId(fixedEmployeeId ?? '');
    setAmount('');
    setInstallments('3');
    setIssuedOn(todayISODate());
    setReason('');
    setError(null);
    setCashboxChoice('');
  }, [open, fixedEmployeeId]);
  // the cashbox is the one picked, else the preferred one of whatever list has arrived: a refreshed list must not clear the form
  const cashboxId = cashboxChoice || preferredCashboxId(cashboxes);

  const amountValue = parseAmount(amount);
  const count = Number(installments);
  const validCount = Number.isInteger(count) && count >= 1 && count <= 60;
  const invalid =
    !employeeId || !cashboxId || !Number.isFinite(amountValue) || amountValue <= 0 || !validCount || reason.trim().length < 3 || !issuedOn;

  async function submit() {
    if (sending.current) return;
    sending.current = true;
    setError(null);
    try {
      await issue.mutateAsync({ employeeId, amount: amountValue, installments: count, cashboxId, issuedOn, reason: reason.trim() });
      toast.success('صُرفت السلفة', { description: 'سُجّلت حركة صرف من الخزينة، وتُستقطع الأقساط من كشوف الأشهر القادمة.' });
      onOpenChange(false);
    } catch (e) {
      setError(payrollErrorMessage(e));
    } finally {
      sending.current = false;
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      busy={issue.isPending}
      dirty={amount.trim() !== '' || reason.trim() !== ''}
      title="صرف سلفة"
      description="تُصرف من الخزينة الآن، ويُستقطع قسطها من كشف كل شهر حتى تُسدَّد."
      submitLabel="اصرف السلفة"
      onSubmit={submit}
      submitDisabled={invalid}
      error={error}
      returnFocusTo={returnFocusTo}
    >
      <FormField label="الموظف" htmlFor="adv-employee">
        <EmployeeSelect id="adv-employee" employees={employees} value={employeeId} onChange={setEmployeeId} disabled={Boolean(fixedEmployeeId)} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="مبلغ السلفة" htmlFor="adv-amount">
          <MoneyInput id="adv-amount" value={amount} onChange={setAmount} autoFocus />
        </FormField>
        <FormField label="عدد الأقساط" htmlFor="adv-installments" hint="من 1 إلى 60 شهراً">
          <Input id="adv-installments" inputMode="numeric" dir="ltr" className={`${FIELD_HEIGHT} text-end tabular-nums`} value={installments} onChange={(e) => setInstallments(e.target.value)} />
        </FormField>
        <FormField label="الخزينة" htmlFor="adv-cashbox">
          <Select value={cashboxId} onValueChange={setCashboxChoice}>
            <SelectTrigger id="adv-cashbox" className={FIELD_HEIGHT}>
              <SelectValue placeholder="اختر الخزينة" />
            </SelectTrigger>
            <SelectContent>
              {cashboxes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name_ar}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="تاريخ الصرف" htmlFor="adv-date">
          <Input id="adv-date" type="date" dir="ltr" className={FIELD_HEIGHT} value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
        </FormField>
      </div>
      <FormField label="السبب" htmlFor="adv-reason">
        <Textarea id="adv-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </FormField>
      {Number.isFinite(amountValue) && amountValue > 0 && validCount && (
        <Summary
          rows={[
            { label: 'القسط الشهري', value: <Amount value={round3(amountValue / count)} />, strong: true },
            { label: 'مدة السداد', value: monthsLabel(count) },
          ]}
        />
      )}
    </DialogShell>
  );
}

// ── Paying salaries (one line, or every outstanding line) ───────────────────

const METHOD_LABEL: Record<PayLineInput['method'], string> = {
  CASH: 'نقداً',
  TRANSFER: 'حوالة مصرفية',
  CHEQUE: 'صك',
  CARD: 'بطاقة',
};

/** A stable empty list: a fresh `[]` default on every render would re-run the reset effects forever. */
const NO_CASHBOXES: CashboxRow[] = [];

type PaymentValues = { cashboxId: string; paidOn: string; method: PayLineInput['method'] };

function usePaymentValues(open: boolean) {
  const { data: cashboxes = NO_CASHBOXES } = useCashboxes();
  const [picked, setPicked] = useState<PaymentValues>({ cashboxId: '', paidOn: todayISODate(), method: 'CASH' });
  useEffect(() => {
    if (open) setPicked({ cashboxId: '', paidOn: todayISODate(), method: 'CASH' });
  }, [open]);
  // the cashbox is the one picked, else the preferred one of whatever list has arrived: a refreshed list must not reset the date or method
  const values = useMemo<PaymentValues>(() => ({ ...picked, cashboxId: picked.cashboxId || preferredCashboxId(cashboxes) }), [picked, cashboxes]);
  return { cashboxes, values, setValues: setPicked };
}

/** Cashbox, date and method — the same three fields for paying one salary or many. */
function PaymentFields({
  idPrefix,
  cashboxes,
  values,
  onChange,
}: {
  idPrefix: string;
  cashboxes: CashboxRow[];
  values: PaymentValues;
  onChange: (values: PaymentValues) => void;
}) {
  return (
    <>
      <FormField label="الخزينة" htmlFor={`${idPrefix}-cashbox`}>
        <Select value={values.cashboxId} onValueChange={(cashboxId) => onChange({ ...values, cashboxId })}>
          <SelectTrigger id={`${idPrefix}-cashbox`} className={FIELD_HEIGHT}>
            <SelectValue placeholder="اختر الخزينة" />
          </SelectTrigger>
          <SelectContent>
            {cashboxes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name_ar}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label="تاريخ الصرف" htmlFor={`${idPrefix}-date`}>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          dir="ltr"
          className={FIELD_HEIGHT}
          value={values.paidOn}
          onChange={(e) => onChange({ ...values, paidOn: e.target.value })}
        />
      </FormField>
      <FormField label="طريقة الصرف" htmlFor={`${idPrefix}-method`}>
        <Select value={values.method} onValueChange={(v) => onChange({ ...values, method: v as PayLineInput['method'] })}>
          <SelectTrigger id={`${idPrefix}-method`} className={FIELD_HEIGHT}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(METHOD_LABEL) as PayLineInput['method'][]).map((m) => (
              <SelectItem key={m} value={m}>
                {METHOD_LABEL[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
    </>
  );
}

export function PayLineDialog({
  line,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  line: PayrollRunLine | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const pay = usePayPayrollLine();
  const sending = useRef(false);
  const { cashboxes, values, setValues } = usePaymentValues(open && Boolean(line));
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const outstanding = Number(line?.outstanding) || 0;

  useEffect(() => {
    if (open && line) {
      setAmount(String(round3(Number(line.outstanding) || 0)));
      setError(null);
    }
  }, [open, line]);

  const amountValue = parseAmount(amount);
  const invalid =
    !line || !values.cashboxId || !Number.isFinite(amountValue) || amountValue <= 0 || amountValue > outstanding + 0.0005;

  async function submit() {
    if (!line || sending.current) return;
    sending.current = true;
    setError(null);
    try {
      await pay.mutateAsync({ lineId: line.id, amount: amountValue, ...values });
      toast.success(`صُرف راتب ${line.employee_name}`);
      onOpenChange(false);
    } catch (e) {
      setError(payrollErrorMessage(e));
    } finally {
      sending.current = false;
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      busy={pay.isPending}
      title="صرف راتب"
      description={line ? `${line.employee_name} · ${formatMonthKeyAr(line.period_month.slice(0, 7))}` : undefined}
      submitLabel="اصرف المبلغ"
      onSubmit={submit}
      submitDisabled={invalid}
      error={error}
      returnFocusTo={returnFocusTo}
    >
      {line && (
        <Summary
          rows={[
            { label: 'صافي الراتب', value: <Amount value={line.net} /> },
            { label: 'صُرف سابقاً', value: <Amount value={line.paid} muted /> },
            { label: 'المتبقي', value: <Amount value={outstanding} />, strong: true },
          ]}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="المبلغ"
          htmlFor="pay-amount"
          hint={amountValue > outstanding + 0.0005 ? 'المبلغ أكبر من المتبقي' : 'يمكن الصرف على دفعات'}
        >
          <MoneyInput id="pay-amount" value={amount} onChange={setAmount} autoFocus />
        </FormField>
        <PaymentFields idPrefix="pay" cashboxes={cashboxes} values={values} onChange={setValues} />
      </div>
    </DialogShell>
  );
}

/**
 * Pays what is still owed on each line (one database call per employee, with the same checks as
 * paying one line). Lines that fail are listed and stay unpaid; the others are saved, and the
 * dialog can be submitted again — it only pays what is still outstanding.
 */
export function PayAllDialog({
  lines,
  month,
  open,
  onOpenChange,
}: {
  lines: PayrollRunLine[];
  month: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const payMany = usePayPayrollLines();
  const { cashboxes, values, setValues } = usePaymentValues(open);
  const [done, setDone] = useState(0);
  const [failures, setFailures] = useState<Array<{ lineId: string; name: string; message: string }>>([]);

  const due = useMemo(() => lines.filter((l) => (Number(l.outstanding) || 0) >= 0.0005), [lines]);
  const total = due.reduce((s, l) => s + (Number(l.outstanding) || 0), 0);

  useEffect(() => {
    if (!open) return;
    setDone(0);
    setFailures([]);
  }, [open]);

  async function submit() {
    setDone(0);
    setFailures([]);
    const results = await payMany.mutateAsync({
      lines: due.map((l) => ({ lineId: l.id, amount: round3(Number(l.outstanding)) })),
      ...values,
      onProgress: setDone,
    });
    const names = new Map(due.map((l) => [l.id, l.employee_name]));
    const failed = results
      .filter((r) => !r.ok)
      .map((r) => ({ lineId: r.lineId, name: names.get(r.lineId) ?? '', message: r.message ?? '' }));
    setFailures(failed);
    if (failed.length === 0) {
      toast.success(`صُرفت رواتب ${formatMonthKeyAr(month)}`, { description: arabicCount(results.length, ['موظف واحد', 'موظفان', 'موظفين', 'موظفاً']) });
      onOpenChange(false);
    } else {
      toast.error(`لم يُصرف راتب ${failed.length} من ${results.length}`, { description: 'صُرفت البقية؛ صحّح السبب ثم أعد المحاولة' });
    }
  }

  const busy = payMany.isPending;
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title="صرف كل الرواتب المتبقية"
      description={`كشف ${formatMonthKeyAr(month)}: حركة صرف منفصلة لكل موظف من الخزينة المختارة.`}
      wide
      submitLabel={busy ? `جارٍ الصرف ${done}/${due.length}` : failures.length ? `أعد المحاولة (${due.length})` : `اصرف ${arabicCount(due.length, ['راتباً واحداً', 'راتبين', 'رواتب', 'راتباً'])}`}
      onSubmit={submit}
      submitDisabled={!values.cashboxId || due.length === 0}
    >
      <Summary
        rows={[
          { label: 'عدد الموظفين', value: <span className="tabular-nums">{due.length}</span> },
          { label: 'إجمالي المبلغ', value: <Amount value={total} />, strong: true },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <PaymentFields idPrefix="payall" cashboxes={cashboxes} values={values} onChange={setValues} />
      </div>
      {failures.length > 0 && (
        <div className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12.5px] text-danger-ink" role="alert">
          <p className="font-semibold">لم يُصرف:</p>
          <ul className="mt-1 list-disc ps-5">
            {failures.map((f) => (
              <li key={f.lineId}>
                {f.name}: {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </DialogShell>
  );
}

// ── An action that needs a written reason (reverse, cancel) ─────────────────

export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<void>;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onOpenChange(false);
    } catch (e) {
      setError(payrollErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      dirty={reason.trim() !== ''}
      title={title}
      description={description}
      submitLabel={confirmLabel}
      onSubmit={submit}
      submitDisabled={reason.trim().length < 3}
      tone="danger"
      error={error}
      returnFocusTo={returnFocusTo}
    >
      <FormField label="السبب" htmlFor="reason-text" hint="يُحفظ في سجل الرقابة">
        <Textarea id="reason-text" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </FormField>
    </DialogShell>
  );
}
