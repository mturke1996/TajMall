'use client';

import { useState, type ReactElement } from 'react';
import { pdf } from '@react-pdf/renderer';
import { FileDown, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { registerPdfFonts } from './pdfFonts';
import { prepareTajMallPdfTree } from './prepare-taj-mall-pdf-tree';

type Props = {
  /** بدون امتداد .pdf */
  fileName: string;
  render: () => Promise<ReactElement>;
  disabled?: boolean;
  /** إظهار زر التحميل بجانب العرض */
  showDownload?: boolean;
  /** لفيفكس المحيط على الهاتف مع عناصر actions موسَّعة */
  className?: string;
};

async function renderPdfBlob(render: () => Promise<ReactElement>): Promise<Blob> {
  registerPdfFonts();
  const wrapped = await prepareTajMallPdfTree(await render());
  const instance = pdf();
  instance.updateContainer(wrapped);
  return instance.toBlob();
}

export function TajMallPdfToolbar({
  fileName,
  render,
  disabled,
  showDownload = true,
  className,
}: Props) {
  const [openBusy, setOpenBusy] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);

  async function handleOpen() {
    if (openBusy || disabled) return;
    setOpenBusy(true);
    const id = toast.loading('جاري إنشاء ملف PDF…');
    try {
      const blob = await renderPdfBlob(render);
      const url = URL.createObjectURL(blob);
      const tab = window.open(url, '_blank', 'noopener,noreferrer');
      if (!tab) {
        toast.error('المتصفح منع فتح النافذة — اسمح بالنوافذ المنبثقة أو استخدم «تحميل»', {
          id,
        });
        URL.revokeObjectURL(url);
        return;
      }
      toast.success('تم فتح PDF', { id });
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
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

  async function handleDownload() {
    if (dlBusy || disabled) return;
    setDlBusy(true);
    const id = toast.loading('جاري تجهيز التحميل…');
    try {
      const blob = await renderPdfBlob(render);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 400);
      toast.success('تم تنزيل الملف', { id });
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

  return (
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
  );
}
