'use client';

import { useState } from 'react';
import { Copy, Eye, EyeOff, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Callout, ErrorBlock, InfoList, LoadingBlock, SectionCard } from '@/components/people';
import { DetailsForm } from '@/components/employees/details-form';
import { DbUpdateNotice } from '@/components/employees/profile-shell';
import type { EmployeeProfileData } from '@/components/employees/use-employee-profile';
import { Amount } from '@/components/payroll/payroll-ui';
import { visibleContactNotes } from '@/lib/contacts/contact-roles';
import { monthKeyOf } from '@/lib/employees/employee-profile';
import { daysLabel, employmentTypeLabel, formatIban, maskTail, tenureLabel } from '@/lib/leave';
import { formatDate, formatMoney, formatMonthKeyAr } from '@/lib/utils';
import type { ContactRow } from '@/lib/db/types';

const day = (iso: string | null | undefined) => (iso ? formatDate(iso) : null);

/** A number that is hidden until asked for: bank and identity numbers are not shown to whoever looks over a shoulder. */
function Secret({ value, shown, mask, ltr = true }: { value: string | null | undefined; shown: boolean; mask: (v: string) => string; ltr?: boolean }) {
  if (!value) return null;
  return (
    <bdi dir={ltr ? 'ltr' : undefined} className="tabular-nums">
      {shown ? value : mask(value)}
    </bdi>
  );
}

function RevealButton({ shown, onToggle, label }: { shown: boolean; onToggle: () => void; label: string }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="min-h-11 gap-1.5 sm:min-h-8" aria-pressed={shown} onClick={onToggle}>
      {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
      {shown ? 'أخفِ' : 'أظهر'} {label}
    </Button>
  );
}

