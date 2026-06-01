'use client';

import Link from 'next/link';
import {
  Building2,
  Search,
  Loader2,
  DollarSign,
  Phone,
  Plus,
  ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn, formatMoney } from '@/lib/utils';
import type { TenantRentSummary } from '@/lib/db/queries';
import { TENANT_STATUS_CONFIG, getTenantStatus } from './tenant-status-config';

export type TenantsDirectoryProps = {
  tenants: TenantRentSummary[];
  filteredTenants: TenantRentSummary[];
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: string;
  onStatusFilterChange: (s: string) => void;
  stats: {
    total: number;
    paid: number;
    partial: number;
    unpaid: number;
    expectedTotal: number;
    collectedTotal: number;
  };
  onRecordPayment: (tenant: TenantRentSummary) => void;
  onAddTenant: () => void;
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
          ? 'border-sage-700 bg-sage-700 text-white'
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
  stats,
  onRecordPayment,
  onAddTenant,
}: TenantsDirectoryProps) {
  const filterChips = [
    { key: 'ALL', label: 'الكل', count: stats.total },
    ...Object.entries(TENANT_STATUS_CONFIG).map(([key, cfg]) => ({
      key,
      label: cfg.label,
      count:
        key === 'paid_full'
          ? stats.paid
          : key === 'paid_partial'
            ? stats.partial
            : key === 'unpaid'
              ? stats.unpaid
              : tenants.filter((t) => t.current_month_status === key).length,
      icon: cfg.icon,
    })),
  ];

  return (
    <div className="flex flex-col gap-4 pb-24 md:gap-6 md:pb-10">
      {/* إحصائيات — تمرير على الجوال */}
      <div className="-mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-none md:grid md:grid-cols-4 md:overflow-visible">
          {filterChips.slice(1, 4).map((chip) => {
            const cfg = TENANT_STATUS_CONFIG[chip.key as keyof typeof TENANT_STATUS_CONFIG];
            const Icon = cfg.icon;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => onStatusFilterChange(chip.key)}
                className={cn(
                  'flex min-w-[8.5rem] shrink-0 snap-center flex-col gap-1 rounded-xl border p-3 text-right sm:min-w-0 sm:flex-row sm:items-center sm:gap-3',
                  statusFilter === chip.key
                    ? 'border-sage-600 bg-sage-50 ring-1 ring-sage-600/20'
                    : 'border-border bg-card',
                  cfg.bg,
                  cfg.border,
                )}
              >
                <Icon className={cn('h-5 w-5', cfg.color)} />
                <div>
                  <p className="text-[11px] text-ink-mute">{chip.label}</p>
                  <p className={cn('text-lg font-bold tabular-nums', cfg.color)}>
                    {chip.count}
                  </p>
                </div>
              </button>
            );
          })}
          <div className="flex min-w-[10rem] shrink-0 snap-center flex-col justify-center rounded-xl border border-sage-200 bg-sage-50 p-3 sm:min-w-0">
            <p className="text-[11px] text-ink-mute">تحصيل الشهر</p>
            <p className="text-sm font-bold text-sage-800 leading-snug">
              {formatMoney(stats.collectedTotal, 'LYD')}
            </p>
            <p className="text-[10px] text-ink-mute">
              من {formatMoney(stats.expectedTotal, 'LYD')}
            </p>
          </div>
        </div>
      </div>

      {/* بحث وفلاتر */}
      <div className="sticky top-0 z-20 -mx-4 space-y-3 border-b border-border bg-canvas/95 px-4 py-3 backdrop-blur-md md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0">
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <Input
            placeholder="بحث: الاسم، المحل، الهاتف…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-11 pr-10 text-base md:h-10 md:text-sm"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {filterChips.map((chip) => {
            const Icon = 'icon' in chip ? chip.icon : null;
            return (
              <StatusFilterChip
                key={chip.key}
                active={statusFilter === chip.key}
                onClick={() => onStatusFilterChange(chip.key)}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {chip.key === 'ALL' ? chip.label : chip.label.split(' ')[0]}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                    statusFilter === chip.key ? 'bg-white/20' : 'bg-canvas-sunken',
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
          {filteredTenants.length} مستأجر
        </p>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center py-16 gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-sage-600" />
          <p className="text-sm text-ink-mute">جارٍ التحميل…</p>
        </div>
      ) : filteredTenants.length === 0 ? (
        <Card className="p-8 text-center">
          <Building2 className="mx-auto h-8 w-8 text-ink-mute" />
          <p className="mt-2 text-ink-mute">لا يوجد مستأجرين</p>
          <Button className="mt-4" size="sm" onClick={onAddTenant}>
            إضافة مستأجر
          </Button>
        </Card>
      ) : (
        <>
          {/* جدول — كمبيوتر */}
          <div className="hidden lg:block overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-canvas-sunken/80 text-right text-[12px] text-ink-mute">
                  <th className="px-4 py-3 font-semibold">المستأجر</th>
                  <th className="px-4 py-3 font-semibold">الحالة</th>
                  <th className="px-4 py-3 font-semibold">الإيجار</th>
                  <th className="px-4 py-3 font-semibold">المسدد</th>
                  <th className="px-4 py-3 font-semibold">المتبقي</th>
                  <th className="px-4 py-3 font-semibold w-[200px]">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredTenants.map((tenant, i) => {
                  const status = getTenantStatus(tenant.current_month_status);
                  const StatusIcon = status.icon;
                  const rent = Number(tenant.monthly_rent) || 0;
                  const paid = Number(tenant.current_month_paid) || 0;
                  const remaining = Math.max(0, rent - paid);
                  return (
                    <tr
                      key={tenant.id}
                      className={cn(
                        'border-b border-border/60',
                        i % 2 === 1 && 'bg-canvas-sunken/20',
                        tenant.current_month_status === 'unpaid' && 'bg-red-50/30',
                      )}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/contacts/${tenant.id}`}
                          className="font-medium hover:text-sage-700 hover:underline"
                        >
                          {tenant.name}
                        </Link>
                        <p className="text-xs text-ink-mute">
                          {tenant.shop_number ? `محل ${tenant.shop_number}` : '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-xs font-medium',
                            status.color,
                          )}
                        >
                          <StatusIcon className="h-3.5 w-3.5" />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {rent > 0 ? formatMoney(rent, 'LYD') : '—'}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-green-600">
                        {formatMoney(paid, 'LYD')}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-red-600">
                        {remaining > 0 ? formatMoney(remaining, 'LYD') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            disabled={rent === 0}
                            onClick={() => onRecordPayment(tenant)}
                          >
                            دفع
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/contacts/${tenant.id}`}>الملف</Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* بطاقات — تابلت */}
          <div className="hidden sm:grid lg:hidden gap-3 sm:grid-cols-2">
            {filteredTenants.map((tenant) => (
              <TenantCard
                key={tenant.id}
                tenant={tenant}
                onRecordPayment={onRecordPayment}
              />
            ))}
          </div>

          {/* قائمة — جوال */}
          <ul className="divide-y divide-border rounded-xl border border-border bg-card sm:hidden">
            {filteredTenants.map((tenant) => {
              const status = getTenantStatus(tenant.current_month_status);
              const StatusIcon = status.icon;
              const rent = Number(tenant.monthly_rent) || 0;
              const paid = Number(tenant.current_month_paid) || 0;
              return (
                <li key={tenant.id}>
                  <Link
                    href={`/contacts/${tenant.id}`}
                    className="flex items-center gap-3 px-3 py-3 active:bg-secondary/40 touch-manipulation"
                  >
                    <div
                      className={cn(
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                        status.bg,
                      )}
                    >
                      <StatusIcon className={cn('h-5 w-5', status.color)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{tenant.name}</p>
                      <p className="text-[12px] text-ink-mute">
                        {tenant.shop_number ? `محل ${tenant.shop_number}` : '—'}
                        {rent > 0 && (
                          <>
                            {' · '}
                            {formatMoney(paid, 'LYD')} / {formatMoney(rent, 'LYD')}
                          </>
                        )}
                      </p>
                      <span className={cn('text-[10px] font-medium', status.color)}>
                        {status.label}
                      </span>
                    </div>
                    <ChevronLeft className="h-5 w-5 text-ink-mute shrink-0" />
                  </Link>
                  <div className="flex border-t border-border px-2 py-1.5 gap-1">
                    <Button
                      size="sm"
                      className="flex-1 h-9"
                      disabled={rent === 0}
                      onClick={() => onRecordPayment(tenant)}
                    >
                      <Plus className="h-4 w-4 ml-1" />
                      دفع
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 h-9" asChild>
                      <Link href={`/contacts/${tenant.id}`}>الملف</Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-canvas/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
        <Button
          className="h-12 w-full gap-2 text-base font-semibold shadow-lg"
          onClick={onAddTenant}
        >
          <Plus className="h-5 w-5" />
          إضافة مستأجر
        </Button>
      </div>
    </div>
  );
}

function TenantCard({
  tenant,
  onRecordPayment,
}: {
  tenant: TenantRentSummary;
  onRecordPayment: (t: TenantRentSummary) => void;
}) {
  const status = getTenantStatus(tenant.current_month_status);
  const StatusIcon = status.icon;
  const rent = Number(tenant.monthly_rent) || 0;
  const paid = Number(tenant.current_month_paid) || 0;
  const remaining = Math.max(0, rent - paid);

  return (
    <Card
      className={cn(
        'overflow-hidden',
        tenant.current_month_status === 'unpaid' && 'border-red-300',
      )}
    >
      <div
        className={cn(
          'px-4 py-2 border-b flex items-center justify-between',
          status.bg,
          status.border,
        )}
      >
        <div className="flex items-center gap-2">
          <StatusIcon className={cn('h-4 w-4', status.color)} />
          <span className={cn('text-sm font-medium', status.color)}>{status.label}</span>
        </div>
      </div>
      <div className="p-4">
        <Link href={`/contacts/${tenant.id}`} className="block group">
          <h3 className="font-semibold group-hover:text-sage-700">{tenant.name}</h3>
          <p className="text-sm text-ink-mute">
            {tenant.shop_number ? `محل ${tenant.shop_number}` : '—'}
          </p>
        </Link>
        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-mute">الإيجار</span>
            <span>{rent > 0 ? formatMoney(rent, 'LYD') : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-mute">المسدد</span>
            <span className="text-green-600">{formatMoney(paid, 'LYD')}</span>
          </div>
          {remaining > 0 && (
            <div className="flex justify-between">
              <span className="text-ink-mute">المتبقي</span>
              <span className="text-red-600">{formatMoney(remaining, 'LYD')}</span>
            </div>
          )}
          {tenant.phone && (
            <p className="flex items-center gap-1 text-ink-mute pt-1">
              <Phone className="h-3.5 w-3.5" />
              {tenant.phone}
            </p>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            disabled={rent === 0}
            onClick={() => onRecordPayment(tenant)}
          >
            <DollarSign className="h-4 w-4 ml-1" />
            دفع
          </Button>
          <Button size="sm" variant="outline" className="flex-1" asChild>
            <Link href={`/contacts/${tenant.id}`}>الملف</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
