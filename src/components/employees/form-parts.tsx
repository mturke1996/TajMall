'use client';

import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Inputs are 44px tall on a phone and 36px from 640px, like the rest of the entry forms. */
export const FIELD_HEIGHT = 'h-11 sm:h-9';

export const NATIVE_SELECT =
  'h-11 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:h-9 ' +
  'transition-[border-color,box-shadow] duration-100 focus-visible:outline-hidden focus-visible:border-ring focus-visible:shadow-focus ' +
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-canvas-sunken';

/** A native select: the best picker on a phone, and it works the same in every browser. */
export function NativeSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(NATIVE_SELECT, className)} {...props}>
      {children}
    </select>
  );
}

export type Choice<T extends string> = {
  value: T;
  label: string;
  /** colours the chip when chosen: money in is green, money out is red */
  tone?: 'success' | 'danger' | 'warning' | 'info';
  disabled?: boolean;
};

const CHECKED: Record<NonNullable<Choice<string>['tone']> | 'plain', string> = {
  plain: 'has-checked:border-foreground has-checked:bg-foreground has-checked:text-background',
  success: 'has-checked:border-success-line has-checked:bg-success-soft has-checked:text-success-ink',
  danger: 'has-checked:border-danger-line has-checked:bg-danger-soft has-checked:text-danger-ink',
  warning: 'has-checked:border-warning-line has-checked:bg-warning-soft has-checked:text-warning-ink',
  info: 'has-checked:border-info-line has-checked:bg-info-soft has-checked:text-info-ink',
};

/**
 * One choice out of a few, as chips. They are real radio buttons underneath, so the arrow keys move between them
 * and a screen reader announces the group; the chip that is chosen carries the colour of what it means.
 */
export function ChoiceChips<T extends string>({
  label,
  value,
  onChange,
  choices,
  columns = 'grid-cols-2 sm:grid-cols-3',
  disabled,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  choices: readonly Choice<T>[];
  columns?: string;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid gap-1.5', columns)}>
      {choices.map((c) => (
        <label
          key={c.value}
          className={cn(
            'flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-border bg-card px-2 text-center text-[13px] font-medium text-ink-soft sm:min-h-9',
            'transition-colors hover:bg-canvas-sunken has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
            CHECKED[c.tone ?? 'plain'],
            (disabled || c.disabled) && 'cursor-not-allowed opacity-50 hover:bg-card',
          )}
        >
          <input
            type="radio"
            name={name}
            value={c.value}
            checked={value === c.value}
            disabled={disabled || c.disabled}
            onChange={() => onChange(c.value)}
            className="sr-only"
          />
          {c.label}
        </label>
      ))}
    </div>
  );
}

/** A quiet box that restates the result before saving. */
export function SummaryBox({ rows }: { rows: Array<{ label: string; value: ReactNode; strong?: boolean }> }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-lg border border-border bg-canvas-sunken px-4 py-3 text-[13px]">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className={r.strong ? 'font-semibold' : 'text-muted-foreground'}>{r.label}</dt>
          <dd className={cn('text-end', r.strong && 'font-semibold')}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
