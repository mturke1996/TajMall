'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, ChevronsUpDown, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Skeleton } from '@/components/ui/skeleton';
import { prepareSearchFields, rankBySearch, type PreparedField, type SearchField } from '@/lib/arabic-search';
import { splitFrequent } from '@/lib/entry-suggestions';
import { useVisualViewportFit } from '@/lib/hooks/use-visual-viewport-fit';
import { arabicCount, cn } from '@/lib/utils';

/**
 * A pick-one list you can search: a popover under the field with a pointer, a bottom sheet on a phone.
 * Names, shop numbers, phones and codes are matched with Arabic normalisation (src/lib/arabic-search.ts);
 * with nothing typed the most used choices come first (`usage`).
 */

export type ComboboxOption = {
  value: string;
  label: string;
  /** second line: shop number, phone, account code */
  hint?: string;
  /** small text at the end of the row: the party's kind, «غير نشط» */
  tag?: string;
  /** what the search looks at; put the main name first */
  search: SearchField[];
};

export type ComboboxProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  /** keep the array stable (useMemo): it is indexed for search whenever it changes */
  options: ComboboxOption[];
  /** how much each option has been used lately (id → score); drives the «الأكثر استخداماً» group */
  usage?: ReadonlyMap<string, number>;
  placeholder: string;
  searchPlaceholder: string;
  /** names the sheet on a phone and the list for screen readers */
  title: string;
  frequentHeading?: string;
  allHeading?: string;
  /** adds a first row that clears the choice (for optional fields) */
  clearLabel?: string;
  /** shown on the field when `value` is set but not in `options` (still loading, or no longer listed) */
  fallbackLabel?: string;
  loading?: boolean;
  /** the list could not be loaded: said in place of the options, never as an empty list */
  error?: string | null;
  onRetry?: () => void;
  emptyText?: string;
  /** offered at the end of a search: «إضافة «x» كجهة جديدة» */
  onCreate?: { label: (query: string) => string; run: (query: string) => void };
  disabled?: boolean;
  invalid?: boolean;
  'aria-describedby'?: string;
  className?: string;
};

const WIDE = '(min-width: 640px)';
function subscribeWide(cb: () => void) {
  const list = window.matchMedia(WIDE);
  list.addEventListener('change', cb);
  return () => list.removeEventListener('change', cb);
}
// the dialog mounts after hydration, so the client read is right on the first render
const useIsWide = () => React.useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);

/** Past this the list stops: typing narrows it far faster than scrolling. */
const MAX_ROWS = 100;
const RESULTS: [string, string, string, string] = ['نتيجة واحدة', 'نتيجتان', 'نتائج', 'نتيجة'];

function OptionRow({ option, selected }: { option: ComboboxOption; selected: boolean }) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{option.label}</span>
        {option.hint && <span className="block truncate text-[12px] tabular-nums text-ink-mute">{option.hint}</span>}
      </span>
      {option.tag && <span className="shrink-0 text-[12px] text-ink-mute">{option.tag}</span>}
      {selected && (
        <>
          <Check className="size-4 shrink-0 stroke-[1.8]" aria-hidden />
          <span className="sr-only">محدد</span>
        </>
      )}
    </>
  );
}

