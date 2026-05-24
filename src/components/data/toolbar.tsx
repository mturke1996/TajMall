'use client';

import { Search, SlidersHorizontal, Download, CalendarRange, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type DateRangePreset = 'all' | 'this_month' | 'last_month' | 'this_quarter' | 'this_year';

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'all',          label: 'الكل' },
  { value: 'this_month',   label: 'هذا الشهر' },
  { value: 'last_month',   label: 'الشهر الماضي' },
  { value: 'this_quarter', label: 'هذا الربع' },
  { value: 'this_year',    label: 'هذا العام' },
];

/**
 * Search + date filter + export toolbar.
 * Mobile layout: vertical stack with full-width search.
 * Desktop layout: horizontal row with preset pills + badges.
 */
export function DataToolbar({
  searchPlaceholder = 'ابحث…',
  count,
  children,
  onExport,
  onSearch,
  datePreset,
  onDatePreset,
}: {
  searchPlaceholder?: string;
  count?: number;
  children?: React.ReactNode;
  onExport?: () => void;
  onSearch?: (value: string) => void;
  datePreset?: DateRangePreset;
  onDatePreset?: (preset: DateRangePreset) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-2.5 sm:gap-2 sm:p-3">
      {/* Row 1: Search + actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 stroke-[1.5] text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            className="pe-9 bg-canvas-sunken border-transparent focus:border-ring focus:bg-card transition-colors"
            onChange={(e) => onSearch?.(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          {typeof count === 'number' && (
            <Badge variant="neutral" className="font-mono normal-case tracking-normal shrink-0">
              {count.toLocaleString('en-US')} نتيجة
            </Badge>
          )}
          {children}
          {onExport && (
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={onExport}>
              <Download className="h-3.5 w-3.5 stroke-[1.6]" />
              <span className="hidden sm:inline">تصدير</span>
            </Button>
          )}
        </div>
      </div>

      {/* Row 2: Date presets (only if onDatePreset provided) */}
      {onDatePreset && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground shrink-0 ms-0.5" />
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => onDatePreset(p.value)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150',
                datePreset === p.value || (!datePreset && p.value === 'all')
                  ? 'bg-foreground text-background shadow-sm'
                  : 'bg-canvas-sunken text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
          {datePreset && datePreset !== 'all' && (
            <button
              onClick={() => onDatePreset('all')}
              className="ms-auto shrink-0 flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
              مسح
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Returns a date range [from, to] for a given preset.
 * Use this to filter data client-side.
 */
export function getDateRange(preset: DateRangePreset): { from: Date | null; to: Date | null } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (preset) {
    case 'this_month':
      return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0) };
    case 'last_month':
      return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0) };
    case 'this_quarter': {
      const q = Math.floor(m / 3);
      return { from: new Date(y, q * 3, 1), to: new Date(y, q * 3 + 3, 0) };
    }
    case 'this_year':
      return { from: new Date(y, 0, 1), to: new Date(y, 11, 31) };
    default:
      return { from: null, to: null };
  }
}
