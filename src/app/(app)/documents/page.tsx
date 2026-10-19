'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Mail,
  Receipt,
  FileSpreadsheet,
  ArrowDownToLine,
  Stamp,
  Plus,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { dqk } from '@/lib/db/document-queries';
import { qk } from '@/lib/db/queries';

type DocCard = {
  href: string;
  newHref?: string;
  titleAr: string;
  description: string;
  icon: typeof FileText;
  count?: number;
};

/**
 * Row count only. This page is a menu, so it must not download the letters, receipts, vouchers and
 * charges (with their lines and joins) just to show a number. The keys sit under each list's own
 * key, so saving or deleting a document refreshes its count.
 */
function useDocumentCount(queryKey: readonly unknown[], table: string, letterType?: 'official' | 'routine') {
  return useQuery<number>({
    queryKey,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase.from(table).select('id', { count: 'exact', head: true });
      if (letterType) q = q.eq('letter_type', letterType);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export default function DocumentsHubPage() {
  // undefined while loading (or failed), so the row shows no number instead of a false 0
  const officialCount = useDocumentCount([...dqk.correspondence, 'count', 'official'], 'correspondence_letters', 'official').data;
  const routineCount = useDocumentCount([...dqk.correspondence, 'count', 'routine'], 'correspondence_letters', 'routine').data;
  const receiptCount = useDocumentCount([...dqk.receiptVouchers, 'count'], 'receipt_vouchers').data;
  const voucherCount = useDocumentCount([...qk.disbursementVouchers, 'count'], 'disbursement_vouchers').data;
  // under the 'tenant_charges' root, which invalidateMoneyQueries refreshes after charge and payment changes
  const chargeCount = useDocumentCount(['tenant_charges', 'count'], 'tenant_charges').data;

  const cards: DocCard[] = [
    {
      href: '/documents/correspondence?type=official',
      newHref: '/documents/correspondence/new?type=official',
      titleAr: 'المراسلات الرسمية',
      description: 'خطابات رسمية بالختم والتوقيع للجهات والمؤسسات',
      icon: Stamp,
      count: officialCount,
    },
    {
      href: '/documents/correspondence?type=routine',
      newHref: '/documents/correspondence/new?type=routine',
      titleAr: 'المراسلات الاعتيادية',
      description: 'مراسلات داخلية وخارجية غير رسمية',
      icon: Mail,
      count: routineCount,
    },
    {
      href: '/documents/invoices',
      titleAr: 'الفواتير والمطالبات',
      description: 'فواتير إيجار ورسوم المستأجرين — تصدير PDF',
      icon: FileSpreadsheet,
      count: chargeCount,
    },
    {
      href: '/documents/receipts',
      newHref: '/documents/receipts/new',
      titleAr: 'إيصالات القبض',
      description: 'إثبات استلام مبالغ نقدية أو تحويل',
      icon: Receipt,
      count: receiptCount,
    },
    {
      href: '/vouchers',
      newHref: '/vouchers/new',
      titleAr: 'إذونات الصرف',
      description: 'إذن صرف معتمد — مرتبط بالخزائن والمحاسبة',
      icon: ArrowDownToLine,
      count: voucherCount,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="الوثائق والمراسلات"
        title="مركز الوثائق"
        description="المراسلات والفواتير وإيصالات القبض وإذونات الصرف، وطباعتها PDF."
      />

      <AccountingPageBody>
        <ul className="surface mx-auto w-full max-w-3xl divide-y divide-border overflow-hidden">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <li key={card.href} className="flex items-center gap-3 px-4 py-3.5">
                <Icon className="h-5 w-5 shrink-0 text-ink-mute" aria-hidden />
                <Link href={card.href} className="min-w-0 flex-1 rounded-md focus-visible:outline-2 focus-visible:outline-ring">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[14px] font-medium text-foreground hover:underline">{card.titleAr}</span>
                    {typeof card.count === 'number' && <span className="text-[12.5px] tabular-nums text-ink-mute">{card.count}</span>}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-ink-mute">{card.description}</span>
                </Link>
                {card.newHref && (
                  <Button asChild variant="outline" size="sm" className="h-8 shrink-0 gap-1 text-[12.5px] touch-manipulation">
                    <Link href={card.newHref}>
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                      جديد
                    </Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </AccountingPageBody>
    </>
  );
}
