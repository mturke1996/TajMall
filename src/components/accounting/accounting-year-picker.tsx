'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function AccountingYearPicker({
  value,
  onChange,
  years,
  className,
}: {
  value: number;
  onChange: (year: number) => void;
  years?: number[];
  className?: string;
}) {
  const currentYear = new Date().getFullYear();
  const list = years ?? [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className={cn('min-w-0', className)}>
      <p className="mb-2 text-xs font-medium text-muted-foreground">السنة المالية</p>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scroll-smooth-touch scrollbar-none snap-x snap-mandatory">
        {list.map((year) => (
          <Button
            key={year}
            type="button"
            variant={value === year ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange(year)}
            className={cn(
              'snap-center shrink-0 min-h-10 min-w-[4.25rem] touch-manipulation',
              value === year && 'bg-sage-700 hover:bg-sage-800 text-white border-sage-700',
            )}
          >
            {year}
          </Button>
        ))}
      </div>
    </div>
  );
}
