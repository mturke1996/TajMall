'use client';

import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useTenantRentSummary, type TenantRentSummary } from '@/lib/db/queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { TenantsDirectory } from '@/components/tenants/tenants-directory';
import { RecordRentPaymentDialog } from '@/components/tenants/record-rent-payment-dialog';

export default function TenantsPage() {
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
      <PageHeader
        eyebrow="إدارة المستأجرين"
        title="المحلات والإيجارات"
        description="متابعة التحصيل، تسجيل المدفوعات، وملف كل مستأجر"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TajMallPdfToolbar
              fileName={`إيجارات-المستأجرين-${new Date().toISOString().slice(0, 10)}`}
              disabled={filteredTenants.length === 0}
              className="max-md:w-full max-md:[&_button]:flex-1"
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
            <Button size="sm" className="hidden md:inline-flex" asChild>
              <Link href="/contacts?add=TENANT">
                <Plus className="h-4 w-4 ml-1" />
                إضافة مستأجر
              </Link>
            </Button>
          </div>
        }
      />

      <div className="px-4 py-4 sm:px-5 sm:py-6 md:px-8 md:py-8">
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
          onAddTenant={() => router.push('/contacts?add=TENANT')}
        />
      </div>

      <RecordRentPaymentDialog
        tenant={paymentTenant}
        open={!!paymentTenant}
        onOpenChange={(open) => !open && setPaymentTenant(null)}
      />
    </>
  );
}
