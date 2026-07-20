'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, PieChart } from 'lucide-react';
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
import { RentMonthPicker } from '@/components/rent/rent-month-picker';
import { useSetTenantRentMonthStatus } from '@/lib/db/rent-queries';
import { buildRentCalendarFromCharges } from '@/lib/rent-calendar-from-charges';
import {
  filterTenantJournalEntries,
  formatJournalLinkedHint,
  formatJournalOptionLabel,
  journalAlreadyLinkedToMonth,
  monthLinkedToJournal,
  rentChargesByMonth,
  sumRentMonthsRemaining,
} from '@/lib/rent-journal-link';
import {
  areConsecutiveMonths,
  currentYear,
  formatMonthLabelAr,
  formatMonthsLabelAr,
  type RentCalendarMonth,
} from '@/lib/rent-months';
import type { TenantChargeWithRelations } from '@/lib/db/types';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { toast } from 'sonner';

type LinkMode = 'full' | 'partial';

type Props = {
  tenantId: string;
  tenantName: string;
  monthlyRent: number;
  years: number[];
  charges: TenantChargeWithRelations[];
  journalEntries: JournalEntryRow[];
  journalsLoading?: boolean;
  claimStart?: string | null;
  manualExemptMonths?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SetRentMonthStatusDialog({
  tenantId,
  tenantName,
  monthlyRent,
  years,
  charges,
  journalEntries,
  journalsLoading = false,
  claimStart,
  manualExemptMonths = [],
  open,
  onOpenChange,
}: Props) {
  const setStatus = useSetTenantRentMonthStatus();
  const defaultYear = years[0] ?? currentYear();
  const [year, setYear] = useState(defaultYear);
  const [selected, setSelected] = useState<string[]>([]);
  const [journalId, setJournalId] = useState<string>('');
  const [linkMode, setLinkMode] = useState<LinkMode>('full');
  const [partialAmount, setPartialAmount] = useState('');

  const chargesByMonth = useMemo(
    () => rentChargesByMonth(charges, tenantId),
    [charges, tenantId],
  );

  const monthTotals = useMemo(
    () => sumRentMonthsRemaining(chargesByMonth, selected, monthlyRent),
    [chargesByMonth, selected, monthlyRent],
  );

  const { totalRemaining: remaining, totalAmount: monthAmount, totalPaid: paidSoFar } =
    monthTotals;

  const multiMonth = selected.length > 1;
  // مفتاح نصي مستقر لمحتوى selected — يمنع إعادة تشغيل الأثر أدناه لمجرد
  // تغيّر مرجع المصفوفة دون تغيّر محتواها فعلياً.
  const selectedKey = selected.join(',');

  const journals = useMemo(
    () => filterTenantJournalEntries(journalEntries),
    [journalEntries],
  );

  useEffect(() => {
    if (open) {
      setYear(defaultYear);
      setSelected([]);
      setJournalId('');
      setLinkMode('full');
      setPartialAmount('');
    }
  }, [open, defaultYear]);

  useEffect(() => {
    if (selected.length === 0) {
      setJournalId('');
      return;
    }
    if (linkMode === 'full' && selected.length === 1) {
      const existing = chargesByMonth.get(selected[0]);
      if (existing?.journal_entry_id) {
        setJournalId(existing.journal_entry_id);
        return;
      }
    }
    setJournalId('');
  }, [selected, chargesByMonth, linkMode]);

  useEffect(() => {
    if (multiMonth && linkMode === 'partial') {
      setLinkMode('full');
    }
  }, [multiMonth, linkMode]);

  useEffect(() => {
    if (!selectedKey) return;
    setPartialAmount(remaining > 0 ? String(remaining) : '');
  }, [selectedKey, remaining]);

  const calendarMonths: RentCalendarMonth[] = useMemo(() => {
    return buildRentCalendarFromCharges(tenantId, year, monthlyRent, charges, {
      claimStart,
      manualExemptMonths,
    }).months;
  }, [tenantId, year, monthlyRent, charges, claimStart, manualExemptMonths]);

  function parsePartialAmount(): number | null {
    const n = Number(String(partialAmount).replace(/,/g, '').trim());
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  async function savePaid() {
    if (selected.length === 0) {
      toast.error('اختر شهر إيجار واحداً على الأقل');
      return;
    }
    const blocked = selected.filter((m) => {
      const st = calendarMonths.find((c) => c.month === m)?.status;
      return st === 'exempt';
    });
    if (blocked.length > 0) {
      toast.error(`${formatMonthsLabelAr(blocked)} — شهر بدون مطالبة`);
      return;
    }
    if (!areConsecutiveMonths(selected)) {
      toast.error('اختر أشهراً متتالية فقط');
      return;
    }
    if (!journalId) {
      toast.error('اختر قيد اليومية');
      return;
    }

    const otherMonth = monthLinkedToJournal(
      charges,
      tenantId,
      journalId,
      selected,
    );
    if (otherMonth) {
      toast.error(`القيد مربوط بـ ${formatMonthLabelAr(otherMonth)}`);
      return;
    }

    let amount: number | null = null;
    if (linkMode === 'partial') {
      if (multiMonth) {
        toast.error('الجزء من الشهر متاح لشهر واحد — اختر شهراً أو استخدم شهر كامل');
        return;
      }
      amount = parsePartialAmount();
      if (amount == null) {
        toast.error('أدخل مبلغ الجزء');
        return;
      }
      if (amount > remaining + 0.001) {
        toast.error(`المبلغ أكبر من المتبقي (${formatMoney(remaining, 'LYD')})`);
        return;
      }
    } else if (remaining <= 0) {
      toast.error('الشهور المحددة مسدّدة بالكامل');
      return;
    }

    try {
      await setStatus.mutateAsync({
        tenantId,
        months: selected,
        paid: true,
        journalEntryId: journalId,
        amount: linkMode === 'partial' ? amount : null,
      });
      const label =
        linkMode === 'partial' && amount != null
          ? `${formatMonthsLabelAr(selected)} — جزء ${formatMoney(amount, 'LYD')}`
          : formatMonthsLabelAr(selected);
      toast.success(`تم ربط ${label} بالقيد — يظهر مدفوعاً في التقويم`);
      onOpenChange(false);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'فشل الحفظ';
      toast.error(msg);
    }
  }

  async function clearMonth() {
    if (selected.length === 0) {
      toast.error('اختر شهراً واحداً على الأقل');
      return;
    }
    try {
      await setStatus.mutateAsync({
        tenantId,
        months: selected,
        paid: false,
      });
      toast.success(`${formatMonthsLabelAr(selected)} — غير مدفوع`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل التحديث');
    }
  }

  function applyJournalAmountHint(je: JournalEntryRow) {
    if (remaining <= 0) return;
    const jeAmt = Math.max(Number(je.total_debit) || 0, 0);
    setPartialAmount(String(Math.min(remaining, jeAmt > 0 ? jeAmt : remaining)));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg w-[calc(100%-1.5rem)] max-h-[90dvh] overflow-y-auto rounded-2xl p-0 gap-0"
        dir="rtl"
      >
        <DialogHeader className="px-5 pt-5 pb-3 pe-12 border-b border-border">
          <DialogTitle>ربط شهر (أو شهرين) بقيد الدفع</DialogTitle>
          <p className="text-sm text-ink-mute text-start leading-relaxed pt-1">
            {tenantName} — مثل تسجيل الإيراد: اختر{' '}
            <strong>شهراً أو شهرين متتاليين</strong> والقيد. يُحدَّث تقويم
            الإيجار والمطالبات دون تكرار القيد في دفتر اليومية.
          </p>
        </DialogHeader>

        <div className="px-5 py-4 space-y-5">
          <div className="space-y-2">
            <Label className="text-ink">شهور الإيجار (1–2 متتالي)</Label>
            <Select
              value={String(year)}
              onValueChange={(v) => {
                setYear(Number(v));
                setSelected([]);
              }}
            >
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <RentMonthPicker
              year={year}
              selected={selected}
              onChange={setSelected}
              calendarMonths={calendarMonths}
              fullYear
              maxMonths={2}
              showStatus
            />
          </div>

          {selected.length > 0 && monthAmount > 0 && (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-3 py-2.5 text-sm space-y-1">
              <p className="font-medium text-amber-950">
                {multiMonth ? 'مجموع الشهرين' : 'مطالبة الشهر'}:{' '}
                {formatMoney(monthAmount, 'LYD')}
              </p>
              <p className="text-amber-900/90 tabular-nums">
                مدفوع: {formatMoney(paidSoFar, 'LYD')} · متبقي:{' '}
                <span className="font-semibold">{formatMoney(remaining, 'LYD')}</span>
              </p>
              {multiMonth && (
                <p className="text-xs text-amber-900/80 pt-1">
                  سيُربط القيد بـ {formatMonthsLabelAr(selected)} ويظهر كل شهر{' '}
                  <strong>مدفوع</strong> في التقويم.
                </p>
              )}
              <ul className="text-xs text-amber-900/80 pt-1 space-y-1 border-t border-amber-200/60 mt-2">
                {selected.map((m) => {
                  const c = chargesByMonth.get(m);
                  const amt = Math.max(Number(c?.amount) || monthlyRent || 0, 0);
                  const paid = Math.max(Number(c?.total_paid) || 0, 0);
                  return (
                    <li key={m}>
                      {formatMonthLabelAr(m)}: {formatMoney(paid, 'LYD')} /{' '}
                      {formatMoney(amt, 'LYD')}
                      {(c?.rent_journal_links ?? []).map((l) => (
                        <span key={l.id} className="mr-1 text-ink-mute">
                          · قيد #{l.journal?.number ?? '—'}
                        </span>
                      ))}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-ink">نوع الربط</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={linkMode === 'full' ? 'default' : 'outline'}
                className="h-10 touch-manipulation"
                onClick={() => setLinkMode('full')}
                disabled={remaining <= 0 && paidSoFar > 0}
              >
                شهر كامل
                <span className="block text-[10px] font-normal opacity-90">
                  {remaining > 0 ? `المتبقي ${formatMoney(remaining, 'LYD')}` : 'مسدّد'}
                </span>
              </Button>
              <Button
                type="button"
                variant={linkMode === 'partial' ? 'default' : 'outline'}
                className="h-10 gap-1 touch-manipulation"
                onClick={() => {
                  setLinkMode('partial');
                  if (remaining > 0) setPartialAmount(String(remaining));
                }}
                disabled={remaining <= 0 || multiMonth}
              >
                <PieChart className="h-4 w-4 shrink-0" />
                جزء من الشهر
              </Button>
            </div>
            {multiMonth && (
              <p className="text-[11px] text-ink-mute">
                عند اختيار شهرين يُسدَّى كل شهر كاملاً بنفس القيد (كتسجيل الإيراد).
              </p>
            )}
          </div>

          {linkMode === 'partial' && selected.length === 1 && remaining > 0 && (
            <div className="space-y-2">
              <Label htmlFor="partial-amount" className="text-ink">
                مبلغ هذا الجزء
              </Label>
              <Input
                id="partial-amount"
                type="number"
                min={0}
                step="0.001"
                inputMode="decimal"
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                className="h-10 tabular-nums"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() =>
                    setPartialAmount(String(Math.round(remaining * 50) / 100))
                  }
                >
                  نصف المتبقي
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setPartialAmount(String(remaining))}
                >
                  كل المتبقي
                </Button>
                {journalId && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => {
                      const je = journals.find((j) => j.id === journalId);
                      if (je) applyJournalAmountHint(je);
                    }}
                  >
                    من مبلغ القيد
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-ink">قيد اليومية</Label>
            {selected.length === 0 ? (
              <p className="text-sm text-ink-mute rounded-xl border border-dashed border-border px-3 py-4 text-center bg-canvas-sunken/30">
                اختر شهراً أو شهرين أولاً
              </p>
            ) : journalsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
              </div>
            ) : journals.length === 0 ? (
              <p className="text-sm text-ink-mute rounded-xl border border-border px-3 py-4 text-center">
                لا قيود في ملف المستأجر — أضفها من تبويب «قيود»
              </p>
            ) : (
              <ul className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                {journals.map((je) => {
                  const isSelected = journalId === je.id;
                  const linkedElsewhere = monthLinkedToJournal(
                    charges,
                    tenantId,
                    je.id,
                    selected,
                  );
                  const onSelectedMonth = selected.some((m) =>
                    journalAlreadyLinkedToMonth(chargesByMonth.get(m), je.id),
                  );
                  return (
                    <li key={je.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setJournalId(je.id);
                          if (linkMode === 'partial') applyJournalAmountHint(je);
                        }}
                        className={cn(
                          'w-full text-start px-3 py-2.5 transition-colors touch-manipulation',
                          isSelected
                            ? 'bg-sage-50 ring-1 ring-inset ring-sage-600'
                            : 'hover:bg-canvas-sunken',
                        )}
                      >
                        <p className="text-sm font-medium truncate">
                          {formatJournalOptionLabel(je)}
                        </p>
                        <p className="text-xs text-ink-mute mt-0.5">
                          {formatDate(je.entry_date)} ·{' '}
                          {formatMoney(Number(je.total_debit), 'LYD')}
                        </p>
                        {linkedElsewhere && (
                          <p className="text-[10px] text-amber-800 mt-1">
                            {formatJournalLinkedHint(linkedElsewhere)}
                          </p>
                        )}
                        {onSelectedMonth && !linkedElsewhere && (
                          <p className="text-[10px] text-sage-700 mt-1">
                            مربوط بأحد الشهور المحددة
                          </p>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {journalId && (
              <Button variant="link" className="h-auto p-0 text-xs" asChild>
                <Link href={`/journals?highlight=${journalId}`}>فتح القيد</Link>
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end bg-canvas-sunken/30">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={setStatus.isPending}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={clearMonth}
            disabled={setStatus.isPending || selected.length === 0}
          >
            إلغاء الربط
          </Button>
          <Button
            type="button"
            onClick={savePaid}
            disabled={
              setStatus.isPending ||
              selected.length === 0 ||
              !journalId ||
              remaining <= 0
            }
          >
            {setStatus.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : linkMode === 'partial' ? (
              'حفظ الجزء'
            ) : (
              'حفظ الربط'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
