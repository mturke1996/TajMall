'use client';

import { Disclosure, GRID, NotesField, PhoneField, Section, SuggestionChips, TextField } from '@/components/contacts/form/fields';
import { DuplicateWarning } from '@/components/contacts/form/duplicate-warning';
import type { FormContext } from '@/components/contacts/form/context';
import { PAYMENT_TERMS, applyPaymentTerms, paymentTermsOf } from '@/lib/contacts/form-rules';
import { SUPPLY_CATEGORY } from '@/lib/contacts/form-utils';

/** The label of the name field says what the file is. */
export function nameLabelFor({ businessRole, kind, customerType }: FormContext['form']): string {
  if (businessRole === 'LANDLORD') return 'اسم المؤجر';
  if (businessRole === 'CUSTOMER') return customerType === 'company' ? 'اسم الشركة' : 'اسم العميل';
  if (businessRole === 'EMPLOYEE') return 'اسم الموظف';
  if (businessRole === 'TENANT') return 'اسم المستأجر أو النشاط';
  if (kind === 'VENDOR') return 'اسم المورد أو الشركة';
  return 'الاسم';
}

/** A company has a tax number; so does any customer that already holds one. */
export const customerShowsTax = ({ customerType, tax_number }: FormContext['form']) => customerType === 'company' || Boolean(tax_number);

/** One example of a name, so the empty field says what goes in it. */
export function namePlaceholderFor({ businessRole, kind }: FormContext['form']): string {
  if (businessRole === 'LANDLORD') return 'مثال: عبدالله المصراتي';
  if (businessRole === 'EMPLOYEE') return 'الاسم الثلاثي';
  if (businessRole === 'TENANT') return 'مثال: مقهى الواحة';
  if (businessRole === 'CUSTOMER') return 'مثال: شركة الواحة للإعلان';
  if (kind === 'VENDOR') return 'مثال: شركة النور للتوريد';
  return '';
}

/** The identity number means a different thing for each kind of file. */
export function idLabelFor({ businessRole, customerType }: FormContext['form']): string {
  if (businessRole === 'EMPLOYEE') return 'رقم الهوية الوطنية';
  if (businessRole === 'CUSTOMER' && customerType === 'individual') return 'رقم الهوية';
  if (businessRole === 'CUSTOMER' && customerType === 'company') return 'السجل التجاري';
  return 'رقم الهوية أو السجل التجاري';
}

/** Name, the two phone numbers, the duplicate warning, e-mail and address: what every file has. */
export function BasicSection({ ctx }: { ctx: FormContext }) {
  const { form, patch, errorOf, touch } = ctx;
  const isEmployee = form.businessRole === 'EMPLOYEE';
  return (
    <Section title="البيانات الأساسية" description={ctx.editing ? undefined : 'الاسم وحده مطلوب. أكمل الباقي الآن أو لاحقاً.'}>
      <TextField
        id="cf-name"
        label={nameLabelFor(form)}
        required
        value={form.name}
        onChange={(name) => patch({ name })}
        onBlur={() => touch('name')}
        error={errorOf('name')}
        inputRef={ctx.nameRef}
        placeholder={namePlaceholderFor(form)}
        inputClassName="h-12 text-[15px] sm:h-11"
        autoComplete="off"
        maxLength={160}
      />
      <div className={GRID}>
        <PhoneField id="cf-phone" label="الهاتف" value={form.phone} onChange={(phone) => patch({ phone })} onBlur={() => touch('phone')} error={errorOf('phone')} />
        <PhoneField id="cf-phone2" label="هاتف آخر" value={form.phone2} onChange={(phone2) => patch({ phone2 })} onBlur={() => touch('phone2')} error={errorOf('phone2')} />
      </div>
      <DuplicateWarning matches={ctx.matches} />
      <div className={GRID}>
        {isEmployee ? (
          <TextField id="cf-id_number" label="رقم الهوية الوطنية" ltr value={form.id_number} onChange={(id_number) => patch({ id_number })} />
        ) : (
          <TextField
            id="cf-email"
            label="البريد الإلكتروني"
            type="email"
            inputMode="email"
            ltr
            value={form.email}
            onChange={(email) => patch({ email })}
            onBlur={() => touch('email')}
            error={errorOf('email')}
          />
        )}
        <TextField id="cf-address" label="العنوان" value={form.address} onChange={(address) => patch({ address })} />
      </div>
    </Section>
  );
}

/** Notes. A supplier also gets quick payment terms, kept as one line of the note. */
export function NotesSection({ ctx }: { ctx: FormContext }) {
  const { form, patch, submit } = ctx;
  const supplier = form.businessRole in SUPPLY_CATEGORY;
  return (
    <Section title={supplier ? 'شروط الدفع والملاحظات' : 'ملاحظات'}>
      {supplier && (
        <SuggestionChips
          label="شروط الدفع"
          options={PAYMENT_TERMS}
          active={paymentTermsOf(form.notes)}
          onPick={(term) => patch({ notes: applyPaymentTerms(form.notes, term) })}
        />
      )}
      <NotesField
        id="cf-notes"
        label="ملاحظات"
        hideLabel
        value={form.notes}
        onChange={(notes) => patch({ notes })}
        onSubmitShortcut={submit}
        rows={3}
      />
    </Section>
  );
}

/** Rarely needed fields, folded away; open from the start when the file already has one of them. */
export function MoreSection({ ctx }: { ctx: FormContext }) {
  const { form, patch, editing } = ctx;
  const role = form.businessRole;
  // the identity number and the tax number already have a place in these roles' own sections
  const idElsewhere = role === 'EMPLOYEE' || role === 'CUSTOMER';
  const taxElsewhere = role in SUPPLY_CATEGORY || (role === 'CUSTOMER' && customerShowsTax(form));
  const holdsSomething = Boolean(form.name_en || (!idElsewhere && form.id_number) || (!taxElsewhere && form.tax_number) || !form.is_active);
  return (
    <Disclosure title="بيانات إضافية" open={holdsSomething}>
      <div className={GRID}>
        <TextField id="cf-name_en" label="الاسم بالإنجليزية" ltr value={form.name_en} onChange={(name_en) => patch({ name_en })} autoComplete="off" />
        {!idElsewhere && (
          <TextField id="cf-id_number" label={idLabelFor(form)} ltr value={form.id_number} onChange={(id_number) => patch({ id_number })} />
        )}
        {!taxElsewhere && (
          <TextField id="cf-tax_number" label="الرقم الضريبي" ltr value={form.tax_number} onChange={(tax_number) => patch({ tax_number })} />
        )}
      </div>
      {editing && (
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 text-[13px]">
          <span>
            <span className="font-medium text-foreground">الملف نشط</span>
            <span className="block text-[12px] text-ink-mute">الملف غير النشط يبقى بحركاته ولا يظهر في الاختيارات.</span>
          </span>
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => patch({ is_active: e.target.checked })}
            className="h-5 w-5 shrink-0 accent-success"
          />
        </label>
      )}
    </Disclosure>
  );
}
