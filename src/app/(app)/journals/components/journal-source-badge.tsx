'use client';

import Link from 'next/link';
import { Link2, Bot, RotateCcw, PenLine } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getJournalSourceMeta } from '@/lib/journal-source';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import { cn } from '@/lib/utils';

const ICONS = {
  transaction: Link2,
  tenant_charge: Link2,
  reversal: RotateCcw,
  manual: PenLine,
  auto: Bot,
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
        'text-[10px] font-normal gap-1 max-w-full truncate',
        meta.kind === 'auto' && 'border-blue-200 bg-blue-50 text-blue-800',
        meta.kind === 'transaction' && 'border-sage-200 bg-sage-50 text-sage-800',
        meta.kind === 'reversal' && 'border-amber-200 bg-amber-50 text-amber-800',
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
