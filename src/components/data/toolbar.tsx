'use client';

import { Search, SlidersHorizontal, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * Search + filter + export toolbar.
 *
 * Mobile layout: vertical stack with full-width search.
 * Desktop layout: horizontal row with badge + buttons.
 */
export function DataToolbar({
  searchPlaceholder = 'ابحث…',
  count,
  children,
  onExport,
  onSearch,
}: {
  searchPlaceholder?: string;
  count?: number;
  children?: React.ReactNode;
  onExport?: () => void;
  onSearch?: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-2.5 sm:flex-row sm:items-center sm:gap-2 sm:p-3">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 stroke-[1.5] text-ink-mute" />
        <Input
          placeholder={searchPlaceholder}
          className="pe-9"
          onChange={(e) => onSearch?.(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        {typeof count === 'number' && (
          <Badge variant="neutral" className="font-mono normal-case tracking-normal">
            {count.toLocaleString('en-US')} نتيجة
          </Badge>
        )}
        {children}
        <Button variant="outline" size="sm" className="gap-1.5">
          <SlidersHorizontal className="stroke-[1.6]" />
          <span className="hidden sm:inline">فلاتر</span>
        </Button>
        {onExport && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onExport}>
            <Download className="stroke-[1.6]" />
            <span className="hidden sm:inline">تصدير</span>
          </Button>
        )}
      </div>
    </div>
  );
}
