'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Amount, FormField } from '@/components/payroll/payroll-ui';
import { FIELD_HEIGHT, SummaryBox } from '@/components/employees/form-parts';
import { SheetDialog } from '@/components/employees/sheet-dialog';
import { useCashboxes, useCreateTransaction, type EmployeeSummary } from '@/lib/db/queries';
import type { CashboxRow } from '@/lib/db/types';
import { friendlyError } from '@/lib/user-messages';
import { parseAmountInput, preferredCashboxId, todayISODate } from '@/lib/utils';

export type SalaryPaymentEmployee = Pick<EmployeeSummary, 'id' | 'name' | 'job_title' | 'department' | 'salary' | 'last_12_months_salary_paid'>;

type RecordSalaryPaymentDialogProps = {
  employee: SalaryPaymentEmployee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
};

/** A stable empty list: a fresh `[]` default on every render would re-run the reset effect on every keystroke. */
const NO_CASHBOXES: CashboxRow[] = [];

/**
 * A salary recorded as a plain expense. It is the fallback for a database that has no payroll yet; once payroll is
 * there, salaries are paid from the posted month of the employee's payroll instead (PayLineDialog).
 */
export function RecordSalaryPaymentDialog({ employee, open, onOpenChange, onSuccess, returnFocusTo }: RecordSalaryPaymentDialogProps) {
  const { data: cashboxes = NO_CASHBOXES } = useCashboxes();
  const createTransaction = useCreateTransaction();
  // The category lookup runs before the mutation starts, so isPending alone leaves a window for a second tap.
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => todayISODate());
  const [cashboxChoice, setCashboxChoice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const salary = Number(employee?.salary) || 0;
  const paid12 = Number(employee?.last_12_months_salary_paid) || 0;

  // The form starts over when the dialog opens for an employee, not whenever the caller renders again or the
  // cashbox list refreshes: a typed amount must survive both.
  const employeeId = employee?.id ?? null;
  useEffect(() => {
    if (open && employeeId) {
      setPaymentAmount(salary > 0 ? String(salary) : '');
      setPaymentDate(todayISODate());
      setCashboxChoice('');
      setError(null);
    }
  }, [open, employeeId, salary]);
  // the cashbox is the one picked, else the preferred one of whatever list has arrived
  const cashboxId = cashboxChoice || preferredCashboxId(cashboxes);

  const amount = parseAmountInput(paymentAmount);
  const invalid = !employee || !Number.isFinite(amount) || amount <= 0 || !paymentDate || !cashboxId;

  async function handleSubmit() {
    if (!employee || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const supabase = (await import('@/lib/supabase/client')).createSupabaseBrowserClient();
      // EXP-SAL is the account; EXP-SLR is the older code some databases still use
      const { data: salaryCats, error: catErr } = await supabase.from('categories').select('id, code').in('code', ['EXP-SAL', 'EXP-SLR']);
      if (catErr) throw catErr;
      const expenseCat = salaryCats?.find((c) => c.code === 'EXP-SAL') ?? salaryCats?.find((c) => c.code === 'EXP-SLR') ?? null;
      if (!expenseCat) {
        setError('حساب مصروف الرواتب غير موجود في دليل الحسابات. أبلغ مسؤول النظام.');
        return;
      }
      await createTransaction.mutateAsync({
        kind: 'EXPENSE',
        amount,
        method: 'CASH',
        category_id: expenseCat.id,
        cashbox_id: cashboxId,
        tx_date: paymentDate,
        description: `راتب ${employee.name}`,
        contact_id: employee.id,
        contact_type: 'BENEFICIARY',
      });
      toast.success('سُجّل الراتب', { description: employee.name });
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error('[salary-payment]', err);
      setError(friendlyError(err, 'لم يُسجَّل الراتب. تحقق من الخزينة والمبلغ ثم أعد المحاولة.'));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <SheetDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy || createTransaction.isPending}
      dirty={paymentAmount.trim() !== ''}
      title="تسجيل راتب"
      description={employee ? `${employee.name}${employee.job_title ? ` · ${employee.job_title}` : ''}` : undefined}
      onSubmit={() => void handleSubmit()}
      submitLabel="سجّل الراتب"
      submitDisabled={invalid}
      error={error}
      returnFocusTo={returnFocusTo}
    >
      {employee && (
        <SummaryBox
          rows={[
            { label: 'الراتب المحدد', value: salary > 0 ? <Amount value={salary} /> : '—' },
            { label: 'المدفوع آخر 12 شهراً', value: <Amount value={paid12} muted /> },
          ]}
        />
      )}
      <FormField
        label="المبلغ"
        htmlFor="sal-amount"
        hint={
          salary > 0 && Math.abs(amount - salary) > 0.0005 ? (
            <Button type="button" variant="link" className="h-auto min-h-0 p-0 text-[11.5px]" onClick={() => setPaymentAmount(String(salary))}>
              أعد المبلغ إلى الراتب المحدد
            </Button>
          ) : undefined
        }
      >
        <Input id="sal-amount" inputMode="decimal" dir="ltr" className={`${FIELD_HEIGHT} text-end tabular-nums`} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} autoFocus />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="تاريخ الدفع" htmlFor="sal-date">
          <Input id="sal-date" type="date" dir="ltr" className={FIELD_HEIGHT} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </FormField>
        <FormField label="الخزينة" htmlFor="sal-cashbox">
          <Select value={cashboxId} onValueChange={setCashboxChoice}>
            <SelectTrigger id="sal-cashbox" className={FIELD_HEIGHT}>
              <SelectValue placeholder="اختر الخزينة" />
            </SelectTrigger>
            <SelectContent>
              {cashboxes.map((cb) => (
                <SelectItem key={cb.id} value={cb.id}>
                  {cb.name_ar}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>
    </SheetDialog>
  );
}
