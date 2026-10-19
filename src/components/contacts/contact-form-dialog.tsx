'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent, type MutableRefObject, type RefObject } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Callout } from '@/components/people/callout';
import { FixedKind, KindPicker, RolePicker } from '@/components/contacts/form/pickers';
import { BasicSection, MoreSection, NotesSection } from '@/components/contacts/form/sections-common';
import { CustomerSection, LandlordSection, TenantSection, VendorSection } from '@/components/contacts/form/sections-party';
import { EmployeeSections } from '@/components/contacts/form/sections-employee';
import type { FormContext } from '@/components/contacts/form/context';
import type { SaveOutcome } from '@/components/contacts/form/use-contact-save';
import { useEmployeeSupport } from '@/components/contacts/form/use-employee-support';
import { useVisualViewportFit } from '@/lib/hooks/use-visual-viewport-fit';
import { useContacts } from '@/lib/db/queries';
import { usePermission } from '@/lib/supabase/use-permission';
import { CONTACT_ROLES, type ContactBusinessRole } from '@/lib/contacts/contact-roles';
import { findContactMatches, prepareContacts } from '@/lib/contacts/duplicates';
import {
  KIND_LABEL,
  canMoveTo,
  firstInvalidField,
  formKindOf,
  switchKind,
  switchRole,
  validateContactForm,
  type FormField,
  type FormKind,
} from '@/lib/contacts/form-rules';
import {
  defaultContactFormState,
  isFormDirty,
  type ContactFormState,
  type EmployeeFormFields,
} from '@/lib/contacts/form-utils';
import { leavePowers } from '@/lib/leave';
import type { ContactKind } from '@/lib/db/types';
import { cn } from '@/lib/utils';

// ---- kept for the screens that label a kind with the colour and icon of its role (the tenant profile header)

export const ROLE_OPTIONS = (
  ['TENANT', 'LANDLORD', 'SUPPLIER_ELECTRICITY', 'SUPPLIER_WATER', 'SUPPLIER_GOODS', 'SERVICE_PROVIDER', 'EMPLOYEE', 'CUSTOMER'] as const
).map((value) => {
  const meta = CONTACT_ROLES[value];
  return { value, label: meta.label, badge: meta.badge, icon: meta.icon, color: meta.color, bg: meta.bgColor, border: meta.borderColor };
});

export const KIND_OPTIONS = ROLE_OPTIONS.map((r) => ({
  value: r.value as unknown as ContactKind,
  label: r.label,
  icon: r.icon,
  color: r.color,
}));

// ---- the dialog

export type ContactSubmitOptions = {
  /** keep the form open and start the next one */
  addAnother?: boolean;
};

type ContactFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: ContactFormState;
  onFormChange: (data: ContactFormState) => void;
  /** the contact being edited; null adds a new one */
  editingId: string | null;
  /**
   * Saves the form. Resolve with the outcome and the dialog shows a failure under the buttons and starts the next
   * form after «حفظ وإضافة آخر». The caller closes the dialog after a plain save.
   */
  onSubmit(e?: FormEvent, options?: ContactSubmitOptions): Promise<SaveOutcome | void> | SaveOutcome | void;
  isPending: boolean;
  /** منع تغيير النوع عند التعديل */
  lockKind?: boolean;
  /**
   * Whether the form that opens is one the person typed earlier and closed without saving (it says so and offers a
   * fresh start). Left out, a new form already holding something counts as one; a screen that fills a field itself
   * (a name from a search box) says `false`.
   */
  restoredDraft?: boolean;
};

/** What the dialog must know when someone tries to close it: written by the form, read by the dialog. */
type Guard = { dirty: MutableRefObject<boolean>; busy: MutableRefObject<boolean> };

/**
 * The add and edit form of every kind of contact: a wide dialog on a desktop (two columns, a header and buttons that
 * stay in view), a full-height sheet on a phone. The kind is chosen first and only the fields that kind needs
 * follow. Enter saves, Escape closes at once (what was typed comes back the next time it opens), a tap outside does
 * not close a form that has been typed in, and nothing closes while a save is running.
 */
export function ContactFormDialog(props: ContactFormDialogProps) {
  const { open, onOpenChange } = props;
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  useVisualViewportFit(panel, 'fill');
  const nameRef = useRef<HTMLInputElement>(null);
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);
  const guard: Guard = { dirty: dirtyRef, busy: busyRef };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busyRef.current) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        ref={setPanel}
        dir="rtl"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          nameRef.current?.focus({ preventScroll: true });
        }}
        onInteractOutside={(e) => {
          if (dirtyRef.current || busyRef.current) e.preventDefault();
        }}
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl sm:max-h-[min(92dvh,880px)] sm:min-h-[min(72dvh,640px)]',
          // the whole screen on a phone, with a close button that is a 44px target
          'max-sm:[&>button]:top-1.5 max-sm:[&>button]:p-3.5',
          'max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0',
        )}
      >
        <ContactFormBody {...props} nameRef={nameRef} guard={guard} />
      </DialogContent>
    </Dialog>
  );
}

