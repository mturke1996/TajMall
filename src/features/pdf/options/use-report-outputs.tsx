'use client';

/**
 * Everything that happens after «اطبع التقرير» in an options dialog: building the PDF from the current
 * options, then one of four things — preview, download, share, print — with a busy state, a clear error
 * and the in-app viewer (PdfPreviewDialog) that phones need.
 *
 * It keeps what the existing dialogs did: the viewer opens in a new tab on a computer and inside the app on
 * a phone, a download goes through `savePdfBlob` (the share sheet where the device prefers it), sharing
 * is offered only when the device can share a file, and the file shown in the viewer is the one downloaded
 * or shared from it, so they never differ.
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
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

/** True when this device can hand a PDF file to another app (the share sheet: WhatsApp, mail …). */
function deviceCanShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([new Uint8Array(1)], 'a.pdf', { type: 'application/pdf' })] });
  } catch {
    return false;
  }
}

/** Opens the print dialog for a PDF without showing it: a hidden frame prints it. Returns false when the browser would not. */
function printInFrame(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;inset-inline-end:0;bottom:0;visibility:hidden';
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(ok);
      // the print dialog may still be open: keep the frame for a while
      window.setTimeout(() => frame.remove(), 60_000);
    };
    const timer = window.setTimeout(() => finish(false), 6000);
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        finish(true);
      } catch {
        finish(false);
      }
    };
    frame.src = url;
    document.body.appendChild(frame);
  });
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
  const [canShare, setCanShare] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const blobRef = useRef<Blob | null>(null);

  // the device's abilities are read after mount, so the first render matches the server's
  useEffect(() => {
    setCanShare(deviceCanShareFiles());
  }, []);

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const closePreview = useCallback(
    (next: boolean) => {
      setPreviewOpen(next);
      if (!next) {
        revokePreviewUrl();
        blobRef.current = null;
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
    [busy, disabled],
  );

  const showInViewer = useCallback(
    async (blob: Blob, successText: string) => {
      if (!shouldUseInAppPdfViewer()) {
        const popupUrl = URL.createObjectURL(blob);
        const tab = window.open(popupUrl, '_blank', 'noopener,noreferrer');
        if (tab) {
          toast.success(successText);
          window.setTimeout(() => URL.revokeObjectURL(popupUrl), 120_000);
          return;
        }
        URL.revokeObjectURL(popupUrl);
      }
      revokePreviewUrl();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPreviewOpen(true);
      toast.success('تم تجهيز التقرير للمعاينة');
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
    () =>
      run('print', async () => {
        const blob = await ensureBlob();
        // a phone cannot print from a hidden frame: it gets the viewer, whose share sheet reaches the printer
        if (shouldUseInAppPdfViewer()) {
          await showInViewer(blob, 'تم فتح التقرير للطباعة');
          return;
        }
        const url = URL.createObjectURL(blob);
        const printed = await printInFrame(url);
        window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
        if (!printed) await showInViewer(blob, 'تم فتح التقرير في نافذة جديدة، اطبعه من هناك');
      }),
    [run, ensureBlob, showInViewer],
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
