'use client';

import { Banknote, Receipt, AlertCircle, TrendingUp } from 'lucide-react';
import { cn, formatMoney } from '@/lib/utils';
import type { TenantRentSummary } from '@/lib/db/queries';
import { getTenantStatus } from '@/components/tenants/tenant-status-config';
import {
  getTenantCurrentMonthPresentation,
  TENANT_MONTH_TONE_STYLES,
} from '@/lib/tenant-current-month';

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ElementType;
  tone?: 'neutral' | 'sage' | 'emerald' | 'rose' | 'amber';
}) {
  const styles = {
    neutral: 'border-border/80 bg-card',
    sage: 'border-border/80 bg-canvas-sunken/50',
    emerald:
      'border-success-line/70 bg-success-soft/40',
    rose: 'border-danger-line/70 bg-danger-soft/40',
    amber:
      'border-warning-line/70 bg-warning-soft/40',
  };
  const iconStyles = {
    neutral: 'bg-muted text-muted-foreground',
    sage: 'bg-muted text-foreground',
    emerald: 'bg-success-soft text-success-ink',
    rose: 'bg-danger-soft text-danger-ink',
    amber: 'bg-warning-soft text-warning-ink',
  };

  return (
    <div
      className={cn(
        'rounded-2xl border p-4 min-w-42 shrink-0 snap-center md:min-w-0',
        styles[tone],
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[11px] font-medium text-muted-foreground leading-snug">
          {label}
        </p>
        <div className={cn('p-1.5 rounded-lg shrink-0', iconStyles[tone])}>
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </div>
      </div>
      <p className="text-lg font-bold tabular-nums tracking-tight sm:text-xl">
        {value}
      </p>
      {hint && (
        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{hint}</p>
      )}
    </div>
  );
}

export function TenantProfileStats({
  rent,
  monthlyRent,
  totalsRevenue,
  transactionCount,
  journalCount,
}: {
  rent: TenantRentSummary;
  monthlyRent: number;
  totalsRevenue: number;
  transactionCount: number;
  journalCount: number;
}) {
  const monthPres = getTenantCurrentMonthPresentation(rent, monthlyRent);
  const rentStatus = getTenantStatus(rent.current_month_status);
  const monthTone = TENANT_MONTH_TONE_STYLES[monthPres.tone].tile;
  const openTotal = Number(rent.open_charges_total ?? 0);
  const openCount = Number(rent.open_charges_count ?? 0);

  return (
    <div className="-mx-4 px-4 md:mx-0 md:px-0">
      <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar snap-x snap-mandatory md:grid md:grid-cols-2 md:gap-3 md:overflow-visible lg:grid-cols-4">
        <StatTile
          label="الإيجار الشهري"
          value={formatMoney(monthlyRent, 'LYD', { compact: true })}
          hint="من بيانات المستأجر / العقد"
          icon={Banknote}
          tone="sage"
        />
        <StatTile
          label={`إيجار ${monthPres.monthName}`}
          value={monthPres.headline}
          hint={monthPres.subtitle}
          icon={rentStatus.icon}
          tone={monthTone}
        />
        <StatTile
          label="تحصيل 12 شهراً"
          value={formatMoney(Number(rent.last_12_months_revenue), 'LYD', {
            compact: true,
          })}
          hint={`${transactionCount} معاملة مرتبطة`}
          icon={TrendingUp}
          tone="emerald"
        />
        <StatTile
          label="مطالبات مفتوحة"
          value={formatMoney(openTotal, 'LYD', { compact: true })}
          hint={openCount > 0 ? `${openCount} مطالبة غير مكتملة` : 'لا مستحقات مفتوحة'}
          icon={openCount > 0 ? AlertCircle : Receipt}
          tone={openCount > 0 ? 'rose' : 'neutral'}
        />
      </div>
      {totalsRevenue > 0 && (
        <p className="text-[11px] text-muted-foreground mt-2 hidden md:block">
          إجمالي إيرادات الملف (كل الأنواع):{' '}
          <span className="font-medium text-foreground tabular-nums">
            {formatMoney(totalsRevenue, 'LYD')}
          </span>
          {' · '}
          {journalCount} قيد يومية
        </p>
      )}
    </div>
  );
}
