'use client';

import Link from 'next/link';
import { FileText, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ContactPhoneActions } from '@/components/contacts/contact-phone-actions';
import { ContactLedgerPanel } from '@/components/contacts/contact-ledger-panel';
import { visibleContactNotes } from '@/lib/contacts/contact-roles';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import type { ContactRow, TransactionWithRelations } from '@/lib/db/types';
import { cn, formatDate, formatMoney } from '@/lib/utils';

function Row({ label, children, ltr }: { label: string; children: React.ReactNode; ltr?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="shrink-0 text-[13px] text-ink-mute">{label}</dt>
      <dd className="min-w-0 text-end text-[13.5px] font-medium text-foreground" dir={ltr ? 'ltr' : undefined}>
        {children}
      </dd>
    </div>
  );
}

/**
 * Profile of a customer, an employee or any other contact that is not a tenant, landlord or utility
 * supplier: who they are on the side, and their statement (money in and out, transactions, journal
 * entries) as the main content.
 */
export function OtherContactDetailBody({
  contact,
  transactions,
  txLoading,
  journalEntries,
  jeLoading,
  kindLabel,
  kindColor,
  KindIcon,
}: {
  contact: ContactRow;
  transactions: TransactionWithRelations[];
  txLoading: boolean;
  journalEntries: JournalEntryRow[];
  jeLoading: boolean;
  kindLabel?: string;
  kindColor?: string;
  KindIcon: LucideIcon;
}) {
  const notes = visibleContactNotes(contact.notes);
  const isEmployee = contact.kind === 'EMPLOYEE';
  const lastTx = transactions
    .filter((t) => t.status === 'POSTED' || t.status === 'RECONCILED')
    .reduce<TransactionWithRelations | null>((a, t) => (!a || t.tx_date > a.tx_date ? t : a), null);

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
      <div className="order-2 flex flex-col gap-4 lg:order-0 lg:sticky lg:top-20 lg:self-start">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted" aria-hidden>
              <KindIcon className={cn('h-5 w-5', kindColor)} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {kindLabel && <Badge variant="outline">{kindLabel}</Badge>}
                <Badge variant={contact.is_active ? 'success' : 'warning'}>{contact.is_active ? 'نشط' : 'غير نشط'}</Badge>
              </div>
              {contact.code && <p className="mt-1 text-[12.5px] text-ink-mute tabular-nums">{contact.code}</p>}
            </div>
          </div>

          <dl className="mt-3 divide-y divide-border">
            {contact.name_en && <Row label="الاسم بالإنجليزية" ltr>{contact.name_en}</Row>}
            {contact.phone && (
              <Row label="الهاتف" ltr>
                <a href={`tel:${contact.phone}`} className="tabular-nums hover:underline">
                  {contact.phone}
                </a>
                {contact.phone2 && <span className="block text-[12.5px] font-normal text-ink-mute tabular-nums">{contact.phone2}</span>}
              </Row>
            )}
            {contact.email && (
              <Row label="البريد" ltr>
                <span className="break-all">{contact.email}</span>
              </Row>
            )}
            {contact.address && <Row label="العنوان">{contact.address}</Row>}
            {isEmployee && contact.job_title && <Row label="المسمى الوظيفي">{contact.job_title}</Row>}
            {isEmployee && contact.department && <Row label="القسم">{contact.department}</Row>}
            {isEmployee && Number(contact.salary) > 0 && (
              <Row label="الراتب الشهري">
                <span className="tabular-nums">{formatMoney(Number(contact.salary), 'LYD')}</span>
              </Row>
            )}
            {isEmployee && contact.hire_date && <Row label="تاريخ التعيين">{formatDate(contact.hire_date)}</Row>}
            {contact.tax_number && <Row label="الرقم الضريبي">{contact.tax_number}</Row>}
            {contact.id_number && <Row label="رقم الهوية">{contact.id_number}</Row>}
            <Row label="آخر حركة">
              {lastTx ? (
                <span className="tabular-nums">
                  {formatDate(lastTx.tx_date)} · {formatMoney(Number(lastTx.amount), 'LYD')}
                </span>
              ) : (
                <span className="font-normal text-ink-mute">لا حركات بعد</span>
              )}
            </Row>
          </dl>

          {contact.phone && (
            <div className="mt-3">
              <ContactPhoneActions name={contact.name} phone={contact.phone} kind={contact.kind} />
            </div>
          )}
          {!contact.phone && !contact.email && !contact.address && (
            <p className="mt-2 text-[12.5px] text-ink-mute">بيانات التواصل ناقصة — أكملها من «تعديل».</p>
          )}
          {notes && (
            <p className="mt-3 whitespace-pre-line rounded-lg bg-canvas-sunken/70 px-3 py-2 text-[12.5px] leading-relaxed text-ink-mute">
              {notes}
            </p>
          )}
          {isEmployee && (
            <Button variant="outline" size="sm" className="mt-3 h-9 w-full gap-1.5" asChild>
              <Link href={`/payroll/employees/${contact.id}`}>
                <FileText className="h-4 w-4" aria-hidden />
                ملف الراتب والسلف
              </Link>
            </Button>
          )}
        </Card>
      </div>

      <div className="order-1 min-w-0 lg:col-span-2">
        <ContactLedgerPanel
          contact={contact}
          transactions={transactions}
          journalEntries={journalEntries}
          txLoading={txLoading}
          jeLoading={jeLoading}
        />
      </div>
    </div>
  );
}
