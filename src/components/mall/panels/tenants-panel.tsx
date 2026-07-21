'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import {
  useTenantRentSummaryForMonth,
  useTenantRentSummaryForPeriod,
} from '@/lib/db/queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { TenantsDirectory } from '@/components/tenants/tenants-directory';
import { WriteGuard } from '@/components/auth/write-guard';
import { usePermission } from '@/lib/supabase/use-permission';
import { MallPanelToolbar } from '@/components/mall/panel-toolbar';
import { peopleSegmentHref } from '@/lib/mall/routes';
import { Button } from '@/components/ui/button';
import {
  aggregateTenantSummariesForPeriod,
  buildTenantMatchingMonthNumbers,
  buildTenantsReportPeriodContext,
  collectTenantMonthStatuses,
  computeTenantPeriodStats,
  defaultTenantRentPeriodSelection,
  filterTenantsByStatusAndSearch,
  formatPeriodLabelAr,
  getPeriodMonthKeys,
  periodSelectionKey,
  type TenantRentPeriodSelection,
} from '@/lib/tenant-rent-period';
import { getTenantStatus } from '@/components/tenants/tenant-status-config';

export function MallTenantsPanel() {
  const router = useRouter();
  const { canWrite } = usePermission();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [periodSelection, setPeriodSelection] = useState<TenantRentPeriodSelection>(
    () => defaultTenantRentPeriodSelection(),
  );

  const monthKeys = useMemo(
    () => getPeriodMonthKeys(periodSelection),
    [periodSelection],
  );
  const isSingleMonth = periodSelection.mode === 'month';

  const singleMonthKey = isSingleMonth ? periodSelection.monthKey : null;
  const { data: singleMonthTenants = [], isLoading: singleLoading } =
    useTenantRentSummaryForMonth(singleMonthKey);

  const {
    data: rowsByMonth,
    isLoading: periodLoading,
  } = useTenantRentSummaryForPeriod(isSingleMonth ? [] : monthKeys);

  const tenants = useMemo(() => {
    if (isSingleMonth) return singleMonthTenants;
    if (periodLoading) return [];
    return aggregateTenantSummariesForPeriod(rowsByMonth, monthKeys);
  }, [isSingleMonth, singleMonthTenants, rowsByMonth, monthKeys, periodLoading]);

  const isLoading = isSingleMonth ? singleLoading : periodLoading;

  const monthStatusesByTenant = useMemo(() => {
    if (isSingleMonth || periodLoading) return undefined;
    return collectTenantMonthStatuses(rowsByMonth ?? new Map(), monthKeys);
  }, [isSingleMonth, periodLoading, rowsByMonth, monthKeys]);

  const filteredTenants = useMemo(
    () =>
      filterTenantsByStatusAndSearch(
        tenants,
        statusFilter,
        searchQuery,
        monthStatusesByTenant,
      ),
    [tenants, statusFilter, searchQuery, monthStatusesByTenant],
  );

  const stats = useMemo(() => {
    if (!monthStatusesByTenant) return computeTenantPeriodStats(tenants);
    // سنة/ربع/نصف: العدّ بعدد المستأجرين الذين لديهم شهر واحد على الأقل بالحالة
    return {
      ...computeTenantPeriodStats(tenants),
      paid: tenants.filter((t) =>
        (monthStatusesByTenant.get(t.id) ?? []).some((e) => e.status === 'paid_full'),
      ).length,
      partial: tenants.filter((t) =>
        (monthStatusesByTenant.get(t.id) ?? []).some(
          (e) => e.status === 'paid_partial',
        ),
      ).length,
      unpaid: tenants.filter((t) =>
        (monthStatusesByTenant.get(t.id) ?? []).some((e) => e.status === 'unpaid'),
      ).length,
      noRentSet: tenants.filter((t) =>
        (monthStatusesByTenant.get(t.id) ?? []).some((e) => e.status === 'no_rent_set'),
      ).length,
      exempt: tenants.filter((t) =>
        (monthStatusesByTenant.get(t.id) ?? []).some((e) => e.status === 'exempt'),
      ).length,
    };
  }, [tenants, monthStatusesByTenant]);

  const periodLabel = formatPeriodLabelAr(periodSelection);
  const statusLabel =
    statusFilter === 'ALL'
      ? 'الكل'
      : getTenantStatus(statusFilter).shortLabel;
  /** سنة/ربع/نصف + حالة دفع → PDF يعرض أرقام الشهور بدل المبالغ */
  const showMonthNumbersInPdf =
    !isSingleMonth &&
    statusFilter !== 'ALL' &&
    (statusFilter === 'paid_full' ||
      statusFilter === 'paid_partial' ||
      statusFilter === 'unpaid' ||
      statusFilter === 'no_rent_set' ||
      statusFilter === 'exempt');
  const pdfCacheKey = `${periodSelectionKey(periodSelection)}:${statusFilter}:${searchQuery.trim()}:m${showMonthNumbersInPdf ? 1 : 0}`;
  const pdfFileName = `إيجارات-المستأجرين-${periodLabel.replace(/\s+/g, '-')}-${statusLabel}`;
  const pdfPeriod = buildTenantsReportPeriodContext(
    periodSelection,
    statusFilter === 'ALL' ? undefined : statusLabel,
    { showMonthNumbers: showMonthNumbersInPdf },
  );

  return (
    <>
      <MallPanelToolbar className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <TajMallPdfToolbar
          fileName={pdfFileName}
          cacheKey={pdfCacheKey}
          disabled={filteredTenants.length === 0 || isLoading}
          className="w-full [&>button]:flex-1 sm:w-auto sm:[&>button]:flex-none"
          render={async () => {
            const { TenantsReportPDF } = await import('@/features/pdf/TenantsReportPDF');
            const filterNote =
              statusFilter === 'ALL' ? '' : ` · ${statusLabel} فقط`;
            const monthNumbersByTenantId = showMonthNumbersInPdf
              ? buildTenantMatchingMonthNumbers(
                  filteredTenants.map((t) => t.id),
                  rowsByMonth ?? new Map(),
                  monthKeys,
                  statusFilter,
                )
              : undefined;
            return (
              <TenantsReportPDF
                titleAr="تقرير إيجارات المستأجرين"
                subtitleAr={`${filteredTenants.length} مستأجر · ${periodLabel}${filterNote}`}
                rows={filteredTenants}
                period={pdfPeriod}
                monthNumbersByTenantId={monthNumbersByTenantId}
              />
            );
          }}
        />
        <WriteGuard>
          <Button
            size="sm"
            className="h-11 w-full sm:w-auto touch-manipulation"
            onClick={() => router.push(peopleSegmentHref('TENANT', { add: 'TENANT' }))}
          >
            <Plus className="h-4 w-4 ml-1" />
            إضافة مستأجر
          </Button>
        </WriteGuard>
      </MallPanelToolbar>

      <TenantsDirectory
        tenants={tenants}
        filteredTenants={filteredTenants}
        isLoading={isLoading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        periodSelection={periodSelection}
        onPeriodSelectionChange={setPeriodSelection}
        stats={stats}
        onAddTenant={
          canWrite
            ? () => router.push(peopleSegmentHref('TENANT', { add: 'TENANT' }))
            : undefined
        }
      />
    </>
  );
}
