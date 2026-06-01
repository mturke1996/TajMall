'use client';

import { useState, type ReactElement, type ReactNode } from 'react';
import { Printer, Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { toast } from 'sonner';
import { renderPdfBlob, savePdfBlob } from './pdf-blob-utils';

type Props = ButtonProps & {
  /** Suggested file name (without `.pdf` extension). */
  fileName: string;
  render: () => Promise<ReactElement>;
  children?: ReactNode;
};

/**
 * Generic "download as PDF" button.
 *
 * Generates the PDF on-click using @react-pdf/renderer's `pdf()` helper,
 * then triggers a browser download. Arabic fonts are registered on first
 * use via `pdfFonts.ts`.
 */
export function DownloadPdfButton({
  fileName,
  render,
  children,
  variant = 'default',
  size = 'sm',
  className,
  ...rest
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      const blob = await renderPdfBlob(render);
      const mode = await savePdfBlob(blob, fileName);
      toast.success(
        mode === 'share'
          ? 'اختر «حفظ في الملفات» من قائمة المشاركة'
          : 'تم إنشاء ملف PDF',
        { description: fileName + '.pdf' },
      );
    } catch (err) {
      console.error(err);
      toast.error('تعذّر إنشاء ملف PDF', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      onClick={handleClick}
      disabled={loading}
      variant={variant}
      size={size}
      className={className}
      {...rest}
    >
      {loading ? (
        <Loader2 className="animate-spin stroke-[1.6]" />
      ) : (
        <Printer className="stroke-[1.6]" />
      )}
      {children ?? 'طباعة PDF'}
    </Button>
  );
}
