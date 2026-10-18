'use client';

import Link from 'next/link';
import { Coins, FileText, Pencil } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TenantPortalLinkCard } from '@/components/tenants/tenant-portal-link-card';
import { useTenantLeaseContracts } from '@/lib/db/mall-queries';
import { mallTabHref } from '@/lib/mall/routes';
import { formatDate, formatMoney } from '@/lib/utils';
import type { ContactRow } from '@/lib/db/types';

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

/** Who the tenant is and what binds them: contact details, the lease, and the self-service portal. */
export function TenantProfileSidebar({
  contact,
  claimStart,
  onEdit,
}: {
  contact: ContactRow;
  claimStart: string | null;
  onEdit: () => void;
}) {
  const { data: contracts = [], isLoading } = useTenantLeaseContracts(contact.id);
  const active = contracts.find((c) => c.status === 'ACTIVE');
  const shop = [contact.shop_number && `محل ${contact.shop_number}`, contact.floor && `الطابق ${contact.floor}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[14px] font-semibold text-foreground">بيانات المستأجر</h2>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-[13px] touch-manipulation" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            تعديل
          </Button>
        </div>
        <dl className="mt-1 divide-y divide-border">
          {shop && <Row label="المحل">{shop}</Row>}
          {contact.phone && (
            <Row label="الهاتف" ltr>
              <a href={`tel:${contact.phone}`} className="tabular-nums underline-offset-2 hover:underline">
                {contact.phone}
              </a>
              {contact.phone2 && <span className="block text-[12.5px] font-normal text-ink-mute tabular-nums">{contact.phone2}</span>}
            </Row>
          )}
          {contact.code && <Row label="الرمز">{contact.code}</Row>}
          {claimStart && <Row label="بداية المطالبة">{formatDate(claimStart)}</Row>}
          {contact.email && (
            <Row label="البريد" ltr>
              <span className="break-all">{contact.email}</span>
            </Row>
          )}
          {contact.id_number && <Row label="رقم الهوية">{contact.id_number}</Row>}
        </dl>
        {!contact.phone && !contact.shop_number && (
          <p className="mt-2 text-[12.5px] text-ink-mute">بيانات ناقصة — أكملها من «تعديل».</p>
        )}
        {contact.notes && (
          <p className="mt-3 whitespace-pre-line rounded-lg bg-canvas-sunken/70 px-3 py-2 text-[12.5px] leading-relaxed text-ink-mute">
            {contact.notes}
          </p>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[14px] font-semibold text-foreground">عقد الإيجار</h2>
          {active && <Badge variant="success">نشط</Badge>}
        </div>
        {isLoading ? (
          <p className="mt-3 text-[13px] text-ink-mute">جارٍ تحميل العقود…</p>
        ) : active ? (
          <dl className="mt-1 divide-y divide-border">
            <Row label="الوحدة">{active.unit?.unit_number ?? contact.shop_number ?? '—'}</Row>
            <Row label="المدة">
              <span className="tabular-nums">
                {formatDate(active.start_date)} — {formatDate(active.end_date)}
              </span>
            </Row>
            <Row label="إيجار العقد">
              <span className="tabular-nums">{formatMoney(Number(active.monthly_rent), 'LYD')}</span>
            </Row>
          </dl>
        ) : (
          <p className="mt-2 text-[13px] leading-relaxed text-ink-mute">
            لا يوجد عقد نشط مربوط بهذا المستأجر؛ يُحسب الإيجار من جدول الأسعار أو من ملفه.
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" className="h-9 flex-1 gap-1.5 touch-manipulation" asChild>
            <Link href={mallTabHref('contracts')}>
              <FileText className="h-4 w-4" aria-hidden />
              العقود
            </Link>
          </Button>
          <Button size="sm" variant="outline" className="h-9 flex-1 gap-1.5 touch-manipulation" asChild>
            <Link href={mallTabHref('charges')}>
              <Coins className="h-4 w-4" aria-hidden />
              المطالبات
            </Link>
          </Button>
        </div>
      </Card>

      <TenantPortalLinkCard contactId={contact.id} contactName={contact.name} phone={contact.phone} />
    </div>
  );
}
