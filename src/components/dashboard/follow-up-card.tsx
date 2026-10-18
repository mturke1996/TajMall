'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { buildContractExpiry } from '@/lib/contract-expiry';
import { useLeaseContracts, useMallUnits, useTenantArAging } from '@/lib/db/mall-queries';
import { usePendingVoucherCount, useTenantRentSummary } from '@/lib/db/queries';
import { buildFollowUp, type FollowUpAgingRow, type FollowUpKey, type FollowUpTone } from '@/lib/follow-up';
import { buildMallOccupancy } from '@/lib/mall-occupancy';
import { usePermission } from '@/lib/supabase/use-permission';
import { arabicCount, cn, formatMoney, todayISODate } from '@/lib/utils';

const TENANTS: [string, string, string, string] = ['مستأجر واحد', 'مستأجران', 'مستأجرين', 'مستأجراً'];
const LEASES: [string, string, string, string] = ['عقد واحد', 'عقدان', 'عقود', 'عقداً'];

const META: Record<FollowUpKey, { title: string; unit: [string, string, string, string]; amountLabel?: string; source: string }> = {
  expired: { title: 'عقود انتهت وما زالت نشطة', unit: LEASES, amountLabel: 'إيجارها الشهري', source: 'العقود' },
  ending30: { title: 'عقود تنتهي خلال 30 يوماً', unit: LEASES, amountLabel: 'إيجارها الشهري', source: 'العقود' },
  arrears60: { title: 'متأخرات تجاوزت 60 يوماً', unit: TENANTS, amountLabel: 'المبلغ', source: 'المتأخرات' },
  vouchers: { title: 'أذونات صرف بانتظار اعتمادك', unit: ['إذن واحد', 'إذنان', 'أذونات', 'إذناً'], source: 'أذونات الصرف' },
  rent: { title: 'إيجار هذا الشهر غير مكتمل', unit: TENANTS, amountLabel: 'المتبقي', source: 'إيجار الشهر' },
  vacant: { title: 'محلات شاغرة منذ 3 أشهر أو أكثر', unit: ['محل واحد', 'محلان', 'محلات', 'محلاً'], source: 'المحلات' },
};

const DOT: Record<FollowUpTone, string> = {
  bad: 'bg-danger-ink',
  warn: 'bg-warning-ink',
  neutral: 'bg-ink-mute',
};

/** What needs action today, drawn from the same queries as the screens each row opens. */
export function FollowUpCard() {
  const today = useMemo(() => todayISODate(), []);
  const { can } = usePermission();
  const canApprove = can('voucher.approve');

  const aging = useTenantArAging(today);
  const contracts = useLeaseContracts();
  const units = useMallUnits();
  const rent = useTenantRentSummary();
  const vouchers = usePendingVoucherCount(canApprove);

  const loading = aging.isLoading || contracts.isLoading || units.isLoading || rent.isLoading || (canApprove && vouchers.isLoading);

  const followUp = useMemo(() => {
    if (loading) return null;
    const agingRows = aging.isSuccess ? (((aging.data as { rows?: FollowUpAgingRow[] } | null)?.rows ?? []) as FollowUpAgingRow[]) : null;
    return buildFollowUp({
      today,
      aging: agingRows,
      expiry: contracts.isSuccess ? buildContractExpiry({ contracts: contracts.data ?? [], today }) : null,
      rent: rent.isSuccess ? rent.data ?? [] : null,
      pendingVouchers: canApprove ? (vouchers.isSuccess ? vouchers.data : null) : undefined,
      longVacant: units.isSuccess && contracts.isSuccess ? buildMallOccupancy({ units: units.data ?? [], contracts: contracts.data ?? [], today }).longVacant.length : null,
    });
  }, [loading, today, canApprove, aging.isSuccess, aging.data, contracts.isSuccess, contracts.data, rent.isSuccess, rent.data, vouchers.isSuccess, vouchers.data, units.isSuccess, units.data]);

  const failed = followUp ? [...new Set(followUp.unavailable.map((k) => META[k].source))] : [];

  return (
    <section className="flex flex-col gap-2" aria-labelledby="follow-up-heading">
      <div className="px-1">
        <h2 id="follow-up-heading" className="text-[15px] font-semibold text-foreground">
          يحتاج متابعة
        </h2>
      </div>
      <Card className="overflow-hidden">
        {!followUp ? (
          <div className="flex flex-col gap-3 p-4" aria-busy="true">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : followUp.items.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-ink-mute">
            {failed.length > 0 ? `تعذّر تحميل ${failed.join('، ')}، فلا يمكن الجزم بأن كل شيء على ما يرام. أعد فتح الصفحة بعد قليل.` : 'لا شيء يحتاج متابعة الآن.'}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {followUp.items.map((item) => {
                const meta = META[item.key];
                return (
                  <li key={item.key}>
                    <Link href={item.href} className="group flex items-center gap-3 px-4 py-3 hover:bg-canvas-sunken focus-visible:bg-canvas-sunken focus-visible:outline-hidden">
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT[item.tone])} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium text-foreground">{meta.title}</span>
                        <span className="block text-[12.5px] text-ink-mute">
                          {arabicCount(item.count, meta.unit)}
                          {item.amount != null && meta.amountLabel ? ` · ${meta.amountLabel} ${formatMoney(item.amount, 'LYD')}` : ''}
                        </span>
                      </span>
                      <ChevronLeft className="h-4 w-4 shrink-0 text-ink-mute group-hover:text-foreground" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
            {failed.length > 0 && <p className="border-t border-border px-4 py-2.5 text-[12px] text-ink-mute">تعذّر تحميل {failed.join('، ')}، وهي غير مدرجة أعلاه.</p>}
          </>
        )}
      </Card>
    </section>
  );
}