export function Combobox({
  id,
  value,
  onValueChange,
  options,
  usage,
  placeholder,
  searchPlaceholder,
  title,
  frequentHeading = 'الأكثر استخداماً',
  allHeading = 'الكل',
  clearLabel,
  fallbackLabel,
  loading = false,
  error = null,
  onRetry,
  emptyText = 'لا توجد خيارات.',
  onCreate,
  disabled = false,
  invalid = false,
  'aria-describedby': describedBy,
  className,
}: ComboboxProps) {
  const wide = useIsWide();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  // the phone sheet rises above the keyboard instead of hiding behind it
  const [sheetEl, setSheetEl] = React.useState<HTMLDivElement | null>(null);
  useVisualViewportFit(sheetEl, 'bottom');

  const prepared = React.useMemo(() => {
    const map = new Map<string, PreparedField[]>();
    for (const o of options) map.set(o.value, prepareSearchFields(o.search));
    return map;
  }, [options]);

  const selected = options.find((o) => o.value === value);
  const q = query.trim();

  const view = React.useMemo(() => {
    if (!open) return { frequent: [] as ComboboxOption[], rest: [] as ComboboxOption[], ranked: [] as ComboboxOption[], hidden: 0 };
    if (q) {
      const ranked = rankBySearch(options, q, (o) => prepared.get(o.value) ?? [], (o) => usage?.get(o.value) ?? 0);
      return { frequent: [], rest: [], ranked: ranked.slice(0, MAX_ROWS), hidden: Math.max(0, ranked.length - MAX_ROWS) };
    }
    const { frequent, rest } = usage ? splitFrequent(options, (o) => o.value, usage) : { frequent: [], rest: options };
    return { frequent, rest: rest.slice(0, MAX_ROWS), ranked: [], hidden: Math.max(0, rest.length - MAX_ROWS) };
  }, [open, q, options, prepared, usage]);

  const shown = q ? view.ranked.length : view.frequent.length + view.rest.length;

  function change(next: boolean) {
    if (next && disabled) return;
    setOpen(next);
    if (next) setQuery('');
  }

  function pick(next: string) {
    onValueChange(next);
    change(false);
  }

  const trigger = (
    <button
      type="button"
      id={id}
      disabled={disabled}
      aria-describedby={describedBy}
      aria-busy={loading || undefined}
      className={cn(
        'flex h-11 w-full items-center justify-between gap-2 rounded-md border bg-card px-3 text-start text-base text-foreground sm:h-9 sm:text-sm',
        'transition-[border-color,box-shadow] duration-150',
        'hover:border-border/80 focus-visible:border-ring/60 focus-visible:shadow-focus focus-visible:outline-hidden',
        'disabled:cursor-not-allowed disabled:bg-canvas-sunken disabled:opacity-50',
        invalid ? 'border-danger' : 'border-border',
        className,
      )}
    >
      <span className={cn('min-w-0 flex-1 truncate', !selected && !fallbackLabel && 'text-muted-foreground/70')}>
        {selected ? selected.label : fallbackLabel || placeholder}
      </span>
      {selected?.hint && <span className="hidden max-w-[40%] shrink-0 truncate text-[12px] tabular-nums text-ink-mute sm:block">{selected.hint}</span>}
      {loading ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-ink-mute" aria-hidden />
      ) : (
        <ChevronsUpDown className="size-4 shrink-0 stroke-[1.6] text-ink-mute" aria-hidden />
      )}
    </button>
  );

  const list = (
    <Command shouldFilter={false} loop label={title}>
      <CommandInput ref={inputRef} value={query} onValueChange={setQuery} placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
      <CommandList className={wide ? 'max-h-72' : undefined}>
        {loading ? (
          <div className="flex flex-col gap-1.5 p-1" aria-busy="true" role="status" aria-label="جارٍ التحميل">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-11 w-full sm:h-9" />
            ))}
          </div>
        ) : error ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <p className="text-[13px] text-danger-ink">{error}</p>
            {onRetry && (
              <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-8" onClick={onRetry}>
                أعد المحاولة
              </Button>
            )}
          </div>
        ) : (
          <>
            <p role="status" className="sr-only">
              {arabicCount(shown, RESULTS)}
            </p>
            {clearLabel && !q && selected && (
              <CommandItem value="__clear__" onSelect={() => pick('')} className="text-ink-soft">
                <X className="size-4 shrink-0 stroke-[1.6] text-ink-mute" aria-hidden />
                <span className="flex-1">{clearLabel}</span>
              </CommandItem>
            )}
            {q ? (
              view.ranked.map((o) => (
                <CommandItem key={o.value} value={o.value} onSelect={() => pick(o.value)}>
                  <OptionRow option={o} selected={o.value === value} />
                </CommandItem>
              ))
            ) : (
              <>
                {view.frequent.length > 0 && (
                  <CommandGroup heading={frequentHeading}>
                    {view.frequent.map((o) => (
                      <CommandItem key={o.value} value={o.value} onSelect={() => pick(o.value)}>
                        <OptionRow option={o} selected={o.value === value} />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {view.rest.length > 0 && (
                  <CommandGroup heading={view.frequent.length > 0 ? allHeading : undefined}>
                    {view.rest.map((o) => (
                      <CommandItem key={o.value} value={o.value} onSelect={() => pick(o.value)}>
                        <OptionRow option={o} selected={o.value === value} />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
            {view.hidden > 0 && <p className="px-3 py-2 text-center text-[12px] text-ink-mute">اكتب للبحث بين {view.hidden + MAX_ROWS} خياراً.</p>}
            {shown === 0 && (
              <p className="px-3 py-6 text-center text-[13px] text-ink-mute">{q ? `لا توجد نتائج لـ «${q}». جرّب جزءاً من الاسم أو الرقم.` : emptyText}</p>
            )}
            {onCreate && q && (
              <CommandItem value="__create__" onSelect={() => { change(false); onCreate.run(q); }} className="border-t border-border text-foreground">
                <Plus className="size-4 shrink-0 stroke-[1.6] text-ink-mute" aria-hidden />
                <span className="flex-1 truncate">{onCreate.label(q)}</span>
              </CommandItem>
            )}
          </>
        )}
      </CommandList>
    </Command>
  );

  if (wide) {
    return (
      <PopoverPrimitive.Root open={open} onOpenChange={change}>
        <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            dir="rtl"
            align="start"
            sideOffset={4}
            collisionPadding={12}
            aria-label={title}
            className="z-110 flex w-(--radix-popover-trigger-width) min-w-72 flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lift outline-hidden"
          >
            {list}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    );
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={change}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-110 bg-black/30" />
        <DialogPrimitive.Content
          ref={setSheetEl}
          dir="rtl"
          aria-describedby={undefined}
          // the search field takes focus, so the keyboard is ready to type the first letters
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="fixed inset-x-0 bottom-0 z-110 flex h-[min(80dvh,36rem)] flex-col rounded-t-2xl border-t border-border bg-popover pb-[env(safe-area-inset-bottom)] text-popover-foreground shadow-lift outline-hidden"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 ps-4 pe-1.5 pt-1.5">
            <DialogPrimitive.Title className="text-[15px] font-semibold text-foreground">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="إغلاق القائمة">
                <X className="stroke-[1.6]" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          {list}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
