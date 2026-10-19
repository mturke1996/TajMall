'use client';

import { useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Callout, SectionCard } from '@/components/people';
import { FIELD_HEIGHT, NativeSelect } from '@/components/employees/form-parts';
import { FormField } from '@/components/payroll/payroll-ui';
import { leaveErrorMessage, useUpsertEmployeeDetails } from '@/lib/db/leave-queries';
import { useUpdateContact } from '@/lib/db/queries';
import type { ContactRow } from '@/lib/db/types';
import {
  EMPLOYMENT_TYPES,
  employmentTypeLabel,
  fileInputFromDetails,
  formatIban,
  isValidIban,
  type EmployeeDetails,
  type EmploymentType,
} from '@/lib/leave';
import { formatContactSaveError } from '@/lib/contacts/form-utils';
import { parseAmountInput, todayISODate } from '@/lib/utils';

export type DetailsFormState = {
  jobTitle: string;
  department: string;
  hireDate: string;
  employmentType: EmploymentType;
  nationalId: string;
  birthDate: string;
  probationEnd: string;
  contractEnd: string;
  bankName: string;
  bankAccount: string;
  iban: string;
  emergencyName: string;
  emergencyPhone: string;
  annualLeaveDays: string;
  leaveCarryOver: string;
  terminationDate: string;
  terminationReason: string;
  notes: string;
};

const text = (v: string | null | undefined) => (v ?? '').trim();

/** The form as it opens: the contact card and the file side by side (an ID number typed on the card before the file existed carries over). */
export function initialDetailsForm(contact: ContactRow, details: EmployeeDetails | null): DetailsFormState {
  return {
    jobTitle: text(contact.job_title),
    department: text(contact.department),
    hireDate: contact.hire_date?.slice(0, 10) ?? '',
    employmentType: details?.employment_type ?? 'FULL_TIME',
    nationalId: text(details?.national_id) || text(contact.id_number),
    birthDate: details?.birth_date ?? '',
    probationEnd: details?.probation_end ?? '',
    contractEnd: details?.contract_end ?? '',
    bankName: text(details?.bank_name),
    bankAccount: text(details?.bank_account),
    iban: formatIban(details?.iban),
    emergencyName: text(details?.emergency_name),
    emergencyPhone: text(details?.emergency_phone),
    annualLeaveDays: String(details?.annual_leave_days ?? 30),
    leaveCarryOver: String(details?.leave_carry_over ?? 0),
    terminationDate: details?.termination_date ?? '',
    terminationReason: text(details?.termination_reason),
    notes: text(details?.notes),
  };
}

/** What is wrong with the form, field by field, in plain Arabic; empty when it can be saved. */
export function validateDetailsForm(f: DetailsFormState): Partial<Record<keyof DetailsFormState, string>> {
  const errors: Partial<Record<keyof DetailsFormState, string>> = {};
  if (f.iban.trim() && !isValidIban(f.iban)) errors.iban = 'رقم الآيبان غير صحيح. يبدأ برمز البلد ثم أرقام وحروف، مثل LY83…';
  const days = parseAmountInput(f.annualLeaveDays);
  if (!Number.isFinite(days) || days < 0 || days > 365) errors.annualLeaveDays = 'اكتب عدد أيام بين 0 و365';
  const carry = parseAmountInput(f.leaveCarryOver);
  if (!Number.isFinite(carry) || carry < 0 || carry > 365) errors.leaveCarryOver = 'اكتب عدد أيام بين 0 و365';
  if (f.terminationDate && f.terminationReason.trim().length < 3) errors.terminationReason = 'اكتب سبب إنهاء الخدمة';
  if (f.hireDate && f.terminationDate && f.terminationDate < f.hireDate) errors.terminationDate = 'تاريخ إنهاء الخدمة قبل تاريخ التعيين';
  return errors;
}

/**
 * The employee's file in place: the job facts on the contact card and the file (contract, bank, emergency contact,
 * leave allowance, end of service). The file is saved whole by one database call, starting from what is stored, so
 * changing one field never clears another; the contact card is saved by its own call.
 */
