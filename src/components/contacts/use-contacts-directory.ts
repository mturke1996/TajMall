'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
import { matchesSearch } from '@/lib/arabic-search';
import { useConfirm } from '@/components/ui/confirm-dialog';

export function useContactsDirectory(options?: {
  segment?: PeopleSegment;
  onAddKindConsumed?: () => void;
  addKind?: ContactKind | null;
}) {
  const router = useRouter();
  const { canWrite, loading: permissionLoading } = usePermission();
  const segment = options?.segment ?? 'all';
  const confirm = useConfirm();
  // Inactive files stay reachable (to read their history or reactivate them) but are hidden by default.
  const { data: allContacts = [], isLoading } = useContacts(undefined, { includeInactive: true });
  const [showInactive, setShowInactive] = useState(false);
  const contacts = useMemo(() => allContacts.filter((c) => c.is_active), [allContacts]);
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<ContactBusinessRole | 'ALL'>('ALL');

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ContactFormState>(defaultContactFormState());

  const inactiveCount = useMemo(
    () => allContacts.filter((c) => !c.is_active && (segment === 'all' || c.kind === segment)).length,
    [allContacts, segment],
  );

  const filteredContacts = useMemo(() => {
    return (showInactive ? allContacts : contacts).filter((c) => {
      const cRole = extractContactBusinessRole(c);

      // Filter by role if set
      if (roleFilter !== 'ALL' && cRole !== roleFilter) return false;

      // Filter by legacy segment if applicable
      if (segment !== 'all' && c.kind !== segment) return false;

      return matchesSearch(searchQuery, [
        c.name,
        c.name_en,
        c.phone,
        c.phone2,
        c.shop_number,
        c.job_title,
        c.department,
        c.code,
        c.email,
        c.address,
      ]);
    });
  }, [allContacts, contacts, showInactive, roleFilter, segment, searchQuery]);

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

  // `?add=KIND` opens the add dialog once. Waits for the role (otherwise a writer is told they are
  // read-only and the request is dropped) and remembers what it consumed: the URL keeps the param
  // until router.replace lands, and replacing again on every render cancelled each navigation and
  // looped the page.
  const addKind = options?.addKind ?? null;
  const onAddKindConsumed = options?.onAddKindConsumed;
  const consumedAddKind = useRef<string | null>(null);
  useEffect(() => {
    if (!addKind) {
      consumedAddKind.current = null;
      return;
    }
    if (permissionLoading || consumedAddKind.current === addKind) return;
    if (['TENANT', 'CUSTOMER', 'EMPLOYEE', 'VENDOR'].includes(addKind)) {
      consumedAddKind.current = addKind;
      openAdd(addKind);
      onAddKindConsumed?.();
    }
  }, [addKind, permissionLoading, openAdd, onAddKindConsumed]);

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
    const contact = allContacts.find((c) => c.id === id);
    const ok = await confirm({
      title: `حذف ${contact?.name ?? 'الجهة'} نهائياً`,
      description:
        'يُحذف الملف إن لم تكن له معاملات أو قيود أو عقود. جهة لها حركات لا تُحذف — اجعلها «غير نشطة» من التعديل لتبقى حركاتها في الدفاتر.',
      confirmLabel: 'احذف',
    });
    if (!ok) return;
    try {
      await deleteContact.mutateAsync(id);
      toast.success('تم الحذف');
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      toast.error(
        code === '23503'
          ? 'لا يمكن حذف جهة لها معاملات أو قيود أو عقود — اجعلها «غير نشطة» من التعديل.'
          : 'تعذّر الحذف',
      );
    }
  }

  return {
    canWrite,
    contacts,
    filteredContacts,
    isLoading,
    showInactive,
    setShowInactive,
    inactiveCount,
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

