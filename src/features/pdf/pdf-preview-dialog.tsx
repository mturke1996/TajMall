'use client';

import { FileDown, Share2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type PdfPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
  fileName: string;
  /** عنوان واضح للعرض (بدلاً من اسم الملف التقني) */
  displayTitle?: string;
  onDownload: () => void;
  downloadBusy?: boolean;
  canShare?: boolean;
  onShare?: () => void;
  shareBusy?: boolean;
};

export function PdfPreviewDialog({
  open,
  onOpenChange,
  url,
  fileName,
  displayTitle,
  onDownload,
  downloadBusy,
  canShare,
  onShare,
  shareBusy,
}: PdfPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          // the header below has its own close button; the dialog's built-in one sat exactly on top of it (two stacked targets)
          '[&>button:last-child]:hidden',
          'max-w-[100vw] w-screen h-dvh max-h-dvh rounded-none border-0',
          'sm:max-w-4xl sm:w-[min(100vw-2rem,56rem)] sm:h-[min(92dvh,900px)] sm:max-h-[92dvh] sm:rounded-2xl sm:border',
        )}
        dir="rtl"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">عرض {displayTitle ?? fileName}</DialogTitle>

        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-canvas px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{displayTitle ?? fileName}</p>
            {displayTitle ? (
              <p className="truncate text-[11px] text-muted-foreground">{fileName}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canShare && onShare ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 gap-1 touch-manipulation sm:h-9"
                disabled={shareBusy}
                onClick={onShare}
              >
                <Share2 className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only sm:inline">مشاركة</span>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 gap-1 touch-manipulation sm:h-9"
              disabled={downloadBusy}
              onClick={onDownload}
            >
              <FileDown className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only sm:inline">تحميل</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 touch-manipulation sm:h-9 sm:w-9"
              aria-label="إغلاق"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 bg-ink-mute/40">
          {url ? (
            <embed
              src={url}
              type="application/pdf"
              title={fileName}
              className="absolute inset-0 h-full w-full border-0 bg-white"
            />
          ) : (
            <div className="flex h-full min-h-[50dvh] items-center justify-center text-sm text-ink-mute">
              جارٍ التحميل…
            </div>
          )}
        </div>

        <p className="shrink-0 border-t border-border bg-canvas-sunken/50 px-3 py-2 text-center text-[11px] text-ink-mute sm:hidden">
          إن لم يظهر الملف، استخدم «مشاركة» أو «تحميل» أعلاه
        </p>
      </DialogContent>
    </Dialog>
  );
}
