'use client';

import { Download, ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Stat } from '@/components/dashboard/stat';
import { EmptyState } from '@/components/data/empty-state';
import { DownloadPdfButton } from '@/features/pdf/download-button';

export default function CashFlowPage() {
  // TODO: aggregate inflows/outflows per cashbox per month.
  const totalInflow = 0;
  const totalOutflow = 0;
  const net = totalInflow - totalOutflow;
  const periodLabel = `السنة المالية ${new Date().getFullYear()}`;

  return (
    <>
      <PageHeader
        eyebrow="التقارير"
        title="التدفقات النقدية"
        description="تدفقات الداخل والخارج لكل شهر، مع إجمالي صافي السنة."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="stroke-[1.6]" />
              تصدير CSV
            </Button>
            <DownloadPdfButton
              fileName={`التدفقات-النقدية-${new Date().getFullYear()}`}
              render={async () => {
                const { GenericReportPDF } = await import('@/features/pdf/GenericReportPDF');
                return (
                  <GenericReportPDF
                    title="التدفقات النقدية"
                    periodLabel={periodLabel}
                    sections={[
                      {
                        title: 'التدفقات الواردة',
                        rows: [],
                        total: { label: 'إجمالي الواردات', amount: totalInflow },
                      },
                      {
                        title: 'التدفقات الصادرة',
                        rows: [],
                        total: { label: 'إجمالي الصادرات', amount: totalOutflow },
                      },
                    ]}
                    finalTotal={{ label: 'صافي التدفق', amount: net }}
                  />
                );
              }}
            />
          </>
        }
      />

      <div className="flex flex-col gap-6 px-5 py-7 md:px-8 md:py-10">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Stat label="إجمالي الداخل" value={0} currency="LYD" icon={ArrowDownLeft} hint="—" />
          <Stat label="إجمالي الخارج" value={0} currency="LYD" icon={ArrowUpRight} hint="—" />
          <Stat label="صافي التدفق" value={0} currency="LYD" icon={Wallet} hint="—" />
        </section>

        <EmptyState
          icon={Wallet}
          title="لا توجد حركة نقدية بعد"
          description="ستُعرض التدفقات الشهرية وكشوف حركة الخزائن هنا بمجرد تسجيل المعاملات. زر «طباعة PDF» متاح للمعاينة."
          action={{ label: 'إضافة خزينة', href: '/cashboxes' }}
        />
      </div>
    </>
  );
}
