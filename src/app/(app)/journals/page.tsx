'use client';

import { Plus, BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/data/empty-state';
import { DownloadPdfButton } from '@/features/pdf/download-button';
import type { JournalEntryPdfModel } from '@/features/pdf/JournalPDF';

export default function JournalsPage() {
  // TODO: load JournalEntry[] with their balanced lines via Prisma.
  const entries: JournalEntryPdfModel[] = [];
  const periodLabel = `السنة المالية ${new Date().getFullYear()}`;

  return (
    <>
      <PageHeader
        eyebrow="دفتر اليومية"
        title="القيود المحاسبية"
        description="قيود مزدوجة بنظام المدين والدائن، قابلة للترحيل والعكس."
        actions={
          <>
            <DownloadPdfButton
              variant="outline"
              fileName={`دفتر-اليومية-${new Date().getFullYear()}`}
              render={async () => {
                const { JournalPDF } = await import('@/features/pdf/JournalPDF');
                return <JournalPDF entries={entries} periodLabel={periodLabel} />;
              }}
            >
              طباعة الدفتر
            </DownloadPdfButton>
            <Button size="sm" className="gap-1.5">
              <Plus className="stroke-[1.6]" />
              قيد جديد
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-6 px-5 py-7 md:px-8 md:py-10">
        {entries.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="لا توجد قيود محاسبية بعد"
            description="القيود تُنشأ تلقائياً عند تسجيل الإيرادات والمصروفات، ويمكنك أيضاً إنشاء قيود يدوية متوازنة. زر «طباعة الدفتر» سيُصدر تقرير PDF بكل القيود المرحّلة."
            action={{ label: 'إنشاء قيد جديد', href: '/journals/new' }}
          />
        ) : null}
      </div>
    </>
  );
}
