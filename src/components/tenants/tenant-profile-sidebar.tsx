'use client';

import { Building2, Phone, Hash, Layers, Pencil } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/utils';
import type { ContactRow } from '@/lib/db/types';
import type { TenantRentSummary } from '@/lib/db/queries';
import { TenantCurrentMonthHeroBadge } from '@/components/tenants/tenant-current-month-banner';
import {
  getTenantCurrentMonthPresentation,
} from '@/lib/tenant-current-month';
import { cn } from '@/lib/utils';
import { ContactRentLinks } from '@/components/contacts/contact-rent-links';

export function TenantProfileSidebar({
  contact,
  rent,
  onEdit,
  onRecordPayment,
}: {
  contact: ContactRow;
  rent: TenantRentSummary;
  onEdit: () => void;
  onRecordPayment?: () => void;
}) {
  const monthlyRent = Number(contact.monthly_rent) || 0;
  const monthPres = getTenantCurrentMonthPresentation(rent, monthlyRent);

  return (
    <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
      <Card className="overflow-hidden border-sage-200/60 shadow-sm">
        <div className="bg-gradient-to-l from-sage-800 via-sage-700 to-sage-600 px-4 py-5 text-white">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <Building2 className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <Badge className="bg-white/20 text-white border-white/25 hover:bg-white/25 mb-2">
                مستأجر
              </Badge>
              <h2 className="font-bold text-base leading-tight truncate">
                {contact.name}
              </h2>
              {(contact.shop_number || contact.floor) && (
                <p className="text-[12px] text-white/85 mt-1">
                  {contact.shop_number && `محل ${contact.shop_number}`}
                  {contact.shop_number && contact.floor && ' · '}
                  {contact.floor && `طابق ${contact.floor}`}
                </p>
              )}
            </div>
          </div>
          <TenantCurrentMonthHeroBadge rent={rent} monthlyRent={monthlyRent} />
        </div>

        <dl className="px-4 py-4 space-y-3 text-sm">
          {contact.phone && (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                الهاتف
              </dt>
              <dd className="font-medium tabular-nums" dir="ltr">
                {contact.phone}
              </dd>
            </div>
          )}
          {contact.code && (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5" />
                الرمز
              </dt>
              <dd className="font-mono text-xs">{contact.code}</dd>
            </div>
          )}
          {monthlyRent > 0 && (
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
              <dt className="text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                إيجار شهري
              </dt>
              <dd className="font-bold text-sage-800 dark:text-sage-300 tabular-nums">
                {formatMoney(monthlyRent, 'LYD')}
              </dd>
            </div>
          )}
          {monthPres.amount > 0 && (
            <>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">مستحق {monthPres.monthName}</dt>
                <dd className="font-medium tabular-nums">
                  {formatMoney(monthPres.amount, 'LYD')}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">المسدّد هذا الشهر</dt>
                <dd
                  className={cn(
                    'font-semibold tabular-nums',
                    monthPres.paid > 0 && 'text-emerald-700 dark:text-emerald-400',
                  )}
                >
                  {formatMoney(monthPres.paid, 'LYD')}
                </dd>
              </div>
              {monthPres.remaining > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">المتبقي</dt>
                  <dd className="font-semibold tabular-nums text-amber-800 dark:text-amber-300">
                    {formatMoney(monthPres.remaining, 'LYD')}
                  </dd>
                </div>
              )}
            </>
          )}
          {Number(rent.total_rent_paid) > 0 && (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">إجمالي مسدّد</dt>
              <dd className="font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatMoney(Number(rent.total_rent_paid), 'LYD', { compact: true })}
              </dd>
            </div>
          )}
        </dl>

        <div className="px-4 pb-4 flex flex-col gap-2">
          {onRecordPayment && monthlyRent > 0 && (
            <Button className="w-full h-10 touch-manipulation" onClick={onRecordPayment}>
              تسجيل دفع إيجار
            </Button>
          )}
          <Button
            variant="outline"
            className="w-full h-10 gap-1.5 touch-manipulation"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
            تعديل البيانات
          </Button>
        </div>
      </Card>

      <ContactRentLinks contact={contact} onRecordPayment={onRecordPayment} />
    </div>
  );
}
