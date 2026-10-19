'use client';

import { useEffect, useMemo, useRef } from 'react';
import { CheckCircle2, MessageCircle, RotateCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { useContact } from '@/lib/db/queries';
import { useReceiptTransaction } from '@/lib/db/receipt-queries';
import type { TransactionWithRelations } from '@/lib/db/types';
import { buildRentReceipt, buildRevenueReceipt, type PaymentReceipt, type ReceiptResult } from '@/lib/payment-receipt';
import type { RentAllocationLine } from '@/lib/rent-allocation';
import { formatMoney } from '@/lib/utils';
import { buildMessageShareLink, buildPaymentReceiptMessage } from '@/lib/whatsapp';

/** What a dialog hands over once a payment is saved: enough to build its receipt. */
export type PendingReceipt =
  | {
      kind: 'rent';
      /** the rent function returns only the id; the number and the recorded figures are read back */
      transactionId: string;
      amount: number;
      tenant: { name: string; shopNumber: string | null; phone: string | null };
      /** the split the cashier saw before saving, which is the split the database applied */
      lines: RentAllocationLine[];
      /** months still owed outside this payment, or null when the account was not read in full */
      otherOwing: { month: string; amount: number }[] | null;
    }
  | { kind: 'revenue'; tx: TransactionWithRelations };

type PanelState = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; result: ReceiptResult };

function usePaymentReceipt(pending: PendingReceipt) {
  const rent = pending.kind === 'rent' ? pending : null;
  const read = useReceiptTransaction(rent ? rent.transactionId : null);
  // the join of a transaction carries no phone: the payer's number is read from the contact
  const contact = useContact(pending.kind === 'revenue' ? (pending.tx.contact?.id ?? '') : '');

  const state = useMemo<PanelState>(() => {
    if (pending.kind === 'revenue') return { status: 'ready', result: buildRevenueReceipt({ tx: pending.tx }) };
    if (read.data) {
      return {
        status: 'ready',
        result: buildRentReceipt({ tx: read.data, tenant: pending.tenant, lines: pending.lines, otherOwing: pending.otherOwing }),
      };
    }
    // a retry shows the loading state again, so the button that was tapped visibly does something
    return read.isError && !read.isFetching ? { status: 'failed' } : { status: 'loading' };
  }, [pending, read.data, read.isError, read.isFetching]);

  // the payer's number: known for a tenant, read from the contact for other revenue
  const phoneKnown = pending.kind === 'rent' || !pending.tx.contact?.id || contact.isSuccess || contact.isError;

  return {
    state,
    retry: () => void read.refetch(),
    phone: pending.kind === 'rent' ? pending.tenant.phone : (contact.data?.phone ?? null),
    /** false while the contact is still being read: «no phone» must not flash before the number arrives */
    phoneKnown,
    phoneFailed: pending.kind === 'revenue' && contact.isError,
    payerName: pending.kind === 'rent' ? pending.tenant.name : (pending.tx.contact?.name ?? null),
    amount: pending.kind === 'rent' ? pending.amount : Number(pending.tx.amount),
  };
}

const ACTION = 'min-h-11 w-full touch-manipulation gap-1.5 sm:min-h-9';

function Row({ label, detail, children }: { label: string; detail?: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-2.5">
      <span className="min-w-0">
        <span className="block text-[13.5px] text-foreground">{label}</span>
        {detail ? <span className="block text-[12.5px] text-ink-mute">{detail}</span> : null}
      </span>
      <span className="shrink-0 text-end text-[13.5px] tabular-nums">{children}</span>
    </li>
  );
}

function Summary({ amount, receipt, loading }: { amount: number; receipt: PaymentReceipt | null; loading: boolean }) {
  const balance = receipt?.balance;
  const otherOwed = receipt?.otherOwed;
  return (
    <ul className="surface divide-y divide-border overflow-hidden" aria-busy={loading}>
      <Row label="المبلغ المستلم">
        <span className="text-[15px] font-semibold text-success-ink">{formatMoney(receipt?.total ?? amount, 'LYD')}</span>
      </Row>
      {loading ? (
        <li className="flex flex-col gap-2 px-4 py-3" aria-label="جارٍ تجهيز الإيصال">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </li>
      ) : null}
      {receipt?.kind === 'revenue' && (receipt.purpose ?? receipt.category) ? (
        <Row label="البيان">
          <span className="text-foreground">{receipt.purpose ?? receipt.category}</span>
        </Row>
      ) : null}
      {receipt?.lines.map((l) =>
        l.state === 'other' ? (
          <Row key={l.label} label={l.label}>
            <span className="text-foreground">{formatMoney(l.paid, 'LYD')}</span>
          </Row>
        ) : (
          <Row key={l.label} label={l.label}>
            <Badge variant={l.state === 'settled' ? 'success' : 'warning'}>{l.statusLabel}</Badge>
          </Row>
        ),
      )}
      {balance?.kind === 'remaining' ? (
        <Row label={balance.label}>
          <span className="font-medium text-danger-ink">{formatMoney(balance.amount, 'LYD')}</span>
        </Row>
      ) : null}
      {balance?.kind === 'settled' ? <li className="px-4 py-2.5 text-[13px] text-ink-mute">{balance.text}</li> : null}
      {otherOwed ? (
        <Row label={otherOwed.label} detail={otherOwed.detail}>
          <span className="font-medium text-danger-ink">{formatMoney(otherOwed.amount, 'LYD')}</span>
        </Row>
      ) : null}
    </ul>
  );
}

