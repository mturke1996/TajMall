'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { RentMonthLabel } from '@/components/rent/rent-month-label';
import { useSetTenantRentExemptMonths } from '@/lib/db/rent-queries';
import { buildRentCalendarFromCharges } from '@/lib/rent-calendar-from-charges';
import {
  autoExemptMonthsForYear,
  rentClaimStartMonthKey,
} from '@/lib/rent-exempt-months';
import {
  currentYear,
  formatMonthLabelAr,
  formatMonthsLabelAr,
  parseMonthKey,
  yearMonthsAll,
} from '@/lib/rent-months';
import type { TenantChargeWithRelations } from '@/lib/db/types';
import { cn, formatDate } from '@/lib/utils';
import { toast } from 'sonner';

const AR_MONTH_OPTIONS = [
  { value: '1', label: 'يناير' },
  { value: '2', label: 'فبراير' },
  { value: '3', label: 'مارس' },
  { value: '4', label: 'أبريل' },
  { value: '5', label: 'مايو' },
  { value: '6', label: 'يونيو' },
  { value: '7', label: 'يوليو' },
  { value: '8', label: 'أغسطس' },
  { value: '9', label: 'سبتمبر' },
  { value: '10', label: 'أكتوبر' },
  { value: '11', label: 'نوفمبر' },
  { value: '12', label: 'ديسمبر' },
] as const;

