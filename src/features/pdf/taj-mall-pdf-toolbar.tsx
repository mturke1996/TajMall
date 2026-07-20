'use client';

import { useState, useRef, useCallback, useEffect, type ReactElement } from 'react';
import { FileDown, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { renderPdfBlob, savePdfBlob, shouldUseInAppPdfViewer } from './pdf-blob-utils';
import { PdfPreviewDialog } from './pdf-preview-dialog';

type Props = {
  /** بدون امتداد .pdf */
  fileName: string;
  /** عنوان واضح في نافذة المشاركة (واتساب، إلخ) */
  shareTitle?: string;
  /** نص توضيحي يُرفق مع المشاركة */
  shareText?: string;
  /** يُبطل التخزين المؤقت عند تغيّر الفترة أو الفلتر */
  cacheKey?: string;
  render: () => Promise<ReactElement>;
  disabled?: boolean;
  showDownload?: boolean;
  className?: string;
};

export function TajMallPdfToolbar({
  fileName,
  shareTitle,
  shareText,
  cacheKey,
  render,
  disabled,
  showDownload = true,
  className,
}: Props) {
  const [openBusy, setOpenBusy] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function';

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  const closePreview = useCallback(
    (open: boolean) => {
      setPreviewOpen(open);
      if (!open) {
        revokePreviewUrl();
        blobRef.current = null;
      }
    },
    [revokePreviewUrl],
  );

  useEffect(() => {
    blobRef.current = null;
    setPreviewOpen(false);
    revokePreviewUrl();
  }, [fileName, cacheKey, revokePreviewUrl]);

  async function ensureBlob(): Promise<Blob> {
    if (blobRef.current) return blobRef.current;
    const blob = await renderPdfBlob(render);
    blobRef.current = blob;
    return blob;
  }

  async function handleOpen() {
    if (openBusy || disabled) return;
    setOpenBusy(true);
    const id = toast.loading('جاري إنشاء ملف PDF…');
    try {
      const blob = await ensureBlob();

      if (!shouldUseInAppPdfViewer()) {
        const popupUrl = URL.createObjectURL(blob);
        const tab = window.open(popupUrl, '_blank', 'noopener,noreferrer');
        if (tab) {
          toast.success('تم فتح PDF', { id });
          setTimeout(() => URL.revokeObjectURL(popupUrl), 120_000);
          return;
        }
        URL.revokeObjectURL(popupUrl);
      }

      revokePreviewUrl();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPreviewOpen(true);
      toast.success('تم تجهيز PDF للعرض', { id });
    } catch (e) {
      console.error(e);
      toast.error('تعذّر إنشاء PDF', {
        id,
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setOpenBusy(false);
    }
  }

  const shareMeta = { title: shareTitle, text: shareText };

  async function handleDownload() {
    if (dlBusy || disabled) return;
    setDlBusy(true);
    const id = toast.loading('جاري تجهيز التحميل…');
    try {
      const blob = await ensureBlob();
      const mode = await savePdfBlob(blob, fileName, shareMeta);
      toast.success(
        mode === 'share' ? 'اختر «حفظ في الملفات» من قائمة المشاركة' : 'تم تنزيل الملف',
        { id },
      );
    } catch (e) {
      console.error(e);
      toast.error('تعذّر تنزيل PDF', {
        id,
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setDlBusy(false);
    }
  }

  async function handleShare() {
    if (shareBusy || disabled) return;
    setShareBusy(true);
    try {
      const blob = await ensureBlob();
      await savePdfBlob(blob, fileName, shareMeta);
    } catch (e) {
      console.error(e);
      if (!(e instanceof Error && e.name === 'AbortError')) {
        toast.error('تعذّر مشاركة الملف');
      }
    } finally {
      setShareBusy(false);
    }
  }

  return (
    <>
      <div className={cn('flex flex-wrap items-center gap-2', className)}>
        <Button
          type="button"
          variant="default"
          size="sm"
          className="min-h-11 touch-manipulation gap-1.5 bg-sage-700 hover:bg-sage-800 sm:min-h-9"
          disabled={disabled || openBusy}
          onClick={handleOpen}
        >
          {openBusy ? (
            <Loader2 className="h-4 w-4 animate-spin stroke-[1.6]" />
          ) : (
            <FileText className="h-4 w-4 stroke-[1.6]" />
          )}
          عرض PDF
        </Button>
        {showDownload ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 touch-manipulation gap-1.5 sm:min-h-9"
            disabled={disabled || dlBusy}
            onClick={handleDownload}
          >
            {dlBusy ? (
              <Loader2 className="h-4 w-4 animate-spin stroke-[1.6]" />
            ) : (
              <FileDown className="h-4 w-4 stroke-[1.6]" />
            )}
            تحميل
          </Button>
        ) : null}
      </div>

      <PdfPreviewDialog
        open={previewOpen}
        onOpenChange={closePreview}
        url={previewUrl}
        fileName={fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`}
        displayTitle={shareTitle}
        onDownload={handleDownload}
        downloadBusy={dlBusy}
        canShare={canShareFiles}
        onShare={handleShare}
        shareBusy={shareBusy}
      />
    </>
  );
}
