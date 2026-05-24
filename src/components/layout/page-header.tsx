'use client';

import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  titleClassName,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 border-b border-border bg-canvas px-4 py-4 sm:px-5 md:px-8 md:py-5',
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {eyebrow && (
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.20em] text-muted-foreground">
              {eyebrow}
            </span>
          )}
          {title && (
            <h1 className={cn('text-[18px] font-bold tracking-tight leading-snug', titleClassName)}>
              {title}
            </h1>
          )}
          {description && (
            <p className="text-[13px] text-muted-foreground leading-snug mt-0.5">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export function PageHeaderAction({
  className,
  asChild,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-medium text-ink transition-colors',
        'hover:bg-secondary active:translate-y-[0.5px]',
        className,
      )}
      {...props}
    />
  );
}
