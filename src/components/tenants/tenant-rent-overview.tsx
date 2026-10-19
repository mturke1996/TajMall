'use client';

import { useMemo } from 'react';
import { Banknote, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { WhatsAppReminderButton } from '@/components/tenants/whatsapp-reminder-button';
import { RENT_ACCOUNT_KIND, rentAccountMonthStatus } from '@/components/tenants/rent-account-month';
import { useTenantRentAccount } from '@/components/tenants/use-tenant-rent-account';
import { RentAccountFailed } from '@/components/tenants/rent-account-failed';
import { isRentCategoryCode } from '@/lib/charge-invoice';
import { describeRentPrice, formatMonthRangesAr, monthsCountAr, unlinkedRentReceipts } from '@/lib/tenant-rent-account';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import { currentMonthKey, formatMonthLabelAr, monthNameAr } from '@/lib/rent-months';
import type { ContactRow, TransactionWithRelations } from '@/lib/db/types';
import { cn, formatDate, formatMoney } from '@/lib/utils';

const PRICE_SOURCE: Record<'bands' | 'lease' | 'contact' | 'none', string> = {
  bands: 'حسب جدول الأسعار',
  lease: 'من عقد الإيجار',
  contact: 'من ملف المستأجر',
  none: 'لم يُحدَّد سعر',
};

const paymentsCountAr = (n: number) =>
  n === 1 ? 'دفعة واحدة' : n === 2 ? 'دفعتان' : n <= 10 ? `${n} دفعات` : `${n} دفعة`;

function Tile({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 bg-card p-4', className)}>
      <p className="text-[12.5px] font-medium text-ink-mute">{label}</p>
      {children}
    </div>
  );
}

/**
 * The tenant's rent position at a glance: what is owed right now (every month that has started and is
 * not fully paid, across all years), this month, the rent in force and the last payment. Reads the same
 * account as the calendar below it.
 */
export function TenantRentOverview({
  contact,
  monthlyRent,
  claimStart,
  contractStartYear,
  transactions,
  journalEntries,
  onCollect,
}: {
  contact: ContactRow;
  monthlyRent: number;
  claimStart: string | null;
  contractStartYear?: number | null;
  transactions: TransactionWithRelations[];
  journalEntries: JournalEntryRow[];
  /** open rent collection, optionally with months selected */
  onCollect?: (months?: string[]) => void;
}) {
  const { account, charges, pricing, loading, failed, retry } = useTenantRentAccount({
    tenantId: contact.id,
    contactRent: monthlyRent,
    claimStart,
    contractStartYear,
  });
  const now = currentMonthKey();
  const price = useMemo(() => describeRentPrice(now, pricing), [now, pricing]);

  const payments = useMemo(
    () =>
      transactions
        .filter(
          (t) =>
            t.status === 'POSTED' &&
            t.kind === 'REVENUE' &&
            (isRentCategoryCode(t.category?.code) || !t.category?.code),
        )
        .sort((a, b) => b.tx_date.localeCompare(a.tx_date) || b.number - a.number),
    [transactions],
  );
  const last = payments[0];
  const unlinked = useMemo(
    () => unlinkedRentReceipts({ receipts: transactions, journalEntries, charges }),
    [transactions, journalEntries, charges],
  );

  const cur = account.currentMonth;
  const curMeta = cur ? RENT_ACCOUNT_KIND[cur.kind] : null;
  const curPct = cur && cur.amount > 0 ? Math.min(100, (cur.paid / cur.amount) * 100) : 0;
  const owing = account.owingMonths;

  if (failed) {
    return (
      <Card className="overflow-hidden p-3">
        <RentAccountFailed onRetry={retry} />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden" aria-busy={loading}>
      <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
        <Tile label="المستحق حتى الآن" className="col-span-2 lg:col-span-1">
          {loading ? (
            <p className="h-8 w-28 animate-pulse rounded bg-muted" aria-label="جارٍ الحساب" />
          ) : (
            <>
              <p
                className={cn(
                  'text-[22px] font-semibold leading-tight tabular-nums',
                  account.owedNow > 0 ? 'text-danger-ink' : 'text-success-ink',
                )}
              >
                {formatMoney(account.owedNow, 'LYD')}
              </p>
              {account.owedNow > 0 ? (
                <>
                  <p className="text-[12.5px] text-ink-mute">
                    {monthsCountAr(owing.length)} · {owing.length <= 3 ? formatMonthRangesAr(owing) : `أقدمها ${formatMonthLabelAr(owing[0])}`}
                  </p>
                  {account.owedUncharged > 0 && (
                    <p className="text-[12px] text-ink-mute">
                      منها <span className="tabular-nums">{formatMoney(account.owedUncharged, 'LYD')}</span> لأشهر بلا مطالبة مسجّلة
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[12.5px] text-ink-mute">
                  {account.paidThrough ? `مسدّد حتى ${formatMonthLabelAr(account.paidThrough)}` : 'لا مستحقات'}
                </p>
              )}
              {account.owedNow > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {onCollect && (
                    <Button type="button" size="sm" className="h-9 gap-1.5 touch-manipulation" onClick={() => onCollect([owing[0]])}>
                      <Banknote className="h-4 w-4" aria-hidden />
                      تحصيل من {monthNameAr(owing[0])} {owing[0].slice(0, 4)}
                    </Button>
                  )}
                  <WhatsAppReminderButton
                    tenantName={contact.name}
                    phone={contact.phone}
                    shopNumber={contact.shop_number}
                    // money already received but not yet linked to a month is not asked for again
                    amountOutstanding={Math.max(Math.round((account.owedNow - unlinked.total) * 1000) / 1000, 0)}
                    className="h-9 touch-manipulation gap-1.5"
                  />
                </div>
              )}
            </>
          )}
        </Tile>

        <Tile label={`إيجار ${monthNameAr(now)}`} className="col-span-2 sm:col-span-1">
          {loading || !cur || !curMeta ? (
            <p className="h-6 w-24 animate-pulse rounded bg-muted" aria-hidden />
          ) : cur.kind === 'exempt' || cur.kind === 'no_price' ? (
            <p className="text-[15px] font-semibold text-ink-mute">{rentAccountMonthStatus(cur)}</p>
          ) : (
            <>
              <p className="text-[15px] font-semibold tabular-nums text-foreground">
                {formatMoney(cur.paid, 'LYD')}
                <span className="text-[12.5px] font-normal text-ink-mute"> من {formatMoney(cur.amount, 'LYD')}</span>
              </p>
              <span className="h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
                <span className={cn('block h-full rounded-full', curMeta.bar)} style={{ width: `${curPct}%` }} />
              </span>
              <p className={cn('text-[12.5px]', curMeta.ink)}>
                {cur.kind === 'paid' ? 'مسدّد بالكامل' : cur.kind === 'uncharged' ? 'لم تُسجَّل مطالبته بعد' : rentAccountMonthStatus(cur)}
              </p>
            </>
          )}
        </Tile>

        <Tile label="الإيجار الشهري">
          <p className="text-[15px] font-semibold tabular-nums text-foreground">
            {price.amount > 0 ? formatMoney(price.amount, 'LYD') : '—'}
          </p>
          <p className="text-[12.5px] text-ink-mute">{PRICE_SOURCE[price.source]}</p>
          {price.nextChange && (
            <p className="text-[12px] text-info-ink">
              يصبح <span className="tabular-nums">{formatMoney(price.nextChange.amount, 'LYD')}</span> من{' '}
              {formatMonthLabelAr(price.nextChange.month)}
            </p>
          )}
        </Tile>

        <Tile label="آخر دفعة" className="sm:col-span-2 lg:col-span-1">
          {last ? (
            <>
              <p className="text-[15px] font-semibold tabular-nums text-foreground">{formatMoney(Number(last.amount), 'LYD')}</p>
              <p className="text-[12.5px] text-ink-mute">
                {formatDate(last.tx_date)} · {paymentsCountAr(payments.length)}
              </p>
            </>
          ) : (
            <p className="text-[13px] text-ink-mute">لا دفعات بعد</p>
          )}
        </Tile>
      </div>
      {unlinked.total > 0 && (
        <p className="flex items-start gap-2 border-t border-border bg-info-soft/50 px-4 py-2.5 text-[12.5px] text-info-ink">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            محصّل غير مربوط بأي شهر: <span className="font-semibold tabular-nums">{formatMoney(unlinked.total, 'LYD')}</span> (
            {paymentsCountAr(unlinked.count)}) — لا يُخصم من المستحق حتى يُربط بشهر. اربطه من «ربط إيصال بشهر» في تقويم
            الإيجار.
          </span>
        </p>
      )}
    </Card>
  );
}
