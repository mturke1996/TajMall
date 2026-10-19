'use client';

import { ArrowDownToLine, ArrowUpFromLine, Briefcase, Building, Building2, CalendarCheck, Landmark, Users } from 'lucide-react';
import { KpiStrip, type KpiCardProps } from '@/components/people';
import type { ActivityState } from '@/components/contacts/use-contacts-directory';
import type { DirectorySummary } from '@/lib/contacts/directory';
import type { PeopleSegment } from '@/lib/mall/routes';
import { arabicCount, formatDate, formatMoney } from '@/lib/utils';

const MOVEMENTS: [string, string, string, string] = ['حركة واحدة', 'حركتان', 'حركات', 'حركة'];
const INACTIVE: [string, string, string, string] = ['ملف غير نشط', 'ملفان غير نشطين', 'ملفات غير نشطة', 'ملفاً غير نشط'];

export type GroupSummaries = Record<'TENANT' | 'EMPLOYEE' | 'VENDOR' | 'CUSTOMER', DirectorySummary>;

type Props = {
  segment: PeopleSegment;
  summary: DirectorySummary;
  groups: GroupSummaries | null;
  /** the files are still being read */
  loading: boolean;
  activityState: ActivityState;
  onRetryActivity: () => void;
};

/** Money cards wait for the twelve months, say so when they could not load, and never show zero for either. */
function moneyState(loading: boolean, activity: ActivityState): Pick<KpiCardProps, 'state'> {
  if (loading || activity === 'loading') return { state: 'loading' };
  if (activity === 'error') return { state: 'error' };
  return { state: 'ready' };
}

function build({ segment, summary, groups, loading, activityState, onRetryActivity }: Props): { label: string; items: KpiCardProps[] } {
  const money = { ...moneyState(loading, activityState), onRetry: onRetryActivity };
  const files = loading ? ({ state: 'loading' } as const) : ({ state: 'ready' } as const);
  const quiet = (n: number) => (n > 0 ? arabicCount(n, INACTIVE) : undefined);

  if (segment === 'VENDOR') {
    const last = summary.lastOut;
    return {
      label: 'ملخص الموردين',
      items: [
        { label: 'الموردون', icon: Landmark, accent: 'blue', format: 'count', value: summary.count, context: quiet(summary.inactive), ...files },
        {
          label: 'المدفوع في آخر 12 شهراً',
          icon: ArrowUpFromLine,
          accent: 'red',
          value: summary.out.total,
          context: summary.out.count > 0 ? arabicCount(summary.out.count, MOVEMENTS) : 'لا دفعات',
          ...money,
        },
        {
          label: 'آخر دفعة',
          icon: CalendarCheck,
          accent: 'amber',
          value: last ? last.amount : null,
          context: last ? `${last.name} · ${formatDate(last.date)}` : 'لا دفعات في آخر 12 شهراً',
          ...money,
        },
      ],
    };
  }

  if (segment === 'CUSTOMER') {
    const customers = summary.count - summary.landlords;
    return {
      label: 'ملخص العملاء والمؤجرين',
      items: [
        {
          label: 'الملفات',
          icon: Users,
          accent: 'blue',
          format: 'count',
          value: summary.count,
          context: summary.landlords > 0 ? `عملاء ${customers} · مؤجرون ${summary.landlords}` : quiet(summary.inactive),
          ...files,
        },
        {
          label: 'المؤجرون',
          icon: Building,
          accent: 'violet',
          format: 'count',
          value: summary.landlords,
          context: summary.landlordsOut.total > 0 ? `المدفوع لهم ${formatMoney(summary.landlordsOut.total, 'LYD')}` : undefined,
          ...(summary.landlordsOut.total > 0 ? money : files),
        },
        {
          label: 'المقبوض في آخر 12 شهراً',
          icon: ArrowDownToLine,
          accent: 'green',
          value: summary.in.total,
          context: summary.in.count > 0 ? arabicCount(summary.in.count, MOVEMENTS) : 'لا مقبوضات',
          ...money,
        },
        {
          label: 'المدفوع في آخر 12 شهراً',
          icon: ArrowUpFromLine,
          accent: 'red',
          value: summary.out.total,
          context: summary.out.count > 0 ? arabicCount(summary.out.count, MOVEMENTS) : 'لا دفعات',
          ...money,
        },
      ],
    };
  }

  if (segment === 'TENANT') {
    const last = summary.lastIn;
    return {
      label: 'ملخص المستأجرين',
      items: [
        { label: 'المستأجرون', icon: Building2, accent: 'green', format: 'count', value: summary.count, context: quiet(summary.inactive), ...files },
        {
          label: 'المقبوض في آخر 12 شهراً',
          icon: ArrowDownToLine,
          accent: 'green',
          value: summary.in.total,
          context: summary.in.count > 0 ? arabicCount(summary.in.count, MOVEMENTS) : 'لا مقبوضات',
          ...money,
        },
        {
          label: 'آخر تحصيل',
          icon: CalendarCheck,
          accent: 'amber',
          value: last ? last.amount : null,
          context: last ? `${last.name} · ${formatDate(last.date)}` : 'لا مقبوضات في آخر 12 شهراً',
          ...money,
        },
      ],
    };
  }

  // the full directory: one card per kind of file
  const g = groups;
  const paid = (s: DirectorySummary | undefined) => (s && s.out.count > 0 ? `مدفوع ${formatMoney(s.out.total, 'LYD')}` : undefined);
  const received = (s: DirectorySummary | undefined) => (s && s.in.count > 0 ? `مقبوض ${formatMoney(s.in.total, 'LYD')}` : undefined);
  return {
    label: 'ملخص الجهات',
    items: [
      {
        label: 'المستأجرون',
        icon: Building2,
        accent: 'green',
        format: 'count',
        value: g?.TENANT.count ?? 0,
        context: activityState === 'ready' ? received(g?.TENANT) : undefined,
        ...files,
      },
      {
        label: 'الموردون',
        icon: Landmark,
        accent: 'blue',
        format: 'count',
        value: g?.VENDOR.count ?? 0,
        context: activityState === 'ready' ? paid(g?.VENDOR) : undefined,
        ...files,
      },
      {
        label: 'العملاء والمؤجرون',
        icon: Users,
        accent: 'violet',
        format: 'count',
        value: g?.CUSTOMER.count ?? 0,
        context: g && g.CUSTOMER.landlords > 0 ? `مؤجرون ${g.CUSTOMER.landlords}` : undefined,
        ...files,
      },
      {
        label: 'الموظفون',
        icon: Briefcase,
        accent: 'teal',
        format: 'count',
        value: g?.EMPLOYEE.count ?? 0,
        context: quiet(g?.EMPLOYEE.inactive ?? 0),
        ...files,
      },
    ],
  };
}

/** Figures for the list being looked at, in the colours of what they mean: money in green, money out red. */
export function DirectorySummaryStrip(props: Props) {
  const { label, items } = build(props);
  return <KpiStrip label={label} items={items} />;
}
