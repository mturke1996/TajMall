'use client';

/**
 * The small building blocks of the PDF options dialogs: a section card with a tinted icon tile, a
 * collapsible filter row, chips, a segmented control, a switch row, a labelled field and a money figure.
 * They hold no report logic, so the revenues, expenses and period journal dialogs share them.
 *
 * Phone rules followed everywhere here: a control is 44px tall below 640px (36px from there up), text that
 * is typed is 16px so a phone does not zoom, nothing is wider than its container, and every state is
 * announced to a screen reader (`aria-pressed`, `aria-checked`, `aria-expanded`).
 */
import { useId, type KeyboardEvent, type ReactNode } from 'react';
import type { ElementType } from 'react';
import { ChevronDown } from 'lucide-react';
import { IconTile, type Accent } from '@/components/dashboard/dashboard-ui';
import { cn, formatMoney } from '@/lib/utils';

/** The colour a selected chip takes: blue for neutral choices, green for revenue, red for expense. */
export type Tone = 'info' | 'success' | 'danger';

export const TONE_SELECTED: Record<Tone, string> = {
  info: 'border-info-ink bg-info-soft text-info-ink',
  success: 'border-success-ink bg-success-soft text-success-ink',
  danger: 'border-danger-ink bg-danger-soft text-danger-ink',
};

/** the figure of an amount: number first, currency after it (formatMoney keeps that order in RTL) */
export function Money({ value, className }: { value: number; className?: string }) {
  return <span className={cn('tabular-nums', className)}>{formatMoney(value, 'LYD')}</span>;
}

export const FIELD_CLASS = 'h-11 text-base sm:h-9 sm:text-sm';

/** A text, number, date or select field: 44px tall on a phone, 36px from 640px, 16px type so a phone does not zoom. */
export const INPUT_CLASS = cn(
  FIELD_CLASS,
  'w-full rounded-md border border-border bg-card px-3 text-foreground placeholder:text-ink-mute/70 focus-visible:border-ring/60 focus-visible:shadow-focus focus-visible:outline-hidden aria-invalid:border-danger',
);

