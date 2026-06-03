'use client';

import { useMemo } from 'react';
import { Loader2, FileText } from 'lucide-react';
import { useTenantCharges } from '@/lib/db/mall-queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { chargeToInvoiceModel } from '@/lib/charge-invoice';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { formatMonthLabelAr, currentYear } from '@/lib/rent-months';
import type { ContactRow } from '@/lib/db/types';

const STATUS_AR: Record<string, string> = {
  UNPAID: 'غير مدفوع',
  PARTIAL: 'جزئي',
  PAID: 'مدفوع',
  OVERDUE: 'متأخر',
};

export function TenantProfileCharges({ contact }: { contact: ContactRow }) {
  const { data: allCharges = [], isLoading } = useTenantCharges();
  const year = currentYear();

  const charges = useMemo(() => {
    return allCharges
      .filter((c) => c.contract?.tenant?.id === contact.id)
      .filter((c) => {
        const y = c.due_date?.slice(0, 4);
        return y === String(year);
      });
  }, [allCharges, contact.id, year]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-3">مطالبات الإيجار — {year}</h3>
        {charges.length === 0 ? (
          <p className="text-sm text-ink-mute py-4 text-center">
            لا توجد مطالبات مسجّلة لهذا العام. ولّد المطالبات من تبويب الرسوم أو عند التحصيل.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {charges.map((charge) => {
              const remaining = Math.max(
                0,
                Number(charge.amount) - Number(charge.total_paid),
              );
              const monthKey = charge.due_date?.slice(0, 7) ?? '';
              const fileName = `فاتورة-${contact.name}-${monthKey}`;

              return (
                <li
                  key={charge.id}
                  className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between bg-card"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {charge.description ||
                        (monthKey ? `إيجار ${formatMonthLabelAr(monthKey)}` : 'مطالبة')}
                    </p>
                    <p className="text-xs text-ink-mute mt-0.5">
                      استحقاق {formatDate(charge.due_date)} ·{' '}
                      <span
                        className={cn(
                          charge.status === 'PAID' && 'text-emerald-700',
                          charge.status === 'UNPAID' && 'text-red-700',
                          charge.status === 'PARTIAL' && 'text-amber-800',
                        )}
                      >
                        {STATUS_AR[charge.status] ?? charge.status}
                      </span>
                    </p>
                    <p className="text-xs tabular-nums mt-1">
                      {formatMoney(Number(charge.total_paid), 'LYD')} /{' '}
                      {formatMoney(Number(charge.amount), 'LYD')}
                      {remaining > 0 && (
                        <span className="text-red-600"> · متبقي {formatMoney(remaining, 'LYD')}</span>
                      )}
                    </p>
                  </div>
                  <TajMallPdfToolbar
                    fileName={fileName}
                    className="shrink-0"
                    render={async () => {
                      const { TenantChargeInvoicePDF } = await import(
                        '@/features/pdf/TenantChargeInvoicePDF'
                      );
                      return (
                        <TenantChargeInvoicePDF
                          charge={chargeToInvoiceModel(charge)}
                        />
                      );
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
