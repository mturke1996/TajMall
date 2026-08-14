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
import {
  type ContactFormState,
  defaultContactFormState,
  buildContactPayload,
  contactToFormState,
  formatContactSaveError,
} from '@/lib/contacts/form-utils';
import {
  extractContactBusinessRole,
  type ContactBusinessRole,
} from '@/lib/contacts/contact-roles';
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
  const [roleFilter, setRoleFilter] = useState<ContactBusinessRole | 'ALL'>('ALL');

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ContactFormState>(defaultContactFormState());

  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      const cRole = extractContactBusinessRole(c);

      // Filter by role if set
      if (roleFilter !== 'ALL' && cRole !== roleFilter) return false;

      // Filter by legacy segment if applicable
      if (segment !== 'all' && c.kind !== segment) return false;

      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.shop_number?.toLowerCase().includes(q) ||
        c.job_title?.toLowerCase().includes(q) ||
        c.department?.toLowerCase().includes(q) ||
        c.code?.toLowerCase().includes(q)
      );
    });
  }, [contacts, roleFilter, segment, searchQuery]);

  const stats = useMemo(() => {
    let tenants = 0;
    let landlords = 0;
    let electricity = 0;
    let water = 0;
    let goods = 0;
    let services = 0;
    let employees = 0;
    let customers = 0;

    for (const c of contacts) {
      const r = extractContactBusinessRole(c);
      if (r === 'TENANT') tenants++;
      else if (r === 'LANDLORD') landlords++;
      else if (r === 'SUPPLIER_ELECTRICITY') electricity++;
      else if (r === 'SUPPLIER_WATER') water++;
      else if (r === 'SUPPLIER_GOODS') goods++;
      else if (r === 'SERVICE_PROVIDER') services++;
      else if (r === 'EMPLOYEE') employees++;
      else if (r === 'CUSTOMER') customers++;
    }

    return {
      total: contacts.length,
      tenants,
      landlords,
      electricity,
      water,
      goods,
      services,
      employees,
      customers,
      vendors: landlords + electricity + water + goods + services,
    };
  }, [contacts]);

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

  const resetForm = useCallback((role: ContactBusinessRole = 'CUSTOMER') => {
    setFormData(defaultContactFormState(role));
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
    (roleOrKind?: ContactBusinessRole | ContactKind) => {
      if (!canWrite) {
        toast.error('صلاحية القراءة فقط — لا يمكن إضافة جهات');
        return;
      }
      let targetRole: ContactBusinessRole = 'CUSTOMER';
      if (roleOrKind) {
        if (roleOrKind === 'VENDOR') targetRole = 'SUPPLIER_GOODS';
        else targetRole = roleOrKind as ContactBusinessRole;
      } else if (segment !== 'all') {
        targetRole = segment === 'VENDOR' ? 'SUPPLIER_GOODS' : (segment as ContactBusinessRole);
      }
      resetForm(targetRole);
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
        toast.success('تم التحديث بنجاح');
        setIsAddOpen(false);
        resetForm();
        return;
      }
      const created = await createContact.mutateAsync(payload);
      toast.success('تمت إضافة الجهة بنجاح');
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
    if (!confirm('هل تريد حذف هذا السجل نهائياً؟')) return;
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
    roleFilter,
    setRoleFilter,
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

