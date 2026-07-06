'use client';

import { useState } from 'react';
import { Sheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadCsv } from '@/lib/csv-export';
import { toast } from 'sonner';

type Props = {
  /** بدون امتداد .csv */
  fileName: string;
  headers: string[];
  rows: Array<Array<unknown>>;
  disabled?: boolean;
  className?: string;
};

/** زر تصدير CSV — يوضع عادة بجانب TajMallPdfToolbar في صفحات التقارير. */
export function ExportCsvButton({ fileName, headers, rows, disabled, className }: Props) {
  const [busy, setBusy] = useState(false);

  function handleExport() {
    if (busy || disabled) return;
    setBusy(true);
    try {
      downloadCsv(fileName, headers, rows);
      toast.success('تم تصدير الملف بصيغة CSV');
    } catch (e) {
      toast.error('تعذّر تصدير CSV', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className ?? 'min-h-11 touch-manipulation gap-1.5 sm:min-h-9'}
      disabled={disabled || busy || rows.length === 0}
      onClick={handleExport}
    >
      <Sheet className="h-4 w-4 stroke-[1.6]" />
      تصدير CSV
    </Button>
  );
}
