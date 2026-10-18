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
import { rentClaimStartMonthKey } from '@/lib/rent-exempt-months';
import { currentYear, formatMonthLabelAr, parseMonthKey, yearMonthsAll } from '@/lib/rent-months';
import type { TenantChargeWithRelations } from '@/lib/db/types';
import { arabicCount, cn } from '@/lib/utils';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/user-messages';

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

/**
 * Two separate decisions, saved separately:
 * - the claim start (the first month the tenant owes rent): changed only when the person changes it —
 *   saving the dialog for another reason never moves it (it also moves the active lease's start);
 * - individual months marked "no claim" (a rent-free month after the start).
 * Months before the claim start are excluded automatically and are not stored as marked months.
 */
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
  const currentClaimKey = rentClaimStartMonthKey(claimStart);
  const yearList = useMemo(() => {
    const set = new Set(years.length ? years : [currentYear()]);
    if (currentClaimKey) set.add(parseMonthKey(currentClaimKey).year);
    return [...set].sort((a, b) => b - a);
  }, [years, currentClaimKey]);

  const [year, setYear] = useState(yearList[0] ?? currentYear());
  const [marked, setMarked] = useState<string[]>([]);
  // claim start being edited: null until the person picks one when none is recorded
  const [claimYear, setClaimYear] = useState<number | null>(null);
  const [claimMonth, setClaimMonth] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setYear(yearList[0] ?? currentYear());
    setMarked([...manualExemptMonths].sort());
    if (currentClaimKey) {
      const { year: y, month: m } = parseMonthKey(currentClaimKey);
      setClaimYear(y);
      setClaimMonth(m);
    } else {
      setClaimYear(null);
      setClaimMonth(null);
    }
  }, [open, yearList, manualExemptMonths, currentClaimKey]);

  const editedClaimKey =
    claimYear != null && claimMonth != null ? `${claimYear}-${String(claimMonth).padStart(2, '0')}` : null;
  const claimChanged = editedClaimKey != null && editedClaimKey !== currentClaimKey;
  const effectiveClaimKey = editedClaimKey ?? currentClaimKey;
  const effectiveClaimStart = effectiveClaimKey ? `${effectiveClaimKey}-01` : claimStart ?? null;

  const calendarMonths = useMemo(
    () =>
      buildRentCalendarFromCharges(tenantId, year, monthlyRent, charges, {
        claimStart: effectiveClaimStart,
        manualExemptMonths: marked,
      }).months,
    [tenantId, year, monthlyRent, charges, effectiveClaimStart, marked],
  );

  // a month before the claim start needs no mark: it is excluded anyway
  const storedMarks = marked.filter((m) => !effectiveClaimKey || m >= effectiveClaimKey);
  const markedThisYear = storedMarks.filter((m) => m.startsWith(String(year))).length;

  function toggle(month: string) {
    setMarked((prev) => (prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month].sort()));
  }

  async function save() {
    const removed = manualExemptMonths.filter((m) => !storedMarks.includes(m));
    try {
      await setExempt.mutateAsync({
        tenantId,
        exemptMonths: storedMarks,
        removeMonths: removed,
        // null keeps the recorded start exactly as it is
        claimStart: claimChanged && editedClaimKey ? `${editedClaimKey}-01` : null,
      });
      toast.success(
        claimChanged
          ? `تم الحفظ — المطالبة تبدأ من ${formatMonthLabelAr(editedClaimKey!)}`
          : 'تم الحفظ — الأشهر المحددة لا تُطالَب',
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(friendlyError(err, 'تعذّر الحفظ'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg w-[calc(100%-1.5rem)] max-h-[min(90dvh,42rem)] overflow-hidden rounded-2xl p-0 gap-0 flex flex-col"
        dir="rtl"
      >
        <DialogHeader className="shrink-0 px-5 pt-5 pb-3 pe-12 border-b border-border bg-canvas-sunken/50">
          <DialogTitle className="flex items-center gap-2.5 text-start">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-border/80 text-ink-soft">
              <CalendarOff className="h-4 w-4" />
            </span>
            بداية المطالبة والأشهر المستبعدة
          </DialogTitle>
          <DialogDescription className="text-start pt-1">
            {tenantName} — لا تُنشأ مطالبة لشهر قبل بداية المطالبة ولا لشهر مستبعد، ولا يدخل أيٌّ منهما في المستحق.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">
          <section className="rounded-xl border border-border bg-card px-3.5 py-3.5 space-y-3" aria-labelledby="claim-start-title">
            <div>
              <h3 id="claim-start-title" className="text-sm font-medium text-ink">
                أول شهر مطالبة
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-mute">
                {currentClaimKey
                  ? `المسجّل الآن: ${formatMonthLabelAr(currentClaimKey)}. غيّره فقط إن كان الإيجار بدأ فعلاً في شهر آخر — يُعدَّل معه بدء العقد النشط.`
                  : 'لم تُسجَّل بداية للمطالبة. اختر الشهر الذي بدأ فيه الإيجار.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="claim-month" className="text-xs text-ink-mute">
                  الشهر
                </Label>
                <Select value={claimMonth ? String(claimMonth) : ''} onValueChange={(v) => setClaimMonth(Number(v))}>
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
              <div className="space-y-1.5">
                <Label htmlFor="claim-year" className="text-xs text-ink-mute">
                  السنة
                </Label>
                <Select value={claimYear ? String(claimYear) : ''} onValueChange={(v) => setClaimYear(Number(v))}>
                  <SelectTrigger id="claim-year" className="h-10">
                    <SelectValue placeholder="اختر السنة" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([...yearList, currentYear() - 2, currentYear() - 1, currentYear()])]
                      .sort((a, b) => b - a)
                      .map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {claimChanged && (
              <p className="rounded-lg border border-warning-line bg-warning-soft px-2.5 py-2 text-[12px] text-warning-ink">
                ستتغيّر بداية المطالبة إلى {formatMonthLabelAr(editedClaimKey!)}
                {currentClaimKey ? ` (بدلاً من ${formatMonthLabelAr(currentClaimKey)})` : ''} عند الحفظ.
              </p>
            )}
          </section>

          <section className="space-y-2.5" aria-labelledby="marked-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="marked-title" className="text-sm text-ink">
                أشهر مستبعدة بعد البداية
              </h3>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="h-9 w-26" aria-label="سنة الأشهر">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearList.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-ink-mute">
              اضغط الشهر لاستبعاده أو إعادته ·{' '}
              {markedThisYear === 0
                ? 'لا أشهر مستبعدة في هذه السنة'
                : `مستبعد ${arabicCount(markedThisYear, ['شهر واحد', 'شهران', 'أشهر', 'شهراً'])}`}
            </p>

            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {yearMonthsAll(year).map((key) => {
                const cal = calendarMonths.find((m) => m.month === key);
                const beforeStart = !!effectiveClaimKey && key < effectiveClaimKey;
                const isMarked = !beforeStart && marked.includes(key);
                const isPaid = cal?.status === 'paid' || cal?.status === 'partial';
                const disabled = isPaid || beforeStart || setExempt.isPending;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    aria-pressed={isMarked}
                    title={
                      beforeStart
                        ? 'قبل بداية المطالبة — مستبعد تلقائياً'
                        : isPaid
                          ? 'شهر مسدّد — لا يمكن استبعاده'
                          : isMarked
                            ? 'إعادة الشهر إلى المطالبة'
                            : 'استبعاد الشهر من المطالبة'
                    }
                    onClick={() => toggle(key)}
                    className={cn(
                      'rounded-xl border-2 px-2 py-2.5 text-center touch-manipulation transition-colors',
                      'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ink-soft/40',
                      (isPaid || beforeStart) && 'cursor-not-allowed opacity-50',
                      isMarked || beforeStart
                        ? 'border-dashed border-ink-mute/50 bg-canvas-sunken text-ink-soft'
                        : 'border-border bg-card hover:bg-canvas-sunken',
                    )}
                  >
                    <RentMonthLabel
                      monthKey={key}
                      status={isMarked || beforeStart ? 'exempt' : undefined}
                      statusLabel={beforeStart ? 'قبل البداية' : isMarked ? 'مستبعد' : undefined}
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
          <Button type="button" className="h-10 touch-manipulation min-w-28" onClick={save} disabled={setExempt.isPending}>
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
