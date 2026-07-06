'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Receipt, Send, Check, X, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/data/empty-state';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { VoucherPDF } from '@/features/pdf/VoucherPDF';
import type { VoucherPdfModel } from '@/features/pdf/VoucherPDF';
import {
  useDisbursementVouchers,
  useSubmitVoucherForApproval,
  useDecideVoucherApproval,
} from '@/lib/db/queries';
import type { VoucherApprovalStatus } from '@/lib/db/types';
import { WriteGuard } from '@/components/auth/write-guard';
import { usePermission } from '@/lib/supabase/use-permission';
import { disbursementRowToPdfModel } from '@/lib/voucher-db';
import { useHighlightScroll, isHighlighted } from '@/lib/hooks/use-highlight-scroll';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STATUS_LABEL: Record<VoucherApprovalStatus, string> = {
  DRAFT: 'مسودة',
  PENDING_APPROVAL: 'بانتظار الاعتماد',
  APPROVED: 'معتمَد',
  REJECTED: 'مرفوض',
};

const STATUS_BADGE_VARIANT: Record<VoucherApprovalStatus, 'neutral' | 'warning' | 'success' | 'danger'> = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

function voucherHighlightDomId(id: string) {
  return `voucher-${id}`;
}

export default function VouchersPage() {
  const highlightId = useSearchParams().get('highlight');
  const { data: vouchers = [], isLoading, isError } = useDisbursementVouchers();
  const { can } = usePermission();
  const canApprove = can('voucher.approve');
  const submitForApproval = useSubmitVoucherForApproval();
  const decideApproval = useDecideVoucherApproval();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useHighlightScroll(highlightId, voucherHighlightDomId, [vouchers.length]);

  function handleSubmit(id: string) {
    submitForApproval.mutate(id, {
      onSuccess: () => toast.success('تم إرسال الإذن للاعتماد'),
      onError: (e) =>
        toast.error('تعذّر الإرسال للاعتماد', {
          description: e instanceof Error ? e.message : undefined,
        }),
    });
  }

  function handleApprove(id: string) {
    decideApproval.mutate(
      { voucherId: id, approve: true },
      {
        onSuccess: () => toast.success('تمت الموافقة على الإذن'),
        onError: (e) =>
          toast.error('تعذّر الاعتماد', { description: e instanceof Error ? e.message : undefined }),
      },
    );
  }

  function confirmReject() {
    if (!rejectId) return;
    decideApproval.mutate(
      { voucherId: rejectId, approve: false, reason: rejectReason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('تم رفض الإذن');
          setRejectId(null);
          setRejectReason('');
        },
        onError: (e) =>
          toast.error('تعذّر الرفض', { description: e instanceof Error ? e.message : undefined }),
      },
    );
  }

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
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{title}</p>
                      <Badge variant={STATUS_BADGE_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                    </div>
                    <p className="truncate text-sm text-ink-mute">المستفيد: {row.payee}</p>
                    <p className="text-sm tabular-nums text-ink">
                      الإجمالي:{' '}
                      {new Intl.NumberFormat('en-US').format(Number(row.total_amount))} د.ل
                    </p>
                    {row.status === 'REJECTED' && row.rejection_reason && (
                      <p className="text-xs text-pastel-redInk">سبب الرفض: {row.rejection_reason}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {row.status === 'DRAFT' && (
                      <WriteGuard permission="voucher.create">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={submitForApproval.isPending}
                          onClick={() => handleSubmit(row.id)}
                        >
                          {submitForApproval.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          إرسال للاعتماد
                        </Button>
                      </WriteGuard>
                    )}
                    {row.status === 'PENDING_APPROVAL' && canApprove && (
                      <>
                        <Button
                          size="sm"
                          className="gap-1.5 bg-emerald-700 hover:bg-emerald-800"
                          disabled={decideApproval.isPending}
                          onClick={() => handleApprove(row.id)}
                        >
                          <Check className="h-3.5 w-3.5" />
                          اعتماد
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-rose-700 hover:bg-rose-50"
                          disabled={decideApproval.isPending}
                          onClick={() => setRejectId(row.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                          رفض
                        </Button>
                      </>
                    )}
                    <TajMallPdfToolbar
                      fileName={`إذن-صرف-${row.voucher_number}-${row.voucher_date}`}
                      render={async () => <VoucherPDF voucher={model} />}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={rejectId !== null} onOpenChange={(open) => !open && setRejectId(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>رفض إذن الصرف</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="reject-reason">سبب الرفض (اختياري)</Label>
            <Input
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="مثال: بيانات المستفيد غير مكتملة"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRejectId(null)}>
              إلغاء
            </Button>
            <Button
              className="bg-rose-700 hover:bg-rose-800"
              disabled={decideApproval.isPending}
              onClick={confirmReject}
            >
              {decideApproval.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تأكيد الرفض'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
