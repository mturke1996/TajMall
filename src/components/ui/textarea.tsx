import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-md px-3 py-2 text-sm',
        'border border-border bg-card text-foreground',
        'placeholder:text-muted-foreground/60',
        'transition-[border-color,box-shadow,background-color] duration-150 ease-out',
        'focus-visible:outline-none focus-visible:border-ring/60 focus-visible:shadow-focus focus-visible:bg-card',
        'hover:border-border/80',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-canvas-sunken',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export { Textarea };
