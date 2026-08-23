'use client';

/**
 * One table for every list screen: sorting, pagination, column chooser, density, a totals
 * footer computed over all filtered rows (not just the visible page), mobile cards, and the
 * four list states (loading, empty, no results, data).
 *
 * Filtering stays with the page (search box, tabs, date presets) so each screen keeps its own
 * toolbar; the table receives the already-filtered rows.
 */

import { useEffect, useState, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Rows3,
  Rows4,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePersistedState } from '@/lib/hooks/use-persisted-state';
import { cn } from '@/lib/utils';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Arabic label used in the column chooser when the header is not plain text. */
    label?: string;
    /** Numbers align to the inline end and use tabular digits. */
    numeric?: boolean;
    align?: 'start' | 'center' | 'end';
    /** Columns that cannot be hidden from the chooser (e.g. amount, actions). */
    alwaysVisible?: boolean;
    headerClassName?: string;
    cellClassName?: string;
  }
}

type Density = 'comfortable' | 'compact';

export type DataTableProps<T> = {
  /** Stable id used to remember column visibility, density and page size per browser. */
  tableId: string;
  data: T[];
  columns: ColumnDef<T, any>[];
  getRowId: (row: T) => string;
  loading?: boolean;
  initialSorting?: SortingState;
  /** Columns hidden until the user turns them on. */
  initiallyHidden?: string[];
  pageSizeOptions?: number[];
  defaultPageSize?: number;
  /** Shown when there is no data at all. */
  empty?: ReactNode;
  /** Shown when data exists but the current filters match nothing. */
  noResults?: ReactNode;
  /** True when `data` is a filtered subset — switches the empty message to `noResults`. */
  isFiltered?: boolean;
  /** Card layout for small screens; the desktop table is used when omitted. */
  renderMobileRow?: (row: T) => ReactNode;
  highlightId?: string | null;
  rowDomId?: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  /** Extra controls rendered next to the column/density buttons. */
  toolbar?: ReactNode;
  caption?: string;
};

const DENSITY_CELL: Record<Density, string> = {
  comfortable: 'py-3',
  compact: 'py-1.5',
};

