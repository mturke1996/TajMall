'use client';

import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { defaultDirOf, type SortKey, type SortState } from '@/lib/contacts/directory';

/** A column title that sorts. The sort is announced (aria-sort) and the button says what pressing it does. */
function SortHeader({
  sortKey,
  sort,
  onSort,
  children,
}: {
  sortKey: SortKey;
  sort: SortState;
  onSort: (next: SortState) => void;
  /** the column title; the button's name starts from the words on screen (WCAG label in name) */
  children: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort({ key: sortKey, dir: active ? (sort.dir === 'asc' ? 'desc' : 'asc') : defaultDirOf(sortKey) })}
      className={cn(
        '-mx-1.5 inline-flex min-h-9 items-center gap-1.5 rounded-md px-1.5 font-medium transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        active ? 'text-foreground' : 'text-ink-mute',
      )}
      aria-label={`ترتيب حسب ${children}`}
    >
      {children}
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

/** The wide table. Columns are fixed so rows do not jump as figures change; the page never scrolls sideways. */
export function DirectoryTable({
  sort,
  onSort,
  children,
  label,
}: {
  sort: SortState;
  onSort: (next: SortState) => void;
  children: ReactNode;
  label: string;
}) {
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
  return (
    <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-whisper xl:block">
      <table className="w-full table-fixed text-[13px]" aria-label={label}>
        <colgroup>
          <col className="w-[31%]" />
          <col className="w-[17%]" />
          <col className="w-[15%]" />
          <col className="w-[21%]" />
          <col className="w-[16%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-border bg-canvas-sunken text-start text-[12.5px]">
            <th scope="col" aria-sort={ariaSort('name')} className="px-4 py-1.5 text-start font-medium">
              <SortHeader sortKey="name" sort={sort} onSort={onSort}>
                الجهة
              </SortHeader>
            </th>
            <th scope="col" className="px-4 py-1.5 text-start font-medium text-ink-mute">
              التواصل
            </th>
            <th scope="col" aria-sort={ariaSort('recent')} className="px-4 py-1.5 text-start font-medium">
              <SortHeader sortKey="recent" sort={sort} onSort={onSort}>
                آخر حركة
              </SortHeader>
            </th>
            <th scope="col" aria-sort={ariaSort('total')} className="px-4 py-1.5 text-start font-medium">
              <SortHeader sortKey="total" sort={sort} onSort={onSort}>
                آخر 12 شهراً
              </SortHeader>
            </th>
            <th scope="col" className="px-3 py-1.5 text-end font-medium">
              <span className="sr-only">إجراءات</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}
