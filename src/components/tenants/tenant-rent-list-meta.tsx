'use client';

import { FileText, Wallet } from 'lucide-react';
import type { TenantRentSummary } from '@/lib/db/queries';
import {
  currentMonthNameAr,
  getTenantRentStatusPresentation,
} from '@/components/tenants/tenant-status-config';
import { cn, formatMoney } from '@/lib/utils';

export function TenantCurrentMonthBadge({
  tenant,
  className,
}: {
  tenant: TenantRentSummary;
  className?: string;
}) {
  const pres = getTenantRentStatusPresentation(tenant.current_month_status);
  const Icon = pres.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold',
        pres.bg,
        pres.border,
        pres.color,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{currentMonthNameAr()}</span>
      <span className="opacity-60">·</span>
      <span>{pres.shortLabel}</span>
    </span>
  );
}

export function TenantRentListStats({
  tenant,
  compact = false,
}: {
  tenant: TenantRentSummary;
  compact?: boolean;
}) {
  const rent =
    Number(tenant.current_month_amount) ||
    Number(tenant.monthly_rent) ||
    0;
  const totalPaid =
    Number(tenant.total_rent_paid) || Number(tenant.current_month_paid) || 0;
  const journals =
    Number(tenant.rent_linked_journals_count) ||
    Number(tenant.journal_entries_count) ||
    0;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] tabular-nums">
        <span className="text-ink-mute">
          إيجار{' '}
          <span className="font-medium text-ink">
            {rent > 0 ? formatMoney(rent, 'LYD') : '—'}
          </span>
        </span>
        <span className="inline-flex items-center gap-0.5 text-sage-800">
          <FileText className="h-3 w-3" />
          {journals} قيد
        </span>
      </div>
    );
  }

  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[12px]">
      <div>
        <dt className="text-ink-mute">إيجار {currentMonthNameAr()}</dt>
        <dd className="font-semibold tabular-nums">
          {rent > 0 ? formatMoney(rent, 'LYD') : '—'}
        </dd>
      </div>
      <div>
        <dt className="text-ink-mute inline-flex items-center gap-1">
          <FileText className="h-3 w-3" />
          قيود مربوطة
        </dt>
        <dd className="font-semibold tabular-nums text-sage-800">{journals}</dd>
      </div>
      <div>
        <dt className="text-ink-mute inline-flex items-center gap-1">
          <Wallet className="h-3 w-3" />
          إجمالي المسدد
        </dt>
        <dd className="font-semibold tabular-nums">{formatMoney(totalPaid, 'LYD')}</dd>
      </div>
    </dl>
  );
}
