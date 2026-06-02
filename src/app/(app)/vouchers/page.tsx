'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Receipt } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/data/empty-state';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { VoucherPDF } from '@/features/pdf/VoucherPDF';
import type { VoucherPdfModel } from '@/features/pdf/VoucherPDF';
import { useDisbursementVouchers } from '@/lib/db/queries';
import { WriteGuard } from '@/components/auth/write-guard';
import { disbursementRowToPdfModel } from '@/lib/voucher-db';
import { useHighlightScroll, isHighlighted } from '@/lib/hooks/use-highlight-scroll';
import { cn } from '@/lib/utils';

function voucherHighlightDomId(id: string) {
  return `voucher-${id}`;
}

export default function VouchersPage() {
  const highlightId = useSearchParams().get('highlight');
  const { data: vouchers = [], isLoading, isError } = useDisbursementVouchers();

  useHighlightScroll(highlightId, voucherHighlightDomId, [vouchers.length]);

  const previewVoucher: VoucherPdfModel = {
    number: '0001',
    voucherDate: new Date().toISOString(),
    payee: 'المستفيد',
    method: 'نقدي',
    lines: [{ description: 'سطر بيان توضيحي', amount: 0 }],
    total: 0,
    notes: 'هذه معاينة لقالب إذن الصرف قبل حفظ إذن حقيقي.',
  };

  return (
    <>
      <PageHeader
        eyebrow="إذونات الصرف"
        title="إدارة إذونات الصرف"
        description="إنشاء إذن صرف وحفظه في قاعدة البيانات، ثم تصدير PDF أو طباعته."
        actions={
          <>
            <TajMallPdfToolbar
              fileName="إذن-صرف-معاينة"
              render={async () => <VoucherPDF voucher={previewVoucher} />}
            />
            <WriteGuard permission="voucher.create">
              <Button size="sm" className="gap-1.5" asChild>
                <Link href="/vouchers/new">
                  <Plus className="stroke-[1.6]" />
                  إذن جديد
                </Link>
              </Button>
            </WriteGuard>
          </>
        }
      />

      <div className="flex flex-col gap-6 px-5 py-7 md:px-8 md:py-10">
        {isLoading ? (
          <p className="text-sm text-ink-mute">جاري تحميل الإذونات…</p>
        ) : isError ? (
          <p className="text-sm text-red-600">
            تعذّر قراءة الإذونات. إذا كانت الترحيلات غير مطبّقة على المشروع، نفّذ ملف{' '}
            <code className="rounded bg-muted px-1 text-xs">009_disbursement_vouchers.sql</code>{' '}
            من مجلد ترحيلات Supabase.
          </p>
        ) : vouchers.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="لا توجد إذونات صرف بعد"
            description="أنشئ إذناً من «إذن جديد» واضغط «حفظ إذن الصرف» لتخزينه في قاعدة البيانات."
            action={{ label: 'إنشاء إذن صرف', href: '/vouchers/new' }}
          />
        ) : (
          <div className="space-y-3">
            {vouchers.map((row) => {
              const model = disbursementRowToPdfModel(row);
              const title = `إذن ${row.voucher_number} · ${row.voucher_date}`;
              return (
                <div
                  key={row.id}
                  id={voucherHighlightDomId(row.id)}
                  className={cn(
                    'flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm scroll-mt-24 sm:flex-row sm:items-center sm:justify-between',
                    isHighlighted(highlightId, row.id) && 'ring-2 ring-sage-600 shadow-md',
                  )}
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold text-ink">{title}</p>
                    <p className="truncate text-sm text-ink-mute">المستفيد: {row.payee}</p>
                    <p className="text-sm tabular-nums text-ink">
                      الإجمالي:{' '}
                      {new Intl.NumberFormat('en-US').format(Number(row.total_amount))} د.ل
                    </p>
                  </div>
                  <TajMallPdfToolbar
                    className="sm:shrink-0"
                    fileName={`إذن-صرف-${row.voucher_number}-${row.voucher_date}`}
                    render={async () => <VoucherPDF voucher={model} />}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