export function DataTable<T>({
  tableId,
  data,
  columns,
  getRowId,
  loading = false,
  initialSorting = [],
  initiallyHidden = [],
  pageSizeOptions = [25, 50, 100],
  defaultPageSize = 25,
  empty,
  noResults,
  isFiltered = false,
  renderMobileRow,
  highlightId = null,
  rowDomId,
  rowClassName,
  toolbar,
  caption,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnVisibility, setColumnVisibility] = usePersistedState<VisibilityState>(
    `table:${tableId}:columns`,
    Object.fromEntries(initiallyHidden.map((id) => [id, false])),
  );
  const [density, setDensity] = usePersistedState<Density>(`table:${tableId}:density`, 'comfortable');
  const [pageSize, setPageSize] = usePersistedState<number>(`table:${tableId}:pageSize`, defaultPageSize);
  const [pageIndex, setPageIndex] = useState(0);

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => getRowId(row),
    state: { sorting, columnVisibility, pagination: { pageIndex, pageSize } },
    onSortingChange: (updater) => {
      setSorting(updater);
      setPageIndex(0); // a new order starts from the top
    },
    onColumnVisibilityChange: (updater) =>
      setColumnVisibility((prev) => (typeof updater === 'function' ? updater(prev) : updater)),
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater;
      setPageIndex(next.pageIndex);
      if (next.pageSize !== pageSize) setPageSize(next.pageSize);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  const sortedRows = table.getSortedRowModel().rows;
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));

  // A different result set (search, tab, date) starts from the first page.
  useEffect(() => {
    if (!highlightId) setPageIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.length]);

  // New filters or a smaller result set must never leave the user on an empty page.
  useEffect(() => {
    if (pageIndex > pageCount - 1) setPageIndex(pageCount - 1);
  }, [pageIndex, pageCount]);

  // A deep link (?highlight=id) opens the page that contains the row.
  useEffect(() => {
    if (!highlightId) return;
    const index = sortedRows.findIndex((r) => r.id === highlightId);
    if (index >= 0) setPageIndex(Math.floor(index / pageSize));
    // sortedRows changes identity on every render; its length is enough to re-run after load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, sortedRows.length, pageSize]);

  const visibleRows = table.getRowModel().rows;
  const hasFooter = table.getAllLeafColumns().some((c) => c.getIsVisible() && c.columnDef.footer);
  const hideableColumns = table.getAllLeafColumns().filter((c) => !c.columnDef.meta?.alwaysVisible && c.getCanHide());
  const from = sortedRows.length === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(sortedRows.length, (pageIndex + 1) * pageSize);

  const alignClass = (meta?: { numeric?: boolean; align?: string }) =>
    meta?.align === 'center' ? 'text-center' : meta?.numeric || meta?.align === 'end' ? 'text-end' : 'text-start';

  if (loading) return <DataTableSkeleton />;
  if (data.length === 0) return <>{isFiltered ? noResults ?? empty : empty}</>;

  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={caption}>
      {/* View controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-muted-foreground tabular-nums">
          {sortedRows.length.toLocaleString('en-US')} سجل
        </p>
        <div className="flex items-center gap-1.5">
          {toolbar}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="hidden lg:inline-flex"
            onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}
            aria-label={density === 'comfortable' ? 'عرض مضغوط' : 'عرض مريح'}
            title={density === 'comfortable' ? 'عرض مضغوط' : 'عرض مريح'}
          >
            {density === 'comfortable' ? <Rows4 /> : <Rows3 />}
          </Button>
          {hideableColumns.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="hidden gap-1.5 lg:inline-flex">
                  <Columns3 />
                  الأعمدة
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                <DropdownMenuLabel>الأعمدة الظاهرة</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hideableColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(v) => column.toggleVisibility(Boolean(v))}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {column.columnDef.meta?.label ??
                      (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Mobile cards */}
      {renderMobileRow && (
        <ul className="flex flex-col gap-2 lg:hidden">
          {visibleRows.map((row) => (
            <li
              key={row.id}
              id={rowDomId?.(row.original)}
              className={cn(
                'scroll-mt-24',
                highlightId === row.id && 'rounded-xl ring-2 ring-foreground/70',
              )}
            >
              {renderMobileRow(row.original)}
            </li>
          ))}
        </ul>
      )}

      {/* Desktop table */}
      <div
        className={cn(
          'max-h-[72vh] min-w-0 overflow-auto rounded-xl border border-border bg-card',
          renderMobileRow && 'hidden lg:block',
        )}
      >
        <table className="w-full border-collapse text-[13px]">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="sticky top-0 z-[1] bg-canvas-sunken">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-border">
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                      className={cn(
                        'whitespace-nowrap px-3 py-2.5 text-[12px] font-semibold text-muted-foreground',
                        alignClass(meta),
                        meta?.headerClassName,
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            'inline-flex items-center gap-1 rounded px-1 -mx-1 transition-colors duration-100',
                            'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                            sorted && 'text-foreground',
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.id}
                id={rowDomId?.(row.original)}
                className={cn(
                  'scroll-mt-24 border-b border-border/70 last:border-0 transition-colors duration-100 hover:bg-canvas-sunken/60',
                  highlightId === row.id && 'bg-canvas-sunken ring-2 ring-inset ring-foreground/60',
                  rowClassName?.(row.original),
                )}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta;
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        'px-3 align-middle',
                        DENSITY_CELL[density],
                        alignClass(meta),
                        meta?.numeric && 'tabular-nums whitespace-nowrap',
                        meta?.cellClassName,
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {hasFooter && (
            <tfoot className="sticky bottom-0 bg-canvas-sunken">
              {table.getFooterGroups().map((group) => (
                <tr key={group.id} className="border-t border-border">
                  {group.headers.map((header) => (
                    <td
                      key={header.id}
                      className={cn(
                        'px-3 py-2.5 text-[12.5px] font-semibold',
                        alignClass(header.column.columnDef.meta),
                        header.column.columnDef.meta?.numeric && 'tabular-nums whitespace-nowrap',
                      )}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.footer, header.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination */}
      {sortedRows.length > pageSizeOptions[0] && (
        <nav
          className="flex flex-col items-center justify-between gap-2 sm:flex-row"
          aria-label="التنقل بين الصفحات"
        >
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <span className="tabular-nums">
              {from.toLocaleString('en-US')}–{to.toLocaleString('en-US')} من {sortedRows.length.toLocaleString('en-US')}
            </span>
            <span aria-hidden>·</span>
            <label className="flex items-center gap-1.5">
              <span>لكل صفحة</span>
              <select
                className="h-8 rounded-md border border-border bg-card px-2 text-[12.5px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPageIndex(0);
                }}
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-1">
            {/* RTL: "first" sits at the inline start (right) and points right. */}
            <Button variant="ghost" size="icon-sm" onClick={() => setPageIndex(0)} disabled={pageIndex === 0} aria-label="الصفحة الأولى">
              <ChevronsRight />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setPageIndex(pageIndex - 1)} disabled={pageIndex === 0} aria-label="الصفحة السابقة">
              <ChevronRight />
            </Button>
            <span className="min-w-[5.5rem] text-center text-[12.5px] tabular-nums text-foreground">
              صفحة {pageIndex + 1} من {pageCount}
            </span>
            <Button variant="ghost" size="icon-sm" onClick={() => setPageIndex(pageIndex + 1)} disabled={pageIndex >= pageCount - 1} aria-label="الصفحة التالية">
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setPageIndex(pageCount - 1)} disabled={pageIndex >= pageCount - 1} aria-label="الصفحة الأخيرة">
              <ChevronsLeft />
            </Button>
          </div>
        </nav>
      )}
    </section>
  );
}

export function DataTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" aria-busy="true" aria-live="polite">
      <span className="sr-only">جارٍ التحميل</span>
      <div className="flex gap-4 border-b border-border bg-canvas-sunken px-3 py-3">
        {[28, 16, 40, 20].map((w, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border/70 px-3 py-3.5 last:border-0">
          <Skeleton className="h-3 w-[12%]" />
          <Skeleton className="h-3 w-[18%]" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-[14%]" />
        </div>
      ))}
    </div>
  );
}

