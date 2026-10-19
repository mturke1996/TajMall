'use client';

import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Search,
  Plus,
  ChevronLeft,
  ChevronsUpDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { reportMonthNameAr } from '@/lib/report-period';
import { currentMonthKey } from '@/lib/rent-months';
import { arabicCount, cn, formatDate, formatMoney, todayISODate } from '@/lib/utils';
import type { TenantRentSummary } from '@/lib/db/queries';
import {
  describeTenantSort,
  periodIsDue,
  reminderBasisFor,
  tenantOwed,
  type TenantSort,
  type TenantSortKey,
} from '@/lib/tenant-collection';
import type { RentReminderBasis } from '@/lib/whatsapp';
import type { CollectControl } from './use-collect-rent';
import { TenantRowActions } from './tenant-row-actions';
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
  formatPeriodRangeHintAr,
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
  /** the order of `filteredTenants` (the screen sorts; this only shows it and asks for another) */
  sort: TenantSort;
  onSortChange: (key: TenantSortKey) => void;
  /** omitted for people who may not record payments: rows then have no collect button */
  collect?: CollectControl;
};

const SORT_LABEL: Record<TenantSortKey, string> = { name: 'الاسم', shop: 'المحل', owed: 'المتبقي' };
const SORT_ORDER: TenantSortKey[] = ['name', 'shop', 'owed'];
const TENANT_UNIT: [string, string, string, string] = ['مستأجر واحد', 'مستأجران', 'مستأجرين', 'مستأجراً'];
const MONTH_UNIT: [string, string, string, string] = ['شهر', 'شهرين', 'أشهر', 'شهراً'];
const JOURNAL_UNIT: [string, string, string, string] = ['قيد واحد', 'قيدان', 'قيود', 'قيداً'];

function SortIcon({ sort, column, className }: { sort: TenantSort; column: TenantSortKey; className?: string }) {
  if (sort.key !== column) return <ChevronsUpDown className={cn('h-3.5 w-3.5 stroke-[1.6] text-ink-mute/70', className)} aria-hidden />;
  const Icon = sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return <Icon className={cn('h-3.5 w-3.5 stroke-[1.6] text-foreground', className)} aria-hidden />;
}

/** A column header that sorts: the active one shows its direction, the others offer to become active. */
function SortHeader({
  column,
  label,
  sort,
  onSort,
}: {
  column: TenantSortKey;
  label: string;
  sort: TenantSort;
  onSort: (key: TenantSortKey) => void;
}) {
  const active = sort.key === column;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="px-4 py-2 font-semibold"
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          '-mx-2 inline-flex items-center gap-1 rounded-md px-2 py-1.5 font-semibold touch-manipulation',
          'hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40',
          active && 'text-foreground',
        )}
      >
        {label}
        <SortIcon sort={sort} column={column} />
      </button>
    </th>
  );
}

