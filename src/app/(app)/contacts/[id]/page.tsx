'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  Briefcase,
  User,
  Store,
  Loader2,
  Edit2,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import {
  MobilePageActionBar,
  MOBILE_PAGE_ACTION_PADDING,
} from '@/components/layout/mobile-page-action-bar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/data/empty-state';
import {
  useContact,
  useContactTransactions,
  useTenantRentForContact,
  useUpdateContact,
} from '@/lib/db/queries';
import { useJournalEntries } from '@/lib/db/journal-queries';
import { cn } from '@/lib/utils';
import type { ContactKind } from '@/lib/db/types';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import {
  ContactFormDialog,
  KIND_OPTIONS,
} from '@/components/contacts/contact-form-dialog';
import {
  buildContactPayload,
  contactToFormState,
  defaultContactFormState,
  formatContactSaveError,
  type ContactFormState,
} from '@/lib/contacts/form-utils';
import { toast } from 'sonner';
import { RecordRentPaymentDialog } from '@/components/tenants/record-rent-payment-dialog';
import { contactBackHref } from '@/lib/mall/routes';
import { TenantContactDetail } from '@/components/tenants/tenant-contact-detail';
import { OtherContactDetailBody } from '@/components/contacts/other-contact-detail-body';
import { fallbackTenantRentFromContact } from '@/lib/tenant-rent-fallback';

const KIND_ICON: Record<ContactKind, typeof Building2> = {
  TENANT: Building2,
  EMPLOYEE: Briefcase,
  CUSTOMER: User,
  VENDOR: Store,
  OTHER: User,
};

