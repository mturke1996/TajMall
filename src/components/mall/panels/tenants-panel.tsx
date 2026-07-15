'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useTenantRentSummaryForMonth } from '@/lib/db/queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { TenantsDirectory } from '@/components/tenants/tenants-directory';
import { WriteGuard } from '@/components/auth/write-guard';
import { usePermission } from '@/lib/supabase/use-permission';
import { MallPanelToolbar } from '@/components/mall/panel-toolbar';
import { peopleSegmentHref } from '@/lib/mall/routes';
import { Button } from '@/components/ui/button';
import { currentMonthKey, currentYear } from '@/lib/rent-months';

export function MallTenantsPanel() {
  const router = useRouter();
  const { canWrite } = usePermission();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => currentMonthKey());
  const year = currentYear();

  const { data: tenants = [], isLoading } =
    useTenantRentSummaryForMonth(selectedMonthKey);

  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      if (statusFilter !== 'ALL' && t.current_month_status !== statusFilter) {
        return false;
      }
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.shop_number?.toLowerCase().includes(q) ||
        t.phone?.toLowerCase().includes(q)
      );
    });
  }, [tenants, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    const expectedTotal = tenants.reduce(
      (sum, t) =>
        sum + (Number(t.current_month_amount) || Number(t.monthly_rent) || 0),
      0,
    );
    const collectedTotal = tenants.reduce(
      (sum, t) => sum + Number(t.current_month_paid),
      0,
    );
    return {
      total: tenants.length,
      paid: tenants.filter((t) => t.current_month_status === 'paid_full').length,
      partial: tenants.filter((t) => t.current_month_status === 'paid_partial')
        .length,
      unpaid: tenants.filter((t) => t.current_month_status === 'unpaid').length,
      expectedTotal,
      collectedTotal,
    };
  }, [tenants]);

  return (
    <>
      <MallPanelToolbar className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <TajMallPdfToolbar
          fileName={`إيجارات-المستأجرين-${selectedMonthKey}`}
          disabled={filteredTenants.length === 0}
          className="w-full [&>button]:flex-1 sm:w-auto sm:[&>button]:flex-none"
          render={async () => {
            const { TenantsReportPDF } = await import('@/features/pdf/TenantsReportPDF');
            return (
              <TenantsReportPDF
                titleAr="تقرير إيجارات المستأجرين"
                subtitleAr={`${filteredTenants.length} مستأجر · ${selectedMonthKey}`}
                rows={filteredTenants}
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
        selectedMonthKey={selectedMonthKey}
        onSelectedMonthChange={setSelectedMonthKey}
        year={year}
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
