'use client';

import { Loader2, AlertTriangle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { friendlyError } from '@/lib/user-messages';

export function AccountingLoading({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card',
        className,
      )}
    >
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
    </div>
  );
}

export function AccountingError({
  title,
  message,
  hint,
  className,
}: {
  title: string;
  message?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-danger-line bg-danger-soft/80 p-4 text-center',
        className,
      )}
    >
      <AlertTriangle className="h-8 w-8 text-danger" />
      <p className="font-semibold text-danger-ink">{title}</p>
      <p className="max-w-md text-sm text-danger-ink">{hint ?? friendlyError(message)}</p>
      {message && (
        <details className="max-w-md text-start text-[12px] text-ink-mute">
          <summary className="cursor-pointer">تفاصيل تقنية</summary>
          <p className="mt-1 wrap-break-word" dir="ltr">{message}</p>
        </details>
      )}
    </div>
  );
}

export function AccountingEmpty({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/50 p-6 text-center',
        className,
      )}
    >
      <Icon className="h-11 w-11 text-muted-foreground/50" />
      <div className="space-y-1 max-w-sm">
        <p className="font-semibold text-foreground">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}
