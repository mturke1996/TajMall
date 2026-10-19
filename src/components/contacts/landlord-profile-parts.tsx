'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, History, Plus, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyBlock, MonthField } from '@/components/people';
import { formatContactSaveError } from '@/lib/contacts/form-utils';
import { useUpdateContact } from '@/lib/db/queries';
import type { ContactRow } from '@/lib/db/types';
import {
  monthlyRentFromInput,
  monthlyRentPatch,
  PAYMENT_HOW_TEXT,
  previewTrackingStart,
  trackingLineText,
  trackingPreviewText,
  trackingStartPatch,
  type LandlordPaymentRow,
  type LandlordProfileInput,
} from '@/lib/landlord-profile';
import type { TrackingStart } from '@/lib/people/obligation-months';
import { formatMonthLabelAr } from '@/lib/rent-months';
import { arabicCount, cn, formatDate, formatMoney, todayISODate } from '@/lib/utils';

// full-height sheet on a phone (thumb-reachable footer), a centred dialog from sm up
const SHEET =
  'flex flex-col gap-0 overflow-hidden p-0 max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 sm:max-h-[min(90dvh,40rem)] sm:max-w-[28rem] max-sm:[&>button]:top-1.5 max-sm:[&>button]:p-3.5';

function SheetDialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  // Radix only returns focus to a Dialog.Trigger; these open from a button's click handler, so remember that button
  const [opener] = useState(() => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className={SHEET}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (opener?.isConnected) opener.focus();
        }}
      >
        <div className="border-b border-border px-5 py-4 max-sm:pe-16 sm:pe-12">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="mt-1">{description}</DialogDescription>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex flex-col-reverse gap-2 border-t border-border bg-card px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
          {footer}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- monthly rent

/** Records the real monthly rent of a landlord whose file has none (or has a wrong one). */
export function MonthlyRentDialog({
  open,
  onOpenChange,
  contact,
  estimate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: ContactRow;
  /** the guess from the latest paid month, offered as a starting point */
  estimate: number | null;
}) {
  const update = useUpdateContact();
  const fieldId = useId();
  const current = Number(contact.monthly_rent);
  // a guess is never typed in: the field starts with the recorded rent or stays empty, and the estimate is one tap away
  const [text, setText] = useState(() => (current > 0 ? String(current) : ''));
  const [touched, setTouched] = useState(false);
  const parsed = monthlyRentFromInput(text);
  const error = touched && !parsed.ok ? parsed.error : null;

  async function save() {
    setTouched(true);
    if (!parsed.ok) return;
    try {
      await update.mutateAsync({ id: contact.id, ...monthlyRentPatch(parsed.amount) });
      toast.success('سُجّل الإيجار الشهري');
      onOpenChange(false);
    } catch (err) {
      console.error('[landlord] saving the monthly rent failed', err);
      toast.error(formatContactSaveError(err));
    }
  }

  return (
    <SheetDialog
      open={open}
      onOpenChange={(v) => !update.isPending && onOpenChange(v)}
      title="الإيجار الشهري"
      description="المبلغ الذي يستحقه المؤجر كل شهر. منه تُحسب الأشهر المستحقة."
      footer={
        <>
          <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={update.isPending} onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button type="button" className="min-h-11 sm:min-h-9" disabled={update.isPending} onClick={() => void save()}>
            {update.isPending ? 'جارٍ الحفظ…' : 'احفظ الإيجار'}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor={fieldId}>الإيجار الشهري (د.ل)</Label>
        <Input
          id={fieldId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          placeholder="0"
          value={text}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void save();
            }
          }}
          className="h-12 text-xl font-semibold tabular-nums sm:h-10 sm:text-lg"
        />
        {error && (
          <p id={`${fieldId}-error`} role="alert" className="text-[12.5px] text-danger-ink">
            {error}
          </p>
        )}
      </div>
      {estimate !== null && !(current > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-canvas-sunken px-3 py-2.5 text-[12.5px]">
          <span className="text-ink-soft">
            تقدير من آخر شهر مسدّد: <span className="font-medium tabular-nums text-foreground">{formatMoney(estimate, 'LYD')}</span>
          </span>
          <Button type="button" variant="outline" size="sm" className="min-h-11 bg-card sm:min-h-8" onClick={() => setText(String(estimate))}>
            استخدم التقدير
          </Button>
        </div>
      )}
      {current > 0 && <p className="text-[12.5px] text-ink-mute">الإيجار المسجّل الآن: <span className="tabular-nums text-foreground">{formatMoney(current, 'LYD')}</span></p>}
    </SheetDialog>
  );
}

// ---------------------------------------------------------------- tracking start

