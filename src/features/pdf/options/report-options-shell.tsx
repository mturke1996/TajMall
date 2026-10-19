'use client';

/**
 * The frame of every PDF options dialog.
 *  - Phone: a full-height sheet. A header, the options scrolling in the middle, the live summary pinned
 *    above a sticky footer with the output buttons.
 *  - Desktop (1024px and up): two panes — the options on the start side, the live summary on the other —
 *    and the footer under both.
 * It also keeps a phone's on-screen keyboard from covering the footer, and returns focus to the button
 * that opened it.
 */
import { useRef, useState, type ElementType, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { FileDown, FileText, Loader2, Printer, Share2, X } from 'lucide-react';
import { IconTile, type Accent } from '@/components/dashboard/dashboard-ui';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { useVisualViewportFit } from '@/lib/hooks/use-visual-viewport-fit';
import { cn } from '@/lib/utils';
import type { useReportOutputs } from './use-report-outputs';

export function ReportOptionsDialogShell({
  open,
  onOpenChange,
  title,
  description,
  icon,
  accent,
  summaryPanel,
  summaryBar,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  icon: ElementType;
  accent: Accent;
  /** the desktop side column (ReportSummaryPanel) */
  summaryPanel: ReactNode;
  /** the strip above the footer on a phone and a tablet (ReportSummaryBar) */
  summaryBar: ReactNode;
  /** the output buttons (ReportOutputBar) */
  footer: ReactNode;
  /** the option sections */
  children: ReactNode;
}) {
  const openerRef = useRef<HTMLElement | null>(null);
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  useVisualViewportFit(panelEl, 'fill');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={(node) => {
            setPanelEl(node);
          }}
          dir="rtl"
          tabIndex={-1}
          onOpenAutoFocus={(e) => {
            // remember what opened the dialog; the dialog itself takes the focus, the first press of Tab reaches the first control
            openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          onCloseAutoFocus={(e) => {
            const opener = openerRef.current;
            if (opener?.isConnected) {
              e.preventDefault();
              opener.focus();
            }
          }}
          className={cn(
            'fixed inset-0 z-50 flex flex-col overflow-hidden bg-card text-card-foreground outline-hidden',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(92dvh,52rem)] sm:w-[min(100vw-2rem,62rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-border sm:shadow-lift',
          )}
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
            <IconTile icon={icon} accent={accent} />
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[15px] font-semibold leading-snug">{title}</DialogTitle>
              <DialogDescription className="mt-0.5 text-[12.5px] leading-snug">{description}</DialogDescription>
            </div>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="إغلاق" className="size-11 shrink-0">
                <X className="stroke-[1.6]" />
              </Button>
            </DialogPrimitive.Close>
          </header>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-4">{children}</div>
            </div>
            {/* focusable so the keyboard can scroll it when the notes make it taller than the dialog (a scrollable region needs a tab stop) */}
            <aside
              tabIndex={0}
              aria-label="ملخص التقرير"
              className="hidden w-80 shrink-0 overflow-y-auto overscroll-contain border-s border-border bg-canvas-sunken/50 p-5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring lg:block"
            >
              {summaryPanel}
            </aside>
          </div>

          <div className="shrink-0 lg:hidden">{summaryBar}</div>

          <footer className="shrink-0 border-t border-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">{footer}</footer>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

type Outputs = ReturnType<typeof useReportOutputs>;

/**
 * The output buttons: preview (the main one), download, share (only where the device can share a file),
 * print. While one runs, all are disabled and the line above them says what is happening; a failure is
 * written out in plain words and stays until the next try.
 */
export function ReportOutputBar({
  outputs,
  disabled,
  disabledReason,
  onClose,
}: {
  outputs: Outputs;
  /** nothing to print, or the options are wrong */
  disabled: boolean;
  /** why the buttons are off, shown instead of a status */
  disabledReason?: string | null;
  onClose: () => void;
}) {
  const { busy, busyText, error } = outputs;
  // while an output is being built the buttons are only marked unavailable (the pressed one keeps the focus, which
  // goes back to it when the viewer closes); a real `disabled` is for when there is nothing to print
  const working = busy !== null;
  const wait = working ? 'cursor-wait opacity-60' : '';
  const icon = (kind: 'preview' | 'download' | 'share' | 'print', node: ReactNode) => (busy === kind ? <Loader2 className="animate-spin" aria-hidden /> : node);
  const message = error ? (
    <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 leading-relaxed text-danger-ink">
      {error}
    </p>
  ) : busyText ? (
    <p className="flex items-center gap-2 text-ink-soft">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {busyText}
    </p>
  ) : disabled && disabledReason ? (
    <p className="text-ink-mute">{disabledReason}</p>
  ) : null;

  return (
    <div className="flex flex-col">
      {/* the live region stays in the page so a message that appears is read out; it takes no room while empty */}
      <div aria-live="polite" className={cn('text-[13px]', message && 'mb-2.5')}>
        {message}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        <Button type="button" variant="ghost" onClick={onClose} className="hidden h-9 sm:inline-flex">
          إغلاق
        </Button>
        <div className={cn('grid gap-2 sm:ms-auto sm:flex sm:items-center', outputs.canShare ? 'grid-cols-3' : 'grid-cols-2')}>
          <Button type="button" variant="outline" onClick={outputs.print} disabled={disabled} aria-disabled={working || undefined} className={cn('h-11 sm:h-9', wait)}>
            {icon('print', <Printer />)}
            طباعة
          </Button>
          {outputs.canShare ? (
            <Button type="button" variant="outline" onClick={outputs.share} disabled={disabled} aria-disabled={working || undefined} className={cn('h-11 sm:h-9', wait)}>
              {icon('share', <Share2 />)}
              مشاركة
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={outputs.download} disabled={disabled} aria-disabled={working || undefined} className={cn('h-11 sm:h-9', wait)}>
            {icon('download', <FileDown />)}
            تحميل PDF
          </Button>
        </div>
        <Button type="button" onClick={outputs.preview} disabled={disabled} aria-disabled={working || undefined} className={cn('h-11 w-full sm:h-9 sm:w-auto', wait)}>
          {icon('preview', <FileText />)}
          معاينة وعرض PDF
        </Button>
      </div>
    </div>
  );
}
