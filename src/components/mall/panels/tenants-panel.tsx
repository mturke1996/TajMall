'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useTenantRentSummary, type TenantRentSummary } from '@/lib/db/queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { TenantsDirectory } from '@/components/tenants/tenants-directory';
import { RecordRentPaymentDialog } from '@/components/tenants/record-rent-payment-dialog';
import { MallPanelToolbar } from '@/components/mall/panel-toolbar';
import { mallTabHref, peopleSegmentHref } from '@/lib/mall/routes';
import { Button } from '@/components/ui/button';

export function MallTenantsPanel() {
  const router = useRouter();
  const { data: tenants = [], isLoading } = useTenantRentSummary();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [paymentTenant, setPaymentTenant] = useState<TenantRentSummary | null>(null);

  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      if (statusFilter !== 'ALL' && t.current_month_status !== statusFilter) return false;
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
    const expectedTotal = tenants.reduce((sum, t) => sum + (Number(t.monthly_rent) || 0), 0);
    const collectedTotal = tenants.reduce((sum, t) => sum + Number(t.current_month_paid), 0);
    return {
      total: tenants.length,
      paid: tenants.filter((t) => t.current_month_status === 'paid_full').length,
      partial: tenants.filter((t) => t.current_month_status === 'paid_partial').length,
      unpaid: tenants.filter((t) => t.current_month_status === 'unpaid').length,
      expectedTotal,
      collectedTotal,
    };
  }, [tenants]);

  return (
    <>
      <MallPanelToolbar className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <TajMallPdfToolbar
          fileName={`إيجارات-المستأجرين-${new Date().toISOString().slice(0, 10)}`}
          disabled={filteredTenants.length === 0}
          className="w-full [&>button]:flex-1 sm:w-auto sm:[&>button]:flex-none"
          render={async () => {
            const { TenantsReportPDF } = await import('@/features/pdf/TenantsReportPDF');
            return (
              <TenantsReportPDF
                titleAr="تقرير إيجارات المستأجرين"
                subtitleAr={`${filteredTenants.length} مستأجر`}
                rows={filteredTenants}
              />
            );
          }}
        />
        <Button
          size="sm"
          className="h-11 w-full sm:w-auto touch-manipulation"
          onClick={() => router.push(peopleSegmentHref('TENANT', { add: 'TENANT' }))}
        >
          <Plus className="h-4 w-4 ml-1" />
          إضافة مستأجر
        </Button>
      </MallPanelToolbar>

      <TenantsDirectory
        tenants={tenants}
        filteredTenants={filteredTenants}
        isLoading={isLoading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        stats={stats}
        onRecordPayment={setPaymentTenant}
        onAddTenant={() => router.push(peopleSegmentHref('TENANT', { add: 'TENANT' }))}
      />

      <RecordRentPaymentDialog
        tenant={paymentTenant}
        open={!!paymentTenant}
        onOpenChange={(open) => !open && setPaymentTenant(null)}
      />
    </>
  );
}
