'use client';

import Link from 'next/link';
import {
  Building2,
  Search,
  Loader2,
  Plus,
  ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { reportMonthNameAr } from '@/lib/report-period';
import { cn, formatMoney } from '@/lib/utils';
import type { TenantRentSummary } from '@/lib/db/queries';
import {
  PARTIAL_UNPAID_FILTER_CONFIG,
  PARTIAL_UNPAID_FILTER_KEY,
  TENANT_STATUS_CONFIG,
  type TenantRentStatusKey,
} from './tenant-status-config';
import {
  TenantCurrentMonthBadge,
  TenantRentListStats,
} from './tenant-rent-list-meta';
import { TenantRentPeriodSelector } from './tenant-rent-period-selector';
import {
  MobilePageActionBar,
  MOBILE_PAGE_ACTION_PADDING,
} from '@/components/layout/mobile-page-action-bar';
import {
  formatPeriodLabelAr,
  formatPeriodShortLabelAr,
  getPeriodMonthKeys,
  tenantPeriodExpectedRent,
  tenantPeriodPaid,
  type TenantRentPeriodSelection,
} from '@/lib/tenant-rent-period';

export type TenantsDirectoryProps = {
  tenants: TenantRentSummary[];
  filteredTenants: TenantRentSummary[];
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: string;
  onStatusFilterChange: (s: string) => void;
  periodSelection: TenantRentPeriodSelection;
  onPeriodSelectionChange: (selection: TenantRentPeriodSelection) => void;
  stats: {
    total: number;
    paid: number;
    partial: number;
    unpaid: number;
    partialUnpaid?: number;
    noRentSet?: number;
    exempt?: number;
    expectedTotal: number;
    collectedTotal: number;
  };
  /** عند فلتر حالة على فترة متعددة: أرقام الشهور المطابقة لكل مستأجر */
  matchingMonthsByTenantId?: Record<string, number[]>;
  onAddTenant?: () => void;
};

function StatusFilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 snap-center items-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-medium touch-manipulation',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card hover:bg-secondary',
      )}
    >
      {children}
    </button>
  );
}

