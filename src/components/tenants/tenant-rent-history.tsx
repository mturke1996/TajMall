'use client';

import { Loader2, Receipt } from 'lucide-react';
import { useContactTransactions } from '@/lib/db/queries';
import { isRentCategoryCode } from '@/lib/charge-invoice';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import {
  formatPaymentBankOrSource,
  formatPaymentMethodAr,
} from '@/features/pdf/pdf-payment';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import type { ContactRow } from '@/lib/db/types';

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

  const rentPayments = transactions
    .filter(
      (t) =>
        t.kind === 'REVENUE' &&
        (isRentCategoryCode(t.category?.code) || !t.category?.code),
    )
    .slice(0, limit);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
      </div>
    );
  }

  if (rentPayments.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-ink-mute">
        <Receipt className="mx-auto h-8 w-8 opacity-40 mb-2" />
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
      {rentPayments.map((tx) => (
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
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <p className="font-semibold text-green-600 tabular-nums">
              {formatMoney(Number(tx.amount), tx.currency)}
            </p>
            {contact && (
              <TajMallPdfToolbar
                fileName={`إيصال-${contact.name}-${tx.tx_date}`}
                render={async () => {
                  const { TenantRentReceiptPDF } = await import(
                    '@/features/pdf/TenantRentReceiptPDF'
                  );
                  return (
                    <TenantRentReceiptPDF
                      tenantName={contact.name}
                      shopNumber={contact.shop_number}
                      paymentDate={tx.tx_date}
                      totalAmount={Number(tx.amount)}
                      paymentMethod={formatPaymentMethodAr(tx.method)}
                      paymentSource={formatPaymentBankOrSource(tx)}
                      reference={tx.reference ?? undefined}
                      months={[
                        {
                          monthLabel: tx.description || 'تحصيل إيجار',
                          amount: Number(tx.amount),
                          statusLabel: 'مدفوع',
                        },
                      ]}
                    />
                  );
                }}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
