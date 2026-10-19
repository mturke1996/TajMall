'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarPlus, Loader2, Scale } from 'lucide-react';
import { WriteGuard } from '@/components/auth/write-guard';
import { LeaseSettlementDialog, type SettlementRequest } from '@/components/mall/lease-settlement-dialog';
import { WhatsAppMessageButton } from '@/components/tenants/whatsapp-message-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useExtendLeaseContract } from '@/lib/db/mall-queries';
import { BUCKET_ORDER, buildContractExpiry, type ExpiryBucket, type ExpiryItem } from '@/lib/contract-expiry';
import { addMonthsISO, daysBetween } from '@/lib/mall-dates';
import { buildContractExpiryMessage } from '@/lib/whatsapp';
import { arabicCount, cn, formatDate, formatMoney, todayISODate } from '@/lib/utils';

const dayCount = (n: number) => arabicCount(n, ['يوم واحد', 'يومين', 'أيام', 'يوماً']);

const BUCKET_LABEL: Record<ExpiryBucket, string> = {
  expired: 'انتهى وما زال نشطاً',
  within30: 'خلال 30 يوماً',
  within60: 'خلال 60 يوماً',
  within90: 'خلال 90 يوماً',
};

const BUCKET_DOT: Record<ExpiryBucket, string> = {
  expired: 'bg-danger',
  within30: 'bg-warning',
  within60: 'bg-warning',
  within90: 'bg-ink-mute',
};

/** The longest renewal accepted in one step: a typo such as 2062 is caught before it is saved. */
const MAX_EXTENSION_YEARS = 10;

export function whenText(item: Pick<ExpiryItem, 'daysLeft'>) {
  if (item.daysLeft < 0) return `انتهى منذ ${dayCount(-item.daysLeft)}`;
  if (item.daysLeft === 0) return 'ينتهي اليوم';
  return `ينتهي بعد ${dayCount(item.daysLeft)}`;
}

