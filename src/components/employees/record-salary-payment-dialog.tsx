'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCashboxes,
  useCreateTransaction,
  type EmployeeSummary,
} from '@/lib/db/queries';
import { formatMoney } from '@/lib/utils';
import { toast } from 'sonner';

export type SalaryPaymentEmployee = Pick<
  EmployeeSummary,
  'id' | 'name' | 'job_title' | 'department' | 'salary' | 'last_12_months_salary_paid'
>;

type RecordSalaryPaymentDialogProps = {
  employee: SalaryPaymentEmployee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export function RecordSalaryPaymentDialog({
  employee,
  open,
  onOpenChange,
  onSuccess,
}: RecordSalaryPaymentDialogProps) {
  const { data: cashboxes = [] } = useCashboxes();
  const createTransaction = useCreateTransaction();
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [cashboxId, setCashboxId] = useState('');

  const salary = Number(employee?.salary) || 0;
  const paid12 = Number(employee?.last_12_months_salary_paid) || 0;

  useEffect(() => {
    if (open && employee) {
      setPaymentAmount(salary > 0 ? String(salary) : '');
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setCashboxId(cashboxes[0]?.id ?? '');
    }
  }, [open, employee, salary, cashboxes]);

  async function handleSubmit() {
    if (!employee || !paymentAmount) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('أدخل مبلغاً صحيحاً');
      return;
    }
    if (!cashboxId && cashboxes.length > 0) {
      toast.error('اختر الخزينة');
      return;
    }
    const defaultCashbox = cashboxId || cashboxes[0]?.id;
    if (!defaultCashbox) {
      toast.error('لا توجد خزينة متاحة');
      return;
    }

    try {
      const supabase = (await import('@/lib/supabase/client')).createSupabaseBrowserClient();
      // قبول EXP-SAL (الأساسي) أو EXP-SLR (توافق قديم)
      const { data: salaryCats, error: catErr } = await supabase
        .from('categories')
        .select('id, code')
        .in('code', ['EXP-SAL', 'EXP-SLR']);

      if (catErr) throw catErr;
      const expenseCat =
        salaryCats?.find((c) => c.code === 'EXP-SAL') ??
        salaryCats?.find((c) => c.code === 'EXP-SLR') ??
        null;
      if (!expenseCat) {
        toast.error('فئة المصروفات "المرتبات" غير موجودة (EXP-SAL / EXP-SLR)');
        return;
      }

      await createTransaction.mutateAsync({
        kind: 'EXPENSE',
        amount,
        method: 'CASH',
        category_id: expenseCat.id,
        cashbox_id: defaultCashbox,
        tx_date: paymentDate,
        description: `راتب ${employee.name}`,
        contact_id: employee.id,
        contact_type: 'BENEFICIARY',
      });

      toast.success('تم تسجيل الراتب بنجاح');
      onOpenChange(false);
      setPaymentAmount('');
      onSuccess?.();
    } catch (err) {
      console.error('[salary-payment]', err);
      toast.error(
        err instanceof Error ? err.message : 'فشل تسجيل الراتب — تحقق من الخزينة والفئة',
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md w-[calc(100%-1.5rem)] max-h-[90dvh] overflow-y-auto rounded-2xl"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>تسجيل راتب</DialogTitle>
        </DialogHeader>
        {employee && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-purple-50 p-3">
              <p className="font-medium">{employee.name}</p>
              <p className="text-sm text-ink-mute">
                {employee.job_title || '—'}
                {employee.department ? ` · ${employee.department}` : ''}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-canvas-sunken p-2">
                <p className="text-ink-mute">الراتب المحدد</p>
                <p className="font-semibold">
                  {salary > 0 ? formatMoney(salary, 'LYD') : '—'}
                </p>
              </div>
              <div className="rounded-lg bg-canvas-sunken p-2">
                <p className="text-ink-mute">مدفوع 12 شهر</p>
                <p className="font-semibold">{formatMoney(paid12, 'LYD')}</p>
              </div>
            </div>

            {salary > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-10 touch-manipulation"
                onClick={() => setPaymentAmount(String(salary))}
              >
                تعبئة الراتب ({formatMoney(salary, 'LYD')})
              </Button>
            )}

            <div>
              <Label>المبلغ</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="text-lg h-11"
                autoFocus
              />
            </div>

            <div>
              <Label>تاريخ الدفع</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="h-11"
              />
            </div>

            {cashboxes.length > 0 && (
              <div>
                <Label>الخزينة</Label>
                <Select value={cashboxId} onValueChange={setCashboxId}>
                  <SelectTrigger className="h-11">
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
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-11 touch-manipulation"
                onClick={() => onOpenChange(false)}
              >
                إلغاء
              </Button>
              <Button
                type="button"
                className="flex-1 h-11 touch-manipulation"
                onClick={handleSubmit}
                disabled={!paymentAmount || createTransaction.isPending}
              >
                {createTransaction.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'تسجيل الراتب'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
