'use client';

import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/data/empty-state';
import { ContactFormDialog } from '@/components/contacts/contact-form-dialog';
import { useContactSave } from '@/components/contacts/form/use-contact-save';
import { OtherContactDetailBody } from '@/components/contacts/other-contact-detail-body';
import { UtilitySupplierPanel } from '@/components/contacts/utility-supplier-panel';
import { LandlordFrame } from '@/components/contacts/profile/landlord-frame';
import { ProfileSkeleton } from '@/components/contacts/profile/profile-skeleton';
import { TenantFrame } from '@/components/contacts/profile/tenant-frame';
import { useReturnFocus } from '@/components/contacts/profile/use-return-focus';
import { useContact, useContactTransactions, useTenantRentForContact } from '@/lib/db/queries';
import { useJournalEntries } from '@/lib/db/journal-queries';
import { extractContactBusinessRole } from '@/lib/contacts/contact-roles';
import { contactToFormState, defaultContactFormState, type ContactFormState } from '@/lib/contacts/form-utils';
import { contactBackHref } from '@/lib/mall/routes';
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
        action={retry ? { label: 'إعادة المحاولة', onClick: retry } : { label: 'العودة', href: contactBackHref('CUSTOMER') }}
      />
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
  const saver = useContactSave();

  const contact = contactQuery.data;
  const transactions = useMemo(() => txQuery.data ?? [], [txQuery.data]);
  const journalEntries = useMemo(() => jeQuery.data ?? [], [jeQuery.data]);

  const [isEditOpen, setIsEditOpen] = useState(false);
  useReturnFocus(isEditOpen);
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

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!contact) return;
    // saving goes through the one place every form uses: a landlord keeps the list it is filed in, the tracking
    // month and the tags in the notes survive, and a phone that was not touched is saved as it was
    const outcome = await saver.run(formData, { editingId: id, previous: contact });
    if (outcome.ok) setIsEditOpen(false);
    return outcome;
  }

  if (!id) {
    return <PageMessage title="رابط غير صالح" description="الرابط ناقص أو غير صحيح، فلا يمكن فتح الملف." />;
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
      <PageMessage title="لم يُعثر على الملف" description="قد يكون الملف قد حُذف أو ليست لديك صلاحية الوصول إليه." />
    ) : (
      <PageMessage
        title="تعذّر تحميل الملف"
        description={friendlyError(contactQuery.error, 'تحقق من الاتصال ثم أعد المحاولة. وإن تكرر الخطأ أبلغ مسؤول النظام.')}
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
        isPending={saver.pending}
      />
    </>
  );
}
