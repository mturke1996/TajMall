'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useCreateContact, useUpdateContact } from '@/lib/db/queries';
import { isLeaveSchemaMissing, leaveErrorMessage, useUpsertEmployeeDetails } from '@/lib/db/leave-queries';
import { isPayrollSchemaMissing, payrollErrorMessage, useSetSalaryStructure } from '@/lib/db/payroll-queries';
import {
  buildContactPayload,
  contactToFormState,
  formatContactSaveError,
  type ContactFormState,
} from '@/lib/contacts/form-utils';
import { nounFor, planEmployeeFile, planSalaryStructure, validateContactForm, firstInvalidField } from '@/lib/contacts/form-rules';
import { leavePowers } from '@/lib/leave';
import { PROBE_KEYS } from '@/components/contacts/form/use-employee-support';
import { usePermission } from '@/lib/supabase/use-permission';
import { NEEDS_DB_UPDATE } from '@/lib/user-messages';
import type { ContactRow } from '@/lib/db/types';
import { todayISODate } from '@/lib/utils';

/** A phone-width screen: where the toast button must be a full 44px target. */
const onPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

export type SaveOutcome =
  | { ok: true; contact: ContactRow | null }
  | { ok: false; error: string; /** a second tap while the first save was still running: nothing to say */ ignored?: boolean };

export type SaveRequest = {
  /** the contact being edited; null adds a new one */
  editingId: string | null;
  /** the contact as it was loaded, so a phone number the person did not touch is saved untouched */
  previous?: ContactRow | null;
  /**
   * Whether the toast of a new contact offers «فتح الملف». False where the person is in the middle of something else
   * (a transaction entry): a tap on it would leave that page and lose what was typed.
   */
  offerOpen?: boolean;
};

/**
 * Saves the add and edit form, for every place that opens it. A new contact is created; an employee also gets
 * the salary structure and the file the form holds (each only when the database has the table and the role may
 * write it). The contact is saved first and is never lost to a later step: a step that fails is reported as a
 * warning that names what is still to do, in plain words.
 *
 * Messages go out as toasts; the outcome says whether it worked, so a dialog can stay open and show the error.
 */
export function useContactSave() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { role, canWrite } = usePermission();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const setSalary = useSetSalaryStructure();
  const upsertDetails = useUpsertEmployeeDetails();
  const [pending, setPending] = useState(false);
  const sending = useRef(false);

  async function run(form: ContactFormState, request: SaveRequest): Promise<SaveOutcome> {
    if (!canWrite) return { ok: false, error: 'صلاحية القراءة فقط — لا يمكن حفظ الجهات.' };
    if (sending.current) return { ok: false, error: '', ignored: true };

    const baseline = request.previous ? contactToFormState(request.previous) : null;
    // a screen that skipped the form's own checks still cannot save something the form would refuse
    const problems = validateContactForm(form, { baseline });
    const first = firstInvalidField(problems);
    if (first) return { ok: false, error: problems[first] ?? 'راجع الحقول' };

    sending.current = true;
    setPending(true);
    try {
      const payload = buildContactPayload(form, baseline);

      if (request.editingId) {
        await updateContact.mutateAsync({ id: request.editingId, ...payload });
        toast.success('تم حفظ التعديلات');
        return { ok: true, contact: null };
      }

      const created = await createContact.mutateAsync(payload);
      const id = created?.id;
      const warnings = id && form.businessRole === 'EMPLOYEE' ? await saveEmployeeExtras(id, form) : [];

      const noun = nounFor(form.businessRole, payload.kind);
      toast.success(`تمت إضافة ${noun} «${payload.name}»`, {
        duration: 8000,
        action: id && request.offerOpen !== false ? { label: 'فتح الملف', onClick: () => router.push(`/contacts/${id}`) } : undefined,
        // the button of a toast is 24px high by default: a thumb needs 44px on a phone
        actionButtonStyle: onPhone() ? { minHeight: 44, paddingInline: 16, fontSize: 14 } : undefined,
      });
      for (const w of warnings) toast.warning(w, { duration: 14000 });
      return { ok: true, contact: created ?? null };
    } catch (err) {
      console.error('[contacts] save failed', err);
      return { ok: false, error: formatContactSaveError(err) };
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  /** The salary structure and the employee file of a new employee. Returns what could not be saved, as sentences. */
  async function saveEmployeeExtras(employeeId: string, form: ContactFormState): Promise<string[]> {
    const warnings: string[] = [];
    const salary = planSalaryStructure(form, todayISODate());
    const file = planEmployeeFile(form);
    if (!salary && !file) return warnings;

    if (!leavePowers(role).canManage) {
      warnings.push('حُفظ الموظف. يسجّل المحاسب هيكل الراتب وبيانات الحساب المصرفي والإجازات من ملف الموظف.');
      return warnings;
    }

    // a table the form already found missing was explained there; do not try it and report it twice
    const missing = (key: readonly string[], isMissing: (e: unknown) => boolean) => isMissing(queryClient.getQueryState(key)?.error);

    if (salary && !missing(PROBE_KEYS.payroll, isPayrollSchemaMissing)) {
      try {
        await setSalary.mutateAsync({
          employeeId,
          effectiveFrom: salary.effectiveFrom,
          base: salary.base,
          housing: salary.housing,
          transport: salary.transport,
          other: salary.other,
        });
      } catch (err) {
        console.error('[contacts] salary structure failed', err);
        warnings.push(
          isPayrollSchemaMissing(err)
            ? `لم يُسجَّل هيكل الراتب. ${NEEDS_DB_UPDATE} الراتب محفوظ على بطاقة الموظف.`
            : `لم يُسجَّل هيكل الراتب: ${payrollErrorMessage(err)} سجّله من ملف الموظف.`,
        );
      }
    }

    if (file && !missing(PROBE_KEYS.file, isLeaveSchemaMissing)) {
      try {
        await upsertDetails.mutateAsync({ employeeId, ...file });
      } catch (err) {
        console.error('[contacts] employee file failed', err);
        warnings.push(`لم تُحفظ بيانات الحساب المصرفي والإجازات: ${leaveErrorMessage(err)} أضفها من ملف الموظف.`);
      }
    }
    return warnings;
  }

  return { run, pending };
}
