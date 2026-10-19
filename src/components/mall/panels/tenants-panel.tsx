'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Plus } from 'lucide-react';
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
import { useTenantsView } from '@/stores/tenants-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
} from '@/lib/tenant-rent-period';
import { getStatusFilterLabel } from '@/components/tenants/tenant-status-config';

export function MallTenantsPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canWrite } = usePermission();
  // kept in a store, not state: opening a tenant unmounts this panel, and «رجوع» must find the list as it was
  const searchQuery = useTenantsView((s) => s.searchQuery);
  const setSearchQuery = useTenantsView((s) => s.setSearchQuery);
  const statusFilter = useTenantsView((s) => s.statusFilter);
  const setStatusFilter = useTenantsView((s) => s.setStatusFilter);
  const storedPeriod = useTenantsView((s) => s.periodSelection);
  const setPeriodSelection = useTenantsView((s) => s.setPeriodSelection);
  // memoised so monthKeys keeps its identity between renders
  const periodSelection = useMemo(
    () => storedPeriod ?? defaultTenantRentPeriodSelection(),
    [storedPeriod],
  );

  const monthKeys = useMemo(
    () => getPeriodMonthKeys(periodSelection),
    [periodSelection],
  );
  const isSingleMonth = periodSelection.mode === 'month';

  const singleMonthKey = isSingleMonth ? periodSelection.monthKey : null;
  const {
    data: singleData,
    isLoading: singleLoading,
    isError: singleQueryError,
  } = useTenantRentSummaryForMonth(singleMonthKey);
  const singleMonthTenants = useMemo(() => singleData ?? [], [singleData]);

  const {
    data: rowsByMonth,
    isLoading: periodLoading,
    isError: periodError,
  } = useTenantRentSummaryForPeriod(isSingleMonth ? [] : monthKeys);

  // an empty list after a failed request is not "no tenants": show the failure, never zeros
  const failed = isSingleMonth ? singleQueryError && singleData === undefined : periodError;

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
      const base = computeTenantPeriodStats(tenants);
      if (statusFilter === 'ALL') return base;
      // counts stay those of the whole list so the chips remain usable; only the money follows the filter
      const sub = computeTenantPeriodStats(filteredTenants);
      return { ...base, expectedTotal: sub.expectedTotal, collectedTotal: sub.collectedTotal };
    }

    const hasStatus = (id: string, status: string) =>
      (monthStatusesByTenant.get(id) ?? []).some((e) => e.status === status);

    const counts = {
      paid: tenants.filter((t) => hasStatus(t.id, 'paid_full')).length,
      partial: tenants.filter((t) => hasStatus(t.id, 'paid_partial')).length,
      unpaid: tenants.filter((t) => hasStatus(t.id, 'unpaid')).length,
      partialUnpaid: tenants.filter(
        (t) =>
          hasStatus(t.id, 'paid_partial') || hasStatus(t.id, 'unpaid'),
      ).length,
      noRentSet: tenants.filter((t) => hasStatus(t.id, 'no_rent_set')).length,
      exempt: tenants.filter((t) => hasStatus(t.id, 'exempt')).length,
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
  const statusLabel = getStatusFilterLabel(statusFilter);
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
          disabled={filteredTenants.length === 0 || isLoading || failed}
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
        <Button variant="outline" size="sm" asChild className="h-9 touch-manipulation">
          <Link href="/reports/tenant-statements">
            <FileSpreadsheet className="h-4 w-4 me-1" aria-hidden />
            كشوف الحساب
          </Link>
        </Button>
        <WriteGuard permission="document.create">
          <Button
            size="sm"
            className="hidden h-9 touch-manipulation md:inline-flex"
            onClick={() => router.push(peopleSegmentHref('TENANT', { add: 'TENANT' }))}
          >
            <Plus className="h-4 w-4 me-1" />
            إضافة مستأجر
          </Button>
        </WriteGuard>
      </MallPanelToolbar>

      {failed ? (
        <Card
          role="alert"
          className="flex flex-col items-center gap-3 border-danger-line bg-danger-soft p-8 text-center text-danger-ink"
        >
          <p className="text-[13px]">تعذّر تحميل بيانات المستأجرين. تحقق من الاتصال ثم أعد المحاولة.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void queryClient.invalidateQueries({ queryKey: ['tenant_rent_summary_for_month'] });
              }}
            >
              إعادة المحاولة
            </Button>
            {/* the period picker is part of the list that is not shown: without this a failing month would be a dead end */}
            {periodSelectionKey(periodSelection) !== periodSelectionKey(defaultTenantRentPeriodSelection()) && (
              <Button type="button" variant="outline" size="sm" onClick={() => setPeriodSelection(null)}>
                الشهر الحالي
              </Button>
            )}
          </div>
        </Card>
      ) : (
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
      )}
    </>
  );
}
