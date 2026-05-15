'use client';

import Link from 'next/link';
import { Plus, Receipt } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/data/empty-state';
import { FluxenPdfToolbar } from '@/features/pdf/fluxen-pdf-toolbar';
import type { VoucherPdfModel } from '@/features/pdf/VoucherPDF';

export default function VouchersPage() {
  // TODO: load Voucher[] via Prisma with line aggregates.
  const vouchers: VoucherPdfModel[] = [];

  // Preview voucher: a single empty template so users can see the PDF design.
  const previewVoucher: VoucherPdfModel = {
    number: '0001',
    voucherDate: new Date().toISOString(),
    payee: 'المستفيد',
    method: 'نقدي',
    lines: [
      { description: 'سطر بيان توضيحي', amount: 0 },
    ],
    total: 0,
    notes: 'هذه معاينة لقالب إذن الصرف قبل ربط البيانات الفعلية.',
  };

  return (
    <>
      <PageHeader
        eyebrow="إذونات الصرف"
        title="إدارة إذونات الصرف"
        description="إصدار، اعتماد وترحيل إذونات صرف المبالغ النقدية والمصرفية."
        actions={
          <>
            <FluxenPdfToolbar
              fileName="إذن-صرف-معاينة"
              render={async () => {
                const { VoucherPDF } = await import('@/features/pdf/VoucherPDF');
                return <VoucherPDF voucher={previewVoucher} />;
              }}
            />
            <Button size="sm" className="gap-1.5" asChild>
              <Link href="/vouchers/new">
                <Plus className="stroke-[1.6]" />
                إذن جديد
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-6 px-5 py-7 md:px-8 md:py-10">
        {vouchers.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="لا توجد إذونات صرف بعد"
            description="إذن الصرف يحدّد المستفيد، المصرف، نوع السداد وقيمة المبالغ الفرعية. يمر بمراحل المسودة والاعتماد والترحيل. استخدم «عرض PDF» أو «تحميل» لمعاينة قالب الإذن."
            action={{ label: 'إنشاء إذن صرف', href: '/vouchers/new' }}
          />
        ) : null}
      </div>
    </>
  );
}