/** The line above the month grid: where the months stop being judged, and the way to move that line. */
export function TrackingLine({ tracking, onChange }: { tracking: TrackingStart; onChange?: () => void }) {
  const line = trackingLineText(tracking);
  const unknown = !tracking.month;
  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 rounded-xl border px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between',
        unknown ? 'border-warning-line bg-warning-soft text-warning-ink' : 'border-info-line bg-info-soft text-info-ink',
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {unknown ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <History className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
        <div className="min-w-0 text-[13px] leading-relaxed">
          <p className="font-medium">{line.text}</p>
          <p className="text-[12px]">{line.source}</p>
        </div>
      </div>
      {onChange && (
        <Button type="button" variant="outline" className="min-h-11 shrink-0 bg-card text-foreground sm:min-h-9" onClick={onChange}>
          {unknown ? 'حدّد البداية' : 'غيّر البداية'}
        </Button>
      )}
    </div>
  );
}

/**
 * Moves the month the system starts following this landlord. Shows what the chosen month would make owed before
 * anything is saved, offers the month the system would pick on its own, and an empty choice means that one.
 */
export function TrackingStartDialog({
  open,
  onOpenChange,
  contact,
  input,
  tracking,
  suggested,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: ContactRow;
  /** what the preview is computed from: this landlord's payments and today */
  input: LandlordProfileInput;
  tracking: TrackingStart;
  /** where tracking starts without the owner's choice */
  suggested: TrackingStart;
}) {
  const update = useUpdateContact();
  const hasTag = tracking.source === 'tag';
  // empty means «تلقائي»: the month the system would pick, which the suggestion row names
  const [value, setValue] = useState(hasTag ? (tracking.month ?? '') : '');
  const thisMonth = todayISODate().slice(0, 7);
  const future = value !== '' && value > thisMonth;
  const preview = useMemo(() => (future ? null : previewTrackingStart(input, value === '' ? null : value)), [input, value, future]);
  const unchanged = value === (hasTag ? (tracking.month ?? '') : '');

  async function save() {
    if (future) return;
    try {
      await update.mutateAsync({ id: contact.id, ...trackingStartPatch(contact, value === '' ? null : value) });
      toast.success(value === '' ? 'عادت بداية المتابعة تلقائية' : 'حُفظت بداية المتابعة');
      onOpenChange(false);
    } catch (err) {
      console.error('[landlord] saving the tracking start failed', err);
      toast.error(formatContactSaveError(err));
    }
  }

  const earliest = Number((suggested.month ?? tracking.month ?? thisMonth).slice(0, 4)) - 1;

  return (
    <SheetDialog
      open={open}
      onOpenChange={(v) => !update.isPending && onOpenChange(v)}
      title="بداية المتابعة"
      description="الأشهر قبل هذا الشهر تُعدّ مسدّدة قبل المنظومة، ولا تظهر مستحقة."
      footer={
        <>
          <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={update.isPending} onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button type="button" className="min-h-11 sm:min-h-9" disabled={update.isPending || future || unchanged} onClick={() => void save()}>
            {update.isPending ? 'جارٍ الحفظ…' : 'احفظ البداية'}
          </Button>
        </>
      }
    >
      <MonthField
        label="أول شهر تتابعه المنظومة"
        value={value}
        onChange={setValue}
        clearLabel="تلقائي"
        minYear={earliest}
        maxYear={Number(thisMonth.slice(0, 4))}
      />
      {suggested.month && value !== suggested.month && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-canvas-sunken px-3 py-2.5 text-[12.5px]">
          <span className="text-ink-soft">
            المقترح: <span className="font-medium text-foreground">{formatMonthLabelAr(suggested.month)}</span>
          </span>
          <Button type="button" variant="outline" size="sm" className="min-h-11 bg-card sm:min-h-8" onClick={() => setValue(suggested.month ?? '')}>
            استخدم المقترح
          </Button>
        </div>
      )}
      {future ? (
        <p role="alert" className="text-[12.5px] text-danger-ink">
          لا يمكن أن تبدأ المتابعة بعد الشهر الحالي.
        </p>
      ) : (
        preview && (
          <p role="status" className={cn('text-[12.5px] leading-relaxed', preview.owedMonths > 0 ? 'text-warning-ink' : 'text-ink-mute')}>
            {trackingPreviewText(preview)}
          </p>
        )
      )}
    </SheetDialog>
  );
}

// ---------------------------------------------------------------- the year switch

