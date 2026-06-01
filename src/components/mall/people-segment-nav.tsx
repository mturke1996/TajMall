'use client';

import { Building2, Briefcase, Landmark, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PeopleSegment } from '@/lib/mall/routes';

const SEGMENTS: {
  id: PeopleSegment;
  label: string;
  icon: typeof Users;
}[] = [
  { id: 'all', label: 'الكل', icon: Users },
  { id: 'TENANT', label: 'مستأجرين', icon: Building2 },
  { id: 'EMPLOYEE', label: 'موظفين', icon: Briefcase },
  { id: 'VENDOR', label: 'موردين', icon: Landmark },
  { id: 'CUSTOMER', label: 'عملاء', icon: User },
];

export function PeopleSegmentNav({
  active,
  counts,
  onChange,
}: {
  active: PeopleSegment;
  counts?: Partial<Record<PeopleSegment, number>>;
  onChange: (segment: PeopleSegment) => void;
}) {
  return (
    <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar snap-x snap-mandatory">
      {SEGMENTS.map((seg) => {
        const Icon = seg.icon;
        const count = counts?.[seg.id];
        return (
          <button
            key={seg.id}
            type="button"
            onClick={() => onChange(seg.id)}
            className={cn(
              'inline-flex shrink-0 snap-center items-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-medium touch-manipulation',
              active === seg.id
                ? 'border-sage-700 bg-sage-700 text-white'
                : 'border-border bg-card hover:bg-secondary',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {seg.label}
            {count != null && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                  active === seg.id ? 'bg-white/20' : 'bg-canvas-sunken',
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