export function TenantsDirectory({
  tenants,
  filteredTenants,
  isLoading,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  periodSelection,
  onPeriodSelectionChange,
  stats,
  matchingMonthsByTenantId,
  onAddTenant,
}: TenantsDirectoryProps) {
  const periodLabel = formatPeriodLabelAr(periodSelection);
  const periodShort = formatPeriodShortLabelAr(periodSelection);
  const isMultiMonth = periodSelection.mode !== 'month';
  const periodMonthCount = getPeriodMonthKeys(periodSelection).length;

  // One month: the column header names it, so the badge shows the status only. Several months: which
  // of them match the filter, by name.
  const badgeLabelFor = (tenantId: string) => {
    if (!isMultiMonth) return '';
    const months = matchingMonthsByTenantId?.[tenantId];
    if (months && months.length > 0) {
      return months.map((m) => (typeof m === 'number' ? reportMonthNameAr(m) : m)).join('، ');
    }
    return periodShort;
  };

  const statusCount = (key: TenantRentStatusKey) => {
    if (key === 'paid_full') return stats.paid;
    if (key === 'paid_partial') return stats.partial;
    if (key === 'unpaid') return stats.unpaid;
    if (key === 'exempt') {
      return (
        stats.exempt ??
        tenants.filter((t) => t.current_month_status === 'exempt').length
      );
    }
    return (
      stats.noRentSet ??
      tenants.filter((t) => t.current_month_status === key).length
    );
  };

  const filterChips = [
    { key: 'ALL', label: 'الكل', count: stats.total },
    ...(
      (
        Object.entries(TENANT_STATUS_CONFIG) as [
          TenantRentStatusKey,
          (typeof TENANT_STATUS_CONFIG)[TenantRentStatusKey],
        ][]
      ).flatMap(([key, cfg]) => {
        const chip = {
          key,
          label: cfg.shortLabel,
          count: statusCount(key),
          icon: cfg.icon,
        };
        if (key !== 'unpaid') return [chip];
        return [
          chip,
          {
            key: PARTIAL_UNPAID_FILTER_KEY,
            label: PARTIAL_UNPAID_FILTER_CONFIG.shortLabel,
            count:
              stats.partialUnpaid ??
              tenants.filter(
                (t) =>
                  t.current_month_status === 'paid_partial' ||
                  t.current_month_status === 'unpaid',
              ).length,
            icon: PARTIAL_UNPAID_FILTER_CONFIG.icon,
          },
        ];
      })
    ),
  ];

  return (
    <div className={cn('flex flex-col gap-4 md:gap-6', MOBILE_PAGE_ACTION_PADDING)}>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-3 gap-px bg-border md:grid-cols-4">
          {filterChips.slice(1, 4).map((chip) => {
            const cfg = TENANT_STATUS_CONFIG[chip.key as TenantRentStatusKey];
            const active = statusFilter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                aria-pressed={active}
                onClick={() => onStatusFilterChange(active ? 'ALL' : chip.key)}
                className={cn(
                  'flex flex-col items-start gap-0.5 p-3 text-start touch-manipulation transition-colors sm:p-4',
                  active ? 'bg-canvas-sunken shadow-[inset_0_-2px_0_hsl(var(--foreground))]' : 'bg-card hover:bg-canvas-sunken/60',
                )}
              >
                <span className="text-[12.5px] text-ink-mute">{cfg.shortLabel}</span>
                <span className={cn('text-[20px] font-semibold tabular-nums', chip.count > 0 ? cfg.color : 'text-foreground')}>{chip.count}</span>
              </button>
            );
          })}
          <div className="col-span-3 bg-card p-3 sm:p-4 md:col-span-1">
            <p className="text-[12.5px] text-ink-mute">المحصّل · {periodShort}</p>
            <p className="mt-0.5 text-[16px] font-semibold tabular-nums text-foreground">{formatMoney(stats.collectedTotal, 'LYD')}</p>
            <p className="text-[12px] text-ink-mute tabular-nums">من {formatMoney(stats.expectedTotal, 'LYD')}</p>
          </div>
        </div>
      </Card>

      <div className="sticky top-16 z-20 -mx-4 space-y-3 border-b border-border bg-canvas px-4 py-3 md:static md:mx-0 md:z-auto md:border-0 md:bg-transparent md:px-0 md:py-0">
        <div className="relative">
          <Search className="pointer-events-none absolute inset-s-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <Input
            placeholder="بحث: الاسم، المحل، الهاتف…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-11 ps-10 text-base md:h-10 md:text-sm"
          />
        </div>

        <TenantRentPeriodSelector
          selection={periodSelection}
          onChange={onPeriodSelectionChange}
        />

        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar -mx-1 px-1">
          {filterChips.map((chip) => {
            const Icon = 'icon' in chip ? chip.icon : null;
            const chipLabel = chip.label;
            return (
              <StatusFilterChip
                key={chip.key}
                active={statusFilter === chip.key}
                onClick={() => onStatusFilterChange(chip.key)}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                <span className="max-w-40 truncate sm:max-w-none">
                  {chipLabel}
                </span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[11px] tabular-nums',
                    statusFilter === chip.key ? 'bg-background/20' : 'bg-canvas-sunken',
                  )}
                >
                  {chip.count}
                </span>
              </StatusFilterChip>
            );
          })}
        </div>
      </div>

      {!isLoading && (
        <p className="text-[12px] text-ink-mute">
          {filteredTenants.length} مستأجر · {periodLabel}
          {isMultiMonth && (
            <span className="ms-1 text-ink-mute/80">
              {' '}
              (مجموع {periodMonthCount} أشهر)
            </span>
          )}
        </p>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center py-16 gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-ink-soft" />
          <p className="text-sm text-ink-mute">جارٍ التحميل…</p>
        </div>
      ) : filteredTenants.length === 0 ? (
        <Card className="p-8 text-center">
          <Building2 className="mx-auto h-8 w-8 text-ink-mute" />
          <p className="mt-2 text-ink-mute">لا يوجد مستأجرون</p>
          {onAddTenant && (
            <Button className="mt-4" size="sm" onClick={onAddTenant}>
              إضافة مستأجر
            </Button>
          )}
        </Card>
      ) : (
        <>
          <div className="hidden lg:block overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-canvas-sunken/80 text-start text-[12px] text-ink-mute">
                  <th className="px-4 py-3 font-semibold">المستأجر</th>
                  <th className="px-4 py-3 font-semibold">
                    {isMultiMonth ? `الفترة (${periodShort})` : `شهر (${periodShort})`}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {isMultiMonth ? 'إيجار الفترة' : 'إيجار'}
                  </th>
                  <th className="px-4 py-3 font-semibold">القيود</th>
                  <th className="px-4 py-3 font-semibold">
                    {isMultiMonth ? 'مسدّد الفترة' : 'إجمالي المسدد'}
                  </th>
                  <th className="px-4 py-3 font-semibold w-[180px]">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredTenants.map((tenant, i) => (
                  <TenantTableRow
                    key={tenant.id}
                    tenant={tenant}
                    periodLabel={badgeLabelFor(tenant.id)}
                    isMultiMonth={isMultiMonth}
                    striped={i % 2 === 1}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="hidden sm:grid lg:hidden gap-3 sm:grid-cols-2">
            {filteredTenants.map((tenant) => (
              <TenantCard
                key={tenant.id}
                tenant={tenant}
                periodLabel={badgeLabelFor(tenant.id)}
              />
            ))}
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border sm:hidden">
            {filteredTenants.map((tenant) => (
              <TenantMobileRow
                key={tenant.id}
                tenant={tenant}
                periodLabel={badgeLabelFor(tenant.id)}
              />
            ))}
          </ul>
        </>
      )}

      {onAddTenant && (
        <MobilePageActionBar>
          <Button
            className="h-12 w-full gap-2 text-base font-semibold shadow-xs touch-manipulation"
            onClick={onAddTenant}
          >
            <Plus className="h-5 w-5" />
            إضافة مستأجر
          </Button>
        </MobilePageActionBar>
      )}
    </div>
  );
}

