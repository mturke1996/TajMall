'use client';

import { useRef, useState, type ElementType, type ReactNode, type Ref } from 'react';
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cleanPhoneInput, displayPhone, parsePhone, phoneKindLabel, toLatinDigits } from '@/lib/contacts/phone';
import { TILE, type Accent } from '@/components/dashboard/dashboard-ui';
import { cn } from '@/lib/utils';

/** Inputs are 44px tall on a phone and 40px from 640px; 16px text on a phone keeps iOS from zooming the page when one is focused. */
export const CONTROL_HEIGHT = 'h-11 sm:h-10 max-sm:text-base';

/**
 * A label above, a control, and one line below: the error when there is one, otherwise the hint. The message is
 * tied to the control (`aria-describedby`), so a screen reader reads it with the field.
 */
export function FieldFrame({
  id,
  label,
  required,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex items-baseline gap-2">
        <Label htmlFor={id}>{label}</Label>
        {required && <span className="text-[11.5px] text-ink-mute">مطلوب</span>}
      </div>
      {children}
      {error ? (
        <p id={`${id}-msg`} role="alert" className="text-[12.5px] leading-snug text-danger-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="text-[12px] leading-snug text-ink-mute">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  inputClassName?: string;
  inputRef?: Ref<HTMLInputElement>;
  type?: 'text' | 'email' | 'tel' | 'date' | 'url';
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email';
  /** numbers, phones and codes read left to right but sit at the right edge, under their Arabic label */
  ltr?: boolean;
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
  disabled?: boolean;
};

export function TextField({
  id,
  label,
  value,
  onChange,
  onBlur,
  required,
  hint,
  error,
  className,
  inputClassName,
  inputRef,
  type = 'text',
  inputMode,
  ltr,
  placeholder,
  autoComplete = 'off',
  maxLength,
  disabled,
}: TextFieldProps) {
  return (
    <FieldFrame id={id} label={label} required={required} hint={hint} error={error} className={className}>
      <Input
        id={id}
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        inputMode={inputMode}
        dir={ltr ? 'ltr' : undefined}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={maxLength}
        disabled={disabled}
        aria-required={required ? true : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={cn(CONTROL_HEIGHT, 'aria-invalid:border-danger aria-invalid:bg-danger-soft', ltr && 'text-right', inputClassName)}
      />
    </FieldFrame>
  );
}

/** An amount: Latin digits whatever keyboard it came from, one decimal point, no sign. The unit is in the label. */
export function MoneyField(props: Omit<TextFieldProps, 'type' | 'inputMode' | 'ltr'>) {
  const { onChange, ...rest } = props;
  return (
    <TextField
      {...rest}
      ltr
      inputMode="decimal"
      onChange={(v) => onChange(toLatinDigits(v).replace(/٫/g, '.').replace(/[^\d.,]/g, ''))}
    />
  );
}

/**
 * A phone number. Arabic digits become Latin as they are typed; once the person leaves a field they changed, a
 * complete number is written the usual way (091 2345678). A field that was only passed through is left alone, so
 * an old number is never rewritten by tabbing across it. A short line under a complete number says what it is.
 */
export function PhoneField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  className,
  hint,
  placeholder = '09x xxxxxxx',
}: Pick<TextFieldProps, 'id' | 'label' | 'value' | 'onChange' | 'onBlur' | 'error' | 'className' | 'hint' | 'placeholder'>) {
  const typed = useRef(false);
  const parsed = parsePhone(value);
  const complete = parsed.kind === 'mobile' || parsed.kind === 'landline' || parsed.kind === 'international';
  return (
    <TextField
      id={id}
      label={label}
      value={value}
      className={className}
      type="tel"
      inputMode="tel"
      ltr
      autoComplete="off"
      placeholder={placeholder}
      error={error}
      hint={hint ?? (complete && !error ? phoneKindLabel(parsed.kind) : undefined)}
      onChange={(v) => {
        typed.current = true;
        onChange(cleanPhoneInput(v));
      }}
      onBlur={() => {
        if (typed.current) {
          typed.current = false;
          const shown = displayPhone(value);
          if (shown !== value) onChange(shown);
        }
        onBlur?.();
      }}
    />
  );
}

export function NotesField({
  id,
  label,
  value,
  onChange,
  hint,
  placeholder,
  rows = 3,
  onSubmitShortcut,
  hideLabel,
}: {
  id: string;
  label: ReactNode;
  /** the section's heading already says it: the label stays for screen readers only */
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  placeholder?: string;
  rows?: number;
  /** Ctrl or Cmd with Enter saves, since a plain Enter starts a new line */
  onSubmitShortcut?: () => void;
}) {
  return (
    <FieldFrame id={id} label={hideLabel ? <span className="sr-only">{label}</span> : label} hint={hint} className={hideLabel ? 'gap-0' : undefined}>
      <Textarea
        id={id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onSubmitShortcut?.();
          }
        }}
        aria-describedby={hint ? `${id}-msg` : undefined}
        className="min-h-20 resize-y max-sm:text-base"
      />
    </FieldFrame>
  );
}

