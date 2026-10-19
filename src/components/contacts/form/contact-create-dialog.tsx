'use client';

import { useState, type FormEvent } from 'react';
import { ContactFormDialog, type ContactSubmitOptions } from '@/components/contacts/contact-form-dialog';
import { useContactSave, type SaveOutcome } from '@/components/contacts/form/use-contact-save';
import { startingKind } from '@/lib/contacts/form-rules';
import { defaultContactFormState, hasTypedContent, type ContactFormState } from '@/lib/contacts/form-utils';
import type { ContactBusinessRole } from '@/lib/contacts/contact-roles';
import type { ContactRow } from '@/lib/db/types';

const freshForm = (role: ContactBusinessRole, name: string): ContactFormState => ({
  ...defaultContactFormState(role, startingKind(role)),
  name,
});

/**
 * The add form for a place that has no contacts list behind it (the transaction entry, a picker): it keeps its own
 * form, saves it the way every other place does, and hands the saved contact to `onCreated`. It is the same form,
 * with the same checks, duplicate warning and kinds, as the one on the people list.
 *
 * `role` is the role the form opens with (the kind follows: «CUSTOMER» for a customer, «SUPPLIER_GOODS» for a
 * vendor …); `name` is what was already typed in the picker.
 */
export function ContactCreateDialog({
  open,
  onOpenChange,
  role = 'CUSTOMER',
  name = '',
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: ContactBusinessRole;
  name?: string;
  onCreated?: (contact: ContactRow) => void;
}) {
  const saver = useContactSave();
  const [form, setForm] = useState<ContactFormState>(() => freshForm(role, name));
  // the name the caller put in the form when it last opened: it is the caller's, so it is not something typed
  const [given, setGiven] = useState(name);
  const [restored, setRestored] = useState(false);

  // each time the dialog opens it starts from what its caller asks for now, unless a form that was typed in and
  // closed without saving is waiting: that one comes back, and says so
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      if (hasTypedContent(form, given)) {
        setForm({ ...form, name: form.name || name });
        setRestored(true);
      } else {
        setForm(freshForm(role, name));
        setGiven(name);
        setRestored(false);
      }
    }
  }

  async function submit(e?: FormEvent, options?: ContactSubmitOptions): Promise<SaveOutcome> {
    e?.preventDefault();
    const outcome = await saver.run(form, { editingId: null, offerOpen: false });
    if (outcome.ok) {
      if (outcome.contact) onCreated?.(outcome.contact);
      if (!options?.addAnother) {
        onOpenChange(false);
        setForm(freshForm(role, ''));
      }
    }
    return outcome;
  }

  return (
    <ContactFormDialog
      open={open}
      onOpenChange={onOpenChange}
      formData={form}
      onFormChange={setForm}
      editingId={null}
      onSubmit={submit}
      isPending={saver.pending}
      restoredDraft={restored}
    />
  );
}
