'use client';

/**
 * Picks one account of the period journal: «كل حسابات الإيرادات» or a single account, from a list you can
 * search. Each account shows how many entries (and how much) it would give under the other options, so the
 * list is also a small table of what the report would hold. Native radio inputs underneath, so the arrow
 * keys and screen readers work without extra code.
 */
import { useId, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { matchesSearch } from '@/lib/arabic-search';
import { ALL_ACCOUNTS } from '@/lib/period-journal-options';
import { entriesLabel, type FacetItem } from '@/lib/report-options';
import { cn } from '@/lib/utils';
import { Money } from './option-ui';

export function JournalAccountPicker({
  idPrefix,
  label,
  allLabel,
  items,
  value,
  onChange,
  searchPlaceholder = 'ابحث عن حساب',
}: {
  /** unique on the page */
  idPrefix: string;
  /** names the list for screen readers */
  label: string;
  /** the first choice: «كل حسابات الإيرادات» */
  allLabel: string;
  items: readonly FacetItem[];
  /** ALL_ACCOUNTS or an account id */
  value: string;
  onChange: (next: string) => void;
  searchPlaceholder?: string;
}) {
  const [query, setQuery] = useState('');
  const name = useId();
  const found = useMemo(() => items.filter((i) => matchesSearch(query, [i.label, i.hint])), [items, query]);
  const all = useMemo(() => ({ count: items.reduce((n, i) => n + i.count, 0), total: items.reduce((s, i) => s + Math.round(i.total * 1000), 0) / 1000 }), [items]);

  const rows: { id: string; label: string; hint?: string; count: number; total: number }[] = [
    ...(query.trim() ? [] : [{ id: ALL_ACCOUNTS, label: allLabel, count: all.count, total: all.total }]),
    ...found,
  ];
  const searchId = `${idPrefix}-search`;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          {searchPlaceholder}
        </label>
        <Search className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-ink-mute" aria-hidden />
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          autoComplete="off"
          className="h-11 w-full rounded-md border border-border bg-card ps-9 pe-9 text-base text-foreground placeholder:text-ink-mute/70 focus-visible:border-ring/60 focus-visible:shadow-focus focus-visible:outline-hidden sm:h-9 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            aria-label="مسح البحث"
            onClick={() => setQuery('')}
            className="absolute inset-e-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-ink-mute hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:size-7"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[13px] text-ink-mute">
          {items.length === 0 ? 'لا توجد حسابات.' : 'لا توجد نتائج مطابقة للبحث.'}
        </p>
      ) : (
        <div role="radiogroup" aria-label={label} className="max-h-72 divide-y divide-border overflow-y-auto overscroll-contain rounded-lg border border-border bg-card">
          {rows.map((item) => {
            const on = item.id === value;
            const idle = item.count === 0;
            return (
              // `relative`: the hidden radio is absolutely positioned; without this its containing block is the whole dialog and focusing it scrolls the dialog
              <label key={item.id} className={cn('relative flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-canvas-sunken sm:min-h-11', on && 'bg-info-soft/60')}>
                <input type="radio" name={name} checked={on} onChange={() => onChange(item.id)} className="peer sr-only" />
                <span
                  aria-hidden
                  className="grid size-5 shrink-0 place-items-center rounded-full border-2 border-ink-mute/60 peer-checked:border-info-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring"
                >
                  <span className={cn('size-2.5 rounded-full', on ? 'bg-info-ink' : 'opacity-0')} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-[14px] font-medium', idle ? 'text-ink-mute' : 'text-foreground')}>{item.label}</span>
                  {item.hint ? <span className="block truncate text-[12px] text-ink-mute">{item.hint}</span> : null}
                </span>
                <span className="shrink-0 text-end">
                  {idle ? (
                    <span className="block text-[12px] text-ink-mute">بلا حركة</span>
                  ) : (
                    <>
                      <Money value={item.total} className="block text-[13px] font-medium text-foreground" />
                      <span className="block text-[12px] tabular-nums text-ink-mute">{entriesLabel(item.count)}</span>
                    </>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
