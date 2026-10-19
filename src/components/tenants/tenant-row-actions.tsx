'use client';

import Link from 'next/link';
import { Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WhatsAppReminderButton } from '@/components/tenants/whatsapp-reminder-button';
import type { CollectControl } from '@/components/tenants/use-collect-rent';
import { cn } from '@/lib/utils';
import type { RentReminderBasis } from '@/lib/whatsapp';

/** 'table' is a desktop row, 'card' a touch layout, 'overview' a compact list that is also read on phones. */
export type RowActionsDensity = 'table' | 'overview' | 'card';

// Button's default size sets sm:h-9 itself, so a height that must hold from sm up repeats it with the sm: prefix
const HEIGHT: Record<RowActionsDensity, string> = {
  table: 'h-8 sm:h-8',
  overview: 'h-11 sm:h-9',
  card: 'h-11 sm:h-11',
};
const ICON_BOX: Record<RowActionsDensity, string> = {
  table: 'h-8 w-8',
  overview: 'h-11 w-11 sm:h-9 sm:w-9',
  card: 'h-11 w-11',
};

/**
 * What can be done to a tenant from a list row: collect rent (the one primary action), send a reminder
 * (a quiet icon, and only when something is owed and there is a phone), open the file.
 * `owed` is the amount the row shows; the reminder states `basis` so the tenant reads what it is for.
 */
export function TenantRowActions({
  tenant,
  owed,
  basis,
  asOf,
  collect,
  density,
  showProfile = false,
  remindable = true,
  className,
}: {
  tenant: { id: string; name: string; phone: string | null; shop_number: string | null };
  owed: number;
  basis: RentReminderBasis;
  asOf?: string;
  /** omitted for people who may not record payments: no collect button at all */
  collect?: CollectControl;
  density: RowActionsDensity;
  showProfile?: boolean;
  /** false when the amount includes rent that is not due yet: a reminder would ask for too much */
  remindable?: boolean;
  className?: string;
}) {
  const fills = density !== 'table';
  const canRemind = remindable && owed > 0 && Boolean(tenant.phone);
  // nothing to offer (a viewer, nothing owed or no phone, no file link asked for): no empty row, no stray padding
  if (!collect && !canRemind && !showProfile) return null;
  const collectTitle =
    collect?.state === 'loading' ? 'جارٍ تحميل بيانات التحصيل' : collect?.state === 'failed' ? 'تعذّر تحميل بيانات التحصيل' : undefined;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {collect && (
        <Button
          type="button"
          // the colour of the button follows the need: black when something is owed, quiet when the row is settled
          variant={owed > 0 ? 'default' : 'outline'}
          className={cn('touch-manipulation gap-1.5 [&_svg]:stroke-[1.6]', HEIGHT[density], fills && 'flex-1')}
          disabled={collect.state !== 'ready'}
          title={collectTitle}
          aria-label={`تحصيل إيجار ${tenant.name}`}
          onClick={(e) => collect.onCollect(tenant.id, e.currentTarget)}
        >
          <Banknote aria-hidden />
          تحصيل
        </Button>
      )}
      {canRemind && (
        <WhatsAppReminderButton
          tenantName={tenant.name}
          phone={tenant.phone}
          shopNumber={tenant.shop_number}
          amountOutstanding={owed}
          basis={basis}
          asOf={asOf}
          size="icon-sm"
          className={cn('shrink-0 touch-manipulation text-muted-foreground hover:text-foreground [&_svg]:size-4 [&_svg]:stroke-[1.6]', ICON_BOX[density])}
        />
      )}
      {/* in a table the file button keeps its column whether or not a reminder is offered */}
      {!canRemind && !fills && showProfile && <span className={cn('shrink-0', ICON_BOX[density])} aria-hidden />}
      {showProfile && (
        <Button variant="ghost" asChild className={cn('shrink-0 touch-manipulation px-3', HEIGHT[density])}>
          <Link href={`/contacts/${tenant.id}`} aria-label={`الملف: ${tenant.name}`}>
            الملف
          </Link>
        </Button>
      )}
    </div>
  );
}