export function DetailsForm({
  contact,
  details,
  onClose,
  onSaved,
}: {
  contact: ContactRow;
  details: EmployeeDetails | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = useMemo(() => initialDetailsForm(contact, details), [contact, details]);
  const [form, setForm] = useState<DetailsFormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const upsert = useUpsertEmployeeDetails();
  const updateContact = useUpdateContact();

  const errors = validateDetailsForm(form);
  const set = <K extends keyof DetailsFormState>(key: K, value: DetailsFormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const err = (key: keyof DetailsFormState) => (showErrors ? errors[key] : undefined);
  const same = (keys: Array<keyof DetailsFormState>) => keys.every((k) => form[k] === initial[k]);

  async function save() {
    if (sending.current) return;
    setShowErrors(true);
    if (Object.keys(errors).length > 0) return;
    const fileKeys: Array<keyof DetailsFormState> = [
      'employmentType', 'nationalId', 'birthDate', 'probationEnd', 'contractEnd', 'bankName', 'bankAccount', 'iban',
      'emergencyName', 'emergencyPhone', 'annualLeaveDays', 'leaveCarryOver', 'terminationDate', 'terminationReason', 'notes',
    ];
    const contactKeys: Array<keyof DetailsFormState> = ['jobTitle', 'department', 'hireDate'];
    const fileChanged = !same(fileKeys);
    const contactChanged = !same(contactKeys);
    if (!fileChanged && !contactChanged) {
      onClose();
      return;
    }

    sending.current = true;
    setBusy(true);
    setError(null);
    let fileSaved = false;
    try {
      if (fileChanged) {
        const carry = parseAmountInput(form.leaveCarryOver);
        try {
          await upsert.mutateAsync({
            // start from what is stored: a save sends the whole file
            ...fileInputFromDetails(details),
            employeeId: contact.id,
            employmentType: form.employmentType,
            nationalId: form.nationalId,
            birthDate: form.birthDate,
            contractEnd: form.contractEnd,
            probationEnd: form.probationEnd,
            bankName: form.bankName,
            bankAccount: form.bankAccount,
            iban: form.iban,
            emergencyName: form.emergencyName,
            emergencyPhone: form.emergencyPhone,
            annualLeaveDays: parseAmountInput(form.annualLeaveDays),
            leaveCarryOver: carry,
            // a changed carry-over belongs to this year; an unchanged one keeps the year it was given for
            leaveCarryOverYear: carry === (details?.leave_carry_over ?? 0) ? (details?.leave_carry_over_year ?? null) : Number(todayISODate().slice(0, 4)),
            terminationDate: form.terminationDate,
            terminationReason: form.terminationDate ? form.terminationReason : '',
            notes: form.notes,
          });
          fileSaved = true;
        } catch (e) {
          setError(leaveErrorMessage(e));
          return;
        }
      }
      if (contactChanged) {
        try {
          await updateContact.mutateAsync({
            id: contact.id,
            job_title: form.jobTitle.trim() || null,
            department: form.department.trim() || null,
            hire_date: form.hireDate || null,
          });
        } catch (e) {
          const message = formatContactSaveError(e);
          setError(fileSaved ? `حُفظ ملف الموظف، لكن لم تُحفظ بيانات البطاقة: ${message}` : message);
          return;
        }
      }
      toast.success('حُفظت بيانات الموظف');
      onSaved();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const dateInput = (id: string, key: keyof DetailsFormState) => (
    <Input id={id} type="date" dir="ltr" className={FIELD_HEIGHT} value={form[key] as string} onChange={(e) => set(key, e.target.value as never)} />
  );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col gap-4"
    >
      {details === null && <Callout tone="info">لم يُفتح ملف وظيفي لهذا الموظف بعد. يُفتح عند أول حفظ، والإجازة السنوية 30 يوماً ما لم تغيّرها.</Callout>}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="التعيين">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="المسمى الوظيفي" htmlFor="df-title">
              <Input id="df-title" className={FIELD_HEIGHT} value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} />
            </FormField>
            <FormField label="القسم" htmlFor="df-dept">
              <Input id="df-dept" className={FIELD_HEIGHT} value={form.department} onChange={(e) => set('department', e.target.value)} />
            </FormField>
            <FormField label="تاريخ التعيين" htmlFor="df-hire">
              {dateInput('df-hire', 'hireDate')}
            </FormField>
            <FormField label="نوع التوظيف" htmlFor="df-type">
              <NativeSelect id="df-type" value={form.employmentType} onChange={(e) => set('employmentType', e.target.value as EmploymentType)}>
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {employmentTypeLabel(t)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="انتهاء فترة التجربة" htmlFor="df-probation">
              {dateInput('df-probation', 'probationEnd')}
            </FormField>
            <FormField label="انتهاء العقد" htmlFor="df-contract">
              {dateInput('df-contract', 'contractEnd')}
            </FormField>
          </div>
        </SectionCard>

        <SectionCard title="الهوية">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="الرقم الوطني" htmlFor="df-nid">
              <Input id="df-nid" inputMode="numeric" dir="ltr" className={`${FIELD_HEIGHT} text-end tabular-nums`} value={form.nationalId} onChange={(e) => set('nationalId', e.target.value)} />
            </FormField>
            <FormField label="تاريخ الميلاد" htmlFor="df-birth">
              {dateInput('df-birth', 'birthDate')}
            </FormField>
          </div>
        </SectionCard>

        <SectionCard title="الحساب المصرفي">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="المصرف" htmlFor="df-bank">
              <Input id="df-bank" className={FIELD_HEIGHT} value={form.bankName} onChange={(e) => set('bankName', e.target.value)} />
            </FormField>
            <FormField label="رقم الحساب" htmlFor="df-account">
              <Input id="df-account" dir="ltr" className={`${FIELD_HEIGHT} text-end tabular-nums`} value={form.bankAccount} onChange={(e) => set('bankAccount', e.target.value)} />
            </FormField>
            <FormField label="الآيبان" htmlFor="df-iban" className="sm:col-span-2" hint={err('iban')}>
              <Input
                id="df-iban"
                dir="ltr"
                autoCapitalize="characters"
                aria-invalid={Boolean(err('iban'))}
                className={`${FIELD_HEIGHT} text-end tabular-nums`}
                value={form.iban}
                onChange={(e) => set('iban', e.target.value)}
                onBlur={() => isValidIban(form.iban) && set('iban', formatIban(form.iban))}
              />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard title="جهة الطوارئ">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="الاسم والصلة" htmlFor="df-em-name">
              <Input id="df-em-name" className={FIELD_HEIGHT} value={form.emergencyName} onChange={(e) => set('emergencyName', e.target.value)} />
            </FormField>
            <FormField label="الهاتف" htmlFor="df-em-phone">
              <Input id="df-em-phone" type="tel" dir="ltr" className={`${FIELD_HEIGHT} text-end tabular-nums`} value={form.emergencyPhone} onChange={(e) => set('emergencyPhone', e.target.value)} />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard title="رصيد الإجازات">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="الإجازة السنوية (أيام عمل)" htmlFor="df-annual" hint={err('annualLeaveDays')}>
              <Input id="df-annual" inputMode="decimal" dir="ltr" aria-invalid={Boolean(err('annualLeaveDays'))} className={`${FIELD_HEIGHT} text-end tabular-nums`} value={form.annualLeaveDays} onChange={(e) => set('annualLeaveDays', e.target.value)} />
            </FormField>
            <FormField label="رصيد مُرحَّل من السنة السابقة" htmlFor="df-carry" hint={err('leaveCarryOver') ?? 'يُحتسب للسنة الحالية فقط.'}>
              <Input id="df-carry" inputMode="decimal" dir="ltr" aria-invalid={Boolean(err('leaveCarryOver'))} className={`${FIELD_HEIGHT} text-end tabular-nums`} value={form.leaveCarryOver} onChange={(e) => set('leaveCarryOver', e.target.value)} />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard title="إنهاء الخدمة" description="يُترك فارغاً للموظف على رأس العمل">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="آخر يوم في الخدمة" htmlFor="df-term" hint={err('terminationDate')}>
              {dateInput('df-term', 'terminationDate')}
            </FormField>
            <FormField label="السبب" htmlFor="df-term-reason" hint={err('terminationReason')}>
              <Input id="df-term-reason" aria-invalid={Boolean(err('terminationReason'))} className={FIELD_HEIGHT} value={form.terminationReason} onChange={(e) => set('terminationReason', e.target.value)} disabled={!form.terminationDate} />
            </FormField>
          </div>
          {form.terminationDate && <p className="mt-3 text-[12.5px] text-ink-mute">هذا التاريخ لا يوقف كشف الرواتب تلقائياً. عطّل الموظف من بطاقة الجهة بعد آخر راتب له.</p>}
        </SectionCard>

        <SectionCard title="ملاحظات" className="lg:col-span-2">
          <Textarea id="df-notes" aria-label="ملاحظات على الملف" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </SectionCard>
      </div>

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-30 flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-lift md:bottom-4">
        {error && (
          <p role="alert" className="text-[13px] leading-relaxed text-danger-ink">
            {error}
          </p>
        )}
        {showErrors && Object.keys(errors).length > 0 && !error && <p className="text-[12.5px] text-danger-ink">راجع الحقول المعلَّمة قبل الحفظ.</p>}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="min-h-11 flex-1 sm:min-h-9 sm:flex-none" onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
          <Button type="submit" className="min-h-11 flex-[2] sm:min-h-9 sm:flex-none" disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            احفظ البيانات
          </Button>
        </div>
      </div>
    </form>
  );
}
