'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  useContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
} from '@/lib/db/queries';
import { toast } from 'sonner';
import type { ContactKind, ContactRow } from '@/lib/db/types';
import { defaultContactFormState } from '@/components/contacts/contact-form-dialog';
import {
  buildContactPayload,
  contactToFormState,
  formatContactSaveError,
  type ContactFormState,
} from '@/lib/contacts/form-utils';
import type { PeopleSegment } from '@/lib/mall/routes';
import { mallTabHref } from '@/lib/mall/routes';
import { usePermission } from '@/lib/supabase/use-permission';

export function useContactsDirectory(options?: {
  segment?: PeopleSegment;
  onAddKindConsumed?: () => void;
  addKind?: ContactKind | null;
}) {
  const router = useRouter();
  const { canWrite } = usePermission();
  const segment = options?.segment ?? 'all';
  const { data: contacts = [], isLoading } = useContacts();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  const [searchQuery, setSearchQuery] = useState('');
  const kindFilter: ContactKind | 'ALL' =
    segment === 'all' ? 'ALL' : segment;
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ContactFormState>(defaultContactFormState());

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
      vendors: contacts.filter((c) => c.kind === 'VENDOR').length,
    }),
    [contacts],
  );

  const segmentCounts = useMemo(
    (): Partial<Record<PeopleSegment, number>> => ({
      all: stats.total,
      TENANT: stats.tenants,
      EMPLOYEE: stats.employees,
      VENDOR: stats.vendors,
      CUSTOMER: stats.customers,
    }),
    [stats],
  );

  const resetForm = useCallback((kind: ContactKind = 'CUSTOMER') => {
    setFormData(defaultContactFormState(kind));
    setEditingId(null);
  }, []);

  const startEdit = useCallback((contact: ContactRow) => {
    if (!canWrite) {
      toast.error('صلاحية القراءة فقط');
      return;
    }
    setEditingId(contact.id);
    setFormData(contactToFormState(contact));
    setIsAddOpen(true);
  }, [canWrite]);

  const openAdd = useCallback(
    (kind?: ContactKind) => {
      if (!canWrite) {
        toast.error('صلاحية القراءة فقط — لا يمكن إضافة جهات');
        return;
      }
      const defaultKind =
        kind ??
        (segment !== 'all' ? (segment as ContactKind) : 'CUSTOMER');
      resetForm(defaultKind);
      setIsAddOpen(true);
    },
    [resetForm, segment, canWrite],
  );

  useEffect(() => {
    const addKind = options?.addKind;
    if (addKind && ['TENANT', 'CUSTOMER', 'EMPLOYEE', 'VENDOR'].includes(addKind)) {
      openAdd(addKind);
      options?.onAddKindConsumed?.();
    }
  }, [options?.addKind, openAdd, options]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite) {
      toast.error('صلاحية القراءة فقط');
      return;
    }
    if (!formData.name?.trim()) {
      toast.error('أدخل الاسم على الأقل');
      return;
    }

    try {
      const payload = buildContactPayload(formData);
      if (editingId) {
        await updateContact.mutateAsync({ id: editingId, ...payload });
        toast.success('تم التحديث');
        setIsAddOpen(false);
        resetForm(segment !== 'all' ? (segment as ContactKind) : 'CUSTOMER');
        return;
      }
      const created = await createContact.mutateAsync(payload);
      toast.success('تم الإضافة');
      setIsAddOpen(false);
      resetForm();
      router.push(`/contacts/${created.id}`);
    } catch (err) {
      console.error('[contacts] save failed', err);
      toast.error(formatContactSaveError(err));
    }
  }

  async function handleDelete(id: string) {
    if (!canWrite) {
      toast.error('صلاحية القراءة فقط');
      return;
    }
    if (!confirm('هل تريد حذف هذا السجل؟')) return;
    try {
      await deleteContact.mutateAsync(id);
      toast.success('تم الحذف');
    } catch {
      toast.error('فشل الحذف');
    }
  }

  return {
    canWrite,
    contacts,
    filteredContacts,
    isLoading,
    searchQuery,
    setSearchQuery,
    kindFilter,
    stats,
    segmentCounts,
    isAddOpen,
    setIsAddOpen,
    formData,
    setFormData,
    editingId,
    openAdd,
    startEdit,
    handleSubmit,
    handleDelete,
    isPending: createContact.isPending || updateContact.isPending,
    goToRentCollection: () => router.push(mallTabHref('tenants')),
  };
}