/** A label above a control, with an optional message under it (an error is read out when it appears). */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-ink-soft">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-msg`} role="alert" className="text-[12.5px] text-danger-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-msg`} className="text-[12.5px] text-ink-mute">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A card for one group of options: a tinted icon tile, the title, a short line, and an action at the end (a count, «مسح»). */
export function OptionSection({
  icon,
  accent,
  title,
  description,
  action,
  flush,
  children,
  className,
}: {
  icon: ElementType;
  accent: Accent;
  title: string;
  description?: string;
  action?: ReactNode;
  /** no padding around the content, for rows that bring their own (OptionDisclosure) */
  flush?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cn('rounded-xl border border-border bg-card', className)}>
      <header className="flex items-center gap-3 px-3.5 pt-3.5 sm:px-4">
        <IconTile icon={icon} accent={accent} className="h-9 w-9 rounded-lg" />
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="text-[14px] font-semibold leading-snug text-foreground">
            {title}
          </h3>
          {description ? <p className="text-[12.5px] leading-relaxed text-ink-mute">{description}</p> : null}
        </div>
        {action}
      </header>
      <div className={flush ? 'mt-3 border-t border-border' : 'px-3.5 pb-3.5 pt-3 sm:px-4 sm:pb-4'}>{children}</div>
    </section>
  );
}

/**
 * A filter that folds away: its title and what it is set to stay in one line, the choices open in place.
 * While it restricts something, the value is shown in a tinted chip and «مسح» clears it without opening it.
 */
export function OptionDisclosure({
  icon,
  accent,
  title,
  summary,
  active,
  onClear,
  clearLabel = 'مسح',
  defaultOpen = false,
  children,
}: {
  icon: ElementType;
  accent: Accent;
  title: string;
  /** what the filter is set to now: «كل البنود» or «3 من 12» */
  summary: string;
  active: boolean;
  onClear?: () => void;
  clearLabel?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <details className="group/disc border-t border-border first:border-t-0" open={defaultOpen || undefined}>
      <summary
        className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3.5 py-2 marker:hidden focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-4 [&::-webkit-details-marker]:hidden"
        aria-controls={id}
      >
        <IconTile icon={icon} accent={accent} className="h-9 w-9 rounded-lg" />
        <span className="min-w-0 flex-1 text-[14px] font-medium text-foreground">{title}</span>
        <span
          className={cn(
            'max-w-[45%] truncate rounded-full px-2.5 py-0.5 text-[12px] font-medium tabular-nums',
            active ? 'bg-info-soft text-info-ink' : 'text-ink-mute',
          )}
        >
          {summary}
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-mute transition-transform group-open/disc:rotate-180" aria-hidden />
      </summary>
      <div id={id} className="flex flex-col gap-3 px-3.5 pb-4 pt-1 sm:px-4">
        {active && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="min-h-11 w-fit rounded-md px-2 text-[13px] font-medium text-info-ink hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-ring sm:min-h-8"
          >
            {clearLabel}
          </button>
        ) : null}
        {children}
      </div>
    </details>
  );
}

/** A choice that is on or off. */
export function ChipButton({
  selected,
  onClick,
  tone = 'info',
  disabled,
  title,
  className,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  tone?: Tone;
  disabled?: boolean;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-8 sm:px-3',
        selected ? TONE_SELECTED[tone] : 'border-border bg-card text-ink-soft hover:bg-canvas-sunken',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** One of a few exclusive choices on one line. Arrow keys move between them, as in a native radio group. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly { id: T; label: string }[];
  label: string;
  className?: string;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    // the first option sits at the start edge: in a right-to-left row that is the right-hand side
    const forward = e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
    const i = options.findIndex((o) => o.id === value);
    const next = options[(i + (forward ? 1 : -1) + options.length) % options.length];
    onChange(next.id);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-id="${next.id}"]`)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('grid gap-0.5 rounded-lg border border-border bg-canvas-sunken p-0.5', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            data-id={o.id}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.id)}
            className={cn(
              'min-h-11 rounded-md px-2 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring sm:min-h-8',
              on ? 'bg-card text-foreground shadow-whisper' : 'text-ink-mute hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One of several exclusive choices as chips that wrap (use when a segmented control would be too tight, as
 * with six groupings on a phone). A radio group: arrow keys move the choice, only the chosen chip is in the
 * tab order.
 */
export function ChoiceChips<T extends string>({
  value,
  onChange,
  options,
  label,
  tone = 'info',
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly { id: T; label: string }[];
  label: string;
  tone?: Tone;
  className?: string;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const forward = e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
    const i = options.findIndex((o) => o.id === value);
    const next = options[(i + (forward ? 1 : -1) + options.length) % options.length];
    onChange(next.id);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-id="${next.id}"]`)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            data-id={o.id}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.id)}
            className={cn(
              'inline-flex min-h-11 items-center justify-center rounded-full border px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-8 sm:px-3',
              on ? TONE_SELECTED[tone] : 'border-border bg-card text-ink-soft hover:bg-canvas-sunken',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A setting that is on or off, as a whole row you can press: the title, one line under it, the switch at the end. */
export function ToggleRow({
  checked,
  onChange,
  title,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-start transition-colors hover:bg-canvas-sunken focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-foreground">{title}</span>
        {description ? <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-mute">{description}</span> : null}
      </span>
      <span
        aria-hidden
        className={cn(
          'flex h-6 w-10 shrink-0 items-center rounded-full border px-0.5 transition-colors',
          checked ? 'justify-end border-foreground bg-foreground' : 'justify-start border-border bg-canvas-sunken',
        )}
      >
        <span className={cn('size-4.5 rounded-full', checked ? 'bg-background' : 'bg-ink-mute')} />
      </span>
    </button>
  );
}