/** Renewal: a new, later end date for a running lease. */
export function ExtendContractDialog({
  item,
  onOpenChange,
}: {
  item: ExpiryItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const extend = useExtendLeaseContract();
  const today = useMemo(() => todayISODate(), []);
  const [picked, setPicked] = useState<{ id: string; date: string } | null>(null);

  const open = item != null;
  // a fresh start for each lease: the suggestion is a year on from the current end date
  const date = item ? (picked?.id === item.contract.id ? picked.date : addMonthsISO(item.endDate, 12)) : '';

  const problem = useMemo(() => {
    if (!item) return null;
    const gap = daysBetween(item.endDate, date);
    if (gap == null) return 'أدخل تاريخاً صحيحاً.';
    if (gap <= 0) return 'التاريخ الجديد يجب أن يكون بعد تاريخ الانتهاء الحالي. لتقصير العقد استخدم «تصفية» ثم «إنهاء العقد».';
    if (date > addMonthsISO(item.endDate, MAX_EXTENSION_YEARS * 12)) return `أطول تمديد في خطوة واحدة ${MAX_EXTENSION_YEARS} سنوات.`;
    return null;
  }, [item, date]);
  const stillPast = !problem && date < today;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!item || problem) return;
    try {
      await extend.mutateAsync({ id: item.contract.id, endDate: date });
      onOpenChange(false);
    } catch {
      // the hook has shown the reason
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>تمديد العقد</DialogTitle>
          <DialogDescription>
            {item ? (
              <>
                {item.tenantName}
                {item.unitNumber && ` · محل ${item.unitNumber}`} — {item.pastEnd ? 'انتهى' : 'ينتهي'} {formatDate(item.endDate)}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {item && (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="extend-date">تاريخ الانتهاء الجديد</Label>
              <Input
                id="extend-date"
                type="date"
                dir="ltr"
                value={date}
                onChange={(e) => setPicked({ id: item.contract.id, date: e.target.value })}
                aria-invalid={problem != null}
                aria-describedby="extend-hint"
              />
              <div className="flex flex-wrap gap-1.5">
                {[6, 12, 24].map((m) => (
                  <Button
                    key={m}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-[12.5px]"
                    onClick={() => setPicked({ id: item.contract.id, date: addMonthsISO(item.endDate, m) })}
                  >
                    {m === 12 ? 'سنة' : m === 24 ? 'سنتان' : `${m} أشهر`}
                  </Button>
                ))}
              </div>
              <p id="extend-hint" className={cn('text-[12.5px]', problem ? 'text-danger-ink' : 'text-ink-mute')}>
                {problem ??
                  (stillPast
                    ? 'التاريخ الجديد ما زال في الماضي: يبقى العقد منتهياً وإن كان نشطاً.'
                    : `مدة التمديد ${arabicCount(Math.round((daysBetween(item.endDate, date) ?? 0) / 30.44), ['شهر واحد', 'شهران', 'أشهر', 'شهراً'])} تقريباً. الإيجار والتأمين والمطالبات السابقة كما هي؛ لتغيير الإيجار استخدم جدول الأسعار في ملف المستأجر.`)}
              </p>
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button type="submit" disabled={extend.isPending || problem != null}>
                {extend.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-label="جارٍ الحفظ" /> : 'مدّد العقد'}
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

const FIRST_SHOWN = 6;

/**
 * Leases to renew or end: past their end date and still active, or ending within 90 days. Each has a
 * ready WhatsApp message to the tenant, a one-step renewal, and the closing statement that comes before
 * ending the lease.
 */
export function ContractExpiryAlerts({ contracts }: { contracts: Parameters<typeof buildContractExpiry>[0]['contracts'] }) {
  // the day the panel opened: stable across re-renders
  const [today] = useState(() => todayISODate());
  const expiry = useMemo(() => buildContractExpiry({ contracts, today }), [contracts, today]);
  const [all, setAll] = useState(false);
  const [extending, setExtending] = useState<ExpiryItem | null>(null);
  const [settling, setSettling] = useState<SettlementRequest | null>(null);

  if (expiry.total === 0) return null;
  const shown = all ? expiry.items : expiry.items.slice(0, FIRST_SHOWN);

  return (
    <section aria-labelledby="expiry-heading" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <h2 id="expiry-heading" className="text-[15px] font-semibold text-foreground">
          عقود تحتاج قراراً
        </h2>
        <p className="text-[12.5px] tabular-nums text-ink-mute">
          {arabicCount(expiry.total, ['عقد واحد', 'عقدان', 'عقود', 'عقداً'])} · إيجارها الشهري {formatMoney(expiry.monthlyRentAtRisk, 'LYD')}
        </p>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[12.5px] text-ink-soft" aria-label="عدد العقود حسب القرب من الانتهاء">
        {BUCKET_ORDER.filter((b) => expiry.counts[b] > 0).map((b) => (
          <li key={b} className="inline-flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', BUCKET_DOT[b])} aria-hidden />
            {BUCKET_LABEL[b]}
            <span className="tabular-nums text-foreground">{expiry.counts[b]}</span>
          </li>
        ))}
      </ul>

      <ul className="surface divide-y divide-border overflow-hidden">
        {shown.map((i) => (
          <li key={i.contract.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', BUCKET_DOT[i.bucket])} aria-hidden />
              <div className="min-w-0">
                <Link href={`/contacts/${i.tenantId}`} className="block truncate text-[13.5px] font-medium text-foreground hover:underline">
                  {i.tenantName}
                </Link>
                <p className="text-[12px] text-ink-mute">
                  {i.unitNumber ? `محل ${i.unitNumber}` : 'بلا وحدة'}
                  {i.floor && ` · الدور ${i.floor}`} · {formatMoney(i.monthlyRent, 'LYD')} شهرياً
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
              <div className="min-w-0 text-start sm:text-end">
                <p className="text-[13px] tabular-nums text-foreground">{formatDate(i.endDate)}</p>
                <p className={cn('text-[12px]', i.pastEnd ? 'text-danger-ink' : i.bucket === 'within30' ? 'text-warning-ink' : 'text-ink-mute')}>
                  {whenText(i)}
                </p>
              </div>
              <div className="grid grid-cols-[auto_1fr_1fr] gap-2 sm:flex sm:shrink-0 sm:gap-1.5">
                <WhatsAppMessageButton
                  phone={i.phone}
                  label={null}
                  title="رسالة واتساب للمستأجر عن انتهاء العقد"
                  className="h-11 w-11 touch-manipulation gap-1.5 px-0 text-success-ink hover:bg-success-soft hover:text-success-ink sm:h-8 sm:w-auto sm:px-3"
                  message={buildContractExpiryMessage({
                    tenantName: i.tenantName,
                    shopNumber: i.unitNumber,
                    endDate: i.endDate,
                    daysLeft: i.daysLeft,
                  })}
                />
                <WriteGuard permission="document.create">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11 gap-1.5 text-[12.5px] touch-manipulation sm:h-8"
                    onClick={() => setExtending(i)}
                  >
                    <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
                    تمديد
                  </Button>
                </WriteGuard>
                <WriteGuard permission="document.create">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11 gap-1.5 text-[12.5px] touch-manipulation sm:h-8"
                    aria-label={`تصفية عقد ${i.tenantName}${i.unitNumber ? ` محل ${i.unitNumber}` : ''}`}
                    onClick={(e) => setSettling({ contract: i.contract, opener: e.currentTarget })}
                  >
                    <Scale className="h-3.5 w-3.5 stroke-[1.6]" aria-hidden />
                    تصفية
                  </Button>
                </WriteGuard>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {expiry.items.length > FIRST_SHOWN && (
        <Button variant="ghost" size="sm" className="self-start text-[12.5px] text-ink-mute" onClick={() => setAll((v) => !v)}>
          {all ? 'إظهار الأقرب فقط' : `إظهار الكل (${expiry.items.length})`}
        </Button>
      )}

      <ExtendContractDialog item={extending} onOpenChange={(o) => !o && setExtending(null)} />
      <LeaseSettlementDialog request={settling} onOpenChange={(o) => !o && setSettling(null)} />
    </section>
  );
}
