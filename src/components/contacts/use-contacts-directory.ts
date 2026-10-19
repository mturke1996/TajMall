'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useContacts, useCreateContact, useUpdateContact, useDeleteContact } from '@/lib/db/queries';
import { toast } from 'sonner';
import type { ContactKind, ContactRow } from '@/lib/db/types';
import {
  type ContactFormState,
  defaultContactFormState,
  buildContactPayload,
  contactToFormState,
  formatContactSaveError,
} from '@/lib/contacts/form-utils';
import type { ContactBusinessRole } from '@/lib/contacts/contact-roles';
import { withRole } from '@/lib/contacts/contact-tags';
import {
  DEFAULT_SORT,
  buildDirectoryRows,
  filterDirectoryRows,
  inSegment,
  roleCountsOf,
  segmentCountsOf,
  segmentOfContact,
  sortDirectoryRows,
  summarizeDirectory,
  type DirectoryRow,
  type DirectorySummary,
  type RoleFilter,
  type SortState,
} from '@/lib/contacts/directory';
import type { PeopleSegment } from '@/lib/mall/routes';
import { mallTabHref } from '@/lib/mall/routes';
import { usePermission } from '@/lib/supabase/use-permission';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useDirectoryActivity } from '@/components/contacts/directory/use-directory-activity';
import { arabicCount } from '@/lib/utils';

/** Rows drawn at first and added by each «عرض المزيد»: a long list is not drawn all at once. */
export const DIRECTORY_PAGE_SIZE = 50;

const DISMISSED_KEY = 'people.landlord-hints.dismissed';
const FILES: [string, string, string, string] = ['ملف واحد', 'ملفان', 'ملفات', 'ملفاً'];

function readDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    // private window or blocked storage: the offer simply returns next visit
  }
}

/** What the person typed and chose in one list. It starts over when the list changes. */
type View = { segment: PeopleSegment; search: string; sort: SortState; showInactive: boolean };
const freshView = (segment: PeopleSegment): View => ({ segment, search: '', sort: DEFAULT_SORT, showInactive: false });

export type ActivityState = 'loading' | 'error' | 'ready';

/** The role a new file starts with: the one being filtered, else the list's own. */
function startingRole(segment: PeopleSegment, role: RoleFilter): ContactBusinessRole {
  if (role !== 'ALL') return role;
  if (segment === 'VENDOR') return 'SUPPLIER_GOODS';
  if (segment === 'all') return 'CUSTOMER';
  return segment;
}

