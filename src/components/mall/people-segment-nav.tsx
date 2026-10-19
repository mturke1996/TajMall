'use client';

import { Building2, Briefcase, Landmark, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveInView } from '@/lib/hooks/use-active-in-view';
import type { PeopleSegment } from '@/lib/mall/routes';

const SEGMENTS: {
  id: PeopleSegment;
  label: string;
  icon: typeof Users;
}[] = [
  { id: 'all', label: 'الكل', icon: Users },
  { id: 'TENANT', label: 'المستأجرون', icon: Building2 },
  { id: 'EMPLOYEE', label: 'الموظفون', icon: Briefcase },
  { id: 'VENDOR', label: 'الموردون', icon: Landmark },
  { id: 'CUSTOMER', label: 'العملاء', icon: User },
];

/** The lists of people, as one segmented control. It scrolls inside itself on a phone, never the page. */
export function PeopleSegmentNav({
  active,
  counts,
  onChange,
  className,
}: {
  active: PeopleSegment;
  counts?: Partial<Record<PeopleSegment, number>>;
  onChange: (segment: PeopleSegment) => void;
  className?: string;
}) {
  const rowRef = useActiveInView<HTMLDivElement>(active);
  return (
    <div
      ref={rowRef}
      className={cn(
        'no-scrollbar flex max-w-full snap-x snap-mandatory gap-1 overflow-x-auto rounded-xl border border-border bg-canvas-sunken p-1',
        className,
      )}
      role="group"
      aria-label="نوع الجهة"
    >
      {SEGMENTS.map((seg) => {
        const Icon = seg.icon;
        const count = counts?.[seg.id];
        const selected = active === seg.id;
        return (
          <button
            key={seg.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(seg.id)}
            className={cn(
              'inline-flex h-11 shrink-0 snap-center touch-manipulation items-center gap-2 rounded-lg border px-3 text-[13px] font-medium transition-colors sm:h-9',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
              selected
                ? 'border-border bg-card text-foreground shadow-whisper'
                : 'border-transparent text-ink-mute hover:text-foreground',
            )}
          >
            <Icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
            {seg.label}
            {count != null && (
              <span
                className={cn(
                  'min-w-6 rounded-full px-1.5 text-center text-[11.5px] leading-5 tabular-nums',
                  selected ? 'bg-canvas-sunken text-foreground' : 'bg-card/70 text-ink-mute',
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
