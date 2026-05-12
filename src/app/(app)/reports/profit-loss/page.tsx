'use client';

import { Download, ArrowDownToLine, ArrowUpFromLine, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Stat } from '@/components/dashboard/stat';
import { EmptyState } from '@/components/data/empty-state';
import { DownloadPdfButton } from '@/features/pdf/download-button';

export default function ProfitLossPage() {
  // TODO: aggregate revenues vs expenses grouped by category for the period.
  const totalRevenue = 0;
  const totalExpense = 0;
  const profit = totalRevenue - totalExpense;
  const periodLabel = `السنة المالية ${new Date().getFullYear()}`;

  return (
    <>
      <PageHeader
        eyebrow="التقارير"
        title="قائمة الأرباح والخسائر"
        description="تحليل النتيجة المالية للسنة الجارية بشكل تفصيلي."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="stroke-[1.6]" />
              تصدير CSV
            </Button>
            <DownloadPdfButton
              fileName={`الأرباح-والخسائر-${new Date().getFullYear()}`}
              render={async () => {
                const { GenericReportPDF } = await import('@/features/pdf/GenericReportPDF');
                return (
                  <GenericReportPDF
                    title="قائمة الأرباح والخسائر"
                    periodLabel={periodLabel}
                    sections={[
                      {
                        title: 'الإيرادات',
                        rows: [],
                        total: { label: 'إجمالي الإيرادات', amount: totalRevenue },
                      },
                      {
                        title: 'المصروفات',
                        rows: [],
                        total: { label: 'إجمالي المصروفات', amount: totalExpense },
                      },
                    ]}
                    finalTotal={{ label: 'صافي الربح', amount: profit }}
                  />
                );
              }}
            />
          </>
        }
      />

      <div className="flex flex-col gap-6 px-5 py-7 md:px-8 md:py-10">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Stat label="إجمالي الإيرادات" value={0} currency="LYD" icon={ArrowDownToLine} hint="—" />
          <Stat label="إجمالي المصروفات" value={0} currency="LYD" icon={ArrowUpFromLine} hint="—" />
          <Stat label="صافي الربح" value={0} currency="LYD" icon={TrendingUp} hint="—" />
        </section>

        <EmptyState
          icon={TrendingUp}
          title="لا توجد بيانات لعرض الأرباح والخسائر"
          description="ستظهر قائمة الأرباح والخسائر هنا فور تسجيل أول إيراد أو مصروف. زر «طباعة PDF» متاح للمعاينة."
          action={{ label: 'تسجيل أول معاملة', href: '/revenues' }}
        />
      </div>
    </>
  );
}
