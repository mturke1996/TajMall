'use client';

/**
 * Exclusive choices that need a sentence of explanation, as cards: a tinted icon tile, the name, one line
 * under it, and a round mark at the end. Used by the period journal dialog for the basis and the level of
 * detail. A radio group: the arrow keys move the choice, only the chosen card is in the tab order, and each
 * card is at least 44px tall.
 */
import type { ElementType, KeyboardEvent } from 'react';
import { IconTile, type Accent } from '@/components/dashboard/dashboard-ui';
import { cn } from '@/lib/utils';

export type ChoiceCardOption<T extends string> = {
  id: T;
  title: string;
  description: string;
  icon: ElementType;
  accent: Accent;
};

export function ChoiceCards<T extends string>({
  value,
  onChange,
  options,
  label,
  columns = 1,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly ChoiceCardOption<T>[];
  /** names the group for screen readers */
  label: string;
  /** cards per row from 640px up; on a phone they always stack */
  columns?: 1 | 2 | 3;
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
      className={cn('grid gap-2', columns === 2 && 'sm:grid-cols-2', columns === 3 && 'sm:grid-cols-3')}
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
              'flex min-h-16 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              on ? 'border-info-ink bg-info-soft' : 'border-border bg-card hover:bg-canvas-sunken',
            )}
          >
            <IconTile icon={o.icon} accent={o.accent} className="h-9 w-9 rounded-lg" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold leading-snug text-foreground">{o.title}</span>
              <span className={cn('mt-0.5 block text-[12.5px] leading-relaxed', on ? 'text-ink-soft' : 'text-ink-mute')}>{o.description}</span>
            </span>
            <span
              aria-hidden
              className={cn('grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors', on ? 'border-info-ink' : 'border-ink-mute/60')}
            >
              <span className={cn('size-2.5 rounded-full transition-opacity', on ? 'bg-info-ink opacity-100' : 'opacity-0')} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
