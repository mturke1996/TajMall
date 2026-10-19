'use client';

import type { ReactNode } from 'react';
import { Contact, FileText, IdCard, Pencil, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InfoList, SectionCard, type InfoItem } from '@/components/people';
import { ContactWhatsAppButton } from '@/components/contacts/contact-phone-actions';
import { CONTACT_ROLES, extractContactBusinessRole } from '@/lib/contacts/contact-roles';
import { readTags } from '@/lib/contacts/contact-tags';
import { profileNotes } from '@/lib/people/party-profile';
import { digitsOnly } from '@/lib/arabic-search';
import { formatMonthLabelAr } from '@/lib/rent-months';
import { formatDate, formatMoney } from '@/lib/utils';
import type { ContactRow } from '@/lib/db/types';

const KIND_TEXT: Record<string, string> = {
  VENDOR: 'مورد',
  CUSTOMER: 'عميل',
  TENANT: 'مستأجر',
  EMPLOYEE: 'موظف',
  OTHER: 'جهة أخرى',
};

const clean = (v: string | null | undefined) => (v ?? '').trim() || null;
const tel = (v: string | null) => (v ? `tel:${v.startsWith('+') ? '+' : ''}${digitsOnly(v)}` : undefined);

/** Roles whose file also carries supply facts (meter or contract number, classification). */
export function isSupplyRole(role: string): boolean {
  return role === 'SUPPLIER_ELECTRICITY' || role === 'SUPPLIER_WATER' || role === 'SUPPLIER_GOODS' || role === 'SERVICE_PROVIDER';
}

export function contactItems(contact: ContactRow): InfoItem[] {
  const phone = clean(contact.phone);
  const phone2 = clean(contact.phone2);
  const email = clean(contact.email);
  return [
    { label: 'الهاتف', value: phone, ltr: true, href: tel(phone) },
    { label: 'هاتف آخر', value: phone2, ltr: true, href: tel(phone2) },
    { label: 'البريد الإلكتروني', value: email, ltr: true, href: email ? `mailto:${email}` : undefined },
    { label: 'العنوان', value: clean(contact.address) },
  ];
}

export function identityItems(contact: ContactRow): InfoItem[] {
  const role = extractContactBusinessRole(contact);
  const meta = CONTACT_ROLES[role];
  const staff: InfoItem[] =
    contact.kind === 'EMPLOYEE'
      ? [
          { label: 'المسمى الوظيفي', value: clean(contact.job_title) },
          { label: 'القسم', value: clean(contact.department) },
          { label: 'تاريخ التعيين', value: contact.hire_date ? formatDate(contact.hire_date) : null },
          { label: 'الراتب الشهري', value: Number(contact.salary) > 0 ? formatMoney(Number(contact.salary), 'LYD') : null },
        ]
      : [];
  return [
    { label: 'النوع', value: KIND_TEXT[contact.kind] ?? KIND_TEXT.OTHER },
    // «جهة أخرى» says nothing the kind has not said
    { label: 'الدور', value: role === 'OTHER' ? null : meta.label },
    { label: 'الرمز', value: clean(contact.code), ltr: true },
    { label: 'الحالة', value: contact.is_active ? 'نشط' : 'غير نشط' },
    { label: 'الاسم بالإنجليزية', value: clean(contact.name_en), ltr: true },
    { label: 'الرقم الضريبي', value: clean(contact.tax_number), ltr: true },
    { label: 'رقم الهوية', value: clean(contact.id_number), ltr: true },
    ...staff,
    { label: 'تاريخ الإنشاء', value: contact.created_at ? formatDate(contact.created_at) : null },
  ];
}

/**
 * Whether the supply card says anything: always for electricity and water (the meter is the point), for goods
 * and services only once a meter or contract number or a classification is filled in.
 */
export function hasSupplyFacts(contact: ContactRow, role: string): boolean {
  if (role === 'SUPPLIER_ELECTRICITY' || role === 'SUPPLIER_WATER') return true;
  return !!(clean(contact.shop_number) || clean(contact.department));
}

export function supplyItems(contact: ContactRow): InfoItem[] {
  const role = extractContactBusinessRole(contact);
  return [
    { label: 'نوع التوريد', value: CONTACT_ROLES[role].label },
    { label: 'رقم العداد أو العقد', value: clean(contact.shop_number), ltr: true },
    { label: 'التصنيف', value: clean(contact.department) },
  ];
}

/** The «بيانات الجهة» cards, and the same cards under a landlord's rent schedule. */
export function PartyDetails({
  contact,
  onEdit,
  documents,
}: {
  contact: ContactRow;
  /** absent for people who may not edit the file */
  onEdit?: () => void;
  /** the PDF buttons of the file */
  documents?: ReactNode;
}) {
  const notes = profileNotes(contact.notes);
  const since = readTags(contact.notes).since;
  const edit = onEdit && (
    <Button type="button" variant="outline" className="min-h-11 gap-1.5 sm:min-h-9" onClick={onEdit}>
      <Pencil aria-hidden />
      تعديل
    </Button>
  );
  const contactFilled = [contact.phone, contact.phone2, contact.email, contact.address].some((v) => clean(v));

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-5">
      <SectionCard title="التواصل" icon={Contact} accent="blue" actions={edit}>
        <InfoList items={contactItems(contact)} />
        {!contactFilled && onEdit && <p className="mt-3 text-[12.5px] text-ink-mute">لم تُسجَّل بيانات تواصل. أضفها من «تعديل».</p>}
        {contact.phone && (
          <div className="mt-4 flex">
            <ContactWhatsAppButton name={contact.name} phone={contact.phone} kind={contact.kind} className="min-h-11 flex-1 sm:min-h-9 sm:flex-none" />
          </div>
        )}
      </SectionCard>

      <SectionCard title="التعريف" icon={IdCard} accent="teal">
        <InfoList
          items={[
            ...identityItems(contact),
            ...(since ? [{ label: 'بداية المتابعة', value: formatMonthLabelAr(since) }] : []),
          ]}
        />
      </SectionCard>

      {notes && (
        <SectionCard title="ملاحظات" icon={StickyNote} accent="violet">
          <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-soft">{notes}</p>
        </SectionCard>
      )}

      {documents && (
        <SectionCard title="ملف الجهة" icon={FileText} accent="violet">
          {documents}
        </SectionCard>
      )}
    </div>
  );
}
