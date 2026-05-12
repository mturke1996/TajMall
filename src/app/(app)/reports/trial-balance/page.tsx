'use client';

import { FileBarChart, Download, Calendar } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/data/empty-state';
import { DownloadPdfButton } from '@/features/pdf/download-button';

export default function TrialBalancePage() {
  // TODO: aggregate JournalLine sums grouped by category for the period.
  const rows: Array<{
    category: string;
    debitTotals: number;
    creditTotals: number;
    debitBalance: number;
    creditBalance: number;
  }> = [];

  const periodLabel = `1 يناير - 31 ديسمبر ${new Date().getFullYear()}`;

  return (
    <>
      <PageHeader
        eyebrow="التقارير"
        title="ميزان المراجعة"
        description="ميزان مراجعة تجميعي بالمجاميع والأرصدة لكل حساب — يُحسب تلقائياً من القيود."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Calendar className="stroke-[1.6]" />
              السنة الحالية
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="stroke-[1.6]" />
              تصدير CSV
            </Button>
            <DownloadPdfButton
              fileName={`ميزان-المراجعة-${new Date().getFullYear()}`}
              render={async () => {
                const { TrialBalancePDF } = await import('@/features/pdf/TrialBalancePDF');
                return <TrialBalancePDF rows={rows} periodLabel={periodLabel} />;
              }}
            />
          </>
        }
      />

      <div className="flex flex-col gap-5 px-5 py-7 md:px-8 md:py-10">
        {rows.length === 0 ? (
          <EmptyState
            icon={FileBarChart}
            title="لا توجد بيانات لعرض ميزان المراجعة"
            description="ميزان المراجعة يُحسب تلقائياً من القيود المرحّلة في دفتر اليومية. ابدأ بتسجيل المعاملات وستظهر الأرصدة هنا. زر «طباعة PDF» متاح للمعاينة بأي وقت."
            action={{ label: 'الذهاب إلى دفتر اليومية', href: '/journals' }}
          />
        ) : null}
      </div>
    </>
  );
}
