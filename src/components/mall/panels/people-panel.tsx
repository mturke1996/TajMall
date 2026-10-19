'use client';

import { useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PeopleSegmentNav } from '@/components/mall/people-segment-nav';
import { ADD_LABEL, ContactsDirectory } from '@/components/contacts/contacts-directory';
import { ContactFormDialog } from '@/components/contacts/contact-form-dialog';
import { useContactsDirectory } from '@/components/contacts/use-contacts-directory';
import { MallEmployeesPanel } from '@/components/mall/panels/employees-panel';
import { normalizeRoleFilter, type RoleFilter } from '@/lib/contacts/directory';
import { isPeopleSegment, mallTabHref, peopleSegmentHref, type PeopleSegment } from '@/lib/mall/routes';
import type { ContactKind } from '@/lib/db/types';
import { WriteGuard } from '@/components/auth/write-guard';

export function MallPeoplePanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawSegment = searchParams.get('segment');
  const segment: PeopleSegment = isPeopleSegment(rawSegment) ? rawSegment : 'all';
  // a role from the address bar only counts in a list that offers it; changing the list drops it
  const role: RoleFilter = normalizeRoleFilter(segment, searchParams.get('role'));
  const addKind = searchParams.get('add') as ContactKind | null;

  const hrefFor = useCallback(
    (next: PeopleSegment, nextRole: RoleFilter = 'ALL') => peopleSegmentHref(next, nextRole === 'ALL' ? undefined : { role: nextRole }),
    [],
  );

  const clearAddParam = useCallback(() => {
    router.replace(hrefFor(segment, role), { scroll: false });
  }, [router, hrefFor, segment, role]);

  const setSegment = useCallback(
    (next: PeopleSegment) => {
      router.replace(hrefFor(next), { scroll: false });
    },
    [router, hrefFor],
  );

  const setRole = useCallback(
    (next: RoleFilter) => {
      router.replace(hrefFor(segment, next), { scroll: false });
    },
    [router, hrefFor, segment],
  );

  const directory = useContactsDirectory({
    segment,
    role,
    addKind,
    onAddKindConsumed: clearAddParam,
  });

  const highlightId = searchParams.get('id');
  useEffect(() => {
    if (highlightId) {
      router.replace(`/contacts/${highlightId}`);
    }
  }, [highlightId, router]);

  const formDialog = (
    <ContactFormDialog
      open={directory.isAddOpen}
      onOpenChange={directory.setIsAddOpen}
      formData={directory.formData}
      onFormChange={directory.setFormData}
      editingId={directory.editingId}
      onSubmit={directory.handleSubmit}
      isPending={directory.isPending}
    />
  );

  if (segment === 'EMPLOYEE') {
    return (
      <div className="space-y-5">
        <PeopleSegmentNav active={segment} counts={directory.segmentCounts} onChange={setSegment} />
        <MallEmployeesPanel embedded onAddEmployee={() => directory.openAdd('EMPLOYEE')} />
        {formDialog}
      </div>
    );
  }

  const addLabel = role === 'LANDLORD' ? 'إضافة مؤجر' : ADD_LABEL[segment];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <PeopleSegmentNav active={segment} counts={directory.segmentCounts} onChange={setSegment} />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {segment === 'TENANT' && (
            <Button variant="outline" className="h-11 gap-1.5 touch-manipulation sm:h-9" onClick={() => router.push(mallTabHref('tenants'))}>
              <Banknote aria-hidden />
              تحصيل الإيجار
            </Button>
          )}
          <WriteGuard permission="document.create">
            <Button className="h-11 gap-1.5 touch-manipulation sm:h-9" onClick={() => directory.openAdd()}>
              <Plus aria-hidden />
              {addLabel}
            </Button>
          </WriteGuard>
        </div>
      </div>

      <ContactsDirectory directory={directory} segment={segment} role={role} onRoleChange={setRole} />

      {formDialog}
    </div>
  );
}
