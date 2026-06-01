'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';

export function JournalConfirmSheet({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'إلغاء',
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useBodyScrollLock(open);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]" dir="rtl">
      <div className="absolute inset-0 bg-black/45" onClick={onCancel} aria-hidden />
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 rounded-t-2xl border bg-card p-5 shadow-xl',
          'sm:left-1/2 sm:right-auto sm:bottom-auto sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
        )}
        role="alertdialog"
        aria-modal
      >
        <h3 className="font-semibold text-base">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{description}</p>
        <div
          className="mt-5 grid grid-cols-2 gap-2"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <Button
            variant="outline"
            className="h-12 touch-manipulation"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            className={cn(
              'h-12 touch-manipulation',
              variant === 'danger' && 'bg-red-600 hover:bg-red-700 text-white',
            )}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