/** The same choice as the column headers, for the layouts that have no table (tablet and phone). */
function SortControl({ sort, onSort, className }: { sort: TenantSort; onSort: (key: TenantSortKey) => void; className?: string }) {
  return (
    <div role="group" aria-label="ترتيب القائمة" className={cn('flex items-center gap-2', className)}>
      <span className="text-[12px] text-ink-mute">ترتيب</span>
      <div className="flex rounded-lg border border-border bg-canvas-sunken p-0.5">
        {SORT_ORDER.map((key) => {
          const active = sort.key === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => onSort(key)}
              className={cn(
                'inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-[13px] font-medium touch-manipulation transition-colors sm:min-h-9',
                'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40',
                active ? 'bg-card text-foreground shadow-xs' : 'text-ink-mute hover:text-foreground',
              )}
            >
              {SORT_LABEL[key]}
              {active && <SortIcon sort={sort} column={key} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** What is still owed on a row: the figure in the debt colour, or a dash when nothing is. */
function Owed({ value, className }: { value: number; className?: string }) {
  if (value > 0) return <span className={cn('font-semibold tabular-nums text-danger-ink', className)}>{formatMoney(value, 'LYD')}</span>;
  return (
    <span className={cn('text-ink-mute', className)}>
      <span className="sr-only">لا شيء متبقٍ</span>
      <span aria-hidden>—</span>
    </span>
  );
}

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
  sort,
  onSortChange,
  collect,
}: TenantsDirectoryProps) {
  const periodLabel = formatPeriodLabelAr(periodSelection);
  const periodShort = formatPeriodShortLabelAr(periodSelection);
  const isMultiMonth = periodSelection.mode !== 'month';
  const periodMonthCount = getPeriodMonthKeys(periodSelection).length;
  // the reminder says what its amount is for: this month's rent, or the months of the period on screen
  const basis = reminderBasisFor(
    periodSelection.mode,
    isMultiMonth ? formatPeriodRangeHintAr(periodSelection) : periodLabel,
  );
  const asOf = formatDate(todayISODate());
  // a reminder says the amount is owed today: not for a period whose rent has months still to come
  const remindable = periodIsDue(getPeriodMonthKeys(periodSelection), currentMonthKey());
  const reminderWithheld = !remindable && filteredTenants.some((t) => tenantOwed(t) > 0 && Boolean(t.phone));

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

      {!isLoading && filteredTenants.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-[12px] text-ink-mute">
              {arabicCount(filteredTenants.length, TENANT_UNIT)} · {periodLabel}
              {isMultiMonth && <span className="ms-1">(مجموع {arabicCount(periodMonthCount, MONTH_UNIT)})</span>}
            </p>
            {/* the table sorts from its headers; tablet and phone have none, so they get the same choice here */}
            {filteredTenants.length > 1 && <SortControl sort={sort} onSort={onSortChange} className="xl:hidden" />}
          </div>
          {reminderWithheld && (
            <p className="text-[12px] text-ink-mute">
              لا يظهر التذكير لفترة فيها أشهر لم يحلّ موعدها. اختر شهراً حلّ موعده أو «حتى الآن».
            </p>
          )}
        </div>
      )}

      {collect?.state === 'failed' && !isLoading && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning-line bg-warning-soft px-4 py-3 text-[13px] text-warning-ink"
        >
          <p>تعذّر تحميل بيانات التحصيل، فلا يمكن التحصيل من القائمة الآن. الملف الشخصي للمستأجر ما زال متاحاً.</p>
          <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-8" onClick={collect.onRetry}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="surface overflow-hidden" aria-busy="true">
          <p role="status" className="sr-only">
            جارٍ تحميل المستأجرين
          </p>
          <ul className="divide-y divide-border" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-20" />
              </li>
            ))}
          </ul>
        </div>
      ) : filteredTenants.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <Building2 className="h-8 w-8 stroke-[1.6] text-ink-mute" aria-hidden />
          {tenants.length === 0 ? (
            <>
              <p className="text-[13px] text-ink-mute">لا يوجد مستأجرون بعد.</p>
              {onAddTenant && (
                <Button size="sm" className="min-h-11 sm:min-h-8" onClick={onAddTenant}>
                  إضافة مستأجر
                </Button>
              )}
            </>
          ) : (
            <>
              <p className="text-[13px] text-ink-mute">لا يوجد مستأجر يطابق البحث أو الفلتر.</p>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 sm:min-h-8"
                onClick={() => {
                  onSearchChange('');
                  onStatusFilterChange('ALL');
                }}
              >
                عرض كل المستأجرين
              </Button>
            </>
          )}
        </Card>
      ) : (
        <>
          <p role="status" className="sr-only">
            {describeTenantSort(sort)}
          </p>

          {/* seven columns and the actions need about 970px of content: below that (with the sidebar open) the cards are the better layout */}
          <div className="hidden xl:block overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <caption className="sr-only">قائمة المستأجرين. {describeTenantSort(sort)}</caption>
              <thead>
                <tr className="border-b bg-canvas-sunken/80 text-start text-[12px] text-ink-mute">
                  <SortHeader column="name" label="المستأجر" sort={sort} onSort={onSortChange} />
                  <SortHeader column="shop" label="المحل" sort={sort} onSort={onSortChange} />
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {isMultiMonth ? `الفترة (${periodShort})` : `شهر (${periodShort})`}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {isMultiMonth ? 'إيجار الفترة' : 'إيجار'}
                  </th>
                  <SortHeader column="owed" label={isMultiMonth ? 'المتبقي من الفترة' : 'المتبقي'} sort={sort} onSort={onSortChange} />
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {isMultiMonth ? 'مسدّد الفترة' : 'إجمالي المسدد'}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    إجراءات
                  </th>
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
                    basis={basis}
                    asOf={asOf}
                    remindable={remindable}
                    collect={collect}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="hidden gap-3 sm:grid sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:hidden">
            {filteredTenants.map((tenant) => (
              <TenantCard
                key={tenant.id}
                tenant={tenant}
                periodLabel={badgeLabelFor(tenant.id)}
                basis={basis}
                asOf={asOf}
                remindable={remindable}
                collect={collect}
              />
            ))}
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border sm:hidden">
            {filteredTenants.map((tenant) => (
              <TenantMobileRow
                key={tenant.id}
                tenant={tenant}
                periodLabel={badgeLabelFor(tenant.id)}
                basis={basis}
                asOf={asOf}
                remindable={remindable}
                collect={collect}
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

type RowExtras = { basis: RentReminderBasis; asOf: string; remindable: boolean; collect?: CollectControl };

function TenantTableRow({
  tenant,
  periodLabel,
  isMultiMonth,
  striped,
  basis,
  asOf,
  remindable,
  collect,
}: {
  tenant: TenantRentSummary;
  periodLabel: string;
  isMultiMonth: boolean;
  striped: boolean;
} & RowExtras) {
  const rent = tenantPeriodExpectedRent(tenant);
  const paid = tenantPeriodPaid(tenant);
  const totalPaid = isMultiMonth
    ? paid
    : Number(tenant.total_rent_paid) || paid;
  const journals = journalCount(tenant);
  const owed = tenantOwed(tenant);

  return (
    <tr
      className={cn(
        'border-b border-border/60',
        striped && 'bg-canvas-sunken/20',
        tenant.current_month_status === 'unpaid' && 'bg-danger-soft/25',
        tenant.current_month_status === 'paid_partial' && 'bg-warning-soft/20',
      )}
    >
      <th scope="row" className="px-4 py-3 text-start font-medium">
        <Link
          href={`/contacts/${tenant.id}`}
          className="hover:text-foreground hover:underline"
        >
          {tenant.name}
        </Link>
      </th>
      <td className="px-4 py-3 text-ink-soft tabular-nums">{tenant.shop_number || '—'}</td>
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
      <td className="px-4 py-3">
        <Owed value={owed} />
      </td>
      <td className="px-4 py-3 tabular-nums">
        {formatMoney(totalPaid, 'LYD')}
        <p className="text-[12px] text-ink-mute">{journals > 0 ? arabicCount(journals, JOURNAL_UNIT) : 'بلا قيود'}</p>
      </td>
      <td className="px-4 py-3">
        <TenantRowActions tenant={tenant} owed={owed} basis={basis} asOf={asOf} remindable={remindable} collect={collect} density="table" showProfile />
      </td>
    </tr>
  );
}

function TenantCard({
  tenant,
  periodLabel,
  basis,
  asOf,
  remindable,
  collect,
}: {
  tenant: TenantRentSummary;
  periodLabel: string;
} & RowExtras) {
  const owed = tenantOwed(tenant);
  return (
    <Card
      className={cn(
        'overflow-hidden',
        tenant.current_month_status === 'unpaid' && 'border-danger-line/80',
        tenant.current_month_status === 'paid_partial' && 'border-warning-line/80',
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <TenantCurrentMonthBadge tenant={tenant} periodLabel={periodLabel} />
        </div>
        <p className="flex shrink-0 items-baseline gap-1.5 text-[12.5px] text-ink-mute">
          المتبقي
          <Owed value={owed} className="text-[15px]" />
        </p>
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
        <TenantRowActions tenant={tenant} owed={owed} basis={basis} asOf={asOf} remindable={remindable} collect={collect} density="card" showProfile className="mt-4" />
      </div>
    </Card>
  );
}

function TenantMobileRow({
  tenant,
  periodLabel,
  basis,
  asOf,
  remindable,
  collect,
}: {
  tenant: TenantRentSummary;
  periodLabel: string;
} & RowExtras) {
  const owed = tenantOwed(tenant);
  return (
    <li className="bg-card">
      <Link
        href={`/contacts/${tenant.id}`}
        className="flex min-h-[80px] items-start gap-3 px-3 pt-3.5 pb-2 active:bg-secondary/50 touch-manipulation"
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
              <>
                <span aria-hidden> · </span>
                {/* isolated, so the shop number before it cannot run into the digits of the phone */}
                <bdi dir="ltr">{tenant.phone}</bdi>
              </>
            )}
          </p>
          <p className="flex items-baseline justify-between gap-3 text-[12.5px] text-ink-mute">
            المتبقي
            <Owed value={owed} className="text-[16px]" />
          </p>
          <TenantRentListStats tenant={tenant} compact periodLabel={periodLabel} />
        </div>
        <ChevronLeft className="h-5 w-5 shrink-0 text-ink-mute mt-1" aria-hidden />
      </Link>
      <TenantRowActions tenant={tenant} owed={owed} basis={basis} asOf={asOf} remindable={remindable} collect={collect} density="card" className="px-3 pb-3" />
    </li>
  );
}
