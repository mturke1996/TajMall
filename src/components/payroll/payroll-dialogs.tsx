'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCashboxes } from '@/lib/db/queries';
import type { CashboxRow, ContactRow } from '@/lib/db/types';
import {
  ADJUSTMENT_IS_ADDITION,
  ADJUSTMENT_KIND_LABEL,
  payrollErrorMessage,
  structureForMonth,
  structureTotal,
  useAddPayrollAdjustment,
  useIssuePayrollAdvance,
  usePayPayrollLine,
  usePayPayrollLines,
  useSetSalaryStructure,
  type PayLineInput,
  type PayrollAdjustmentKind,
  type PayrollRunLine,
  type PayrollSalaryStructure,
} from '@/lib/db/payroll-queries';
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
  if (n === 1) return 'شهر واحد';
  if (n === 2) return 'شهران';
  return `${n} ${n <= 10 ? 'أشهر' : 'شهراً'}`;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

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
}) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!busy && !submitDisabled) onSubmit();
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className={wide ? 'max-w-xl' : 'max-w-md'} dir="rtl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {children}
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              تراجع
            </Button>
            <Button type="submit" variant={tone === 'danger' ? 'destructive' : 'default'} disabled={busy || submitDisabled}>
              {busy && <Loader2 className="animate-spin" />}
              {submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
      className="text-end tabular-nums"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0.000"
      autoFocus={autoFocus}
    />
  );
}

/** A quiet box that restates the result before saving. */
function Summary({ rows }: { rows: Array<{ label: string; value: ReactNode; strong?: boolean }> }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-lg border border-border bg-canvas-sunken px-4 py-3 text-[13px]">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className={r.strong ? 'font-semibold' : 'text-muted-foreground'}>{r.label}</dt>
          <dd className={r.strong ? 'font-semibold' : undefined}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Salary structure ─────────────────────────────────────────────────────────

export function SalaryStructureDialog({
  open,
  onOpenChange,
  employees,
  structures,
  employeeId: fixedEmployeeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  structures: PayrollSalaryStructure[];
  /** Opens the dialog for one employee; otherwise the user picks. */
  employeeId?: string | null;
}) {
  const setSalary = useSetSalaryStructure();
  const [employeeId, setEmployeeId] = useState('');
  const [effective, setEffective] = useState('');
  const [base, setBase] = useState('');
  const [housing, setHousing] = useState('');
  const [transport, setTransport] = useState('');
  const [other, setOther] = useState('');
  const [notes, setNotes] = useState('');

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
      toast.error('لم يُحفظ هيكل الراتب', { description: payrollErrorMessage(e) });
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      busy={setSalary.isPending}
      title={latest ? 'تعديل هيكل الراتب' : 'تحديد هيكل الراتب'}
      description="يسري الهيكل من أول الشهر المختار، ويبقى الهيكل السابق محفوظاً في السجل."
      submitLabel="احفظ الهيكل"
      onSubmit={submit}
      submitDisabled={invalid}
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
        <FormField label="يسري من شهر" htmlFor="ss-effective">
          <Input id="ss-effective" type="month" dir="ltr" value={effective} onChange={(e) => setEffective(e.target.value)} />
        </FormField>
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
        <Input id="ss-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: زيادة سنوية" />
      </FormField>
      <Summary
        rows={[
          ...(latest ? [{ label: 'الإجمالي الحالي', value: <Amount value={structureTotal(latest)} muted /> }] : []),
          { label: 'الإجمالي الشهري الجديد', value: <Amount value={total} />, strong: true },
        ]}
      />
    </DialogShell>
  );
}

// ── Bonus / deduction / absence ──────────────────────────────────────────────

const KIND_ORDER: PayrollAdjustmentKind[] = ['BONUS', 'OVERTIME', 'ABSENCE', 'PENALTY', 'OTHER_DEDUCTION'];

