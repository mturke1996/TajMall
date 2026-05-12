import Link from 'next/link';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Editorial empty state.
 *
 * Server-renderable: uses CSS entry animation (animate-fade-up) instead of
 * framer-motion so Server Components can pass LucideIcon refs directly.
 *
 * - Paper-thin dashed border on a sunken background to hint "place for content".
 * - Generous vertical whitespace.
 * - Single inline CTA.
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
  action?: { label: string; href?: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        'animate-fade-up flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-canvas-sunken/40 px-5 py-12 text-center sm:px-6 sm:py-16',
        className,
      )}
    >
      <span className="grid h-12 w-12 place-items-center rounded-md border border-border bg-card text-ink-mute">
        <Icon className="h-5 w-5 stroke-[1.5]" />
      </span>
      <div className="flex max-w-md flex-col gap-1.5 px-2">
        <h3 className="text-[15px] font-semibold tracking-tight sm:text-[16px]">{title}</h3>
        {description && (
          <p className="text-[12.5px] leading-[1.6] text-ink-mute sm:text-[13px]">
            {description}
          </p>
        )}
      </div>
      {action?.href && (
        <Button asChild size="sm" className="mt-1 gap-1.5">
          <Link href={action.href}>
            {action.label}
            <ArrowLeft className="stroke-[1.6]" />
          </Link>
        </Button>
      )}
    </div>
  );
}
