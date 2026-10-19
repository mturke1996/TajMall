'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Check, ExternalLink, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useContactTransactions } from '@/lib/db/queries';
import { amountKey, duplicateHeadlineAr, duplicateReasonAr, type DuplicateMatch } from '@/lib/duplicate-check';
import { lastPaymentFromHistory, lastPaymentLabelAr, suggestCategoryFromHistory, usedTimesAr } from '@/lib/entry-suggestions';
import type { EntryMethod } from '@/lib/entry-guards';
import type { CategoryRow } from '@/lib/db/types';
import { cn, formatDate } from '@/lib/utils';

/** 44px fields on a phone (and 16px text, so iOS does not zoom in), the compact size with a pointer. */
export const FIELD_CLASS = 'h-11 text-base sm:h-9 sm:text-sm';
export const NATIVE_SELECT_CLASS =
  'h-11 w-full rounded-md border border-border bg-card px-3 text-base text-foreground focus-visible:border-ring/60 focus-visible:shadow-focus focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:text-sm';

// ── a suggestion the person can take ────────────────────────────────────────────────────────────

/**
 * A suggestion is a button: it changes nothing until it is pressed, and what it fills stays editable.
 * `applied` shows it is already in the field.
 */
export function SuggestionChip({
  onClick,
  applied = false,
  label,
  children,
}: {
  onClick: () => void;
  applied?: boolean;
  /** what pressing does, for screen readers */
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={applied}
      aria-label={label}
      className={cn(
        'inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border border-border bg-canvas-sunken px-3 py-1 text-start text-[12.5px] leading-snug text-ink-soft sm:min-h-8',
        'hover:border-foreground/30 hover:text-foreground focus-visible:border-ring/60 focus-visible:shadow-focus focus-visible:outline-hidden',
        'disabled:cursor-default disabled:opacity-60 disabled:hover:border-border',
      )}
    >
      {applied ? <Check className="size-3.5 shrink-0 stroke-[1.6]" aria-hidden /> : <Plus className="size-3.5 shrink-0 stroke-[1.6]" aria-hidden />}
      <span className="min-w-0">{children}</span>
    </button>
  );
}

/**
 * What the party's history offers: its usual account (when none is chosen) and its last payment. The row
 * keeps one line of height while it loads and when there is nothing to offer, so the form below does not
 * jump when the answer arrives.
 */
export function PartySuggestions({
  contactId,
  kind,
  categoryId,
  amount,
  categories,
  onPickCategory,
  onPickAmount,
}: {
  contactId: string;
  kind: 'REVENUE' | 'EXPENSE';
  categoryId: string;
  /** the amount typed so far, in dinars (0 when empty) */
  amount: number;
  categories: Pick<CategoryRow, 'id' | 'name_ar'>[];
  onPickCategory: (id: string) => void;
  onPickAmount: (amount: number) => void;
}) {
  const history = useContactTransactions(contactId);
  const allowed = useMemo(() => new Set(categories.map((c) => c.id)), [categories]);
  const { category, last } = useMemo(() => {
    const rows = history.data ?? [];
    return { category: suggestCategoryFromHistory(rows, kind, allowed), last: lastPaymentFromHistory(rows, kind) };
  }, [history.data, kind, allowed]);

  const categoryName = category ? categories.find((c) => c.id === category.categoryId)?.name_ar : undefined;
  const showCategory = !categoryId && category && categoryName;

  return (
    <div className="flex min-h-11 flex-wrap items-center gap-2 sm:min-h-8" aria-live="polite">
      {history.isLoading ? (
        <div className="flex gap-2" aria-busy="true" aria-label="جارٍ تحميل معاملات الجهة">
          <Skeleton className="h-8 w-36 rounded-full" />
          <Skeleton className="h-8 w-44 rounded-full" />
        </div>
      ) : history.isError ? (
        <p className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-mute">
          تعذّر تحميل معاملات هذه الجهة السابقة، ويمكنك المتابعة بدونها.
          <Button type="button" variant="link" size="sm" className="h-auto min-h-11 text-[12.5px] sm:min-h-0" onClick={() => void history.refetch()}>
            أعد المحاولة
          </Button>
        </p>
      ) : !showCategory && !last ? (
        <p className="text-[12.5px] text-ink-mute">لا توجد معاملات سابقة لهذه الجهة.</p>
      ) : (
        <>
          {showCategory && (
            <SuggestionChip onClick={() => onPickCategory(category.categoryId)} label={`اختر البند ${categoryName}`}>
              <span className="font-medium text-foreground">{categoryName}</span>
              <span className="text-ink-mute"> · {usedTimesAr(category.count)}</span>
            </SuggestionChip>
          )}
          {last && (
            <SuggestionChip
              onClick={() => onPickAmount(last.amount)}
              applied={amountKey(amount) === amountKey(last.amount)}
              label={`استخدم المبلغ: ${lastPaymentLabelAr(kind, last)}`}
            >
              {lastPaymentLabelAr(kind, last)}
            </SuggestionChip>
          )}
        </>
      )}
    </div>
  );
}

// ── the duplicate warning ───────────────────────────────────────────────────────────────────────

/**
 * A quiet note, not a modal: which transactions look like this one, each opening in a new tab so the entry
 * in progress is kept, and a tick to say this one is a different payment. The tick belongs to these
 * matches (see duplicateSignature): if they change it is asked for again.
 */
