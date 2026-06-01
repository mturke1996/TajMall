'use client';

import Link from 'next/link';
import {
  Store,
  Building2,
  FileText,
  Coins,
  Users,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, formatMoney } from '@/lib/utils';
import { useContacts, useTenantRentSummary } from '@/lib/db/queries';
import {
  useMallUnits,
  useLeaseContracts,
  useTenantCharges,
} from '@/lib/db/mall-queries';
import type { MallTab } from '@/lib/mall/routes';
import { mallTabHref, peopleSegmentHref } from '@/lib/mall/routes';

const QUICK_LINKS: {
  tab: MallTab;
  title: string;
  description: string;
  icon: typeof Store;
  tone: string;
}[] = [
  {
    tab: 'units',
    title: 'المحلات والوحدات',
    description: 'إضافة محلات وتتبع الحالة والمساحة',
    icon: Store,
    tone: 'border-blue-200 bg-blue-50/80',
  },
  {
    tab: 'tenants',
    title: 'المستأجرين والتحصيل',
    description: 'إيجار الشهر وتسجيل المدفوعات',
    icon: Building2,
    tone: 'border-sage-200 bg-sage-50/80',
  },
  {
    tab: 'contracts',
    title: 'عقود الإيجار',
    description: 'ربط المستأجر بالمحل وتوثيق العقد',
    icon: FileText,
    tone: 'border-violet-200 bg-violet-50/80',
  },
  {
    tab: 'charges',
    title: 'المطالبات والرسوم',
    description: 'فواتير الإيجار والخدمات الشهرية',
    icon: Coins,
    tone: 'border-amber-200 bg-amber-50/80',
  },
  {
    tab: 'people',
    title: 'الجهات والدليل',
    description: 'مستأجرين، موظفين، موردين، وعملاء',
    icon: Users,
    tone: 'border-slate-200 bg-slate-50/80',
  },
];

export function MallOverviewPanel({ onNavigate }: { onNavigate: (tab: MallTab) => void }) {
  const { data: units = [] } = useMallUnits();
  const { data: contracts = [] } = useLeaseContracts();
  const { data: charges = [] } = useTenantCharges();
  const { data: tenants = [] } = useTenantRentSummary();
  const { data: contacts = [] } = useContacts();

  const occupied = units.filter((u) => u.status === 'OCCUPIED').length;
  const available = units.filter((u) => u.status === 'AVAILABLE').length;
  const activeContracts = contracts.filter((c) => c.status === 'ACTIVE').length;
  const unpaidCharges = charges.filter((c) => c.status === 'UNPAID').length;
  const unpaidTenants = tenants.filter((t) => t.current_month_status === 'unpaid').length;
  const collected = tenants.reduce((s, t) => s + Number(t.current_month_paid), 0);
  const expected = tenants.reduce((s, t) => s + (Number(t.monthly_rent) || 0), 0);

  const alerts: { text: string; tab: MallTab }[] = [];
  if (unpaidTenants > 0) {
    alerts.push({
      text: `${unpaidTenants} مستأجر لم يُسدّد إيجار الشهر بالكامل`,
      tab: 'tenants',
    });
  }
  if (unpaidCharges > 0) {
    alerts.push({
      text: `${unpaidCharges} مطالبة مالية غير مسددة`,
      tab: 'charges',
    });
  }
  if (available > 0 && activeContracts < units.length) {
    alerts.push({
      text: `${available} محل متاح للإيجار`,
      tab: 'units',
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
        <Card className="p-3 md:p-4">
          <p className="text-[11px] text-ink-mute md:text-xs">المحلات</p>
          <p className="text-xl font-bold tabular-nums md:text-2xl">{units.length}</p>
          <p className="text-[11px] text-ink-mute mt-0.5">
            {occupied} مؤجرة · {available} متاحة
          </p>
        </Card>
        <Card className="p-3 md:p-4">
          <p className="text-[11px] text-ink-mute md:text-xs">عقود نشطة</p>
          <p className="text-xl font-bold tabular-nums md:text-2xl">{activeContracts}</p>
          <p className="text-[11px] text-ink-mute mt-0.5">{tenants.length} مستأجر</p>
        </Card>
        <Card className="p-3 md:p-4 border-sage-200 bg-sage-50/50">
          <p className="text-[11px] text-ink-mute md:text-xs">تحصيل الشهر</p>
          <p className="text-base font-bold text-sage-800 tabular-nums md:text-lg">
            {formatMoney(collected, 'LYD')}
          </p>
          <p className="text-[10px] text-ink-mute">
            من {formatMoney(expected, 'LYD')}
          </p>
        </Card>
        <Card className="p-3 md:p-4">
          <p className="text-[11px] text-ink-mute md:text-xs">الدليل</p>
          <p className="text-xl font-bold tabular-nums md:text-2xl">{contacts.length}</p>
          <p className="text-[11px] text-ink-mute mt-0.5">جهة تعامل</p>
        </Card>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <button
              key={a.text}
              type="button"
              onClick={() => onNavigate(a.tab)}
              className="flex w-full items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-3 text-right text-sm touch-manipulation active:bg-amber-100"
            >
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-700" />
              <span className="flex-1 font-medium text-amber-900">{a.text}</span>
              <ArrowLeft className="h-4 w-4 shrink-0 text-amber-700" />
            </button>
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink-mute">الأقسام</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.tab}
                type="button"
                onClick={() => onNavigate(item.tab)}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-xl border p-4 text-right transition-shadow touch-manipulation active:scale-[0.99]',
                  item.tone,
                  'hover:shadow-md',
                )}
              >
                <Icon className="h-6 w-6 text-sage-700" />
                <div>
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-0.5 text-[12px] text-ink-mute leading-snug">
                    {item.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="touch-manipulation" asChild>
          <Link href={peopleSegmentHref('TENANT', { add: 'TENANT' })}>إضافة مستأجر</Link>
        </Button>
        <Button variant="outline" size="sm" className="touch-manipulation" asChild>
          <Link href={mallTabHref('units')}>إضافة محل</Link>
        </Button>
        <Button variant="outline" size="sm" className="touch-manipulation" asChild>
          <Link href={mallTabHref('contracts')}>توثيق عقد</Link>
        </Button>
      </div>
    </div>
  );
}
