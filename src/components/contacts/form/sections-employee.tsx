'use client';

import { ExternalLink } from 'lucide-react';
import { Amount } from '@/components/payroll/payroll-ui';
import { Callout } from '@/components/people/callout';
import { ChipRadios, GRID, MoneyField, PhoneField, Section, TextField, type ChipOption } from '@/components/contacts/form/fields';
import type { FormContext } from '@/components/contacts/form/context';
import { planSalaryStructure } from '@/lib/contacts/form-rules';
import { salaryTotal } from '@/lib/contacts/form-utils';
import { EMPLOYMENT_TYPES, employmentTypeLabel, formatIban, type EmploymentType } from '@/lib/leave';
import { formatMonthKeyAr, todayISODate } from '@/lib/utils';
import { NEEDS_DB_UPDATE } from '@/lib/user-messages';

const EMPLOYMENT_OPTIONS: ChipOption<EmploymentType>[] = EMPLOYMENT_TYPES.map((t) => ({ value: t, label: employmentTypeLabel(t) }));

/** The employee's identity, job and employment type. Pay and file follow, or a way to the file when editing. */
export function EmployeeSections({ ctx }: { ctx: FormContext }) {
  const { form, patch, patchEmployee, errorOf, touch, editing } = ctx;
  const e = form.employee;
  const timeBound = e.employmentType === 'CONTRACT' || e.employmentType === 'TEMPORARY';
  return (
    <>
      <Section title="الوظيفة">
        <div className={GRID}>
          <TextField id="cf-job_title" label="المسمى الوظيفي" value={form.job_title} onChange={(job_title) => patch({ job_title })} placeholder="مثال: محاسب" />
          <TextField id="cf-department" label="القسم" value={form.department} onChange={(department) => patch({ department })} placeholder="مثال: المالية" />
        </div>
        {!editing && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[12.5px] font-medium text-ink-soft">نوع التوظيف</p>
            <ChipRadios
              name="cf-employment"
              label="نوع التوظيف"
              value={e.employmentType}
              onChange={(employmentType) => patchEmployee({ employmentType })}
              options={EMPLOYMENT_OPTIONS}
            />
          </div>
        )}
        <div className={GRID}>
          <TextField id="cf-hire_date" label="تاريخ التعيين" type="date" value={form.hire_date} onChange={(hire_date) => patch({ hire_date })} />
          {!editing && timeBound && (
            <TextField
              id="cf-employeeContractEnd"
              label="نهاية العقد"
              type="date"
              value={e.contractEnd}
              onChange={(contractEnd) => patchEmployee({ contractEnd })}
              onBlur={() => touch('employeeContractEnd')}
              error={errorOf('employeeContractEnd')}
            />
          )}
        </div>
      </Section>
      {editing ? <EditingPay ctx={ctx} /> : <NewEmployeePay ctx={ctx} />}
    </>
  );
}

/** The pay of a new employee: basic salary and the two allowances, and when it starts. */
function NewEmployeePay({ ctx }: { ctx: FormContext }) {
  const { form, patch, patchEmployee, errorOf, touch, employeeSupport, canManage } = ctx;
  const e = form.employee;
  const plan = planSalaryStructure(form, todayISODate());
  const total = salaryTotal(form);

  let note: string | null = null;
  if (!canManage) note = 'يسجّل المحاسب هيكل الراتب من ملف الموظف. يُحفظ الراتب هنا في ملف الجهة.';
  else if (!employeeSupport.payroll) {
    // when the file is missing too, its note says why: once is enough
    note = `لن يُسجَّل هيكل الراتب الآن.${employeeSupport.file ? ` ${NEEDS_DB_UPDATE}` : ''} يُحفظ الراتب في ملف الجهة.`;
  }
  else if (plan) {
    const month = formatMonthKeyAr(plan.effectiveFrom.slice(0, 7));
    note = plan.fromHireDate ? `يبدأ الراتب من ${month}، شهر التعيين.` : `يبدأ الراتب من ${month}. حدّد تاريخ التعيين إن كان الراتب بدأ قبله.`;
  }

  return (
    <>
      <Section title="الراتب">
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
          <MoneyField id="cf-salary" className="col-span-2 sm:col-span-1" label="الراتب الأساسي (د.ل)" value={form.salary} onChange={(salary) => patch({ salary })} onBlur={() => touch('salary')} error={errorOf('salary')} />
          <MoneyField id="cf-housing" label="بدل السكن (د.ل)" value={e.housing} onChange={(housing) => patchEmployee({ housing })} onBlur={() => touch('housing')} error={errorOf('housing')} />
          <MoneyField id="cf-transport" label="بدل النقل (د.ل)" value={e.transport} onChange={(transport) => patchEmployee({ transport })} onBlur={() => touch('transport')} error={errorOf('transport')} />
        </div>
        <div role="status" className="flex items-center justify-between gap-3 rounded-lg bg-canvas-sunken px-3.5 py-2.5 text-[13px]">
          <span className="text-ink-soft">الإجمالي الشهري</span>
          <Amount value={total} className="text-[14px] font-semibold" />
        </div>
        {note && <p className="text-[12.5px] leading-snug text-ink-mute">{note}</p>}
      </Section>
      <EmployeeFile ctx={ctx} />
    </>
  );
}

