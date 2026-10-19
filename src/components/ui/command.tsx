'use client';

import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * cmdk with this system's tokens: the building blocks of a searchable list (the combobox in
 * ui/combobox.tsx). The palette in layout/command-palette.tsx keeps its own markup.
 */

const Command = React.forwardRef<React.ElementRef<typeof CommandPrimitive>, React.ComponentPropsWithoutRef<typeof CommandPrimitive>>(
  ({ className, ...props }, ref) => (
    <CommandPrimitive ref={ref} className={cn('flex min-h-0 w-full flex-1 flex-col overflow-hidden text-popover-foreground', className)} {...props} />
  ),
);
Command.displayName = 'Command';

const CommandInput = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Input>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>>(
  ({ className, ...props }, ref) => (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-3">
      <Search className="size-4 shrink-0 stroke-[1.6] text-ink-mute" aria-hidden />
      <CommandPrimitive.Input
        ref={ref}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        className={cn(
          // 16px on phones: a smaller field makes iOS zoom the page when it is focused
          'flex h-12 w-full bg-transparent text-base outline-hidden placeholder:text-ink-mute disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:text-sm',
          className,
        )}
        {...props}
      />
    </div>
  ),
);
CommandInput.displayName = 'CommandInput';

const CommandList = React.forwardRef<React.ElementRef<typeof CommandPrimitive.List>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>>(
  ({ className, ...props }, ref) => (
    <CommandPrimitive.List ref={ref} className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5', className)} {...props} />
  ),
);
CommandList.displayName = 'CommandList';

const CommandGroup = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Group>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>>(
  ({ className, ...props }, ref) => (
    <CommandPrimitive.Group
      ref={ref}
      className={cn(
        '**:[[cmdk-group-heading]]:px-2.5 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:text-[12px] **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-ink-mute',
        className,
      )}
      {...props}
    />
  ),
);
CommandGroup.displayName = 'CommandGroup';

const CommandItem = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Item>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>>(
  ({ className, ...props }, ref) => (
    <CommandPrimitive.Item
      ref={ref}
      className={cn(
        // 44px rows on a phone, 36px with a pointer
        'flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-[13.5px] outline-hidden sm:min-h-9',
        'data-[selected=true]:bg-canvas-sunken data-[selected=true]:text-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
CommandItem.displayName = 'CommandItem';

const CommandSeparator = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Separator>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>>(
  ({ className, ...props }, ref) => <CommandPrimitive.Separator ref={ref} className={cn('-mx-1.5 my-1 h-px bg-border', className)} {...props} />,
);
CommandSeparator.displayName = 'CommandSeparator';

export { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandSeparator };
