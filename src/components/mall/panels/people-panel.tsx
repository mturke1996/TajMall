'use client';

import { useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MallPanelToolbar } from '@/components/mall/panel-toolbar';
import { PeopleSegmentNav } from '@/components/mall/people-segment-nav';
import { ContactsDirectory } from '@/components/contacts/contacts-directory';
import { ContactFormDialog } from '@/components/contacts/contact-form-dialog';
import { useContactsDirectory } from '@/components/contacts/use-contacts-directory';
import { MallEmployeesPanel } from '@/components/mall/panels/employees-panel';
import {
  isPeopleSegment,
  mallTabHref,
  peopleSegmentHref,
  type PeopleSegment,
} from '@/lib/mall/routes';
import type { ContactKind } from '@/lib/db/types';

export function MallPeoplePanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawSegment = searchParams.get('segment');
  const segment: PeopleSegment = isPeopleSegment(rawSegment) ? rawSegment : 'all';
  const addKind = searchParams.get('add') as ContactKind | null;

  const clearAddParam = useCallback(() => {
    router.replace(peopleSegmentHref(segment), { scroll: false });
  }, [router, segment]);

  const setSegment = useCallback(
    (next: PeopleSegment) => {
      router.replace(peopleSegmentHref(next), { scroll: false });
    },
    [router],
  );

  const directory = useContactsDirectory({
    segment,
    addKind,
    onAddKindConsumed: clearAddParam,
  });

  const highlightId = searchParams.get('id');
  useEffect(() => {
    if (highlightId) {
      router.replace(`/contacts/${highlightId}`);
    }
  }, [highlightId, router]);

  if (segment === 'EMPLOYEE') {
    return (
      <div className="space-y-4">
        <PeopleSegmentNav
          active={segment}
          counts={directory.segmentCounts}
          onChange={setSegment}
        />
        <MallEmployeesPanel embedded />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PeopleSegmentNav
        active={segment}
        counts={directory.segmentCounts}
        onChange={setSegment}
      />

      <MallPanelToolbar className="justify-stretch gap-2 sm:justify-end">
        {segment === 'TENANT' && (
          <Button
            variant="outline"
            size="sm"
            className="h-11 flex-1 gap-1.5 touch-manipulation sm:flex-none md:h-9"
            onClick={() => router.push(mallTabHref('tenants'))}
          >
            <Banknote className="h-4 w-4" />
            تحصيل الإيجار
          </Button>
        )}
        <Button
          size="sm"
          className="h-11 flex-1 gap-1.5 touch-manipulation sm:flex-none md:h-9"
          onClick={() =>
            directory.openAdd(
              segment === 'all' ? undefined : (segment as ContactKind),
            )
          }
        >
          <Plus className="h-4 w-4 ml-1" />
          إضافة
        </Button>
      </MallPanelToolbar>

      <ContactsDirectory
        contacts={directory.contacts}
        filteredContacts={directory.filteredContacts}
        isLoading={directory.isLoading}
        searchQuery={directory.searchQuery}
        onSearchChange={directory.setSearchQuery}
        kindFilter={directory.kindFilter}
        onKindFilterChange={() => {}}
        hideKindFilters={segment !== 'all'}
        stats={directory.stats}
        onAdd={directory.openAdd}
        onEdit={directory.startEdit}
        onDelete={directory.handleDelete}
      />

      <ContactFormDialog
        open={directory.isAddOpen}
        onOpenChange={directory.setIsAddOpen}
        formData={directory.formData}
        onFormChange={directory.setFormData}
        editingId={directory.editingId}
        onSubmit={directory.handleSubmit}
        isPending={directory.isPending}
        lockKind={!!directory.editingId}
      />
    </div>
  );
}