export function DetailsTab({ data, contact }: { data: EmployeeProfileData; contact: ContactRow }) {
  const { details, parts, kpis, canManage, today } = data;
  const [editing, setEditing] = useState(false);
  const [showId, setShowId] = useState(false);
  const [showBank, setShowBank] = useState(false);

  if (editing && canManage) {
    return <DetailsForm contact={contact} details={details} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />;
  }

  const filePart = parts.details;
  const fileMissing = filePart.missing;
  const nationalId = details?.national_id || contact.id_number;
  const tenure = tenureLabel(contact.hire_date, today);
  const note = visibleContactNotes(contact.notes);
  const iban = details?.iban ? formatIban(details.iban) : null;

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`نُسخ ${what}`);
    } catch {
      toast.error('تعذّر النسخ. حدّد الرقم وانسخه يدوياً.');
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">البيانات الوظيفية</h2>
        </div>
        {canManage && !fileMissing && (
          <Button type="button" className="min-h-11 gap-1.5 sm:min-h-9" onClick={() => setEditing(true)} disabled={filePart.loading}>
            <Pencil aria-hidden />
            تعديل البيانات
          </Button>
        )}
      </div>

      {fileMissing && <DbUpdateNotice what="leave" />}
      {filePart.error && (
        <Card>
          <ErrorBlock message="تعذّر تحميل ملف الموظف. أعد المحاولة." onRetry={filePart.retry} />
        </Card>
      )}
      {canManage && !fileMissing && !filePart.loading && !filePart.error && details === null && (
        <Callout tone="info" action={<Button type="button" variant="outline" onClick={() => setEditing(true)}>افتح الملف</Button>}>
          لم يُفتح ملف وظيفي لهذا الموظف بعد (الهوية والحساب المصرفي وجهة الطوارئ). الإجازة السنوية 30 يوماً إلى أن تُحدَّد.
        </Callout>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="التعيين">
          <InfoList
            items={[
              { label: 'المسمى الوظيفي', value: contact.job_title },
              { label: 'القسم', value: contact.department },
              { label: 'تاريخ التعيين', value: day(contact.hire_date) ? `${day(contact.hire_date)}${tenure ? ` — ${tenure}` : ''}` : null },
              { label: 'نوع التوظيف', value: details ? employmentTypeLabel(details.employment_type) : null },
              { label: 'انتهاء فترة التجربة', value: day(details?.probation_end) },
              { label: 'انتهاء العقد', value: day(details?.contract_end) },
              { label: 'الحالة', value: data.status.label },
            ]}
          />
        </SectionCard>

        <SectionCard title="الراتب">
          <InfoList
            items={[
              {
                label: 'الراتب الشهري',
                value: kpis.salary.source === 'none' ? null : <Amount value={kpis.salary.total} />,
              },
              {
                label: 'يسري من',
                value: kpis.salary.since ? formatMonthKeyAr(kpis.salary.since) : kpis.salary.source === 'card' ? (data.structuresReadable ? 'من بطاقة الجهة، بلا هيكل' : 'من بطاقة الجهة') : null,
              },
              {
                label: 'في بطاقة الجهة',
                value: contact.salary && Number(contact.salary) > 0 ? <Amount value={contact.salary} muted={Number(contact.salary) === kpis.salary.total} /> : null,
              },
              ...(kpis.salary.coming ? [{ label: 'يصبح', value: `${formatMoney(kpis.salary.coming.total, 'LYD')} من ${formatMonthKeyAr(monthKeyOf(kpis.salary.coming.from))}` }] : []),
            ]}
          />
          {kpis.salary.source === 'structure' && contact.salary && Math.abs(Number(contact.salary) - kpis.salary.total) > 0.0005 && (
            <p className="mt-3 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-[12.5px] text-warning-ink">
              الراتب في بطاقة الجهة يختلف عن هيكل الراتب الحالي. المعتمد في الكشوف هو الهيكل.
            </p>
          )}
        </SectionCard>

        <SectionCard title="الهوية" actions={nationalId ? <RevealButton shown={showId} onToggle={() => setShowId((v) => !v)} label="الرقم" /> : undefined}>
          {filePart.loading ? (
            <LoadingBlock rows={2} className="p-0" />
          ) : (
            <InfoList
              items={[
                { label: 'الرقم الوطني', value: <Secret value={nationalId} shown={showId} mask={(v) => maskTail(v)} /> },
                { label: 'تاريخ الميلاد', value: day(details?.birth_date) },
              ]}
            />
          )}
        </SectionCard>

        <SectionCard title="الحساب المصرفي" actions={details?.iban || details?.bank_account ? <RevealButton shown={showBank} onToggle={() => setShowBank((v) => !v)} label="الأرقام" /> : undefined}>
          {filePart.loading ? (
            <LoadingBlock rows={3} className="p-0" />
          ) : (
            <>
              <InfoList
                items={[
                  { label: 'المصرف', value: details?.bank_name },
                  { label: 'رقم الحساب', value: <Secret value={details?.bank_account} shown={showBank} mask={(v) => maskTail(v)} /> },
                  { label: 'الآيبان', value: <Secret value={iban} shown={showBank} mask={(v) => maskTail(v, 4)} /> },
                ]}
              />
              {iban && showBank && (
                <Button type="button" variant="outline" size="sm" className="mt-3 min-h-11 gap-1.5 sm:min-h-8" onClick={() => void copy(iban.replace(/\s+/g, ''), 'الآيبان')}>
                  <Copy aria-hidden />
                  انسخ الآيبان
                </Button>
              )}
            </>
          )}
        </SectionCard>

        <SectionCard title="جهة الطوارئ">
          {filePart.loading ? (
            <LoadingBlock rows={2} className="p-0" />
          ) : (
            <InfoList
              items={[
                { label: 'الاسم والصلة', value: details?.emergency_name },
                { label: 'الهاتف', value: details?.emergency_phone, ltr: true, href: details?.emergency_phone ? `tel:${details.emergency_phone.replace(/[^\d+]/g, '')}` : undefined },
              ]}
            />
          )}
        </SectionCard>

        <SectionCard title="رصيد الإجازات">
          {filePart.loading ? (
            <LoadingBlock rows={2} className="p-0" />
          ) : (
            <InfoList
              items={[
                { label: 'الإجازة السنوية', value: details ? daysLabel(details.annual_leave_days) : '30 يوماً (لم يُفتح الملف)' },
                {
                  label: 'رصيد مُرحَّل',
                  value: details && details.leave_carry_over > 0 ? `${daysLabel(details.leave_carry_over)}${details.leave_carry_over_year ? ` لسنة ${details.leave_carry_over_year}` : ''}` : details ? 'لا يوجد' : null,
                },
              ]}
            />
          )}
        </SectionCard>

        {details?.termination_date && (
          <SectionCard title="إنهاء الخدمة" className="lg:col-span-2">
            <InfoList items={[{ label: 'آخر يوم في الخدمة', value: day(details.termination_date) }, { label: 'السبب', value: details.termination_reason }]} />
          </SectionCard>
        )}

        {(note || details?.notes) && (
          <SectionCard title="ملاحظات" className="lg:col-span-2">
            <InfoList items={[{ label: 'ملف الموظف', value: details?.notes }, { label: 'بطاقة الجهة', value: note }]} />
          </SectionCard>
        )}
      </div>
    </>
  );
}
