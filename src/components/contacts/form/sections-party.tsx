'use client';

import { Disclosure, GRID, MoneyField, Section, SuggestionChips, TextField } from '@/components/contacts/form/fields';
import { MonthField } from '@/components/people/month-field';
import type { FormContext } from '@/components/contacts/form/context';
import { customerShowsTax, idLabelFor } from '@/components/contacts/form/sections-common';
import { CUSTOMER_TYPE_LABEL, type CustomerType } from '@/lib/contacts/form-utils';
import { formatMonthKeyAr } from '@/lib/utils';

const TYPE_OPTIONS = [CUSTOMER_TYPE_LABEL.individual, CUSTOMER_TYPE_LABEL.company] as const;
const PURCHASES = ['خدمات', 'مواقف', 'إعلانات'] as const;

/** What a supplier is identified by: the meter of a utility, the contract of the others, and the tax number. */
export function VendorSection({ ctx }: { ctx: FormContext }) {
  const { form, patch } = ctx;
  const utility = form.businessRole === 'SUPPLIER_ELECTRICITY' || form.businessRole === 'SUPPLIER_WATER';
  return (
    <Section title="بيانات المورد">
      <div className={GRID}>
        <TextField
          id="cf-shop_number"
          label={utility ? 'رقم العداد' : 'رقم العقد أو الاشتراك'}
          ltr
          value={form.shop_number}
          onChange={(shop_number) => patch({ shop_number })}
        />
        <TextField id="cf-tax_number" label="الرقم الضريبي" ltr value={form.tax_number} onChange={(tax_number) => patch({ tax_number })} />
      </div>
    </Section>
  );
}

