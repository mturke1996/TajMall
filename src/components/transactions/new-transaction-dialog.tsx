'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  X,
  Calendar,
  Wallet,
  Receipt,
  Hash,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTxDialog, type TxKind } from '@/stores/transaction-dialog';
import { PAYMENT_METHODS } from '@/lib/constants';
import { formatMoney, cn } from '@/lib/utils';
import {
  useCategories,
  useCashboxes,
  useCreateTransaction,
} from '@/lib/db/queries';
import { toast } from 'sonner';

/**
 * NewTransactionDialog — single create-flow for revenues and expenses.
 *
 * - Bottom-sheet on mobile, centred dialog on desktop.
 * - Kind switch (Revenue / Expense) filters the category list.
 * - Categories + cashboxes load live from Supabase.
 * - Submit persists via `useCreateTransaction` (Supabase JS + TanStack Query).
 *   Optimistic invalidation refreshes lists + balances on success.
 */
export function NewTransactionDialog() {
  const { isOpen, defaultKind, close } = useTxDialog();
  const titleId = useId();

  const [kind, setKind] = useState<TxKind>(defaultKind);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [cashboxId, setCashboxId] = useState('');
  const [method, setMethod] = useState<'CASH' | 'CHEQUE' | 'TRANSFER' | 'CARD'>('CASH');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: categoriesAll = [], isLoading: catsLoading } = useCategories();
  const { data: cashboxes = [], isLoading: boxLoading } = useCashboxes();
  const createTx = useCreateTransaction();

  const categories = useMemo(
    () => categoriesAll.filter((c) => c.kind === kind),
    [categoriesAll, kind],
  );

  // Reset when reopened with a different default kind
  useEffect(() => {
    if (isOpen) {
      setKind(defaultKind);
      setAmount('');
      setCategoryId('');
      setCashboxId('');
      setMethod('CASH');
      setDate(new Date().toISOString().slice(0, 10));
      setReference('');
      setDescription('');
      setError(null);
    }
  }, [isOpen, defaultKind]);

  // Pre-select sensible defaults once data is loaded
  useEffect(() => {
    if (!isOpen) return;
    if (!cashboxId && cashboxes.length > 0) {
      setCashboxId(cashboxes[0].id);
    }
  }, [isOpen, cashboxes, cashboxId]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // ESC closes
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  const amountNumber = Number(amount.replace(/[^\d.-]/g, ''));
  const submitting = createTx.isPending;
  const isRevenue = kind === 'REVENUE';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setError('أدخل مبلغاً صحيحاً أكبر من صفر.');
      return;
    }
    if (!categoryId) {
      setError('اختر البند.');
      return;
    }
    if (!cashboxId) {
      setError('اختر الخزينة أو الحساب المصرفي.');
      return;
    }

    try {
      await createTx.mutateAsync({
        kind,
        amount: amountNumber,
        method,
        category_id: categoryId,
        cashbox_id: cashboxId,
        tx_date: date,
        reference: reference || undefined,
        description: description || undefined,
      });
      const catName = categories.find((c) => c.id === categoryId)?.name_ar ?? '';
      toast.success(isRevenue ? 'تم تسجيل الإيراد' : 'تم تسجيل المصروف', {
        description: `${formatMoney(amountNumber, 'LYD')} · ${catName}`,
      });
      close();
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : 'تعذّر حفظ المعاملة';
      setError(
        /relation .* does not exist/i.test(msg)
          ? 'قاعدة البيانات لم تُهيَّأ بعد. شغّل ملف SQL في Supabase.'
          : msg,
      );
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={close}
            className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]"
            aria-hidden="true"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 24, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.985 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="
              fixed bottom-0 z-50 flex w-full max-h-[92dvh] flex-col
              overflow-hidden rounded-t-2xl border border-border bg-card
              shadow-lift
              left-0 right-0 mx-auto
              sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:right-auto sm:max-w-xl
              sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl
            "
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            dir="rtl"
          >
            <header className="flex items-center gap-3 border-b border-border px-5 py-4">
              <div
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-md border',
                  isRevenue
                    ? 'border-pastel-greenInk/15 bg-pastel-green text-pastel-greenInk'
                    : 'border-pastel-redInk/15 bg-pastel-red text-pastel-redInk',
                )}
              >
                {isRevenue ? (
                  <ArrowDownToLine className="h-4 w-4 stroke-[1.6]" />
                ) : (
                  <ArrowUpFromLine className="h-4 w-4 stroke-[1.6]" />
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
                  معاملة جديدة
                </span>
                <h2 id={titleId} className="text-[16px] font-semibold tracking-tight">
                  {isRevenue ? 'تسجيل إيراد' : 'تسجيل مصروف'}
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="me-auto"
                onClick={close}
                aria-label="إغلاق"
              >
                <X className="stroke-[1.5]" />
              </Button>
            </header>

            <form
              onSubmit={onSubmit}
              className="flex flex-1 flex-col overflow-y-auto px-5 py-4"
            >
              {/* Kind switch */}
              <div className="grid grid-cols-2 gap-1.5 rounded-md border border-border bg-canvas-sunken p-1">
                {(['REVENUE', 'EXPENSE'] as const).map((k) => {
                  const active = kind === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setKind(k);
                        setCategoryId('');
                      }}
                      className={cn(
                        'press inline-flex items-center justify-center gap-2 rounded-sm py-1.5 text-[13px] font-medium transition-colors duration-150',
                        active
                          ? k === 'REVENUE'
                            ? 'bg-pastel-green text-pastel-greenInk'
                            : 'bg-pastel-red text-pastel-redInk'
                          : 'text-ink-mute hover:text-foreground',
                      )}
                    >
                      {k === 'REVENUE' ? (
                        <ArrowDownToLine className="h-3.5 w-3.5 stroke-[1.6]" />
                      ) : (
                        <ArrowUpFromLine className="h-3.5 w-3.5 stroke-[1.6]" />
                      )}
                      {k === 'REVENUE' ? 'إيراد' : 'مصروف'}
                    </button>
                  );
                })}
              </div>

              {/* Amount */}
              <div className="mt-5 flex flex-col gap-1.5">
                <Label htmlFor="tx-amount">المبلغ</Label>
                <div className="relative">
                  <Input
                    id="tx-amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="h-12 ps-4 pe-16 text-[20px] font-semibold tabular-nums"
                    autoFocus
                  />
                  <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-ink-mute">
                    د.ل
                  </span>
                </div>
              </div>

              {/* Grid: category + cashbox */}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field icon={Receipt} label="البند" htmlFor="tx-cat">
                  <Select
                    value={categoryId}
                    onValueChange={setCategoryId}
                    disabled={catsLoading}
                  >
                    <SelectTrigger id="tx-cat">
                      <SelectValue
                        placeholder={catsLoading ? 'جارٍ التحميل…' : 'اختر البند'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.length === 0 && !catsLoading ? (
                        <div className="px-2 py-4 text-center text-[12px] text-ink-mute">
                          لا توجد بنود — شغّل ملف SQL
                        </div>
                      ) : (
                        categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name_ar}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </Field>

                <Field icon={Wallet} label="الخزينة" htmlFor="tx-box">
                  <Select
                    value={cashboxId}
                    onValueChange={setCashboxId}
                    disabled={boxLoading}
                  >
                    <SelectTrigger id="tx-box">
                      <SelectValue
                        placeholder={boxLoading ? 'جارٍ التحميل…' : 'اختر الحساب'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {cashboxes.length === 0 && !boxLoading ? (
                        <div className="px-2 py-4 text-center text-[12px] text-ink-mute">
                          لا توجد خزائن — شغّل ملف SQL
                        </div>
                      ) : (
                        cashboxes.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name_ar}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {/* Grid: method + date */}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="نوع السداد" htmlFor="tx-method">
                  <Select
                    value={method}
                    onValueChange={(v) =>
                      setMethod(v as 'CASH' | 'CHEQUE' | 'TRANSFER' | 'CARD')
                    }
                  >
                    <SelectTrigger id="tx-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.labelAr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field icon={Calendar} label="التاريخ" htmlFor="tx-date">
                  <Input
                    id="tx-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </Field>
              </div>

              <Field
                icon={Hash}
                label="رقم القيد (اختياري)"
                htmlFor="tx-ref"
                className="mt-4"
              >
                <Input
                  id="tx-ref"
                  type="text"
                  inputMode="numeric"
                  placeholder="مثال: 1958"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </Field>

              <Field
                icon={FileText}
                label="البيان"
                htmlFor="tx-desc"
                className="mt-4"
              >
                <textarea
                  id="tx-desc"
                  rows={2}
                  placeholder="وصف موجز للمعاملة…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="
                    flex w-full resize-none rounded-md border border-border bg-card
                    px-3 py-2 text-sm text-foreground
                    placeholder:text-muted-foreground/70
                    transition-[border-color,box-shadow] duration-200 ease-out-quint
                    focus-visible:outline-none focus-visible:border-sage-500
                    focus-visible:shadow-focus
                    disabled:cursor-not-allowed disabled:opacity-50
                  "
                />
              </Field>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 flex items-start gap-2 rounded-md border border-pastel-redInk/15 bg-pastel-red px-3 py-2 text-[12.5px] text-pastel-redInk"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 stroke-[1.7]" />
                  <span>{error}</span>
                </motion.div>
              )}
            </form>

            <footer className="flex items-center justify-between gap-3 border-t border-border bg-canvas px-5 py-3.5">
              <Button type="button" variant="ghost" onClick={close} disabled={submitting}>
                إلغاء
              </Button>
              <Button
                type="submit"
                onClick={onSubmit}
                disabled={submitting}
                className="gap-1.5 min-w-[140px]"
              >
                {submitting && <Loader2 className="animate-spin stroke-[1.6]" />}
                {isRevenue ? 'حفظ الإيراد' : 'حفظ المصروف'}
              </Button>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Field({
  icon: Icon,
  label,
  htmlFor,
  children,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor} className="inline-flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 stroke-[1.6] text-ink-mute" />}
        {label}
      </Label>
      {children}
    </div>
  );
}