/** Previous year, the year, next year; each end stops where the landlord has nothing to show. */
export function YearSwitch({ year, min, max, onChange }: { year: number; min: number; max: number; onChange: (year: number) => void }) {
  const arrow = 'grid h-11 w-11 place-items-center rounded-md text-ink-mute hover:bg-card hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent sm:h-8 sm:w-8';
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-canvas-sunken p-0.5" role="group" aria-label="السنة">
      <button type="button" aria-label="السنة السابقة" disabled={year <= min} onClick={() => onChange(year - 1)} className={arrow}>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
      <span className="min-w-12 px-2 text-center text-[13px] font-semibold tabular-nums" aria-live="polite">
        {year}
      </span>
      <button type="button" aria-label="السنة التالية" disabled={year >= max} onClick={() => onChange(year + 1)} className={arrow}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- payments

const STEP = 20;
const MORE_PAYMENTS: [string, string, string, string] = ['دفعة أخرى', 'دفعتين أخريين', 'دفعات أخرى', 'دفعة أخرى'];
const chip = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[12px] leading-5';

function PaymentMonths({ row }: { row: LandlordPaymentRow }) {
  if (row.parts.length === 0) return <span className="text-ink-mute">—</span>;
  const split = row.parts.length > 1;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {row.parts.map((p) => (
        <span
          key={p.monthKey}
          className={cn(chip, p.how === 'spill' || row.advance ? 'border-info-line bg-info-soft text-info-ink' : p.how === 'oldest_unpaid' ? 'border-warning-line bg-warning-soft text-warning-ink' : 'border-border bg-canvas-sunken text-ink-soft')}
        >
          {formatMonthLabelAr(p.monthKey)}
          {split && <span className="tabular-nums">· {formatMoney(p.amount, '')}</span>}
        </span>
      ))}
      {row.advance && <span className="text-[12px] text-info-ink">مقدّماً</span>}
      {!row.advance && row.parts.some((p) => p.how === 'oldest_unpaid') && <span className="text-[12px] text-warning-ink">{PAYMENT_HOW_TEXT.oldest_unpaid}</span>}
    </span>
  );
}

/**
 * The payments to this landlord, newest first, each with the months it was counted for. The month engine decides
 * the months, so a payment that names its month, one that pays an old month late and one paid ahead all read
 * the way the grid above counts them.
 */
export function LandlordPayments({ rows, onAdd }: { rows: readonly LandlordPaymentRow[]; onAdd?: () => void }) {
  const [shown, setShown] = useState(STEP);
  if (rows.length === 0) {
    return (
      <EmptyBlock
        action={
          onAdd ? (
            <Button type="button" variant="outline" className="min-h-11 gap-1.5 sm:min-h-9" onClick={onAdd}>
              <Plus aria-hidden />
              سجّل دفعة إيجار
            </Button>
          ) : undefined
        }
      >
        لا دفعات مسجّلة لهذا المؤجر.
      </EmptyBlock>
    );
  }
  const list = rows.slice(0, shown);
  const more = rows.length - list.length;
  return (
    <div>
      <ul className="divide-y divide-border md:hidden" aria-label="دفعات المؤجر">
        {list.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] tabular-nums text-ink-soft">{formatDate(r.date)}</span>
              <span className="text-[15px] font-semibold tabular-nums text-foreground">{formatMoney(r.amount, 'LYD')}</span>
            </div>
            <PaymentMonths row={r} />
            {r.description && <p className="text-[12.5px] text-ink-mute">{r.description}</p>}
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <table className="w-full text-[13px]">
          <caption className="sr-only">دفعات المؤجر والأشهر التي حُسبت لها</caption>
          <thead>
            <tr className="border-b border-border bg-canvas-sunken text-[12.5px] text-ink-mute">
              <th scope="col" className="px-5 py-2.5 text-start font-medium">التاريخ</th>
              <th scope="col" className="px-3 py-2.5 text-start font-medium">عن شهر</th>
              <th scope="col" className="px-3 py-2.5 text-start font-medium">البيان</th>
              <th scope="col" className="px-5 py-2.5 text-end font-medium">المبلغ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-5 py-3 tabular-nums text-ink-soft">{formatDate(r.date)}</td>
                <td className="px-3 py-3">
                  <PaymentMonths row={r} />
                </td>
                <td className="max-w-[18rem] px-3 py-3 text-ink-mute">{r.description || 'بدون بيان'}</td>
                <td className="whitespace-nowrap px-5 py-3 text-end font-semibold tabular-nums text-foreground">{formatMoney(r.amount, 'LYD')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more > 0 && (
        <div className="border-t border-border p-3 text-center">
          <Button type="button" variant="ghost" className="min-h-11 sm:min-h-9" onClick={() => setShown((n) => n + STEP)}>
            عرض {arabicCount(Math.min(STEP, more), MORE_PAYMENTS)}
          </Button>
        </div>
      )}
    </div>
  );
}