/** Bank, emergency contact and leave of a new employee; or one calm line when this role or database cannot keep them. */
function EmployeeFile({ ctx }: { ctx: FormContext }) {
  const { form, patchEmployee, errorOf, touch, employeeSupport, canManage } = ctx;
  const e = form.employee;
  if (!canManage) {
    return <p className="border-t border-border pt-5 text-[12.5px] leading-snug text-ink-mute">يضيف المحاسب الحساب المصرفي وجهة الطوارئ والإجازات من ملف الموظف.</p>;
  }
  if (!employeeSupport.file) {
    return (
      <div className="border-t border-border pt-5">
        <Callout tone="info">الحساب المصرفي وجهة الطوارئ والإجازات لا تُحفظ الآن. {NEEDS_DB_UPDATE}</Callout>
      </div>
    );
  }
  return (
    <>
      <Section title="الحساب المصرفي">
        <div className={GRID}>
          <TextField id="cf-bankName" label="المصرف" value={e.bankName} onChange={(bankName) => patchEmployee({ bankName })} />
          <TextField id="cf-bankAccount" label="رقم الحساب" ltr value={e.bankAccount} onChange={(bankAccount) => patchEmployee({ bankAccount })} />
        </div>
        <TextField
          id="cf-iban"
          label="رقم الآيبان"
          ltr
          value={e.iban}
          onChange={(iban) => patchEmployee({ iban })}
          onBlur={() => {
            touch('iban');
            if (e.iban.trim() && formatIban(e.iban) !== e.iban) patchEmployee({ iban: formatIban(e.iban) });
          }}
          error={errorOf('iban')}
          placeholder="LY83 0020 …"
        />
      </Section>
      <Section title="جهة الطوارئ">
        <div className={GRID}>
          <TextField id="cf-emergencyName" label="الاسم" value={e.emergencyName} onChange={(emergencyName) => patchEmployee({ emergencyName })} placeholder="مثال: سالم أحمد (الأخ)" />
          <PhoneField id="cf-emergencyPhone" label="الهاتف" value={e.emergencyPhone} onChange={(emergencyPhone) => patchEmployee({ emergencyPhone })} onBlur={() => touch('emergencyPhone')} error={errorOf('emergencyPhone')} />
        </div>
      </Section>
      <Section title="الإجازة">
        <TextField
          id="cf-annualLeaveDays"
          label="أيام الإجازة السنوية"
          inputMode="decimal"
          ltr
          className="sm:max-w-[50%]"
          value={e.annualLeaveDays}
          onChange={(annualLeaveDays) => patchEmployee({ annualLeaveDays })}
          onBlur={() => touch('annualLeaveDays')}
          error={errorOf('annualLeaveDays')}
          hint="30 يوماً إن لم تغيّرها."
        />
      </Section>
    </>
  );
}

/**
 * Editing an employee. The pay has an effective date and a history, and the file (bank, emergency contact,
 * leave) its own form, so both are changed from the employee's file, which opens in a new tab and keeps this
 * form as it is. Where the database has no payroll yet, the salary on the card can still be changed here.
 */
function EditingPay({ ctx }: { ctx: FormContext }) {
  const { form, patch, errorOf, touch, employeeSupport, editingId } = ctx;
  if (!employeeSupport.payroll) {
    // the card keeps one monthly figure (basic pay and allowances together): that one figure is what is changed here
    return (
      <Section title="الراتب">
        <MoneyField
          id="cf-salary"
          className="sm:max-w-[50%]"
          label="الراتب الشهري (د.ل)"
          value={form.salary}
          onChange={(salary) => patch({ salary })}
          onBlur={() => touch('salary')}
          error={errorOf('salary')}
        />
        <p className="text-[12.5px] leading-snug text-ink-mute">{NEEDS_DB_UPDATE} إلى أن يتم ذلك يُحفظ الراتب في ملف الجهة.</p>
      </Section>
    );
  }
  const total = salaryTotal(form);
  return (
    <Section title="الراتب والبيانات الوظيفية">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-canvas-sunken/60 p-3.5">
        <div className="min-w-0">
          <p className="text-[12.5px] text-ink-mute">الراتب الشهري الحالي</p>
          <p className="mt-0.5 text-[15px] font-semibold text-foreground">{total > 0 ? <Amount value={total} /> : 'لم يُحدَّد بعد'}</p>
        </div>
        {editingId && (
          <a
            href={`/payroll/employees/${editingId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-medium text-foreground hover:bg-canvas-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-9"
          >
            فتح ملف الموظف
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(في صفحة جديدة)</span>
          </a>
        )}
      </div>
      <p className="text-[12.5px] leading-snug text-ink-mute">الراتب والحساب المصرفي وجهة الطوارئ والإجازات تُعدَّل من ملف الموظف.</p>
    </Section>
  );
}