/** A customer is a person or a company and buys something; a regular contract is optional. */
export function CustomerSection({ ctx }: { ctx: FormContext }) {
  const { form, patch, errorOf, touch } = ctx;
  const typeLabel = form.customerType ? CUSTOMER_TYPE_LABEL[form.customerType] : null;
  const pickType = (label: string) => {
    const next: CustomerType = label === CUSTOMER_TYPE_LABEL.company ? 'company' : 'individual';
    patch({ customerType: form.customerType === next ? '' : next });
  };
  const hasContract = Boolean(form.monthly_rent || form.contract_start || form.contract_end);
  return (
    <Section title="بيانات العميل">
      <div className="flex flex-col gap-1.5">
        <p className="text-[12.5px] font-medium text-ink-soft">نوع العميل</p>
        <SuggestionChips label="نوع العميل" options={TYPE_OPTIONS} active={typeLabel} onPick={pickType} />
      </div>
      <div className={GRID}>
        <TextField id="cf-id_number" label={idLabelFor(form)} ltr value={form.id_number} onChange={(id_number) => patch({ id_number })} />
        {customerShowsTax(form) && (
          <TextField id="cf-tax_number" label="الرقم الضريبي" ltr value={form.tax_number} onChange={(tax_number) => patch({ tax_number })} />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <TextField
          id="cf-department"
          label="ما يشتريه"
          value={form.department}
          onChange={(department) => patch({ department })}
          placeholder="مثال: إعلانات الواجهة"
        />
        <SuggestionChips label="ما يشتريه" options={PURCHASES} active={form.department} onPick={(p) => patch({ department: form.department === p ? '' : p })} />
      </div>
      <Disclosure title="عقد دوري" hint="اختياري" open={hasContract}>
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
          <MoneyField
            id="cf-monthly_rent"
            className="col-span-2 sm:col-span-1"
            label="المبلغ الشهري (د.ل)"
            value={form.monthly_rent}
            onChange={(monthly_rent) => patch({ monthly_rent })}
            onBlur={() => touch('monthly_rent')}
            error={errorOf('monthly_rent')}
          />
          <TextField id="cf-contract_start" label="بداية العقد" type="date" value={form.contract_start} onChange={(contract_start) => patch({ contract_start })} />
          <TextField
            id="cf-contract_end"
            label="نهاية العقد"
            type="date"
            value={form.contract_end}
            onChange={(contract_end) => patch({ contract_end })}
            onBlur={() => touch('contract_end')}
            error={errorOf('contract_end')}
          />
        </div>
      </Disclosure>
    </Section>
  );
}

/** What the mall pays this landlord, for what, from when it is followed in the system. */
export function LandlordSection({ ctx }: { ctx: FormContext }) {
  const { form, patch, errorOf, touch } = ctx;
  return (
    <Section title="عقد الإيجار" description="ما يدفعه المول لهذا المؤجر.">
      <div className="grid grid-cols-2 gap-3.5">
        <MoneyField
          id="cf-monthly_rent"
          className="col-span-2 sm:col-span-1"
          label="الإيجار الشهري (د.ل)"
          hint="يُحسب به المتبقي في كل شهر."
          value={form.monthly_rent}
          onChange={(monthly_rent) => patch({ monthly_rent })}
          onBlur={() => touch('monthly_rent')}
          error={errorOf('monthly_rent')}
        />
        <TextField id="cf-shop_number" className="col-span-2 sm:col-span-1" label="اسم العقار أو الموقع" value={form.shop_number} onChange={(shop_number) => patch({ shop_number })} placeholder="مثال: أرض المواقف" />
        <TextField id="cf-contract_start" label="بداية العقد" type="date" value={form.contract_start} onChange={(contract_start) => patch({ contract_start })} />
        <TextField
          id="cf-contract_end"
          label="نهاية العقد"
          type="date"
          value={form.contract_end}
          onChange={(contract_end) => patch({ contract_end })}
          onBlur={() => touch('contract_end')}
          error={errorOf('contract_end')}
        />
        <TextField id="cf-floor" label="الطابق" value={form.floor} onChange={(floor) => patch({ floor })} />
        <MoneyField
          id="cf-area_sqm"
          label="المساحة (م²)"
          value={form.area_sqm}
          onChange={(area_sqm) => patch({ area_sqm })}
          onBlur={() => touch('area_sqm')}
          error={errorOf('area_sqm')}
        />
      </div>
      <MonthField
        label="بداية المتابعة في المنظومة"
        value={form.since}
        onChange={(since) => patch({ since })}
        clearLabel="غير محددة"
        hint={
          form.since
            ? `الأشهر قبل ${formatMonthKeyAr(form.since)} تُحسب «مسدّد قبل المنظومة».`
            : 'إن لم تحدّدها، تبدأ من أول دفعة مسجّلة، وإن لم توجد فمن بداية تشغيل المنظومة.'
        }
      />
    </Section>
  );
}

/** The shop, its floor and size, the rent, and the contract. */
export function TenantSection({ ctx }: { ctx: FormContext }) {
  const { form, patch, errorOf, touch } = ctx;
  const row = 'grid grid-cols-2 gap-3.5 sm:grid-cols-3';
  return (
    <Section title="المحل والإيجار">
      <div className={row}>
        <TextField id="cf-shop_number" label="رقم المحل" ltr value={form.shop_number} onChange={(shop_number) => patch({ shop_number })} />
        <TextField id="cf-floor" label="الطابق" value={form.floor} onChange={(floor) => patch({ floor })} />
        <MoneyField
          id="cf-area_sqm"
          className="col-span-2 sm:col-span-1"
          label="المساحة (م²)"
          value={form.area_sqm}
          onChange={(area_sqm) => patch({ area_sqm })}
          onBlur={() => touch('area_sqm')}
          error={errorOf('area_sqm')}
        />
      </div>
      <div className={row}>
        <MoneyField
          id="cf-monthly_rent"
          className="col-span-2 sm:col-span-1"
          label="الإيجار الشهري (د.ل)"
          value={form.monthly_rent}
          onChange={(monthly_rent) => patch({ monthly_rent })}
          onBlur={() => touch('monthly_rent')}
          error={errorOf('monthly_rent')}
        />
        <TextField id="cf-contract_start" label="بداية العقد" type="date" value={form.contract_start} onChange={(contract_start) => patch({ contract_start })} />
        <TextField
          id="cf-contract_end"
          label="نهاية العقد"
          type="date"
          value={form.contract_end}
          onChange={(contract_end) => patch({ contract_end })}
          onBlur={() => touch('contract_end')}
          error={errorOf('contract_end')}
        />
      </div>
    </Section>
  );
}