type Props = {
  tenantId: string;
  tenantName: string;
  monthlyRent: number;
  years: number[];
  charges: TenantChargeWithRelations[];
  claimStart?: string | null;
  manualExemptMonths: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function claimStartFromFirstMonth(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex).padStart(2, '0')}-01`;
}

function buildExemptForYear(
  year: number,
  claimStart: string | null | undefined,
  manualExemptMonths: string[],
): string[] {
  const auto = autoExemptMonthsForYear(year, claimStart);
  const manual = manualExemptMonths.filter((m) => m.startsWith(String(year)));
  return [...new Set([...auto, ...manual])].sort();
}

export function SetRentExemptMonthsDialog({
  tenantId,
  tenantName,
  monthlyRent,
  years,
  charges,
  claimStart,
  manualExemptMonths,
  open,
  onOpenChange,
}: Props) {
  const setExempt = useSetTenantRentExemptMonths();
  const defaultYear = years[0] ?? currentYear();
  const [year, setYear] = useState(defaultYear);
  const [selectedExempt, setSelectedExempt] = useState<string[]>([]);
  const [firstClaimMonth, setFirstClaimMonth] = useState('3');

  const claimStartKey = rentClaimStartMonthKey(claimStart);

  useEffect(() => {
    if (!open) return;
    const y = defaultYear;
    setYear(y);
    setSelectedExempt(buildExemptForYear(y, claimStart, manualExemptMonths));
    if (claimStartKey) {
      setFirstClaimMonth(String(parseMonthKey(claimStartKey).month));
    } else {
      setFirstClaimMonth('3');
    }
  }, [open, defaultYear, claimStart, claimStartKey, manualExemptMonths]);

  const calendarMonths = useMemo(
    () =>
      buildRentCalendarFromCharges(tenantId, year, monthlyRent, charges, {
        claimStart,
        manualExemptMonths: selectedExempt,
      }).months,
    [tenantId, year, monthlyRent, charges, claimStart, selectedExempt],
  );

  const yearExemptKeys = useMemo(
    () => selectedExempt.filter((m) => m.startsWith(String(year))),
    [selectedExempt, year],
  );

  const previewAutoExempt = useMemo(() => {
    const idx = Number(firstClaimMonth);
    if (!Number.isFinite(idx) || idx < 2) return [];
    return autoExemptMonthsForYear(
      year,
      claimStartFromFirstMonth(year, idx),
    );
  }, [year, firstClaimMonth]);

  function handleYearChange(nextYear: number) {
    setYear(nextYear);
    setSelectedExempt((prev) => {
      const keepOtherYears = prev.filter((m) => !m.startsWith(String(year)));
      const forNext = buildExemptForYear(
        nextYear,
        claimStart,
        manualExemptMonths,
      );
      return [...keepOtherYears, ...forNext].sort();
    });
  }

  function toggleExemptMonth(month: string) {
    setSelectedExempt((prev) =>
      prev.includes(month)
        ? prev.filter((m) => m !== month)
        : [...prev, month].sort(),
    );
  }

  function applyFirstClaimMonth() {
    const idx = Number(firstClaimMonth);
    if (!Number.isFinite(idx) || idx < 1 || idx > 12) {
      toast.error('اختر شهر بداية المطالبة');
      return;
    }
    const auto = yearMonthsAll(year).filter((_, i) => i + 1 < idx);
    setSelectedExempt((prev) => {
      const withoutYear = prev.filter((m) => !m.startsWith(String(year)));
      return [...withoutYear, ...auto].sort();
    });
    if (auto.length === 0) {
      toast.message(`لا أشهر قبل ${AR_MONTH_OPTIONS[idx - 1]?.label ?? idx}`);
    } else {
      toast.success(`بدون مطالبة: ${formatMonthsLabelAr(auto)}`);
    }
  }

  async function save() {
    const claimIdx = Number(firstClaimMonth);
    if (!Number.isFinite(claimIdx) || claimIdx < 1 || claimIdx > 12) {
      toast.error('اختر شهر بداية المطالبة');
      return;
    }

    const newClaimStart = claimStartFromFirstMonth(year, claimIdx);
    const autoFromClaim = autoExemptMonthsForYear(year, newClaimStart);

    // يدوي = المحدد − المعفى تلقائياً من بداية المطالبة الجديدة
    const nextManual = selectedExempt.filter((m) => !autoFromClaim.includes(m));
    const removed = manualExemptMonths.filter((m) => !nextManual.includes(m));

    try {
      await setExempt.mutateAsync({
        tenantId,
        exemptMonths: nextManual,
        removeMonths: removed,
        claimStart: newClaimStart,
      });
      toast.success('تم الحفظ — الأشهر بدون مطالبة مستبعدة من الإجمالي');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل الحفظ');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg w-[calc(100%-1.5rem)] max-h-[min(90dvh,40rem)] overflow-hidden rounded-2xl p-0 gap-0 flex flex-col"
        dir="rtl"
      >
        <DialogHeader className="shrink-0 px-5 pt-5 pb-3 pe-12 border-b border-border bg-canvas-sunken/50">
          <DialogTitle className="flex items-center gap-2.5 text-start">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-200/80 text-slate-700">
              <CalendarOff className="h-4 w-4" />
            </span>
            أشهر بدون مطالبة
          </DialogTitle>
          <DialogDescription className="text-start pt-1">
            {tenantName} — الأشهر قبل بداية الإيجار لا تُنشأ لها مطالبة ولا تدخل
            في إجمالي المطالبات المفتوحة.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">
          <section className="rounded-xl border border-border bg-card px-3.5 py-3.5 space-y-3">
            <div>
              <Label className="text-ink font-medium text-sm">
                أول شهر مطالبة
              </Label>
              <p className="text-xs text-ink-mute leading-relaxed mt-1">
                مثال: بدأ الإيجار في مارس — اختر مارس فيُعفى يناير وفبراير
                تلقائياً.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1.5 min-w-[9rem] flex-1">
                <Label htmlFor="claim-month" className="text-xs text-ink-mute">
                  الشهر
                </Label>
                <Select
                  value={firstClaimMonth}
                  onValueChange={setFirstClaimMonth}
                >
                  <SelectTrigger id="claim-month" className="h-10">
                    <SelectValue placeholder="اختر الشهر" />
                  </SelectTrigger>
                  <SelectContent>
                    {AR_MONTH_OPTIONS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0 touch-manipulation"
                onClick={applyFirstClaimMonth}
              >
                تطبيق على {year}
              </Button>
            </div>

            {previewAutoExempt.length > 0 && (
              <p className="text-[11px] text-slate-700 bg-slate-50 rounded-lg px-2.5 py-2 border border-dashed border-slate-300">
                سيُعفى:{' '}
                <span className="font-medium">
                  {formatMonthsLabelAr(previewAutoExempt)}
                </span>
              </p>
            )}

            {claimStart && (
              <p className="text-[11px] text-ink-mute border-t border-border pt-2">
                بداية العقد الحالية:{' '}
                <span className="tabular-nums">{formatDate(claimStart)}</span>
                {claimStartKey ? ` · ${formatMonthLabelAr(claimStartKey)}` : ''}
              </p>
            )}
          </section>

          <section className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-ink text-sm">تحديد يدوي</Label>
              <Select
                value={String(year)}
                onValueChange={(v) => handleYearChange(Number(v))}
              >
                <SelectTrigger className="h-9 w-[6.5rem]" aria-label="السنة">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(years.length > 0 ? years : [currentYear()]).map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-ink-mute">
              انقر للتفعيل أو الإلغاء · محدد{' '}
              <span className="font-semibold text-ink tabular-nums">
                {yearExemptKeys.length}
              </span>{' '}
              شهر
            </p>

            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {yearMonthsAll(year).map((key) => {
                const cal = calendarMonths.find((m) => m.month === key);
                const isExempt = selectedExempt.includes(key);
                const isPaid =
                  cal?.status === 'paid' || cal?.status === 'partial';

                return (
                  <button
                    key={key}
                    type="button"
                    disabled={isPaid || setExempt.isPending}
                    aria-pressed={isExempt}
                    title={
                      isPaid
                        ? 'شهر مسدّد — لا يمكن إعفاؤه'
                        : isExempt
                          ? 'إلغاء بدون مطالبة'
                          : 'تعيين بدون مطالبة'
                    }
                    onClick={() => {
                      if (!isPaid) toggleExemptMonth(key);
                    }}
                    className={cn(
                      'rounded-xl px-2 py-2.5 text-center touch-manipulation transition-all border-2',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-600/40',
                      isPaid && 'opacity-45 cursor-not-allowed',
                      isExempt
                        ? 'border-dashed border-slate-400 bg-slate-50 text-slate-700 shadow-none'
                        : 'border-border bg-card hover:bg-canvas-sunken active:scale-[0.98]',
                    )}
                  >
                    <RentMonthLabel
                      monthKey={key}
                      status={isExempt ? 'exempt' : undefined}
                      statusLabel={isExempt ? 'بدون مطالبة' : undefined}
                      layout="stacked"
                    />
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <DialogFooter className="shrink-0 flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end bg-canvas-sunken/40 m-0 pt-4">
          <Button
            type="button"
            variant="outline"
            className="h-10 touch-manipulation"
            onClick={() => onOpenChange(false)}
            disabled={setExempt.isPending}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            className="h-10 touch-manipulation min-w-[7rem]"
            onClick={save}
            disabled={setExempt.isPending}
          >
            {setExempt.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin ms-1" />
                جارٍ الحفظ…
              </>
            ) : (
              'حفظ'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
