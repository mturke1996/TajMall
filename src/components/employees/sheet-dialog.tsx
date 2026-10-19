'use client';

import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useVisualViewportFit } from '@/lib/hooks/use-visual-viewport-fit';
import { cn } from '@/lib/utils';

const WIDTH = { md: 'sm:max-w-md', lg: 'sm:max-w-xl', xl: 'sm:max-w-2xl' } as const;

/**
 * The dialog every employee form uses: a card from 640px, a full-height sheet on a phone with the title on top, the
 * fields scrolling in the middle and the buttons always in reach at the bottom (the on-screen keyboard never covers
 * them). It does not close while a save is running, keeps a typed form safe from a stray tap outside, and puts
 * keyboard focus back where it was when it closes.
 *
 * With `onSubmit` the body and the buttons are one form, so Enter saves. `error` is the database's own sentence for
 * a refused save and stays on screen until the next try.
 */
export function SheetDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  busy = false,
  dirty = false,
  size = 'md',
  onSubmit,
  submitLabel,
  submitDisabled,
  submitTone = 'default',
  cancelLabel = 'إلغاء',
  error,
  footer,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  busy?: boolean;
  /** something was typed: a tap outside does not close it */
  dirty?: boolean;
  size?: keyof typeof WIDTH;
  onSubmit?: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  submitTone?: 'default' | 'danger';
  cancelLabel?: string;
  error?: string | null;
  /** replaces the cancel and save buttons */
  footer?: ReactNode;
  /** where focus goes when the dialog opened from a menu item that no longer exists */
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  useVisualViewportFit(panel, 'fill');

  // runs before Radix moves focus into the dialog, so the element that opened it is still the active one
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, [open]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!busy && !submitDisabled) onSubmit?.();
  }

  const buttons = footer ?? (
    <div className="flex gap-2">
      <Button type="button" variant="ghost" className="min-h-11 flex-1 sm:min-h-9" onClick={() => onOpenChange(false)} disabled={busy}>
        {cancelLabel}
      </Button>
      {onSubmit && submitLabel && (
        <Button
          type="submit"
          variant={submitTone === 'danger' ? 'destructive' : 'default'}
          className="min-h-11 flex-[1.5] sm:min-h-9"
          disabled={busy || submitDisabled}
        >
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
      )}
    </div>
  );

  const body = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4">{children}</div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
        {error && (
          <p role="alert" className="text-[13px] leading-relaxed text-danger-ink">
            {error}
          </p>
        )}
        {buttons}
      </div>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        ref={setPanel}
        dir="rtl"
        onInteractOutside={(e) => {
          if (dirty || busy) e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          const target = returnFocusTo?.current ?? opener.current;
          if (target && target.isConnected) {
            e.preventDefault();
            target.focus({ preventScroll: true });
          }
        }}
        className={cn(
          // a card from 640px, the whole screen below it
          'flex flex-col gap-0 overflow-hidden p-0',
          'max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0',
          WIDTH[size],
        )}
      >
        <div className="shrink-0 border-b border-border py-3.5 ps-4 pe-12 sm:ps-5">
          <DialogTitle className="text-[16px]">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="mt-1">{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </div>
        {onSubmit ? (
          <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
            {body}
          </form>
        ) : (
          body
        )}
      </DialogContent>
    </Dialog>
  );
}