export function DuplicateNote({
  matches,
  acknowledged,
  onAcknowledge,
  attention,
  checkboxId,
}: {
  matches: DuplicateMatch[];
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
  /** a save was pressed without the tick */
  attention: boolean;
  checkboxId: string;
}) {
  return (
    <div className="rounded-lg border border-warning-line bg-warning-soft text-warning-ink">
      <div className="px-3 pt-2.5">
        <p className="text-[13px] font-semibold">{duplicateHeadlineAr(matches)}</p>
        <p className="text-[12.5px]">{duplicateReasonAr(matches)}</p>
      </div>
      <ul className="mt-1 divide-y divide-warning-line px-3">
        {matches.map((m) => (
          <li key={m.id} className="flex items-center gap-2 py-1.5">
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                <span dir="ltr" className="font-semibold tabular-nums">
                  #{m.number}
                </span>
                <span className="tabular-nums">{formatDate(m.date)}</span>
                {m.daysApart === 0 && <span>نفس اليوم</span>}
              </span>
              <span className="block truncate text-[12.5px]">{m.description ?? 'بدون بيان'}</span>
            </span>
            <Link
              href={`/transactions?highlight=${m.id}`}
              prefetch={false}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`افتح المعاملة رقم ${m.number} في تبويب جديد`}
              title="افتحها في تبويب جديد"
              className="grid size-11 shrink-0 place-items-center rounded-md hover:bg-warning-line focus-visible:bg-warning-line focus-visible:outline-hidden sm:size-8"
            >
              <ExternalLink className="size-4 stroke-[1.6]" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <label
        htmlFor={checkboxId}
        className="flex min-h-11 cursor-pointer items-center gap-2.5 border-t border-warning-line px-3 text-[13px] font-medium sm:min-h-9"
      >
        <input
          id={checkboxId}
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => onAcknowledge(e.target.checked)}
          aria-describedby={attention && !acknowledged ? `${checkboxId}-hint` : undefined}
          className="size-5 shrink-0 accent-foreground sm:size-4"
        />
        ليست مكررة
      </label>
      {attention && !acknowledged && (
        <p id={`${checkboxId}-hint`} className="px-3 pb-2 text-[12.5px] font-medium text-danger-ink">
          افتح المعاملة للتأكد، ثم ضع علامة «ليست مكررة» لتكمل الترحيل.
        </p>
      )}
    </div>
  );
}

// ── cheque and transfer details ─────────────────────────────────────────────────────────────────

export type PaymentDetailsValues = { chequeNumber: string; chequeBank: string; chequeDate: string; reference: string };

/** A cheque asks for its number (required), bank and date; a transfer for its reference. Nothing for cash or card. */
export function PaymentDetailsFields({
  method,
  values,
  errors,
  onChange,
}: {
  method: EntryMethod;
  values: PaymentDetailsValues;
  errors: { chequeNumber?: string; chequeDate?: string };
  onChange: (patch: Partial<PaymentDetailsValues>) => void;
}) {
  if (method === 'CHEQUE') {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-canvas-sunken/50 p-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tx-cheque-number" className="flex items-baseline justify-between gap-2">
            رقم الصك
            <span className="text-[12px] font-normal text-ink-mute">مطلوب</span>
          </Label>
          <Input
            id="tx-cheque-number"
            dir="ltr"
            inputMode="text"
            autoComplete="off"
            maxLength={40}
            value={values.chequeNumber}
            onChange={(e) => onChange({ chequeNumber: e.target.value })}
            aria-invalid={errors.chequeNumber ? true : undefined}
            aria-describedby={errors.chequeNumber ? 'tx-cheque-number-error' : undefined}
            className={cn(FIELD_CLASS, 'text-right tabular-nums', errors.chequeNumber && 'border-danger')}
          />
          {errors.chequeNumber && (
            <p id="tx-cheque-number-error" role="alert" className="text-[12.5px] text-danger-ink">
              {errors.chequeNumber}
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tx-cheque-bank">البنك (اختياري)</Label>
            <Input
              id="tx-cheque-bank"
              autoComplete="off"
              maxLength={80}
              value={values.chequeBank}
              onChange={(e) => onChange({ chequeBank: e.target.value })}
              className={FIELD_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tx-cheque-date">تاريخ الصك (اختياري)</Label>
            <Input
              id="tx-cheque-date"
              type="date"
              min="2000-01-01"
              value={values.chequeDate}
              onChange={(e) => onChange({ chequeDate: e.target.value })}
              aria-invalid={errors.chequeDate ? true : undefined}
              aria-describedby="tx-cheque-date-hint"
              className={cn(FIELD_CLASS, errors.chequeDate && 'border-danger')}
            />
          </div>
        </div>
        <p id="tx-cheque-date-hint" className={cn('text-[12.5px]', errors.chequeDate ? 'text-danger-ink' : 'text-ink-mute')}>
          {errors.chequeDate ?? 'اتركه فارغاً إن كان الصك بتاريخ العملية. الصك الآجل يُكتب بتاريخ استحقاقه.'}
        </p>
      </div>
    );
  }
  if (method === 'TRANSFER') {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tx-reference">رقم الحوالة أو المرجع (اختياري)</Label>
        <Input
          id="tx-reference"
          dir="ltr"
          autoComplete="off"
          maxLength={60}
          value={values.reference}
          onChange={(e) => onChange({ reference: e.target.value })}
          className={cn(FIELD_CLASS, 'text-right tabular-nums')}
        />
      </div>
    );
  }
  return null;
}
