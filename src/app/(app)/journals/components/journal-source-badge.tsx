'use client';

import Link from 'next/link';
import { Link2, Cog, RotateCcw, PenLine } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getJournalSourceMeta } from '@/lib/journal-source';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import { cn } from '@/lib/utils';

const ICONS = {
  transaction: Link2,
  tenant_charge: Link2,
  reversal: RotateCcw,
  manual: PenLine,
  auto: Cog,
} as const;

export function JournalSourceBadge({
  entry,
  className,
}: {
  entry: Pick<
    JournalEntryRow,
    'source_type' | 'source_id' | 'reversal_of_entry_id'
  >;
  className?: string;
}) {
  const meta = getJournalSourceMeta(entry);
  if (!meta) return null;

  const Icon = ICONS[meta.kind];

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        'text-[11px] font-normal gap-1 max-w-full truncate',
        meta.kind === 'auto' && 'border-info-line bg-info-soft text-info-ink',
        meta.kind === 'transaction' && 'border-border bg-canvas-sunken text-foreground',
        meta.kind === 'reversal' && 'border-warning-line bg-warning-soft text-warning-ink',
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {meta.label}
    </Badge>
  );

  if (meta.href) {
    return (
      <Link href={meta.href} className="inline-flex max-w-full" onClick={(e) => e.stopPropagation()}>
        {badge}
      </Link>
    );
  }

  return badge;
}
