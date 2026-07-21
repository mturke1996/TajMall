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
  applyMatchingMonthDetailsToTenants,
  buildSingleMonthMatchingDetails,
  buildTenantMatchingMonthDetails,
  buildTenantsReportPeriodContext,
  collectTenantMonthStatuses,
  computeTenantPeriodStats,
  defaultTenantRentPeriodSelection,
  filterTenantsByStatusAndSearch,
  formatPeriodLabelAr,
  getPeriodMonthKeys,
  periodSelectionKey,
  sumMatchingMonthDetails,
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
    return aggregateTenantSummariesForPeriod(rowsByMonth, monthKeys);
  }, [isSingleMonth, singleMonthTenants, rowsByMonth, monthKeys]);

  const isLoading =
    isSingleMonth ? singleLoading : periodLoading && tenants.length === 0;

  const monthStatusesByTenant = useMemo(() => {
    if (isSingleMonth) return undefined;
    return collectTenantMonthStatuses(rowsByMonth ?? new Map(), monthKeys);
  }, [isSingleMonth, rowsByMonth, monthKeys]);

  const baseFiltered = useMemo(
    () =>
      filterTenantsByStatusAndSearch(
        tenants,
        statusFilter,
        searchQuery,
        monthStatusesByTenant,
      ),
    [tenants, statusFilter, searchQuery, monthStatusesByTenant],
  );

  const matchingDetails = useMemo(() => {
    if (isSingleMonth && singleMonthKey) {
      return buildSingleMonthMatchingDetails(baseFiltered, singleMonthKey);
    }
    return buildTenantMatchingMonthDetails(
      baseFiltered.map((t) => t.id),
      rowsByMonth ?? new Map(),
      monthKeys,
      statusFilter,
    );
  }, [
    isSingleMonth,
    singleMonthKey,
    statusFilter,
    baseFiltered,
    rowsByMonth,
    monthKeys,
  ]);

  const filteredTenants = useMemo(() => {
    // إعادة حساب المبالغ فقط عند فلتر حالة على فترة متعددة
    if (isSingleMonth || statusFilter === 'ALL') return baseFiltered;
    return applyMatchingMonthDetailsToTenants(
      baseFiltered,
      matchingDetails,
      statusFilter,
    );
  }, [isSingleMonth, statusFilter, baseFiltered, matchingDetails]);

  const matchingMonthNumbersByTenantId = useMemo(() => {
    const out: Record<string, number[]> = {};
    for (const [id, d] of Object.entries(matchingDetails)) {
      out[id] = d.months;
    }
    return out;
  }, [matchingDetails]);

  const stats = useMemo(() => {
    if (!monthStatusesByTenant) {
      return computeTenantPeriodStats(
        statusFilter === 'ALL' ? tenants : filteredTenants,
      );
    }

    const counts = {
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

    if (statusFilter !== 'ALL') {
      const sums = sumMatchingMonthDetails(matchingDetails);
      return {
        total: tenants.length,
        ...counts,
        expectedTotal: sums.expected,
        collectedTotal: sums.paid,
      };
    }

    const all = computeTenantPeriodStats(tenants);
    return { ...all, ...counts, total: tenants.length };
  }, [
    tenants,
    filteredTenants,
    monthStatusesByTenant,
    statusFilter,
    matchingDetails,
  ]);

  const periodLabel = formatPeriodLabelAr(periodSelection);
  const statusLabel =
    statusFilter === 'ALL'
      ? 'الكل'
      : getTenantStatus(statusFilter).shortLabel;
  /** كل التقارير تعرض أرقام الشهور (1، 2، 3…) مع القيم */
  const showMonthNumbersInPdf = true;
  const pdfCacheKey = `${periodSelectionKey(periodSelection)}:${statusFilter}:${searchQuery.trim()}:months`;
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
            return (
              <TenantsReportPDF
                titleAr="تقرير إيجارات المستأجرين"
                subtitleAr={`${filteredTenants.length} مستأجر · ${periodLabel}${filterNote}`}
                rows={filteredTenants}
                period={pdfPeriod}
                monthNumbersByTenantId={matchingMonthNumbersByTenantId}
                matchingDetailsByTenantId={matchingDetails}
              />
            );
          }}
        />
        <WriteGuard permission="journal.create">
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
        matchingMonthsByTenantId={matchingMonthNumbersByTenantId}
        onAddTenant={
          canWrite
            ? () => router.push(peopleSegmentHref('TENANT', { add: 'TENANT' }))
            : undefined
        }
      />
    </>
  );
}
