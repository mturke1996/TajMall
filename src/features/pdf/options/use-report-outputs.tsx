'use client';

/**
 * Everything that happens after the output buttons of an options dialog are pressed: building the PDF from
 * the current options, then one of four things — preview, download, share, print — with a busy state, a clear
 * error and the in-app viewer (PdfPreviewDialog) that phones need.
 *
 * It keeps what the existing dialogs did: the viewer opens in a new tab on a computer and inside the app on
 * a phone, a download goes through `savePdfBlob` (the share sheet where the device prefers it), sharing
 * is offered only when the device can share a file, and the file shown in the viewer is the one downloaded
 * or shared from it, so they never differ. Print opens the same viewer, where the browser's own print
 * button prints exactly what is shown (a hidden frame can print a blank page, so none is used).
 *
 * Render `previewDialog` once, next to the options dialog.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/user-messages';
import { renderPdfBlob, savePdfBlob, shouldUseInAppPdfViewer } from '../pdf-blob-utils';
import { PdfPreviewDialog } from '../pdf-preview-dialog';

export type ReportOutput = 'preview' | 'download' | 'share' | 'print';

const BUSY_TEXT: Record<ReportOutput, string> = {
  preview: 'جارٍ تجهيز التقرير للمعاينة…',
  download: 'جارٍ تجهيز الملف للتنزيل…',
  share: 'جارٍ تجهيز الملف للمشاركة…',
  print: 'جارٍ تجهيز التقرير للطباعة…',
};

const noSubscription = () => () => {};

/** True when this device can hand a PDF file to another app (the share sheet: WhatsApp, mail …). */
function deviceCanShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([new Uint8Array(1)], 'a.pdf', { type: 'application/pdf' })] });
  } catch {
    return false;
  }
}

export function useReportOutputs({
  buildDocument,
  fileName,
  title,
  shareText,
  disabled,
}: {
  /** builds the PDF element from the options as they are at the moment of the call */
  buildDocument: () => Promise<ReactElement>;
  /** without .pdf */
  fileName: string;
  /** the title of the viewer and of the share sheet */
  title: string;
  shareText: string;
  /** nothing to print */
  disabled: boolean;
}) {
  const [busy, setBusy] = useState<ReportOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const blobRef = useRef<Blob | null>(null);
  // the button that started the output: the viewer has no trigger of its own, so focus is put back here when it closes
  const pressedRef = useRef<HTMLElement | null>(null);
  // false once the dialog that owns this hook is gone (the expenses page remounts it on close): a late result must not open a viewer nobody can close
  const aliveRef = useRef(true);

  // what the device can do is read on the client only, so the server's render and the first client render agree
  const canShare = useSyncExternalStore(noSubscription, deviceCanShareFiles, () => false);

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const closePreview = useCallback(
    (next: boolean) => {
      setPreviewOpen(next);
      if (!next) {
        revokePreviewUrl();
        blobRef.current = null;
        const pressed = pressedRef.current;
        window.requestAnimationFrame(() => {
          if (pressed?.isConnected) pressed.focus();
        });
      }
    },
    [revokePreviewUrl],
  );

  /** The file in the viewer is reused for what is done from it; anywhere else the document is built again from the current options. */
  const ensureBlob = useCallback(async (): Promise<Blob> => {
    if (blobRef.current && previewOpen) return blobRef.current;
    const blob = await renderPdfBlob(buildDocument);
    blobRef.current = blob;
    return blob;
  }, [buildDocument, previewOpen]);

  const run = useCallback(
    async (kind: ReportOutput, task: () => Promise<void>) => {
      if (busy || disabled) return;
      // while the viewer is open the press comes from inside it (its download or share button), which is gone when it closes: keep the options dialog's own button
      if (!previewOpen) pressedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setBusy(kind);
      setError(null);
      try {
        await task();
      } catch (e) {
        // closing the share sheet is a choice, not a failure
        if (e instanceof Error && e.name === 'AbortError') return;
        console.error(e);
        setError(`تعذّر تجهيز التقرير. ${friendlyError(e, 'حاول مرة أخرى، وإن تكرر الخطأ أبلغ مسؤول النظام.')}`);
      } finally {
        setBusy(null);
      }
    },
    [busy, disabled, previewOpen],
  );

  const showInViewer = useCallback(
    async (blob: Blob, tabText: string, viewerText = 'تم تجهيز التقرير للمعاينة') => {
      if (!shouldUseInAppPdfViewer()) {
        const popupUrl = URL.createObjectURL(blob);
        const tab = window.open(popupUrl, '_blank', 'noopener,noreferrer');
        if (tab) {
          toast.success(tabText);
          window.setTimeout(() => URL.revokeObjectURL(popupUrl), 120_000);
          return;
        }
        URL.revokeObjectURL(popupUrl);
      }
      if (!aliveRef.current) return;
      revokePreviewUrl();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPreviewOpen(true);
      toast.success(viewerText);
    },
    [revokePreviewUrl],
  );

  const preview = useCallback(() => run('preview', async () => showInViewer(await ensureBlob(), 'تم فتح التقرير في نافذة جديدة')), [run, showInViewer, ensureBlob]);

  const download = useCallback(
    () =>
      run('download', async () => {
        const mode = await savePdfBlob(await ensureBlob(), fileName, { title, text: shareText });
        toast.success(mode === 'share' ? 'اختر «حفظ في الملفات» من قائمة المشاركة' : 'تم تنزيل الملف');
      }),
    [run, ensureBlob, fileName, title, shareText],
  );

  const share = useCallback(() => run('share', async () => void (await savePdfBlob(await ensureBlob(), fileName, { title, text: shareText }))), [run, ensureBlob, fileName, title, shareText]);

  const print = useCallback(
    () => run('print', async () => showInViewer(await ensureBlob(), 'تم فتح التقرير، اطبعه من شريط العارض', 'تم فتح التقرير، اطبعه من العارض')),
    [run, showInViewer, ensureBlob],
  );

  const previewDialog = (
    <PdfPreviewDialog
      open={previewOpen}
      onOpenChange={closePreview}
      url={previewUrl}
      fileName={`${fileName}.pdf`}
      displayTitle={title}
      onDownload={download}
      downloadBusy={busy === 'download'}
      canShare={canShare}
      onShare={share}
      shareBusy={busy === 'share'}
    />
  );

  return {
    busy,
    busyText: busy ? BUSY_TEXT[busy] : null,
    error,
    clearError: () => setError(null),
    canShare,
    preview,
    download,
    share,
    print,
    previewDialog,
  };
}
