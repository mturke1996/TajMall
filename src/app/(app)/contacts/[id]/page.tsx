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
  Banknote,
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
import { LandlordProfilePanel } from '@/components/contacts/landlord-profile-panel';
import { UtilitySupplierPanel } from '@/components/contacts/utility-supplier-panel';
import { extractContactBusinessRole, CONTACT_ROLES } from '@/lib/contacts/contact-roles';
import { fallbackTenantRentFromContact } from '@/lib/tenant-rent-fallback';
import { useTxDialog } from '@/stores/transaction-dialog';
import { suggestedTxKindForContact } from '@/lib/party-contacts';
import { usePermission } from '@/lib/supabase/use-permission';
import { canCreateContactTransaction } from '@/lib/contacts/form-utils';
import { getPostedContactTransactions } from '@/lib/contacts/contact-transactions';


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
  const openTx = useTxDialog((s) => s.open);
  const { can } = usePermission();

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
  const [payMonths, setPayMonths] = useState<string[] | undefined>(undefined);
  const [formData, setFormData] = useState<ContactFormState>(defaultContactFormState());
  const role = useMemo(() => extractContactBusinessRole(contact), [contact]);

  const roleMeta = CONTACT_ROLES[role] || CONTACT_ROLES.OTHER;
  const isLandlord = role === 'LANDLORD';
  const isUtilitySupplier =
    role === 'SUPPLIER_ELECTRICITY' ||
    role === 'SUPPLIER_WATER' ||
    role === 'SUPPLIER_GOODS' ||
    role === 'SERVICE_PROVIDER';

  const postedTransactions = useMemo(
    () => getPostedContactTransactions(transactions),
    [transactions],
  );

  const rentPaymentsCount = useMemo(
    () => postedTransactions.filter((t) => t.kind === 'REVENUE').length,
    [postedTransactions],
  );

  const rentSummary = useMemo(() => {
    if (!contact || contact.kind !== 'TENANT') return null;
    return rent ?? fallbackTenantRentFromContact(contact);
  }, [contact, rent]);

  function openCollect(months?: string[]) {
    setPayMonths(months);
    setIsPayOpen(true);
  }

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
  const transactionPermission =
    suggestedTxKindForContact(contact.kind) === 'REVENUE' ? 'revenue.create' : 'expense.create';
  const mayCreateTransaction = canCreateContactTransaction(
    contact.is_active,
    can(transactionPermission),
  );
  // collecting rent posts revenue: same rule as any new transaction (active file, revenue permission)
  const canRecordRent = isTenant && !!rentSummary && mayCreateTransaction;
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
                <ArrowRight className="h-4 w-4 me-1" />
                رجوع
              </Link>
            </Button>
            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <TajMallPdfToolbar fileName={pdfFileName} render={renderContactPdf} />
              <Button size="sm" variant="outline" onClick={openEdit}>
                <Edit2 className="h-4 w-4 me-1" />
                تعديل
              </Button>
              {!isTenant && mayCreateTransaction ? (
                <Button
                  size="sm"
                  onClick={() =>
                    openTx({
                      kind: suggestedTxKindForContact(contact.kind),
                      contactId: id,
                      contactKind: contact.kind,
                    })
                  }
                >
                  <Plus className="h-4 w-4 me-1" />
                  معاملة جديدة
                </Button>
              ) : null}
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

      <div
        className={cn(
          'flex flex-col gap-5 px-4 py-4 sm:gap-6 sm:px-5 sm:py-6 md:px-8 md:py-7',
          MOBILE_PAGE_ACTION_PADDING,
        )}
      >
        {!contact.is_active && (
          <div
            role="status"
            className="rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning-ink"
          >
            هذا الملف غير نشط. تظل بياناته وحركاته السابقة متاحة، لكن لا يمكن بدء معاملة جديدة قبل إعادة تفعيله من تعديل الملف.
          </div>
        )}
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
            onCollect={canRecordRent ? openCollect : undefined}
          />
        ) : isLandlord ? (
          <LandlordProfilePanel
            contact={contactRecord}
            transactions={transactions}
            journalEntries={journalEntries}
            txLoading={txLoading}
            onEdit={openEdit}
          />
        ) : isUtilitySupplier ? (
          <UtilitySupplierPanel
            contact={contactRecord}
            role={role}
            transactions={transactions}
            journalEntries={journalEntries}
            txLoading={txLoading}
            onEdit={openEdit}
          />
        ) : (
          <OtherContactDetailBody
            contact={contactRecord}
            transactions={transactions}
            txLoading={txLoading}
            journalEntries={journalEntries}
            jeLoading={jeLoading}
            kindLabel={roleMeta?.label || kindInfo?.label}
            kindColor={roleMeta?.color || kindInfo?.color}
            KindIcon={roleMeta?.icon || Icon}
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
      />


      {isTenant && rentSummary && (
        <RecordRentPaymentDialog
          tenant={rentSummary}
          open={isPayOpen}
          onOpenChange={setIsPayOpen}
          initialMonths={payMonths}
        />
      )}

      <MobilePageActionBar>
        <div className="flex gap-2">
          {!isTenant && mayCreateTransaction ? (
            <Button
              className="h-11 flex-1 gap-1.5 touch-manipulation"
              onClick={() =>
                openTx({
                  kind: suggestedTxKindForContact(contact.kind),
                  contactId: id,
                  contactKind: contact.kind,
                })
              }
            >
              <Plus className="h-4 w-4" />
              معاملة
            </Button>
          ) : null}
          {canRecordRent && (
            <Button
              className="h-11 flex-2 gap-1.5 touch-manipulation"
              onClick={() => openCollect()}
            >
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
