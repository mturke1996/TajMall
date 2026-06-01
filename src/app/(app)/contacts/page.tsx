'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import {
  useContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
} from '@/lib/db/queries';
import { toast } from 'sonner';
import type { ContactKind, ContactRow } from '@/lib/db/types';
import { useSearchParams } from 'next/navigation';
import { ContactFormDialog, defaultContactFormState } from '@/components/contacts/contact-form-dialog';
import {
  buildContactPayload,
  contactToFormState,
  formatContactSaveError,
  type ContactFormState,
} from '@/lib/contacts/form-utils';
import { ContactsDirectory } from '@/components/contacts/contacts-directory';

export default function ContactsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-40 items-center justify-center gap-2 text-[13px] text-ink-mute">
          <Loader2 className="h-4 w-4 animate-spin stroke-[1.6]" />
          جارٍ التحميل…
        </div>
      }
    >
      <ContactsContent />
    </Suspense>
  );
}

function ContactsContent() {
  const router = useRouter();
  const { data: contacts = [], isLoading } = useContacts();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const searchParams = useSearchParams();

  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<ContactKind | 'ALL'>('ALL');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ContactFormState>(defaultContactFormState());

  const highlightId = searchParams.get('id');
  const addKind = searchParams.get('add') as ContactKind | null;

  useEffect(() => {
    if (highlightId) {
      router.replace(`/contacts/${highlightId}`);
    }
  }, [highlightId, router]);

  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (kindFilter !== 'ALL' && c.kind !== kindFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.shop_number?.toLowerCase().includes(q) ||
        c.job_title?.toLowerCase().includes(q) ||
        c.code?.toLowerCase().includes(q)
      );
    });
  }, [contacts, kindFilter, searchQuery]);

  const stats = useMemo(
    () => ({
      total: contacts.length,
      tenants: contacts.filter((c) => c.kind === 'TENANT').length,
      employees: contacts.filter((c) => c.kind === 'EMPLOYEE').length,
      customers: contacts.filter((c) => c.kind === 'CUSTOMER').length,
    }),
    [contacts],
  );

  function resetForm(kind: ContactKind = 'CUSTOMER') {
    setFormData(defaultContactFormState(kind));
    setEditingId(null);
  }

  function startEdit(contact: ContactRow) {
    setEditingId(contact.id);
    setFormData(contactToFormState(contact));
    setIsAddOpen(true);
  }

  function openAdd(kind?: ContactKind) {
    resetForm(kind ?? (kindFilter === 'ALL' ? 'CUSTOMER' : kindFilter));
    setIsAddOpen(true);
  }

  useEffect(() => {
    if (addKind && ['TENANT', 'CUSTOMER', 'EMPLOYEE', 'VENDOR'].includes(addKind)) {
      openAdd(addKind);
      router.replace('/contacts');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addKind]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name?.trim()) {
      toast.error('أدخل الاسم على الأقل');
      return;
    }

    try {
      const payload = buildContactPayload(formData);
      if (editingId) {
        await updateContact.mutateAsync({ id: editingId, ...payload });
        toast.success('تم التحديث');
      } else {
        const created = await createContact.mutateAsync(payload);
        toast.success('تم الإضافة');
        setIsAddOpen(false);
        resetForm();
        router.push(`/contacts/${created.id}`);
        return;
      }
      setIsAddOpen(false);
      resetForm();
    } catch (err) {
      console.error('[contacts] save failed', err);
      toast.error(formatContactSaveError(err));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('هل تريد حذف هذا السجل؟')) return;
    try {
      await deleteContact.mutateAsync(id);
      toast.success('تم الحذف');
    } catch {
      toast.error('فشل الحذف');
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="جهات التعامل"
        title="الدليل الشامل"
        description="مستأجرين، موظفين، عملاء وموردين — بحث سريع وملف لكل جهة"
        actions={
          <Button size="sm" className="hidden md:inline-flex" onClick={() => openAdd()}>
            <Plus className="h-4 w-4 ml-1" />
            إضافة
          </Button>
        }
      />

      <div className="px-4 py-4 sm:px-5 sm:py-6 md:px-8 md:py-8">
        <ContactsDirectory
          contacts={contacts}
          filteredContacts={filteredContacts}
          isLoading={isLoading}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          kindFilter={kindFilter}
          onKindFilterChange={setKindFilter}
          stats={stats}
          onAdd={openAdd}
          onEdit={startEdit}
          onDelete={handleDelete}
        />
      </div>

      <ContactFormDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        formData={formData}
        onFormChange={setFormData}
        editingId={editingId}
        onSubmit={handleSubmit}
        isPending={createContact.isPending || updateContact.isPending}
      />
    </>
  );
}
