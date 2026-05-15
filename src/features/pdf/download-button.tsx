'use client';

import { useState, type ReactElement, type ReactNode } from 'react';
import { pdf } from '@react-pdf/renderer';
import { Printer, Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { toast } from 'sonner';
import { prepareFluxenPdfTree } from './prepare-fluxen-pdf-tree';
import { registerPdfFonts } from './pdfFonts';

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
      registerPdfFonts();
      const wrapped = await prepareFluxenPdfTree(await render());
      const instance = pdf();
      instance.updateContainer(wrapped);
      const blob = await instance.toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after a tick so Safari finishes the download.
      setTimeout(() => URL.revokeObjectURL(url), 250);
      toast.success('تم إنشاء ملف PDF', { description: fileName + '.pdf' });
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