function journalCount(tenant: TenantRentSummary): number {
  return (
    Number(tenant.rent_linked_journals_count) ||
    Number(tenant.journal_entries_count) ||
    0
  );
}

function TenantTableRow({
  tenant,
  periodLabel,
  isMultiMonth,
  striped,
}: {
  tenant: TenantRentSummary;
  periodLabel: string;
  isMultiMonth: boolean;
  striped: boolean;
}) {
  const rent = tenantPeriodExpectedRent(tenant);
  const paid = tenantPeriodPaid(tenant);
  const totalPaid = isMultiMonth
    ? paid
    : Number(tenant.total_rent_paid) || paid;
  const journals = journalCount(tenant);

  return (
    <tr
      className={cn(
        'border-b border-border/60',
        striped && 'bg-canvas-sunken/20',
        tenant.current_month_status === 'unpaid' && 'bg-danger-soft/25',
        tenant.current_month_status === 'paid_partial' && 'bg-warning-soft/20',
      )}
    >
      <td className="px-4 py-3">
        <Link
          href={`/contacts/${tenant.id}`}
          className="font-medium hover:text-foreground hover:underline"
        >
          {tenant.name}
        </Link>
        <p className="text-xs text-ink-mute">
          {tenant.shop_number ? `محل ${tenant.shop_number}` : '—'}
        </p>
      </td>
      <td className="px-4 py-3">
        <TenantCurrentMonthBadge tenant={tenant} periodLabel={periodLabel} />
      </td>
      <td className="px-4 py-3 tabular-nums font-medium">
        {rent > 0 ? formatMoney(rent, 'LYD') : '—'}
        {isMultiMonth && paid > 0 && paid < rent && (
          <p className="text-[11px] text-warning-ink font-normal">
            مسدّد {formatMoney(paid, 'LYD')}
          </p>
        )}
      </td>
      <td className="px-4 py-3 tabular-nums font-medium text-foreground">
        {journals}
      </td>
      <td className="px-4 py-3 tabular-nums">{formatMoney(totalPaid, 'LYD')}</td>
      <td className="px-4 py-3">
        <Button size="sm" variant="outline" asChild>
          <Link href={`/contacts/${tenant.id}`}>الملف</Link>
        </Button>
      </td>
    </tr>
  );
}

function TenantCard({
  tenant,
  periodLabel,
}: {
  tenant: TenantRentSummary;
  periodLabel: string;
}) {
  return (
    <Card
      className={cn(
        'overflow-hidden',
        tenant.current_month_status === 'unpaid' && 'border-danger-line/80',
        tenant.current_month_status === 'paid_partial' && 'border-warning-line/80',
      )}
    >
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <TenantCurrentMonthBadge tenant={tenant} periodLabel={periodLabel} />
      </div>
      <div className="p-4">
        <Link href={`/contacts/${tenant.id}`} className="block group">
          <h3 className="font-semibold group-hover:text-foreground">{tenant.name}</h3>
          <p className="text-sm text-ink-mute">
            {tenant.shop_number ? `محل ${tenant.shop_number}` : '—'}
          </p>
        </Link>
        <div className="mt-3">
          <TenantRentListStats tenant={tenant} periodLabel={periodLabel} />
        </div>
        <div className="mt-3">
          <Button size="sm" variant="outline" className="w-full" asChild>
            <Link href={`/contacts/${tenant.id}`}>الملف</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

function TenantMobileRow({
  tenant,
  periodLabel,
}: {
  tenant: TenantRentSummary;
  periodLabel: string;
}) {
  return (
    <li className="bg-card">
      <Link
        href={`/contacts/${tenant.id}`}
        className="flex min-h-[80px] items-start gap-3 px-3 py-3.5 active:bg-secondary/50 touch-manipulation"
      >
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-semibold text-[15px] truncate">{tenant.name}</p>
            <TenantCurrentMonthBadge
              tenant={tenant}
              periodLabel={periodLabel}
              className="shrink-0"
            />
          </div>
          <p className="text-[13px] text-ink-mute line-clamp-1">
            {tenant.shop_number ? `محل ${tenant.shop_number}` : '—'}
            {tenant.phone && (
              <span className="mr-1" dir="ltr">
                · {tenant.phone}
              </span>
            )}
          </p>
          <TenantRentListStats tenant={tenant} compact periodLabel={periodLabel} />
        </div>
        <ChevronLeft className="h-5 w-5 shrink-0 text-ink-mute mt-1" aria-hidden />
      </Link>
    </li>
  );
}