/** «إضافة مورد»، «إضافة مؤجر»… follows the choice. */
function addTitle(form: ContactFormState): string {
  if (form.businessRole === 'LANDLORD') return 'إضافة مؤجر';
  return `إضافة ${KIND_LABEL[formKindOf(form)]}`;
}

function ContactFormBody({
  formData,
  onFormChange,
  editingId,
  onSubmit,
  isPending,
  lockKind = false,
  restoredDraft,
  onOpenChange,
  nameRef,
  guard,
}: ContactFormDialogProps & { nameRef: RefObject<HTMLInputElement | null>; guard: Guard }) {
  const editing = Boolean(editingId);
  const { role: userRole } = usePermission();
  const canManage = leavePowers(userRole).canManage;
  const kind = formKindOf(formData);

  // The body exists only while the dialog is open, so these are the form as it opened: the baseline an edit is compared
  // with, the kind the file had, and whether the form came back from an earlier, unsaved try.
  const [baseline] = useState<ContactFormState | null>(() => (editingId ? formData : null));
  const [openedAs] = useState<ContactKind>(() => formData.kind);
  const [draftNotice, setDraftNotice] = useState(() => !editingId && (restoredDraft ?? isFormDirty(formData)));

  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FormField, true>>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ name: string; id: string | null } | null>(null);
  const sending = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // two changes in one tick (typing, then leaving the field) must not overwrite each other
  const latest = useRef(formData);
  useEffect(() => {
    latest.current = formData;
  }, [formData]);
  const patch = useCallback(
    (changes: Partial<ContactFormState>) => {
      const next = { ...latest.current, ...changes };
      latest.current = next;
      onFormChange(next);
      setAdded(null);
    },
    [onFormChange],
  );
  const patchEmployee = useCallback(
    (changes: Partial<EmployeeFormFields>) => patch({ employee: { ...latest.current.employee, ...changes } }),
    [patch],
  );

  const employeeSupport = useEmployeeSupport(kind === 'EMPLOYEE' && canManage);
  const employeeFileShown = !editing && kind === 'EMPLOYEE' && canManage && employeeSupport.file;

  const errors = useMemo(
    () => validateContactForm(formData, { baseline, employeeFile: employeeFileShown }),
    [formData, baseline, employeeFileShown],
  );
  const errorOf = useCallback((field: FormField) => (attempted || touched[field] ? errors[field] : undefined), [attempted, touched, errors]);
  const touch = useCallback((field: FormField) => setTouched((t) => (t[field] ? t : { ...t, [field]: true })), []);

  // who already has this name or this phone: only what the person typed, not what the file came with
  const contacts = useContacts(undefined, { includeInactive: true });
  const prepared = useMemo(() => prepareContacts(contacts.data ?? []), [contacts.data]);
  const typedName = useDeferredValue(formData.name);
  const typedPhone = useDeferredValue(formData.phone);
  const typedPhone2 = useDeferredValue(formData.phone2);
  const matches = useMemo(() => {
    const changed = (now: string, was: string | undefined) => (baseline && now === was ? '' : now);
    return findContactMatches(
      prepared,
      { name: changed(typedName, baseline?.name), phones: [changed(typedPhone, baseline?.phone), changed(typedPhone2, baseline?.phone2)] },
      { excludeId: editingId },
    );
  }, [prepared, typedName, typedPhone, typedPhone2, baseline, editingId]);

  // what the dialog must know when someone tries to close it
  const dirty = editing ? JSON.stringify(formData) !== JSON.stringify(baseline) : isFormDirty(formData);
  const { dirty: dirtyRef, busy: busyRef } = guard;
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty, dirtyRef]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy, busyRef]);
  useEffect(
    () => () => {
      dirtyRef.current = false;
      busyRef.current = false;
    },
    [dirtyRef, busyRef],
  );

  function focusField(field: FormField) {
    const el = document.getElementById(`cf-${field}`);
    if (!el) return;
    el.closest('details')?.setAttribute('open', '');
    el.focus();
    el.scrollIntoView({ block: 'center' });
  }

  async function save(addAnother: boolean, event?: FormEvent) {
    event?.preventDefault();
    if (sending.current || isPending) return;
    setAttempted(true);
    setAdded(null);
    const first = firstInvalidField(errors);
    if (first) {
      setSubmitError(null);
      focusField(first);
      return;
    }
    sending.current = true;
    setBusy(true);
    setSubmitError(null);
    try {
      const outcome = await onSubmit(event, { addAnother });
      if (outcome && outcome.ok === false) {
        if (outcome.error) setSubmitError(outcome.error);
        return;
      }
      if (addAnother) {
        const saved = { name: formData.name.trim(), id: outcome && outcome.ok ? (outcome.contact?.id ?? null) : null };
        const fresh = defaultContactFormState(formData.businessRole, formData.kind);
        latest.current = fresh;
        onFormChange(fresh);
        setAttempted(false);
        setTouched({});
        setDraftNotice(false);
        setAdded(saved);
        // the notice at the top is what says it worked: show it, then put the cursor in the first field
        scrollRef.current?.scrollTo({ top: 0 });
        requestAnimationFrame(() => nameRef.current?.focus({ preventScroll: true }));
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const ctx: FormContext = {
    form: formData,
    patch,
    patchEmployee,
    errorOf,
    touch,
    editing,
    editingId,
    nameRef,
    submit: () => void save(false),
    employeeSupport,
    canManage,
    matches,
  };

  const role: ContactBusinessRole = formData.businessRole;
  const chooseKind = (next: FormKind) => patch(switchKind(latest.current, next));
  const chooseRole = (next: ContactBusinessRole) => patch(switchRole(latest.current, next));
  const startOver = () => {
    const fresh = defaultContactFormState(formData.businessRole, formData.kind);
    latest.current = fresh;
    onFormChange(fresh);
    setDraftNotice(false);
    setTouched({});
    setAttempted(false);
  };

  const fixedKind = editing && (openedAs === 'TENANT' || openedAs === 'EMPLOYEE');
  const hasRoles = kind === 'VENDOR' || kind === 'CUSTOMER';
  const supplier = kind === 'VENDOR' && role !== 'LANDLORD';

  return (
    <>
      <div className="shrink-0 border-b border-border py-3.5 ps-4 pe-12 sm:ps-6">
        <DialogTitle className="text-[16px]">{editing ? 'تعديل الملف' : addTitle(formData)}</DialogTitle>
        {editing && baseline?.name ? (
          <DialogDescription className="mt-0.5 truncate">{baseline.name}</DialogDescription>
        ) : (
          <DialogDescription className="sr-only">نموذج إضافة جهة جديدة</DialogDescription>
        )}
      </div>

      <form onSubmit={(e) => void save(false, e)} noValidate aria-busy={busy} className="flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-5">
            {draftNotice && (
              <Callout
                tone="info"
                action={
                  <Button type="button" variant="outline" onClick={startOver}>
                    ابدأ من جديد
                  </Button>
                }
              >
                استُرجعت البيانات التي كتبتها ولم تُحفظ.
              </Callout>
            )}
            {added && (
              <Callout
                tone="success"
                action={
                  added.id ? (
                    <a
                      href={`/contacts/${added.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-md border border-success-line bg-card px-3 text-[13px] font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      فتح الملف
                      <span className="sr-only">(في صفحة جديدة)</span>
                    </a>
                  ) : undefined
                }
              >
                تمت إضافة «{added.name}». اكتب بيانات التالي.
              </Callout>
            )}

            <div className="flex flex-col gap-3">
              {fixedKind ? (
                <FixedKind kind={kind} note="نوع الملف لا يتغيّر بعد إضافته." />
              ) : (
                <>
                  <KindPicker value={kind} onChange={chooseKind} canChoose={(k) => !lockKind && canMoveTo(editing ? openedAs : null, k)} />
                  {editing && (
                    <p className="text-[12.5px] leading-snug text-ink-mute">
                      {kind === 'OTHER'
                        ? 'ملف غير مصنّف. اختر نوعه ليظهر ما يناسبه، أو احفظه كما هو.'
                        : 'يمكن نقل الملف بين الموردين والعملاء. الحركات والقيود لا تتغيّر.'}
                    </p>
                  )}
                </>
              )}
              {hasRoles && <RolePicker kind={kind} value={role} onChange={chooseRole} />}
              {kind === 'VENDOR' && role === 'LANDLORD' && (
                <p className="text-[12.5px] leading-snug text-ink-mute">يظهر المؤجرون في قائمة العملاء والمؤجرين.</p>
              )}
            </div>

            <BasicSection ctx={ctx} />
            {supplier && <VendorSection ctx={ctx} />}
            {role === 'LANDLORD' && <LandlordSection ctx={ctx} />}
            {role === 'CUSTOMER' && <CustomerSection ctx={ctx} />}
            {role === 'TENANT' && <TenantSection ctx={ctx} />}
            {role === 'EMPLOYEE' && <EmployeeSections ctx={ctx} />}
            <NotesSection ctx={ctx} />
            <MoreSection ctx={ctx} />
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
          {submitError && (
            <p role="alert" className="mb-2 text-[13px] leading-relaxed text-danger-ink">
              {submitError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" className="min-h-11 px-3 sm:min-h-9" onClick={() => onOpenChange(false)} disabled={busy}>
              إلغاء
            </Button>
            <div className="flex flex-1 justify-end gap-2">
              {!editing && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 flex-1 px-3 sm:min-h-9 sm:flex-none"
                  onClick={() => void save(true)}
                  disabled={busy}
                >
                  حفظ وإضافة آخر
                </Button>
              )}
              <Button type="submit" className="min-h-11 flex-1 px-4 sm:min-h-9 sm:min-w-28 sm:flex-none" disabled={busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                {editing ? 'حفظ التعديلات' : 'حفظ'}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
