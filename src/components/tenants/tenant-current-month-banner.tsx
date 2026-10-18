'use client';

import { getTenantStatus } from '@/components/tenants/tenant-status-config';
import {
  getTenantCurrentMonthPresentation,
  TENANT_MONTH_TONE_STYLES,
} from '@/lib/tenant-current-month';
import type { TenantRentSummary } from '@/lib/db/queries';
import { cn, formatMoney } from '@/lib/utils';

export function TenantCurrentMonthBanner({
  rent,
  monthlyRent,
  className,
}: {
  rent: TenantRentSummary;
  monthlyRent?: number;
  className?: string;
}) {
  const pres = getTenantCurrentMonthPresentation(rent, monthlyRent);
  const statusUi = getTenantStatus(rent.current_month_status);
  const StatusIcon = statusUi.icon;
  const showProgress =
    pres.amount > 0 &&
    (pres.status === 'paid_partial' || pres.status === 'paid_full');

  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-3.5 sm:px-5',
        pres.tone === 'emerald' &&
          'border-success-line/80 bg-success-soft/60',
        pres.tone === 'amber' &&
          'border-warning-line/80 bg-warning-soft/70',
        pres.tone === 'rose' && 'border-danger-line/80 bg-danger-soft/60',
        pres.tone === 'neutral' && 'border-border/80 bg-card',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
              pres.tone === 'emerald' && 'bg-success-soft text-success-ink',
              pres.tone === 'amber' && 'bg-warning-soft text-warning-ink',
              pres.tone === 'rose' && 'bg-danger-soft text-danger-ink',
              pres.tone === 'neutral' && 'bg-muted text-muted-foreground',
            )}
          >
            <StatusIcon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">
              إيجار {pres.monthName}
            </p>
            <p
              className={cn(
                'font-bold text-base sm:text-lg leading-tight',
                pres.tone === 'emerald' && 'text-success-ink',
                pres.tone === 'amber' && 'text-warning-ink',
                pres.tone === 'rose' && 'text-danger-ink',
              )}
            >
              {pres.headline}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              {pres.subtitle}
            </p>
          </div>
        </div>

        {pres.amount > 0 && (
          <dl className="flex gap-4 text-xs shrink-0">
            <div className="text-start">
              <dt className="text-muted-foreground">المستحق</dt>
              <dd className="font-bold tabular-nums">{formatMoney(pres.amount, 'LYD')}</dd>
            </div>
            <div className="text-start">
              <dt className="text-muted-foreground">المسدّد</dt>
              <dd
                className={cn(
                  'font-bold tabular-nums',
                  pres.paid > 0 && 'text-success-ink',
                )}
              >
                {formatMoney(pres.paid, 'LYD')}
              </dd>
            </div>
            {pres.remaining > 0 && (
              <div className="text-start">
                <dt className="text-muted-foreground">المتبقي</dt>
                <dd className="font-bold tabular-nums text-warning-ink">
                  {formatMoney(pres.remaining, 'LYD')}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>

      {showProgress && (
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-muted-foreground mb-1 tabular-nums">
            <span>تقدّم التحصيل</span>
            <span>{pres.percentPaid}%</span>
          </div>
          <div className="h-2 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                pres.status === 'paid_full' ? 'bg-success' : 'bg-warning',
              )}
              style={{ width: `${pres.percentPaid}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** شارة مدمجة للهيدر الداكن في الشريط الجانبي */
export function TenantCurrentMonthHeroBadge({
  rent,
  monthlyRent,
}: {
  rent: TenantRentSummary;
  monthlyRent?: number;
}) {
  const pres = getTenantCurrentMonthPresentation(rent, monthlyRent);
  const statusUi = getTenantStatus(rent.current_month_status);
  const StatusIcon = statusUi.icon;
  const heroStyle = TENANT_MONTH_TONE_STYLES[pres.tone].hero;

  return (
    <div className={cn('mt-4 rounded-xl px-3 py-2.5', heroStyle)}>
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{pres.badgeLabel}</span>
        <span className="opacity-50">·</span>
        <span className="font-normal opacity-90">{pres.monthName}</span>
      </div>
      {pres.badgeDetail ? (
        <p className="text-[11px] mt-1 opacity-95 tabular-nums">{pres.badgeDetail}</p>
      ) : null}
      {pres.amount > 0 && pres.status === 'paid_partial' && (
        <div className="mt-2 h-1.5 rounded-full bg-black/15 overflow-hidden">
          <div
            className="h-full rounded-full bg-warning-soft"
            style={{ width: `${pres.percentPaid}%` }}
          />
        </div>
      )}
      {pres.status === 'paid_full' && pres.amount > 0 && (
        <div className="mt-2 h-1.5 rounded-full bg-black/15 overflow-hidden">
          <div className="h-full w-full rounded-full bg-success-line" />
        </div>
      )}
    </div>
  );
}
