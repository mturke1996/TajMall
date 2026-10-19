import { useId, type ElementType, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { IconTile, type Accent } from '@/components/dashboard/dashboard-ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/components/people/states';
import { cn } from '@/lib/utils';

export type SectionStatus = 'ready' | 'loading' | 'error' | 'empty';

/**
 * A titled panel: heading, one optional line under it, an optional link or action at the far end, then the
 * body. Pass `status` to show the loading, error (with retry) or empty state in place of the body.
 */
export function SectionCard({
  title,
  description,
  icon,
  accent = 'blue',
  link,
  actions,
  status = 'ready',
  emptyText = 'لا توجد بيانات.',
  emptyAction,
  errorText,
  onRetry,
  skeletonRows,
  flush,
  id,
  className,
  children,
}: {
  title: string;
  description?: ReactNode;
  icon?: ElementType;
  accent?: Accent;
  link?: { href: string; label: string };
  actions?: ReactNode;
  status?: SectionStatus;
  emptyText?: ReactNode;
  emptyAction?: ReactNode;
  errorText?: string;
  onRetry?: () => void;
  skeletonRows?: number;
  /** no padding around the body (lists and tables that draw their own rows) */
  flush?: boolean;
  id?: string;
  className?: string;
  children?: ReactNode;
}) {
  const autoId = useId();
  const headingId = `${id ?? autoId}-title`;
  return (
    <Card id={id} role="region" aria-labelledby={headingId} aria-busy={status === 'loading'} className={cn('flex min-w-0 flex-col overflow-hidden', className)}>
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          {icon && <IconTile icon={icon} accent={accent} className="h-9 w-9 rounded-lg" />}
          <div className="min-w-0">
            <h2 id={headingId} className="text-[15px] font-semibold leading-snug text-foreground">
              {title}
            </h2>
            {description && <p className="text-[12px] leading-snug text-ink-mute">{description}</p>}
          </div>
        </div>
        {actions}
        {link && (
          <Link
            href={link.href}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-[12.5px] text-ink-mute hover:bg-canvas-sunken hover:text-foreground sm:min-h-9"
          >
            {link.label}
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </header>
      <div className="flex-1 border-t border-border">
        {status === 'loading' ? (
          <LoadingBlock rows={skeletonRows} />
        ) : status === 'error' ? (
          <ErrorBlock message={errorText} onRetry={onRetry} />
        ) : status === 'empty' ? (
          <EmptyBlock action={emptyAction}>{emptyText}</EmptyBlock>
        ) : (
          <div className={cn(!flush && 'p-4 sm:p-5')}>{children}</div>
        )}
      </div>
    </Card>
  );
}
