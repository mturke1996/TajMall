'use client';

import Link from 'next/link';
import { FileText, Coins, Store, Banknote } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTenantLeaseContracts } from '@/lib/db/mall-queries';
import { mallTabHref } from '@/lib/mall/routes';
import { formatMoney, formatDate, cn } from '@/lib/utils';
import type { ContactRow } from '@/lib/db/types';

export function ContactRentLinks({
  contact,
  onRecordPayment,
}: {
  contact: ContactRow;
  onRecordPayment?: () => void;
}) {
  const { data: contracts = [], isLoading } = useTenantLeaseContracts(
    contact.kind === 'TENANT' ? contact.id : undefined,
  );

  if (contact.kind !== 'TENANT') return null;

  const active = contracts.find((c) => c.status === 'ACTIVE');

  return (
    <Card className="p-4 border-sage-200 bg-sage-50/40">
      <p className="text-sm font-semibold text-sage-900 mb-3 flex items-center gap-2">
        <Store className="h-4 w-4" />
        الإيجار والمحل
      </p>

      {isLoading ? (
        <p className="text-sm text-ink-mute">جارٍ تحميل العقود…</p>
      ) : active ? (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-white">
              عقد نشط
            </Badge>
            <span className="font-medium">
              محل {active.unit?.unit_number ?? contact.shop_number ?? '—'}
            </span>
          </div>
          <p className="text-ink-mute text-[13px]">
            {formatDate(active.start_date)} — {formatDate(active.end_date)}
          </p>
          <p className="tabular-nums font-semibold">
            إيجار شهري: {formatMoney(Number(active.monthly_rent), 'LYD')}
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-mute mb-2">
          لا يوجد عقد إيجار نشط مربوط بهذا المستأجر.
          {contact.shop_number && (
            <span className="block mt-1">
              محل مسجّل في الملف: {contact.shop_number}
            </span>
          )}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {onRecordPayment && Number(contact.monthly_rent) > 0 && (
          <Button size="sm" className="h-10 flex-1 touch-manipulation" onClick={onRecordPayment}>
            <Banknote className="h-4 w-4 ml-1" />
            تسجيل دفع إيجار
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-10 flex-1 touch-manipulation" asChild>
          <Link href={mallTabHref('contracts')}>
            <FileText className="h-4 w-4 ml-1" />
            العقود
          </Link>
        </Button>
        <Button size="sm" variant="outline" className="h-10 flex-1 touch-manipulation" asChild>
          <Link href={mallTabHref('charges')}>
            <Coins className="h-4 w-4 ml-1" />
            الرسوم
          </Link>
        </Button>
        <Button size="sm" variant="outline" className="h-10 flex-1 touch-manipulation" asChild>
          <Link href={mallTabHref('units')}>المحلات</Link>
        </Button>
      </div>

      {contracts.length > 1 && (
        <p className={cn('mt-3 text-[12px] text-ink-mute')}>
          {contracts.length} عقد مسجّل (نشط أو منتهي)
        </p>
      )}
    </Card>
  );
}
