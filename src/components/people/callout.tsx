import type { ElementType, ReactNode } from 'react';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { CHIP, type ChipTone } from '@/components/people/people-theme';
import { cn } from '@/lib/utils';

const ICON: Record<ChipTone, ElementType> = {
  info: Info,
  success: Info,
  warning: TriangleAlert,
  danger: CircleAlert,
  plum: Info,
  neutral: Info,
};

/**
 * A short note on a profile: what the screen noticed and, at most, one thing to do about it. Danger notes are
 * announced at once (role alert); the others wait to be read (role status).
 */
export function Callout({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: ChipTone;
  title?: string;
  children?: ReactNode;
  /** one button or link */
  action?: ReactNode;
  className?: string;
}) {
  const Icon = ICON[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex flex-col gap-3 rounded-xl border p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4', CHIP[tone], className)}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 text-[13px] leading-relaxed">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={cn(title && 'mt-0.5')}>{children}</div>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2 *:min-h-11 sm:*:min-h-9">{action}</div>}
    </div>
  );
}
