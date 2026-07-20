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
  buildTenantsReportPeriodContext,
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

  const filteredTenants = useMemo(
    () => filterTenantsByStatusAndSearch(tenants, statusFilter, searchQuery),
    [tenants, statusFilter, searchQuery],
  );

  const stats = useMemo(() => computeTenantPeriodStats(tenants), [tenants]);

  const periodLabel = formatPeriodLabelAr(periodSelection);
  const statusLabel =
    statusFilter === 'ALL'
      ? 'الكل'
      : getTenantStatus(statusFilter).shortLabel;
  const pdfCacheKey = `${periodSelectionKey(periodSelection)}:${statusFilter}:${searchQuery.trim()}`;
  const pdfFileName = `إيجارات-المستأجرين-${periodLabel.replace(/\s+/g, '-')}-${statusLabel}`;
  const pdfPeriod = buildTenantsReportPeriodContext(
    periodSelection,
    statusFilter === 'ALL' ? undefined : statusLabel,
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
            return (
              <TenantsReportPDF
                titleAr="تقرير إيجارات المستأجرين"
                subtitleAr={`${filteredTenants.length} مستأجر · ${periodLabel}${filterNote}`}
                rows={filteredTenants}
                period={pdfPeriod}
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
