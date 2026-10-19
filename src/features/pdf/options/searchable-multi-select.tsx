'use client';

/**
 * A list of choices you can tick, search and select in bulk — accounts, parties, cashboxes. Each choice
 * shows how many entries (and how much) it would give under the other options, so the list is also a small
 * table of what the report would hold. Native checkboxes underneath, so the keyboard and screen readers
 * work without extra code. The selection is a list of ids; an empty list means "no restriction".
 */
import { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { matchesSearch } from '@/lib/arabic-search';
import { entriesLabel, type FacetItem } from '@/lib/report-options';
import { cn } from '@/lib/utils';
import { Money } from './option-ui';

export function SearchableMultiSelect({
  idPrefix,
  label,
  items,
  selected,
  onChange,
  searchPlaceholder,
  emptyText = 'لا توجد نتائج مطابقة للبحث.',
  noneText = 'لا توجد خيارات.',
  maxVisible = 150,
}: {
  /** unique on the page: the search field's id */
  idPrefix: string;
  /** names the list for screen readers: «البنود» */
  label: string;
  items: readonly FacetItem[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  searchPlaceholder: string;
  emptyText?: string;
  noneText?: string;
  /** a very long list is cut here; searching reaches the rest */
  maxVisible?: number;
}) {
  const [query, setQuery] = useState('');
  const chosen = useMemo(() => new Set(selected), [selected]);

  const found = useMemo(() => items.filter((i) => matchesSearch(query, [i.label, i.hint])), [items, query]);
  const shown = found.slice(0, maxVisible);
  // select all / clear all act on everything the search found, not only on the rows drawn (a long list is cut at maxVisible)
  const allFoundChosen = found.length > 0 && found.every((i) => chosen.has(i.id));

  const toggle = (id: string) => onChange(chosen.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const selectFound = () => onChange([...new Set([...selected, ...found.map((i) => i.id)])]);
  const clearFound = () => {
    const drop = new Set(found.map((i) => i.id));
    onChange(selected.filter((id) => !drop.has(id)));
  };

  const searchId = `${idPrefix}-search`;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-48">
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
        <button
          type="button"
          onClick={allFoundChosen ? clearFound : selectFound}
          disabled={found.length === 0}
          className="min-h-11 rounded-md px-3 text-[13px] font-medium text-info-ink hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 sm:min-h-9"
        >
          {allFoundChosen ? (query ? 'إلغاء تحديد النتائج' : 'إلغاء تحديد الكل') : query ? 'تحديد نتائج البحث' : 'تحديد الكل'}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[13px] text-ink-mute">{noneText}</p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[13px] text-ink-mute">{emptyText}</p>
      ) : (
        <ul
          aria-label={label}
          className="max-h-72 divide-y divide-border overflow-y-auto overscroll-contain rounded-lg border border-border bg-card"
        >
          {shown.map((item) => {
            const on = chosen.has(item.id);
            const idle = item.count === 0;
            return (
              <li key={item.id}>
                {/* `relative`: the hidden checkbox is absolutely positioned, and without this its containing block is the whole dialog, so focusing it (Tab, or a click on a row of a scrolled list) scrolls the dialog itself and pushes its header out of view */}
                <label className={cn('relative flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-canvas-sunken sm:min-h-11', on && 'bg-info-soft/60')}>
                  <input type="checkbox" checked={on} onChange={() => toggle(item.id)} className="peer sr-only" />
                  <span
                    aria-hidden
                    className="grid size-5 shrink-0 place-items-center rounded border border-ink-mute/60 bg-card text-background peer-checked:border-foreground peer-checked:bg-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring"
                  >
                    <Check className={cn('size-3.5 stroke-[3]', on ? 'opacity-100' : 'opacity-0')} />
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
              </li>
            );
          })}
        </ul>
      )}
      {found.length > shown.length ? (
        <p className="text-[12.5px] text-ink-mute">يظهر أول {shown.length} من {found.length}. اكتب في البحث للوصول إلى الباقي.</p>
      ) : null}
    </div>
  );
}
