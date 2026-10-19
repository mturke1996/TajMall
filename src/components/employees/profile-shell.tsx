'use client';

import { useCallback, useEffect, useState, type ElementType, type ReactNode } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { Callout, INK } from '@/components/people';
import { Card } from '@/components/ui/card';
import { NEEDS_DB_UPDATE } from '@/lib/user-messages';
import { cn } from '@/lib/utils';

export type EmployeeTabDef<T extends string = string> = {
  id: T;
  label: string;
  icon?: ElementType;
  /** a count after the label; null hides it */
  count?: number | null;
  /** the count asks for attention (a decision is waiting) */
  alert?: boolean;
};

/**
 * The tab shown first, kept in the address (`?tab=`) without adding history entries. The tabs offered depend on the
 * role, which arrives after the page, so the open tab is worked out on every render: the one the person picked, else
 * the one the address names, else the first that is offered.
 */
export function useEmployeeTab<T extends string>(ids: readonly T[], initial: string | null | undefined): [T, (next: T) => void] {
  const first = ids[0];
  const [picked, setPicked] = useState<T | null>(null);
  const wanted = (picked ?? initial) as T | null;
  const current = wanted && ids.includes(wanted) ? wanted : first;
  const change = useCallback(
    (next: T) => {
      setPicked(next);
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
  return [current, change];
}

/**
 * The tabs of an employee's page. Six of them do not fit a phone side by side, so below 1024px the row scrolls
 * sideways inside itself (never the page) and keeps the open tab in view.
 */
export function EmployeeTabs<T extends string>({
  tabs,
  value,
  onValueChange,
  label,
  children,
}: {
  tabs: readonly EmployeeTabDef<T>[];
  value: T;
  onValueChange: (next: T) => void;
  label: string;
  children: ReactNode;
}) {
  // centre the open tab inside the row without moving the page (scrollIntoView would scroll the page down to the tabs)
  useEffect(() => {
    const tab = document.getElementById(`employee-tab-${value}`);
    const row = tab?.closest<HTMLElement>('[data-tab-row]');
    if (!tab || !row) return;
    const t = tab.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    row.scrollBy({ left: t.left + t.width / 2 - (r.left + r.width / 2) });
  }, [value]);
  return (
    <TabsPrimitive.Root dir="rtl" value={value} onValueChange={(v) => onValueChange(v as T)} className="flex min-w-0 flex-col gap-4">
      <div data-tab-row className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsPrimitive.List aria-label={label} className="inline-flex w-max min-w-full gap-1 rounded-xl border border-border bg-canvas-sunken p-1 sm:min-w-0">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <TabsPrimitive.Trigger
                key={t.id}
                id={`employee-tab-${t.id}`}
                value={t.id}
                className={cn(
                  'inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-[13px] font-medium text-ink-mute sm:min-h-9 sm:text-[13.5px]',
                  'transition-colors hover:text-foreground',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  'data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-whisper',
                )}
              >
                {Icon && <Icon className="hidden h-4 w-4 shrink-0 lg:block" aria-hidden />}
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[11.5px] leading-5 tabular-nums',
                      t.alert ? 'bg-warning-soft text-warning-ink' : 'bg-muted text-ink-soft',
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </TabsPrimitive.Trigger>
            );
          })}
        </TabsPrimitive.List>
      </div>
      {children}
    </TabsPrimitive.Root>
  );
}

export function EmployeePanel({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.Content value={id} className={cn('flex min-w-0 flex-col gap-4 focus-visible:outline-none', className)}>
      {children}
    </TabsPrimitive.Content>
  );
}

/** The database lacks what a tab needs: one calm sentence, no setup instructions. */
export function DbUpdateNotice({ what }: { what: 'payroll' | 'leave' }) {
  return (
    <Callout tone="warning" title={what === 'payroll' ? 'الرواتب غير مفعّلة بعد' : 'الإجازات وملف الموظف غير مفعّلة بعد'}>
      {NEEDS_DB_UPDATE}
    </Callout>
  );
}

/** A short line under a section heading: what this is and, when it matters, what happens next. */
export function Lead({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-ink-mute">{children}</p>;
}

/**
 * A log grouped by month: a heading that stays under the top bar while its entries scroll past, then one line per
 * entry. The box clips with `overflow-clip` (not `hidden`) so the headings can stick to the page's scroll. On a
 * phone the slim bar of the profile header sits at the top, so the headings stick below it.
 */
export function LogGroups<T>({
  groups,
  renderRow,
  getKey,
}: {
  groups: ReadonlyArray<{ key: string; title: string; items: readonly T[] }>;
  renderRow: (item: T) => ReactNode;
  getKey: (item: T) => string;
}) {
  return (
    <div className="overflow-clip rounded-xl border border-border bg-card shadow-whisper">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.title}>
          <h3 className="sticky top-28 z-10 border-b border-border bg-canvas-sunken px-4 py-2 text-[12.5px] font-semibold text-ink-soft sm:top-16 sm:px-5">{g.title}</h3>
          <ul className="divide-y divide-border">
            {g.items.map((item) => (
              <li key={getKey(item)}>{renderRow(item)}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export type AttentionItem = { key: string; tone: 'info' | 'warning' | 'danger'; text: ReactNode; action?: ReactNode };

const ATTENTION_ICON = { info: Info, warning: TriangleAlert, danger: CircleAlert } as const;

/** What needs a look on this file, one line each: a date coming up, a request waiting, a missing salary. One box, not a stack of banners. */
export function AttentionList({ items }: { items: readonly AttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card role="region" aria-label="ما يحتاج متابعة" className="divide-y divide-border overflow-hidden">
      {items.map((item) => {
        const Icon = ATTENTION_ICON[item.tone];
        return (
          <div key={item.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
            <p className="flex min-w-0 items-start gap-2.5 text-[13.5px] leading-relaxed">
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', INK[item.tone])} aria-hidden />
              <span className="min-w-0">{item.text}</span>
            </p>
            {item.action && <div className="shrink-0 *:min-h-11 sm:*:min-h-9">{item.action}</div>}
          </div>
        );
      })}
    </Card>
  );
}