export default function ContactDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';

  const { data: contact, isLoading, isError } = useContact(id);
  const { data: transactions = [], isLoading: txLoading } = useContactTransactions(id);
  const { data: rent } = useTenantRentForContact(id);
  const { data: journalEntries = [], isLoading: jeLoading } = useJournalEntries({
    contactId: id,
    status: 'ALL',
  });
  const updateContact = useUpdateContact();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [formData, setFormData] = useState<ContactFormState>(defaultContactFormState());

  const rentPaymentsCount = useMemo(
    () => transactions.filter((t) => t.kind === 'REVENUE').length,
    [transactions],
  );

  const rentSummary = useMemo(() => {
    if (!contact || contact.kind !== 'TENANT') return null;
    return rent ?? fallbackTenantRentFromContact(contact);
  }, [contact, rent]);

  const totals = useMemo(() => {
    const revenue = transactions
      .filter((t) => t.kind === 'REVENUE')
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const expense = transactions
      .filter((t) => t.kind === 'EXPENSE')
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    return { revenue, expense, net: revenue - expense };
  }, [transactions]);

  function openEdit() {
    if (!contact) return;
    setFormData(contactToFormState(contact));
    setIsEditOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name?.trim()) {
      toast.error('أدخل الاسم');
      return;
    }
    try {
      await updateContact.mutateAsync({
        id,
        ...buildContactPayload(formData),
      });
      toast.success('تم التحديث');
      setIsEditOpen(false);
    } catch (err) {
      console.error('[contacts] update failed', err);
      toast.error(formatContactSaveError(err));
    }
  }

  if (!id) {
    return (
      <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-8 md:py-7">
        <EmptyState
          icon={AlertTriangle}
          title="رابط غير صالح"
          description="لا يمكن عرض هذا السجل بسبب رابط ناقص أو غير صحيح."
          action={{ label: 'العودة', href: contactBackHref('CUSTOMER') }}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center gap-2 text-ink-mute">
        <Loader2 className="h-5 w-5 animate-spin" />
        جارٍ التحميل…
      </div>
    );
  }

  if (isError || !contact) {
    return (
      <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-8 md:py-7">
        <EmptyState
          icon={AlertTriangle}
          title="لم يُعثر على السجل"
          description="قد يكون هذا السجل قد حُذف أو ليس لديك صلاحية الوصول إليه."
          action={{ label: 'العودة', href: contactBackHref('CUSTOMER') }}
        />
      </div>
    );
  }

  const kindInfo = KIND_OPTIONS.find((k) => k.value === contact.kind);
  const Icon = KIND_ICON[contact.kind] ?? User;
  const isTenant = contact.kind === 'TENANT';
  const monthlyRent = Number(contact.monthly_rent) || 0;
  const canRecordRent = isTenant && monthlyRent > 0 && !!rentSummary;
  const contactRecord = contact;
  const pdfFileName = `ملف-${contactRecord.name}-${new Date().toISOString().slice(0, 10)}`;

  async function renderContactPdf() {
    const { ContactDossierPDF } = await import('@/features/pdf/ContactDossierPDF');
    return (
      <ContactDossierPDF
        contact={contactRecord}
        rent={rent ?? null}
        transactions={transactions}
      />
    );
  }

  const backHref = contactBackHref(contact.kind);

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
                <ArrowRight className="h-4 w-4 ml-1" />
                رجوع
              </Link>
            </Button>
            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <TajMallPdfToolbar fileName={pdfFileName} render={renderContactPdf} />
              {canRecordRent && (
                <Button size="sm" onClick={() => setIsPayOpen(true)}>
                  <Plus className="h-4 w-4 ml-1" />
                  تسجيل دفع
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={openEdit}>
                <Edit2 className="h-4 w-4 ml-1" />
                تعديل
              </Button>
            </div>
          </div>
        }
      />

      <div
        className={cn(
          'flex flex-col gap-5 px-4 py-4 sm:gap-6 sm:px-5 sm:py-6 md:px-8 md:py-7',
          MOBILE_PAGE_ACTION_PADDING,
        )}
      >
        {isTenant && rentSummary ? (
          <TenantContactDetail
            contact={contactRecord}
            rent={rentSummary}
            tenantId={id}
            monthlyRent={monthlyRent}
            transactions={transactions}
            txLoading={txLoading}
            journalEntries={journalEntries}
            jeLoading={jeLoading}
            rentPaymentsCount={rentPaymentsCount}
            onEdit={openEdit}
            onRecordPayment={() => setIsPayOpen(true)}
            canRecordPayment={canRecordRent}
          />
        ) : (
          <OtherContactDetailBody
            contactId={id}
            contact={contactRecord}
            isTenant={false}
            rent={rent}
            monthlyRent={monthlyRent}
            totals={totals}
            transactions={transactions}
            txLoading={txLoading}
            journalEntries={journalEntries}
            jeLoading={jeLoading}
            rentPaymentsCount={rentPaymentsCount}
            canRecordRent={false}
            onRecordPayment={() => setIsPayOpen(true)}
            kindLabel={kindInfo?.label}
            kindColor={kindInfo?.color}
            KindIcon={Icon}
          />
        )}
      </div>

      <ContactFormDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        formData={formData}
        onFormChange={setFormData}
        editingId={id}
        onSubmit={handleSubmit}
        isPending={updateContact.isPending}
        lockKind
      />

      {isTenant && rentSummary && (
        <RecordRentPaymentDialog
          tenant={rentSummary}
          open={isPayOpen}
          onOpenChange={setIsPayOpen}
        />
      )}

      <MobilePageActionBar>
        <div className="flex gap-2">
          {canRecordRent && (
            <Button
              className="h-11 flex-1 gap-1.5 touch-manipulation"
              onClick={() => setIsPayOpen(true)}
            >
              <Plus className="h-4 w-4" />
              دفع
            </Button>
          )}
          <TajMallPdfToolbar
            fileName={pdfFileName}
            render={renderContactPdf}
            showDownload={false}
            className={cn(
              'min-w-0 flex-1 [&>button]:h-11 [&>button]:w-full [&>button]:flex-1 [&>button]:px-2 [&>button]:text-[13px]',
              !canRecordRent && 'flex-[2]',
            )}
          />
          <Button
            variant="outline"
            className="h-11 flex-1 gap-1.5 touch-manipulation"
            onClick={openEdit}
          >
            <Edit2 className="h-4 w-4" />
            تعديل
          </Button>
        </div>
      </MobilePageActionBar>
    </>
  );
}
