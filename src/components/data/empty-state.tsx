import Link from 'next/link';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Editorial empty state — redesigned with gradient icon container
 * and better visual hierarchy.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}) {
  return (
    <div
      className={cn(
        'animate-fade-up flex flex-col items-center justify-center gap-5 rounded-xl',
        'border border-dashed border-border bg-canvas-sunken/50',
        'px-5 py-14 text-center sm:px-8 sm:py-20',
        className,
      )}
    >
      {/* Icon container with subtle gradient */}
      <div className="relative">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-border/60 to-transparent blur-xl" />
        <span className="relative grid h-14 w-14 place-items-center rounded-2xl border border-border bg-card shadow-whisper text-muted-foreground">
          <Icon className="h-6 w-6 stroke-[1.5]" />
        </span>
      </div>

      <div className="flex max-w-sm flex-col gap-2">
        <h3 className="text-[15px] font-semibold tracking-tight sm:text-base">
          {title}
        </h3>
        {description && (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      {action && (
        action.href ? (
          <Button asChild size="sm" className="mt-1 gap-1.5">
            <Link href={action.href}>
              {action.label}
              <ArrowLeft className="h-3.5 w-3.5 stroke-[1.6]" />
            </Link>
          </Button>
        ) : (
          <Button size="sm" className="mt-1 gap-1.5" onClick={action.onClick}>
            {action.label}
          </Button>
        )
      )}
    </div>
  );
}
