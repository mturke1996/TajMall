'use client';

import { Pencil } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ContactPhoneActions } from '@/components/contacts/contact-phone-actions';
import { ContactLedgerPanel } from '@/components/contacts/contact-ledger-panel';
import { cn, formatMoney, formatDate } from '@/lib/utils';
import type { ContactRow, TransactionWithRelations } from '@/lib/db/types';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import { visibleContactNotes, CONTACT_ROLES, type ContactBusinessRole } from '@/lib/contacts/contact-roles';
import { getPostedContactTransactions } from '@/lib/contacts/contact-transactions';

type Props = {
  contact: ContactRow;
  role: ContactBusinessRole;
  transactions: TransactionWithRelations[];
  journalEntries: JournalEntryRow[];
  txLoading: boolean;
  onEdit?: () => void;
};

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
 * Supplier profile (electricity, water, goods, services): the supply details on the side, and the
 * statement of what was paid to them as the main content.
 */
export function UtilitySupplierPanel({ contact, role, transactions, journalEntries, txLoading, onEdit }: Props) {
  const meta = CONTACT_ROLES[role] || CONTACT_ROLES.OTHER;
  const RoleIcon = meta.icon;
  const notes = visibleContactNotes(contact.notes);
  const lastPayment = getPostedContactTransactions(transactions)
    .filter((t) => t.kind === 'EXPENSE')
    .reduce<TransactionWithRelations | null>((a, t) => (!a || t.tx_date > a.tx_date ? t : a), null);

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
      <div className="order-2 flex flex-col gap-4 lg:order-0 lg:sticky lg:top-20 lg:self-start">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl', meta.bgColor, meta.color)} aria-hidden>
                <RoleIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-foreground">{meta.badge}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant={contact.is_active ? 'success' : 'warning'}>{contact.is_active ? 'نشط' : 'غير نشط'}</Badge>
                  {contact.code && <span className="text-[12.5px] text-ink-mute tabular-nums">{contact.code}</span>}
                </div>
              </div>
            </div>
            {onEdit && (
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-[13px]" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                تعديل
              </Button>
            )}
          </div>

          <dl className="mt-3 divide-y divide-border">
            <Row label="نوع التوريد">{meta.label}</Row>
            {contact.shop_number && (
              <Row label="العداد / العقد">
                <span className="tabular-nums">{contact.shop_number}</span>
              </Row>
            )}
            {contact.department && <Row label="التصنيف">{contact.department}</Row>}
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
            {contact.tax_number && <Row label="الرقم الضريبي">{contact.tax_number}</Row>}
            <Row label="آخر سداد">
              {lastPayment ? (
                <span className="tabular-nums">
                  {formatDate(lastPayment.tx_date)} · {formatMoney(Number(lastPayment.amount), 'LYD')}
                </span>
              ) : (
                <span className="font-normal text-ink-mute">لا مدفوعات بعد</span>
              )}
            </Row>
          </dl>

          {contact.phone && (
            <div className="mt-3">
              <ContactPhoneActions name={contact.name} phone={contact.phone} kind={contact.kind} />
            </div>
          )}
          {notes && (
            <p className="mt-3 whitespace-pre-line rounded-lg bg-canvas-sunken/70 px-3 py-2 text-[12.5px] leading-relaxed text-ink-mute">
              {notes}
            </p>
          )}
          {!contact.is_active && (
            <p className="mt-3 text-[12.5px] text-warning-ink">ملف غير نشط: للعرض والرجوع إلى الحركات السابقة فقط.</p>
          )}
        </Card>
      </div>

      <div className="order-1 min-w-0 lg:col-span-2">
        <ContactLedgerPanel contact={contact} transactions={transactions} journalEntries={journalEntries} txLoading={txLoading} />
      </div>
    </div>
  );
}
