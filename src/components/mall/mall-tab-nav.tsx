'use client';

import {
  LayoutGrid,
  Building2,
  FileText,
  Coins,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MallTab } from '@/lib/mall/routes';

export const MALL_TAB_META: {
  id: MallTab;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    id: 'overview',
    label: 'نظرة عامة',
    shortLabel: 'نظرة',
    description: 'ملخص المستأجرين والتحصيل والجهات',
    icon: LayoutGrid,
  },
  {
    id: 'tenants',
    label: 'المستأجرين والتحصيل',
    shortLabel: 'المستأجرين',
    description: 'متابعة الشهور المدفوعة وغير المدفوعة وتسجيل التحصيل',
    icon: Building2,
  },
  {
    id: 'contracts',
    label: 'عقود الإيجار',
    shortLabel: 'العقود',
    description: 'توثيق عقود الإيجار وربط المستأجر بالمحل',
    icon: FileText,
  },
  {
    id: 'charges',
    label: 'المطالبات والرسوم',
    shortLabel: 'الرسوم',
    description: 'مطالبات الإيجار والخدمات وتوليد الفواتير الشهرية',
    icon: Coins,
  },
  {
    id: 'people',
    label: 'الجهات والدليل',
    shortLabel: 'الجهات',
    description: 'الدليل الشامل: مستأجرين، موظفين، موردين، وعملاء',
    icon: Users,
  },
];

export function MallTabNav({
  active,
  onChange,
}: {
  active: MallTab;
  onChange: (tab: MallTab) => void;
}) {
  return (
    <div className="sticky top-0 z-30 border-b border-border bg-canvas/95 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/80">
      <div
        className="flex gap-1 overflow-x-auto px-4 py-2 no-scrollbar snap-x snap-mandatory md:gap-1.5 md:px-8"
        role="tablist"
        aria-label="أقسام إدارة المول"
      >
        {MALL_TAB_META.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={cn(
                'inline-flex shrink-0 snap-center items-center gap-1.5 rounded-lg px-3 py-2.5 text-[13px] font-medium touch-manipulation transition-colors',
                isActive
                  ? 'bg-sage-700 text-white shadow-sm'
                  : 'text-ink-mute hover:bg-secondary hover:text-ink',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">{tab.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