export function AdjustmentDialog({
  open,
  onOpenChange,
  employees,
  structures,
  month,
  defaultKind = 'BONUS',
  employeeId: fixedEmployeeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  structures: PayrollSalaryStructure[];
  month: string;
  defaultKind?: PayrollAdjustmentKind;
  employeeId?: string;
}) {
  const add = useAddPayrollAdjustment();
  const [employeeId, setEmployeeId] = useState('');
  const [kind, setKind] = useState<PayrollAdjustmentKind>(defaultKind);
  const [amount, setAmount] = useState('');
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    setEmployeeId(fixedEmployeeId ?? '');
    setKind(defaultKind);
    setAmount('');
    setDays('');
    setReason('');
  }, [open, defaultKind, fixedEmployeeId]);

  const structure = employeeId ? structureForMonth(structures, employeeId, month) : null;
  // A day of absence is the monthly salary over 30 days, the common practice for monthly pay.
  const dailyRate = structure ? structureTotal(structure) / 30 : 0;

  useEffect(() => {
    if (kind !== 'ABSENCE') return;
    const d = Number(days);
    if (Number.isFinite(d) && d > 0 && dailyRate > 0) setAmount(String(round3(d * dailyRate)));
  }, [kind, days, dailyRate]);

  const amountValue = parseAmount(amount);
  const daysValue = days.trim() === '' ? null : Number(days);
  const invalid =
    !employeeId ||
    !Number.isFinite(amountValue) ||
    amountValue <= 0 ||
    reason.trim().length < 3 ||
    (daysValue !== null && (!Number.isFinite(daysValue) || daysValue <= 0));

  async function submit() {
    try {
      await add.mutateAsync({
        employeeId,
        month,
        kind,
        amount: amountValue,
        reason: reason.trim(),
        days: kind === 'ABSENCE' ? daysValue : null,
      });
      toast.success(`سُجّلت ${ADJUSTMENT_KIND_LABEL[kind]}`, { description: 'بانتظار اعتماد المالك أو المدير' });
      onOpenChange(false);
    } catch (e) {
      toast.error('لم تُسجَّل الحركة', { description: payrollErrorMessage(e) });
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      busy={add.isPending}
      title="مكافأة أو خصم"
      description={`لشهر ${formatMonthKeyAr(month)}. تدخل الحركة كشف الشهر بعد اعتمادها فقط.`}
      submitLabel="سجّل الحركة"
      onSubmit={submit}
      submitDisabled={invalid}
    >
      <FormField label="الموظف" htmlFor="adj-employee">
        <EmployeeSelect
          id="adj-employee"
          employees={employees}
          value={employeeId}
          onChange={setEmployeeId}
          disabled={Boolean(fixedEmployeeId)}
        />
      </FormField>
      <FormField label="نوع الحركة">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" role="radiogroup" aria-label="نوع الحركة">
          {KIND_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={
                'h-9 rounded-md border px-2 text-[12.5px] font-medium transition-colors ' +
                (kind === k
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-ink-soft hover:bg-canvas-sunken')
              }
            >
              {ADJUSTMENT_KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        {kind === 'ABSENCE' && (
          <FormField
            label="أيام الغياب"
            htmlFor="adj-days"
            hint={dailyRate > 0 ? <>أجر اليوم <Amount value={round3(dailyRate)} className="text-[11.5px]" /></> : 'حدد هيكل راتب للموظف ليُحسب المبلغ'}
          >
            <Input id="adj-days" inputMode="decimal" dir="ltr" className="text-end tabular-nums" value={days} onChange={(e) => setDays(e.target.value)} />
          </FormField>
        )}
        <FormField label="المبلغ" htmlFor="adj-amount" className={kind === 'ABSENCE' ? undefined : 'sm:col-span-2'}>
          <MoneyInput id="adj-amount" value={amount} onChange={setAmount} />
        </FormField>
      </div>
      <FormField label="السبب" htmlFor="adj-reason">
        <Textarea id="adj-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب واضح يظهر في السجل وفي قسيمة الراتب" />
      </FormField>
      {Number.isFinite(amountValue) && amountValue > 0 && (
        <Summary
          rows={[
            {
              label: ADJUSTMENT_IS_ADDITION[kind] ? 'يُضاف إلى الراتب' : 'يُخصم من الراتب',
              value: <Amount value={amountValue} tone={ADJUSTMENT_IS_ADDITION[kind] ? 'positive' : 'negative'} />,
              strong: true,
            },
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
}) {
  const issue = useIssuePayrollAdvance();
  const { data: cashboxes = NO_CASHBOXES } = useCashboxes();
  const [employeeId, setEmployeeId] = useState('');
  const [amount, setAmount] = useState('');
  const [installments, setInstallments] = useState('3');
  const [cashboxId, setCashboxId] = useState('');
  const [issuedOn, setIssuedOn] = useState(todayISODate());
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    setEmployeeId('');
    setAmount('');
    setInstallments('3');
    setIssuedOn(todayISODate());
    setReason('');
    setCashboxId(preferredCashboxId(cashboxes));
  }, [open, cashboxes]);

  const amountValue = parseAmount(amount);
  const count = Number(installments);
  const validCount = Number.isInteger(count) && count >= 1 && count <= 60;
  const invalid =
    !employeeId || !cashboxId || !Number.isFinite(amountValue) || amountValue <= 0 || !validCount || reason.trim().length < 3;

  async function submit() {
    try {
      await issue.mutateAsync({ employeeId, amount: amountValue, installments: count, cashboxId, issuedOn, reason: reason.trim() });
      toast.success('صُرفت السلفة', { description: 'سُجّلت حركة صرف من الخزينة، وتُستقطع الأقساط من كشوف الأشهر القادمة.' });
      onOpenChange(false);
    } catch (e) {
      toast.error('لم تُصرف السلفة', { description: payrollErrorMessage(e) });
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      busy={issue.isPending}
      title="صرف سلفة"
      description="تُصرف من الخزينة الآن وتُستقطع أقساطها تلقائياً من كشف كل شهر حتى تُسدَّد."
      submitLabel="اصرف السلفة"
      onSubmit={submit}
      submitDisabled={invalid}
    >
      <FormField label="الموظف" htmlFor="adv-employee">
        <EmployeeSelect id="adv-employee" employees={employees} value={employeeId} onChange={setEmployeeId} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="مبلغ السلفة" htmlFor="adv-amount">
          <MoneyInput id="adv-amount" value={amount} onChange={setAmount} />
        </FormField>
        <FormField label="عدد الأقساط" htmlFor="adv-installments" hint="من 1 إلى 60 شهراً">
          <Input id="adv-installments" inputMode="numeric" dir="ltr" className="text-end tabular-nums" value={installments} onChange={(e) => setInstallments(e.target.value)} />
        </FormField>
        <FormField label="الخزينة" htmlFor="adv-cashbox">
          <Select value={cashboxId} onValueChange={setCashboxId}>
            <SelectTrigger id="adv-cashbox">
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
          <Input id="adv-date" type="date" dir="ltr" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
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
  const [values, setValues] = useState<PaymentValues>({ cashboxId: '', paidOn: todayISODate(), method: 'CASH' });
  useEffect(() => {
    if (open) setValues({ cashboxId: preferredCashboxId(cashboxes), paidOn: todayISODate(), method: 'CASH' });
  }, [open, cashboxes]);
  return { cashboxes, values, setValues };
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
          <SelectTrigger id={`${idPrefix}-cashbox`}>
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
          value={values.paidOn}
          onChange={(e) => onChange({ ...values, paidOn: e.target.value })}
        />
      </FormField>
      <FormField label="طريقة الصرف" htmlFor={`${idPrefix}-method`}>
        <Select value={values.method} onValueChange={(v) => onChange({ ...values, method: v as PayLineInput['method'] })}>
          <SelectTrigger id={`${idPrefix}-method`}>
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
}: {
  line: PayrollRunLine | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pay = usePayPayrollLine();
  const { cashboxes, values, setValues } = usePaymentValues(open && Boolean(line));
  const [amount, setAmount] = useState('');
  const outstanding = Number(line?.outstanding) || 0;

  useEffect(() => {
    if (open && line) setAmount(String(round3(Number(line.outstanding) || 0)));
  }, [open, line]);

  const amountValue = parseAmount(amount);
  const invalid =
    !line || !values.cashboxId || !Number.isFinite(amountValue) || amountValue <= 0 || amountValue > outstanding + 0.0005;

  async function submit() {
    if (!line) return;
    try {
      await pay.mutateAsync({ lineId: line.id, amount: amountValue, ...values });
      toast.success(`صُرف راتب ${line.employee_name}`);
      onOpenChange(false);
    } catch (e) {
      toast.error('لم يُصرف الراتب', { description: payrollErrorMessage(e) });
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      busy={pay.isPending}
      title="صرف راتب"
      description={line ? `${line.employee_name} — ${formatMonthKeyAr(line.period_month)}` : undefined}
      submitLabel="اصرف المبلغ"
      onSubmit={submit}
      submitDisabled={invalid}
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
      description={`كشف ${formatMonthKeyAr(month)} — حركة صرف منفصلة لكل موظف من الخزينة المختارة.`}
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
                {f.name} — {f.message}
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  async function submit() {
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      onOpenChange(false);
    } catch (e) {
      toast.error('لم تكتمل العملية', { description: payrollErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={title}
      description={description}
      submitLabel={confirmLabel}
      onSubmit={submit}
      submitDisabled={reason.trim().length < 3}
      tone="danger"
    >
      <FormField label="السبب" htmlFor="reason-text" hint="يُحفظ في سجل الرقابة">
        <Textarea id="reason-text" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </FormField>
    </DialogShell>
  );
}
