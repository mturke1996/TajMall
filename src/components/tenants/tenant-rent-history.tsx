'use client';

import { useMemo } from 'react';
import { Loader2, Receipt } from 'lucide-react';
import { useContactTransactions } from '@/lib/db/queries';
import { useTenantChargesForTenant } from '@/lib/db/mall-queries';
import { isRentCategoryCode } from '@/lib/charge-invoice';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import {
  formatPaymentBankOrSource,
  formatPaymentMethodAr,
} from '@/features/pdf/pdf-payment';
import { formatMonthLabelAr } from '@/lib/rent-months';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import type { ContactRow } from '@/lib/db/types';

type ReceiptMonth = { monthKey: string; amount: number; fullyPaid: boolean };

export function TenantRentHistory({
  tenantId,
  contact,
  limit = 48,
  compact,
}: {
  tenantId: string;
  contact?: ContactRow;
  limit?: number;
  compact?: boolean;
}) {
  const { data: transactions = [], isLoading } = useContactTransactions(tenantId);
  const { data: charges = [] } = useTenantChargesForTenant(tenantId);

  // posted rent receipts only: a voided payment is not money received
  const rentPayments = transactions
    .filter(
      (t) =>
        t.status === 'POSTED' &&
        t.kind === 'REVENUE' &&
        (isRentCategoryCode(t.category?.code) || !t.category?.code),
    )
    .slice(0, limit);

  // which months each receipt paid, from the month links of its journal entry
  const monthsByReceipt = useMemo(() => {
    const map = new Map<string, ReceiptMonth[]>();
    for (const c of charges) {
      if (c.type !== 'RENT') continue;
      for (const l of c.rent_journal_links ?? []) {
        const j = l.journal;
        if (!j || j.status === 'REVERSED' || j.source_type !== 'TRANSACTION' || !j.source_id) continue;
        const list = map.get(j.source_id) ?? [];
        list.push({
          monthKey: String(c.due_date).slice(0, 7),
          amount: Number(l.amount) || 0,
          fullyPaid: c.status === 'PAID',
        });
        map.set(j.source_id, list);
      }
    }
    for (const list of map.values()) list.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    return map;
  }, [charges]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-ink-soft" aria-label="جارٍ التحميل" />
      </div>
    );
  }

  if (rentPayments.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-ink-mute">
        <Receipt className="mx-auto h-8 w-8 opacity-40 mb-2" aria-hidden />
        لا توجد مدفوعات إيجار مسجّلة بعد
      </div>
    );
  }

  return (
    <ul
      className={cn(
        'divide-y divide-border rounded-xl border border-border bg-card overflow-hidden',
        compact && 'text-sm',
      )}
    >
      {rentPayments.map((tx) => {
        const months = monthsByReceipt.get(tx.id) ?? [];
        const linked = months.reduce((s, m) => s + m.amount, 0);
        const unlinked = Math.round((Number(tx.amount) - linked) * 1000) / 1000;
        return (
          <li
            key={tx.id}
            className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4"
          >
            <div className="min-w-0">
              <p className="font-medium truncate">
                {tx.description || tx.category?.name_ar || 'إيجار'}
              </p>
              <p className="text-xs text-ink-mute mt-0.5">
                {formatDate(tx.tx_date)} · {formatPaymentMethodAr(tx.method)}
                {tx.method === 'TRANSFER' || tx.cashbox?.bank_name
                  ? ` · ${formatPaymentBankOrSource(tx)}`
                  : tx.cashbox?.name_ar
                    ? ` · ${tx.cashbox.name_ar}`
                    : ''}
              </p>
              {months.length > 0 && (
                <p className="text-xs text-ink-mute mt-0.5">
                  {months.map((m) => formatMonthLabelAr(m.monthKey)).join('، ')}
                  {unlinked > 0.0005 && ` · غير مربوط ${formatMoney(unlinked, 'LYD')}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <p className="font-semibold text-success-ink tabular-nums">
                {formatMoney(Number(tx.amount), tx.currency)}
              </p>
              {contact && (
                <TajMallPdfToolbar
                  fileName={`إيصال-${contact.name}-${tx.tx_date}`}
                  render={async () => {
                    const { TenantRentReceiptPDF } = await import(
                      '@/features/pdf/TenantRentReceiptPDF'
                    );
                    const lines =
                      months.length > 0
                        ? [
                            ...months.map((m) => ({
                              monthLabel: formatMonthLabelAr(m.monthKey),
                              amount: m.amount,
                              statusLabel: m.fullyPaid ? 'مدفوع' : 'جزئي',
                            })),
                            ...(unlinked > 0.0005
                              ? [{ monthLabel: 'غير مربوط بشهر', amount: unlinked, statusLabel: 'رصيد' }]
                              : []),
                          ]
                        : [{ monthLabel: tx.description || 'تحصيل إيجار', amount: Number(tx.amount), statusLabel: 'مدفوع' }];
                    return (
                      <TenantRentReceiptPDF
                        tenantName={contact.name}
                        shopNumber={contact.shop_number}
                        paymentDate={tx.tx_date}
                        totalAmount={Number(tx.amount)}
                        paymentMethod={formatPaymentMethodAr(tx.method)}
                        paymentSource={formatPaymentBankOrSource(tx)}
                        reference={tx.reference ?? undefined}
                        months={lines}
                      />
                    );
                  }}
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