// ---------------------------------------------------------------- choices

export type ChipOption<T extends string> = {
  value: T;
  label: string;
  icon?: ElementType;
  /** the colour of the icon: what the option means. The chosen chip itself is always the same neutral. */
  accent?: Accent;
};

/**
 * One choice out of a few, as chips that wrap. Real radio buttons underneath, so the arrow keys move between
 * them and a screen reader announces the group. The chosen chip is outlined in the ink colour; an option's
 * colour is carried by its icon only, so a chosen red role never reads as an error.
 */
export function ChipRadios<T extends string>({
  name,
  label,
  value,
  onChange,
  options,
  disabled,
  className,
}: {
  name: string;
  label: string;
  value: T | '';
  onChange: (value: T) => void;
  options: readonly ChipOption<T>[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <label
            key={o.value}
            className={cn(
              'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[13px] font-medium text-ink-soft sm:min-h-9',
              'transition-colors hover:bg-canvas-sunken has-checked:border-foreground has-checked:bg-canvas-sunken has-checked:text-foreground',
              'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
              disabled && 'cursor-not-allowed opacity-50 hover:bg-card',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              disabled={disabled}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {Icon && (
              <span aria-hidden className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full', o.accent ? TILE[o.accent] : 'bg-muted text-ink-soft')}>
                <Icon className="h-3.5 w-3.5" />
              </span>
            )}
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

/** Quick answers for a field: pressing one fills it, pressing the chosen one again takes it back. */
export function SuggestionChips({
  label,
  options,
  active,
  onPick,
}: {
  label: string;
  options: readonly string[];
  active?: string | null;
  onPick: (option: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={active === o}
          onClick={() => onPick(o)}
          className={cn(
            'min-h-11 rounded-full border border-border bg-card px-3 text-[12.5px] font-medium text-ink-soft sm:min-h-8',
            'transition-colors hover:bg-canvas-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            'aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background',
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- structure

/** A titled group of fields. The first has no rule above it; the others are separated by a hairline. */
export function Section({
  title,
  description,
  children,
  first,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <section className={cn('flex flex-col gap-3.5', !first && 'border-t border-border pt-5')}>
      <div>
        <h3 className="text-[13.5px] font-semibold text-foreground">{title}</h3>
        {description && <p className="mt-0.5 text-[12.5px] leading-snug text-ink-mute">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Two columns from 640px, one below. */
export const GRID = 'grid grid-cols-1 gap-3.5 sm:grid-cols-2';

/**
 * A group the person opens when they need it. `open` says only where it starts (open when it already holds
 * something): afterwards the person's own opening and closing stand, so emptying a field inside never folds the
 * group away while they type.
 */
export function Disclosure({ title, hint, open, children }: { title: string; hint?: string; open?: boolean; children: ReactNode }) {
  const [startsOpen] = useState(Boolean(open));
  return (
    <details open={startsOpen} className="group rounded-xl border border-border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3.5 text-[13px] font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <span>
          {title}
          {hint && <span className="ms-2 text-[12px] font-normal text-ink-mute">{hint}</span>}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-mute transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-3.5 border-t border-border px-3.5 pb-3.5 pt-3.5">{children}</div>
    </details>
  );
}
