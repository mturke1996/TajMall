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
    <div className={cn('flex flex-col gap-2 border-b border-border bg-canvas px-4 py-4 sm:px-5 md:px-8 md:py-6', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          {eyebrow && (
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
              {eyebrow}
            </span>
          )}
          {title && (
            <h1 className={cn('text-lg font-semibold', titleClassName)}>
              {title}
            </h1>
          )}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
      {description && <p className="text-sm text-ink-mute">{description}</p>}
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