export function useContactsDirectory(options?: {
  segment?: PeopleSegment;
  /** the role filter, already checked against the list (it comes from the address bar) */
  role?: RoleFilter;
  onAddKindConsumed?: () => void;
  addKind?: ContactKind | null;
}) {
  const router = useRouter();
  const { canWrite, loading: permissionLoading } = usePermission();
  const segment = options?.segment ?? 'all';
  const role = options?.role ?? 'ALL';
  const confirm = useConfirm();

  // Inactive files stay reachable (to read their history or reactivate them) but are hidden by default.
  const { data: allContacts, isLoading, isError, refetch } = useContacts(undefined, { includeInactive: true });
  // a failed background refetch keeps the data already shown; only a request that never answered replaces the list
  const loadFailed = isError && !allContacts;
  const contacts = useMemo(() => allContacts ?? [], [allContacts]);

  // the employees list has its own figures: it does not need the money of every contact
  const activityQuery = useDirectoryActivity({ enabled: segment !== 'EMPLOYEE' });
  const activityState: ActivityState = activityQuery.data ? 'ready' : activityQuery.isError ? 'error' : 'loading';
  const activity = activityQuery.data ?? null;

  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  // ── what is typed and chosen: scoped to the list, so nothing stale follows a change of list ──
  const [scoped, setScoped] = useState<View>(() => freshView(segment));
  const view = scoped.segment === segment ? scoped : freshView(segment);
  const patchView = useCallback((patch: Partial<View>) => setScoped({ ...view, ...patch, segment }), [view, segment]);
  const setSearchQuery = useCallback((search: string) => patchView({ search }), [patchView]);
  const setSort = useCallback((sort: SortState) => patchView({ sort }), [patchView]);
  const setShowInactive = useCallback((showInactive: boolean) => patchView({ showInactive }), [patchView]);

  // ── the list ──
  const activeContacts = useMemo(() => contacts.filter((c) => c.is_active), [contacts]);
  const segmentCounts = useMemo(() => segmentCountsOf(contacts), [contacts]);
  const segmentContacts = useMemo(() => contacts.filter((c) => inSegment(c, segment)), [contacts, segment]);
  const segmentRows = useMemo(() => buildDirectoryRows(segmentContacts, activity), [segmentContacts, activity]);
  const summary: DirectorySummary = useMemo(() => summarizeDirectory(segmentRows), [segmentRows]);
  const inactiveCount = summary.inactive;
  const roleCounts = useMemo(
    () => (isLoading ? new Map<RoleFilter, number>() : roleCountsOf(segmentContacts, segment, view.showInactive)),
    [isLoading, segmentContacts, segment, view.showInactive],
  );

  // the full directory also totals each kind of file
  const groupSummaries = useMemo(() => {
    if (segment !== 'all') return null;
    const groups: Record<'TENANT' | 'EMPLOYEE' | 'VENDOR' | 'CUSTOMER', DirectoryRow[]> = { TENANT: [], EMPLOYEE: [], VENDOR: [], CUSTOMER: [] };
    for (const r of segmentRows) {
      const s = segmentOfContact(r.contact);
      if (s !== 'OTHER') groups[s].push(r);
    }
    return {
      TENANT: summarizeDirectory(groups.TENANT),
      EMPLOYEE: summarizeDirectory(groups.EMPLOYEE),
      VENDOR: summarizeDirectory(groups.VENDOR),
      CUSTOMER: summarizeDirectory(groups.CUSTOMER),
    };
  }, [segment, segmentRows]);

  const rows = useMemo(
    () => sortDirectoryRows(filterDirectoryRows(segmentRows, { role, query: view.search, showInactive: view.showInactive }), view.sort),
    [segmentRows, role, view.search, view.showInactive, view.sort],
  );

  // incremental rendering: the count shown starts over whenever what is listed changes
  const viewKey = `${segment}|${role}|${view.search}|${view.sort.key}|${view.sort.dir}|${view.showInactive}`;
  const [shown, setShown] = useState({ key: viewKey, n: DIRECTORY_PAGE_SIZE });
  const limit = shown.key === viewKey ? shown.n : DIRECTORY_PAGE_SIZE;
  const visibleRows = useMemo(() => rows.slice(0, limit), [rows, limit]);
  const showMore = useCallback(() => setShown({ key: viewKey, n: limit + DIRECTORY_PAGE_SIZE }), [viewKey, limit]);

  // ── files that look like landlords: paid rent, never received money ──
  const [dismissed, setDismissed] = useState<Set<string>>(() => (typeof window === 'undefined' ? new Set() : readDismissed()));
  const hints = useMemo(
    () => segmentRows.filter((r) => r.landlordHint && r.contact.is_active && !dismissed.has(r.contact.id)),
    [segmentRows, dismissed],
  );
  const dismissHints = useCallback(() => {
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const r of hints) next.add(r.contact.id);
      writeDismissed(next);
      return next;
    });
  }, [hints]);

  const [approving, setApproving] = useState(false);
  const approveHints = useCallback(async () => {
    if (!canWrite) {
      toast.error('صلاحية القراءة فقط');
      return;
    }
    const targets = hints.map((r) => r.contact);
    if (targets.length === 0) return;
    const ok = await confirm({
      title: 'اعتماد كمؤجرين',
      description: `${arabicCount(targets.length, FILES)} سيُسجَّل فيها دور «مؤجر» وتظهر تحت «مؤجرون». يمكن تغيير الدور من تعديل الملف.`,
      details: targets.slice(0, 6).map((c) => ({ label: c.code ?? '—', value: c.name })),
      confirmLabel: 'اعتمد',
      tone: 'default',
    });
    if (!ok) return;
    setApproving(true);
    let done = 0;
    for (const c of targets) {
      try {
        await updateContact.mutateAsync({ id: c.id, notes: withRole(c.notes, 'LANDLORD') });
        done += 1;
      } catch (err) {
        console.error('[contacts] landlord approval failed', c.id, err);
      }
    }
    setApproving(false);
    if (done === targets.length) toast.success('تم اعتماد المؤجرين');
    else if (done > 0) toast.warning(`اعتُمد ${done} من ${targets.length}. أعد المحاولة للبقية.`);
    else toast.error('تعذّر الاعتماد. أعد المحاولة.');
  }, [canWrite, confirm, hints, updateContact]);

  // ── the add and edit form ──
  const [isAddOpen, setIsAddOpenState] = useState(false);
  // what had focus when the form opened gets it back when the form closes
  const openerRef = useRef<HTMLElement | null>(null);
  const setIsAddOpen = useCallback((open: boolean) => {
    setIsAddOpenState(open);
    if (open) return;
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener) requestAnimationFrame(() => opener.isConnected && opener.focus());
  }, []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ContactFormState>(defaultContactFormState());

  // before the files have loaded a count of zero would be a claim: show none
  const segmentNavCounts = useMemo((): Partial<Record<PeopleSegment, number>> => (isLoading || loadFailed ? {} : { ...segmentCounts }), [segmentCounts, isLoading, loadFailed]);

  const resetForm = useCallback((r: ContactBusinessRole = 'CUSTOMER') => {
    setFormData(defaultContactFormState(r));
    setEditingId(null);
  }, []);

  const startEdit = useCallback(
    (contact: ContactRow, opener?: HTMLElement | null) => {
      if (!canWrite) {
        toast.error('صلاحية القراءة فقط');
        return;
      }
      openerRef.current = opener ?? (document.activeElement as HTMLElement | null);
      setEditingId(contact.id);
      setFormData(contactToFormState(contact));
      setIsAddOpen(true);
    },
    [canWrite, setIsAddOpen],
  );

  const openAdd = useCallback(
    (roleOrKind?: ContactBusinessRole | ContactKind) => {
      if (!canWrite) {
        toast.error('صلاحية القراءة فقط — لا يمكن إضافة جهات');
        return;
      }
      let target: ContactBusinessRole;
      if (roleOrKind === 'VENDOR') target = role !== 'ALL' && segment === 'VENDOR' ? role : 'SUPPLIER_GOODS';
      else if (roleOrKind) target = roleOrKind as ContactBusinessRole;
      else target = startingRole(segment, role);
      openerRef.current = document.activeElement as HTMLElement | null;
      resetForm(target);
      setIsAddOpen(true);
    },
    [resetForm, segment, role, canWrite, setIsAddOpen],
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
    const contact = contacts.find((c) => c.id === id);
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
    // the files
    contacts: activeContacts,
    isLoading,
    loadFailed,
    retryContacts: () => void refetch(),
    segmentCounts: segmentNavCounts,
    // the list
    segmentRows,
    rows,
    visibleRows,
    hasMore: rows.length > visibleRows.length,
    remaining: rows.length - visibleRows.length,
    showMore,
    summary,
    groupSummaries,
    roleCounts,
    inactiveCount,
    searchQuery: view.search,
    setSearchQuery,
    sort: view.sort,
    setSort,
    showInactive: view.showInactive,
    setShowInactive,
    // twelve months of money
    activityState,
    retryActivity: () => void activityQuery.refetch(),
    // files that look like landlords
    hints,
    dismissHints,
    approveHints,
    approving,
    // the form
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

export type ContactsDirectoryState = ReturnType<typeof useContactsDirectory>;
