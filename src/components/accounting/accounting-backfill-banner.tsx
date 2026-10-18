'use client';

import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useBackfillTransactions } from '@/lib/db/mall-queries';
import { usePermission } from '@/lib/supabase/use-permission';

/**
 * Offered under an empty report: transactions recorded before journal posting existed have no journal
 * entry, so reports built from the ledger miss them until they are posted.
 */
export function AccountingBackfillBanner({
  title = 'معاملات لم تُرحَّل إلى اليومية؟',
  description = 'المعاملات القديمة لا تظهر في التقارير حتى يُنشأ لها قيد في دفتر اليومية.',
}: {
  title?: string;
  description?: string;
}) {
  const backfill = useBackfillTransactions();
  const { can } = usePermission();
  const confirm = useConfirm();

  if (!can('journal.post') && !can('journal.create')) return null;

  async function run() {
    const ok = await confirm({
      title: 'ترحيل المعاملات إلى دفتر اليومية',
      description: 'يُنشأ قيد لكل معاملة مسجّلة ليس لها قيد بعد. المعاملات التي لها قيود لا تتغير.',
      confirmLabel: 'رحّل المعاملات',
      tone: 'default',
    });
    if (ok) backfill.mutate();
  }

  return (
    <div className="flex w-full flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 text-start sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-mute">{description}</p>
      </div>
      <Button variant="outline" size="sm" onClick={run} disabled={backfill.isPending} className="h-9 shrink-0 gap-1.5 touch-manipulation">
        {backfill.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
        ترحيل إلى اليومية
      </Button>
    </div>
  );
}
