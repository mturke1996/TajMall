'use client';

import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/data/empty-state';
import { Button } from '@/components/ui/button';
import { ContactFormDialog } from '@/components/contacts/contact-form-dialog';
import { OtherContactDetailBody } from '@/components/contacts/other-contact-detail-body';
import { UtilitySupplierPanel } from '@/components/contacts/utility-supplier-panel';
import { LandlordFrame } from '@/components/contacts/profile/landlord-frame';
import { ProfileSkeleton } from '@/components/contacts/profile/profile-skeleton';
import { TenantFrame } from '@/components/contacts/profile/tenant-frame';
import { useContact, useContactTransactions, useTenantRentForContact, useUpdateContact } from '@/lib/db/queries';
import { useJournalEntries } from '@/lib/db/journal-queries';
import { extractContactBusinessRole } from '@/lib/contacts/contact-roles';
import {
  buildContactPayload,
  contactToFormState,
  defaultContactFormState,
  formatContactSaveError,
  type ContactFormState,
} from '@/lib/contacts/form-utils';
import { contactBackHref } from '@/lib/mall/routes';
import { reconcileSavePayload } from '@/lib/people/party-profile';
import { fallbackTenantRentFromContact } from '@/lib/tenant-rent-fallback';
import { usePermission } from '@/lib/supabase/use-permission';
import { friendlyError } from '@/lib/user-messages';

const PAGE = 'flex min-w-0 flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-5 sm:py-6 md:px-8 md:py-7';

function PageMessage({ title, description, retry }: { title: string; description: string; retry?: () => void }) {
  return (
    <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-8 md:py-7">
      <EmptyState
        icon={AlertTriangle}
        title={title}
        description={description}
        action={retry ? undefined : { label: 'العودة', href: contactBackHref('CUSTOMER') }}
      />
      {retry && (
        <div className="mt-3 flex justify-center">
          <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={retry}>
            إعادة المحاولة
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ContactDetailPage() {
  const params = useParams();
  // e.g. ?tab=statement from the all-tenants statements report, ?tab=journals from a link
  const initialTab = useSearchParams().get('tab');
  const id = typeof params?.id === 'string' ? params.id : '';
  const { canWrite } = usePermission();

  const contactQuery = useContact(id);
  const txQuery = useContactTransactions(id);
  const rentQuery = useTenantRentForContact(id);
  const jeQuery = useJournalEntries({ contactId: id, status: 'ALL' }, 500);
  const updateContact = useUpdateContact();

  const contact = contactQuery.data;
  const transactions = useMemo(() => txQuery.data ?? [], [txQuery.data]);
  const journalEntries = useMemo(() => jeQuery.data ?? [], [jeQuery.data]);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [formData, setFormData] = useState<ContactFormState>(defaultContactFormState());
  const role = useMemo(() => extractContactBusinessRole(contact), [contact]);

  const rentSummary = useMemo(() => {
    if (!contact || contact.kind !== 'TENANT') return null;
    return rentQuery.data ?? fallbackTenantRentFromContact(contact);
  }, [contact, rentQuery.data]);

  function openEdit() {
    if (!contact) return;
    setFormData(contactToFormState(contact));
    setIsEditOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contact) return;
    if (!formData.name?.trim()) {
      toast.error('أدخل الاسم');
      return;
    }
    try {
      // the form derives the kind from the role and shows only the visible notes: keep the list a landlord
      // is filed in and the month it is followed from
      const payload = reconcileSavePayload(buildContactPayload(formData), contact, formData);
      await updateContact.mutateAsync({ id, ...payload });
      toast.success('تم التحديث');
      setIsEditOpen(false);
    } catch (err) {
      console.error('[contacts] update failed', err);
      toast.error(formatContactSaveError(err));
    }
  }

  if (!id) {
    return <PageMessage title="رابط غير صالح" description="لا يمكن عرض هذا السجل بسبب رابط ناقص أو غير صحيح." />;
  }

  if (contactQuery.isLoading) {
    return (
      <div className={PAGE}>
        <ProfileSkeleton />
      </div>
    );
  }

  if (contactQuery.isError || !contact) {
    // a row that does not exist is PGRST116 (single() found nothing); anything else is a failed load
    const missing = !contactQuery.isError || (contactQuery.error as { code?: string } | null)?.code === 'PGRST116';
    return missing ? (
      <PageMessage title="لم يُعثر على السجل" description="قد يكون هذا السجل قد حُذف أو ليس لديك صلاحية الوصول إليه." />
    ) : (
      <PageMessage
        title="تعذّر تحميل الملف"
        description={friendlyError(contactQuery.error, 'تعذّر تحميل الملف. أعد المحاولة، وإن تكرر الخطأ أبلغ مسؤول النظام.')}
        retry={() => void contactQuery.refetch()}
      />
    );
  }

  const onEdit = canWrite ? openEdit : undefined;

  const body = {
    contact,
    role,
    transactions,
    txLoading: txQuery.isLoading,
    txError: txQuery.isError ? txQuery.error : undefined,
    onRetryTx: () => void txQuery.refetch(),
    journalEntries,
    jeLoading: jeQuery.isLoading,
    jeError: jeQuery.isError ? jeQuery.error : undefined,
    onRetryJe: () => void jeQuery.refetch(),
    onEdit,
    initialTab,
  };

  const isUtilitySupplier = role === 'SUPPLIER_ELECTRICITY' || role === 'SUPPLIER_WATER' || role === 'SUPPLIER_GOODS' || role === 'SERVICE_PROVIDER';

  return (
    <>
      {contact.kind === 'TENANT' && rentSummary ? (
        <TenantFrame
          contact={contact}
          rent={rentQuery.data ?? null}
          rentSummary={rentSummary}
          transactions={transactions}
          txLoading={txQuery.isLoading}
          journalEntries={journalEntries}
          jeLoading={jeQuery.isLoading}
          initialTab={initialTab}
          onEdit={onEdit}
        />
      ) : (
        <div className={PAGE}>
          {role === 'LANDLORD' ? (
            <LandlordFrame {...body} />
          ) : isUtilitySupplier ? (
            <UtilitySupplierPanel {...body} />
          ) : (
            <OtherContactDetailBody {...body} />
          )}
        </div>
      )}

      <ContactFormDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        formData={formData}
        onFormChange={setFormData}
        editingId={id}
        onSubmit={handleSubmit}
        isPending={updateContact.isPending}
      />
    </>
  );
}
