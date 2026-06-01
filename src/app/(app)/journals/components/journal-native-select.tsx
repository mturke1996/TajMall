'use client';

import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { ChevronDown } from 'lucide-react';

export type NativeSelectOption = { value: string; label: string };

/**
 * Native &lt;select&gt; — reliable on iOS/Android inside full-screen sheets
 * (Radix Select can clip or fight viewport scroll on small screens).
 */
export function JournalNativeSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: NativeSelectOption[];
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <div className="relative mt-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className={cn(
            'flex h-12 w-full appearance-none rounded-lg border border-border bg-card px-3 pe-10 text-sm',
            'touch-manipulation focus:outline-none focus-visible:border-sage-500 focus-visible:shadow-focus',
          )}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
      </div>
    </div>
  );
}
