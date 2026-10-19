'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useActiveInView } from '@/lib/hooks/use-active-in-view';
import type { RoleChip, RoleFilter, SortState } from '@/lib/contacts/directory';
import { cn } from '@/lib/utils';

/** What a person may choose to order by. Both ways of each key are offered so a phone has the whole choice. */
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'name:asc', label: 'الاسم: من أ إلى ي' },
  { value: 'name:desc', label: 'الاسم: من ي إلى أ' },
  { value: 'recent:desc', label: 'آخر حركة: الأحدث أولاً' },
  { value: 'recent:asc', label: 'آخر حركة: الأقدم أولاً' },
  { value: 'total:desc', label: 'إجمالي 12 شهراً: الأعلى أولاً' },
  { value: 'total:asc', label: 'إجمالي 12 شهراً: الأقل أولاً' },
];

export const sortToValue = (s: SortState) => `${s.key}:${s.dir}`;
const valueToSort = (v: string): SortState => {
  const [key, dir] = v.split(':');
  return { key: key as SortState['key'], dir: dir as SortState['dir'] };
};

/** One row: the search, the order, and the switch for files that are no longer active. */
export function DirectoryToolbar({
  searchQuery,
  onSearchChange,
  sort,
  onSortChange,
  showInactive,
  onShowInactiveChange,
  inactiveCount,
  searchLabel,
}: {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sort: SortState;
  onSortChange: (s: SortState) => void;
  showInactive: boolean;
  onShowInactiveChange: (show: boolean) => void;
  inactiveCount: number;
  searchLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute inset-s-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
        <Input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="الاسم أو الهاتف أو الرمز أو رقم المحل"
          aria-label={searchLabel}
          className="h-11 ps-9 pe-10 text-[14px] sm:h-10"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="مسح البحث"
            className="absolute inset-e-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-ink-mute hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <label className="sr-only" htmlFor="directory-sort">
          الترتيب
        </label>
        <select
          id="directory-sort"
          value={sortToValue(sort)}
          onChange={(e) => onSortChange(valueToSort(e.target.value))}
          className="h-11 min-w-0 flex-1 rounded-md border border-border bg-card px-3 text-[13px] text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:h-10 sm:w-56 sm:flex-none xl:hidden"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {inactiveCount > 0 && (
          <label className="flex h-11 shrink-0 cursor-pointer touch-manipulation items-center gap-2 rounded-md border border-border bg-card px-3 text-[13px] text-ink-soft hover:border-ink-mute/40 sm:h-10">
            <input
              type="checkbox"
              className="h-4 w-4 accent-foreground"
              checked={showInactive}
              onChange={(e) => onShowInactiveChange(e.target.checked)}
            />
            إظهار غير النشطين
            <span className="tabular-nums text-ink-mute">({inactiveCount})</span>
          </label>
        )}
      </div>
    </div>
  );
}

/** Role filters as pills with their counts. The row scrolls inside itself on a phone, never the page. */
export function RoleChips({
  chips,
  counts,
  value,
  onChange,
}: {
  chips: RoleChip[];
  counts: ReadonlyMap<RoleFilter, number>;
  value: RoleFilter;
  onChange: (role: RoleFilter) => void;
}) {
  const rowRef = useActiveInView<HTMLDivElement>(value);
  if (chips.length === 0) return null;
  return (
    <div ref={rowRef} className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="تصفية حسب الدور">
      <div className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
        {chips.map((c) => {
          const selected = value === c.id;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(c.id)}
              className={cn(
                'inline-flex h-11 touch-manipulation items-center gap-2 whitespace-nowrap rounded-full border px-4 text-[13px] font-medium transition-colors sm:h-9',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                selected ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-ink-soft hover:border-ink-mute/40 hover:text-foreground',
              )}
            >
              {c.label}
              {counts.has(c.id) && <span className={cn('tabular-nums text-[12px]', selected ? 'opacity-80' : 'text-ink-mute')}>{counts.get(c.id)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
