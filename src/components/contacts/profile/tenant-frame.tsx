'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Banknote, Edit2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { MobilePageActionBar, MOBILE_PAGE_ACTION_PADDING } from '@/components/layout/mobile-page-action-bar';
import { Button } from '@/components/ui/button';
import { KIND_OPTIONS } from '@/components/contacts/contact-form-dialog';
import { RecordRentPaymentDialog } from '@/components/tenants/record-rent-payment-dialog';
import { TenantContactDetail } from '@/components/tenants/tenant-contact-detail';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { getCountedContactTransactions } from '@/lib/contacts/contact-transactions';
import { canCreateContactTransaction } from '@/lib/contacts/form-utils';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import type { TenantRentSummary } from '@/lib/db/queries';
import type { ContactRow, TransactionWithRelations } from '@/lib/db/types';
import { contactBackHref } from '@/lib/mall/routes';
import { usePermission } from '@/lib/supabase/use-permission';
import { cn, todayISODate } from '@/lib/utils';

/**
 * A tenant's page as it always was: the rent calendar, statement, charges and payments. Only the rows that
 * count (posted and reconciled) are tallied in the payments tab.
 */
export function TenantFrame({
  contact,
  rent,
  rentSummary,
  transactions,
  txLoading,
  journalEntries,
  jeLoading,
  initialTab,
  onEdit,
}: {
  contact: ContactRow;
  /** the stored summary, or null when the tenant has none yet */
  rent: TenantRentSummary | null;
  /** the summary the page works from (the stored one, else one built from the contact) */
  rentSummary: TenantRentSummary;
  transactions: TransactionWithRelations[];
  txLoading: boolean;
  journalEntries: JournalEntryRow[];
  jeLoading: boolean;
  initialTab: string | null;
  /** absent for people who may not edit the file */
  onEdit?: () => void;
}) {
  const { can } = usePermission();
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [payMonths, setPayMonths] = useState<string[] | undefined>(undefined);

  const rentPaymentsCount = useMemo(
    () => getCountedContactTransactions(transactions).filter((t) => t.kind === 'REVENUE').length,
    [transactions],
  );

  // collecting rent posts revenue: same rule as any new transaction (active file, revenue permission)
  const canRecordRent = canCreateContactTransaction(contact.is_active, can('revenue.create'));
  const monthlyRent = Number(contact.monthly_rent) || 0;
  const kindInfo = KIND_OPTIONS.find((k) => k.value === contact.kind);
  const pdfFileName = `ملف-${contact.name}-${todayISODate()}`;
  const backHref = contactBackHref(contact.kind);

  function openCollect(months?: string[]) {
    setPayMonths(months);
    setIsPayOpen(true);
  }

  async function renderContactPdf() {
    const { ContactDossierPDF } = await import('@/features/pdf/ContactDossierPDF');
    return <ContactDossierPDF contact={contact} rent={rent} transactions={transactions} />;
  }

  return (
    <>
      <PageHeader
        eyebrow={kindInfo?.label ?? 'جهة تعامل'}
        title={contact.name}
        titleClassName="text-[17px] sm:text-[18px]"
        description={
          contact.shop_number
            ? `محل ${contact.shop_number}${contact.floor ? ` · الطابق ${contact.floor}` : ''}`
            : contact.code
              ? `الرمز: ${contact.code}`
              : undefined
        }
        actions={
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button variant="outline" size="sm" className="h-10 touch-manipulation" asChild>
              <Link href={backHref}>
                <ArrowRight className="h-4 w-4 me-1" />
                رجوع
              </Link>
            </Button>
            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <TajMallPdfToolbar fileName={pdfFileName} render={renderContactPdf} />
              {onEdit && (
                <Button size="sm" variant="outline" onClick={onEdit}>
                  <Edit2 className="h-4 w-4 me-1" />
                  تعديل
                </Button>
              )}
              {canRecordRent && (
                <Button size="sm" onClick={() => openCollect()}>
                  <Banknote className="h-4 w-4 me-1" />
                  تحصيل إيجار
                </Button>
              )}
            </div>
          </div>
        }
      />

      <div className={cn('flex flex-col gap-5 px-4 py-4 sm:gap-6 sm:px-5 sm:py-6 md:px-8 md:py-7', MOBILE_PAGE_ACTION_PADDING)}>
        {!contact.is_active && (
          <div role="status" className="rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning-ink">
            هذا الملف غير نشط. تظل بياناته وحركاته السابقة متاحة، لكن لا يمكن بدء معاملة جديدة قبل إعادة تفعيله من تعديل الملف.
          </div>
        )}
        <TenantContactDetail
          contact={contact}
          rent={rentSummary}
          tenantId={contact.id}
          monthlyRent={monthlyRent}
          transactions={transactions}
          txLoading={txLoading}
          journalEntries={journalEntries}
          jeLoading={jeLoading}
          rentPaymentsCount={rentPaymentsCount}
          onEdit={onEdit}
          onCollect={canRecordRent ? openCollect : undefined}
          initialTab={initialTab}
        />
      </div>

      <RecordRentPaymentDialog tenant={rentSummary} open={isPayOpen} onOpenChange={setIsPayOpen} initialMonths={payMonths} />

      <MobilePageActionBar>
        <div className="flex gap-2">
          {canRecordRent && (
            <Button className="h-11 flex-2 gap-1.5 touch-manipulation" onClick={() => openCollect()}>
              <Banknote className="h-4 w-4" />
              تحصيل إيجار
            </Button>
          )}
          <TajMallPdfToolbar
            fileName={pdfFileName}
            render={renderContactPdf}
            showDownload={false}
            className="min-w-0 flex-1 [&>button]:h-11 [&>button]:w-full [&>button]:flex-1 [&>button]:px-2 [&>button]:text-[13px]"
          />
          {onEdit && (
            <Button variant="outline" className="h-11 flex-1 gap-1.5 touch-manipulation" onClick={onEdit}>
              <Edit2 className="h-4 w-4" />
              تعديل
            </Button>
          )}
        </div>
      </MobilePageActionBar>
    </>
  );
}
