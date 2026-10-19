'use client';

import { useCallback, useState, type ElementType, type ReactNode } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export type ProfileTabDef<T extends string = string> = {
  id: T;
  label: string;
  /** a count after the label; null hides it */
  count?: number | null;
  icon?: ElementType;
};

/**
 * The tab shown first and kept in the address (`?tab=`), so a link opens the tab it names and a reload comes
 * back to it. The address is updated in place (replaceState) so switching tabs is instant and adds no history
 * entry. A name that is not one of the tabs falls back to the first.
 */
export function useProfileTab<T extends string>(ids: readonly T[], initial: string | null | undefined): [T, (next: T) => void] {
  const first = ids[0];
  const [tab, setTab] = useState<T>(() => (ids.includes(initial as T) ? (initial as T) : first));
  const change = useCallback(
    (next: T) => {
      setTab(next);
      try {
        const url = new URL(window.location.href);
        if (next === first) url.searchParams.delete('tab');
        else url.searchParams.set('tab', next);
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      } catch {
        // the address is a convenience; the tab itself already changed
      }
    },
    [first],
  );
  return [tab, change];
}

/**
 * Tabs for a profile. Arrow keys move between tabs (Radix, right-to-left aware), Tab moves into the panel.
 * Below lg the tabs share the row equally (the labels are short enough for 390px); from lg they hug their text.
 */
export function ProfileTabs<T extends string>({
  tabs,
  value,
  onValueChange,
  label,
  children,
  className,
}: {
  tabs: readonly ProfileTabDef<T>[];
  value: T;
  onValueChange: (next: T) => void;
  /** what the tabs are, for screen readers */
  label: string;
  /** the panels: <ProfilePanel id="…"> */
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsPrimitive.Root dir="rtl" value={value} onValueChange={(v) => onValueChange(v as T)} className={cn('flex min-w-0 flex-col gap-4', className)}>
      <TabsPrimitive.List
        aria-label={label}
        className="grid gap-1 rounded-xl border border-border bg-canvas-sunken p-1 lg:inline-flex lg:w-fit"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <TabsPrimitive.Trigger
              key={t.id}
              value={t.id}
              className={cn(
                'inline-flex min-h-11 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-1 text-[13px] font-medium text-ink-mute sm:min-h-9 sm:gap-1.5 sm:text-[13.5px] lg:px-4',
                'transition-colors hover:text-foreground',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                'data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-whisper',
              )}
            >
              {Icon && <Icon className="hidden h-4 w-4 shrink-0 lg:block" aria-hidden />}
              <span className="truncate">{t.label}</span>
              {t.count != null && (
                <span className="rounded-full bg-muted px-1 text-[11.5px] leading-5 tabular-nums text-ink-soft sm:px-1.5">{t.count}</span>
              )}
            </TabsPrimitive.Trigger>
          );
        })}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}

/** One panel; only the open one is mounted. */
export function ProfilePanel({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.Content value={id} className={cn('min-w-0 focus-visible:outline-none', className)}>
      {children}
    </TabsPrimitive.Content>
  );
}