/**
 * The short confirmation after a payment is posted, with the two things a payer waits for: the receipt on
 * paper (or shared as a file) and the same facts as a WhatsApp message. It fills the dialog that saved the
 * payment, so the person stays where they are and finishes with one tap.
 */
export function PaymentReceiptSuccess({
  pending,
  heading,
  onDone,
}: {
  pending: PendingReceipt;
  /** defaults to what was saved: «سُجّلت الدفعة» for rent, «سُجّل الإيراد» for other revenue */
  heading?: string;
  onDone: () => void;
}) {
  const { state, retry, phone, phoneKnown, phoneFailed, payerName, amount } = usePaymentReceipt(pending);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // the form that had focus is gone: focus lands on the confirmation, which a screen reader then reads
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const result = state.status === 'ready' ? state.result : null;
  const receipt = result?.ok ? result.receipt : null;
  const message = useMemo(() => (receipt ? buildPaymentReceiptMessage(receipt) : ''), [receipt]);
  const whatsAppHref = useMemo(() => buildMessageShareLink(phone, message), [phone, message]);
  const saved = pending.kind === 'rent' ? 'الدفعة سُجّلت' : 'الإيراد سُجّل';
  const who = [payerName, pending.kind === 'rent' && pending.tenant.shopNumber ? `محل ${pending.tenant.shopNumber}` : null].filter(Boolean).join(' · ');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-1">
          <h2 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-[16px] font-semibold text-foreground outline-hidden">
            <CheckCircle2 className="size-5 shrink-0 stroke-[1.6] text-success-ink" aria-hidden />
            {heading ?? (pending.kind === 'rent' ? 'سُجّلت الدفعة' : 'سُجّل الإيراد')}
          </h2>
          <p className="text-[13px] text-ink-mute" aria-live="polite">
            {who || null}
            {who && receipt ? ' · ' : null}
            {receipt?.number ? <span className="tabular-nums">رقم الإيصال {receipt.number}</span> : null}
          </p>
        </div>

        <Summary amount={amount} receipt={receipt} loading={state.status === 'loading'} />
        {state.status === 'failed' ? (
          <p role="alert" className="text-[13px] leading-relaxed text-ink-soft">
            {saved}، لكن تعذّر تجهيز الإيصال. أعد المحاولة بعد لحظة.
          </p>
        ) : result && !result.ok ? (
          <p role="alert" className="text-[13px] leading-relaxed text-ink-soft">
            {saved}. {result.message}
          </p>
        ) : null}
      </div>

      <div className="sticky bottom-0 flex shrink-0 flex-col gap-2 border-t border-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
        {state.status === 'failed' ? (
          <Button type="button" variant="outline" className={ACTION} onClick={retry}>
            <RotateCw className="stroke-[1.6]" aria-hidden />
            أعد المحاولة
          </Button>
        ) : receipt || state.status === 'loading' ? (
          <div className="grid grid-cols-2 gap-2">
            <TajMallPdfToolbar
              className="*:flex-1"
              disabled={!receipt}
              showDownload={false}
              openLabel="إيصال"
              fileName={receipt?.fileName ?? 'إيصال'}
              shareTitle={receipt ? `${receipt.title} ${receipt.number ?? ''}`.trim() : undefined}
              shareText={message || undefined}
              cacheKey={receipt?.number ?? undefined}
              render={async () => {
                const { PaymentReceiptPDF } = await import('@/features/pdf/PaymentReceiptPDF');
                return <PaymentReceiptPDF receipt={receipt as PaymentReceipt} />;
              }}
            />
            {receipt ? (
              <Button asChild variant="outline" size="sm" className={ACTION}>
                <a href={whatsAppHref} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="stroke-[1.6]" aria-hidden />
                  واتساب
                </a>
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" className={ACTION} disabled>
                <MessageCircle className="stroke-[1.6]" aria-hidden />
                واتساب
              </Button>
            )}
          </div>
        ) : null}
        {receipt && !phone && phoneKnown ? (
          <p className="text-[12px] text-ink-mute">
            {phoneFailed ? 'تعذّر قراءة رقم الهاتف' : 'لا يوجد رقم هاتف مسجَّل'}؛ سيطلب واتساب اختيار المستلم.
          </p>
        ) : null}
        <Button type="button" className="h-11 w-full sm:h-9" onClick={onDone}>
          تم
        </Button>
      </div>
    </div>
  );
}
