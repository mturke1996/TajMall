'use client';

import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBackfillTransactions } from '@/lib/db/mall-queries';
import { usePermission } from '@/lib/supabase/use-permission';

export function AccountingBackfillBanner({
  title = 'لا توجد قيود مرحّلة كافية',
  description = 'المعاملات القديمة قد لا تظهر في التقارير حتى تُرحَّل إلى دفتر اليومية.',
}: {
  title?: string;
  description?: string;
}) {
  const backfill = useBackfillTransactions();
  const { can } = usePermission();

  if (!can('journal.post') && !can('journal.create')) return null;

  return (
    <div className="rounded-xl border border-warning-line bg-warning-soft/80 p-4 text-center space-y-2 w-full">
      <p className="font-semibold text-warning-ink text-sm">{title}</p>
      <p className="text-xs text-warning-ink/90 max-w-lg mx-auto leading-relaxed">{description}</p>
      <Button
        onClick={() => backfill.mutate()}
        disabled={backfill.isPending}
        className="mt-2 gap-2 touch-manipulation min-h-11"
      >
        {backfill.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        ترحيل المعاملات إلى القيود اليومية
      </Button>
    </div>
  );
}
