'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { DoorClosed, HandCoins, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { useTerminateLeaseContract } from '@/lib/db/mall-queries';
import { buildRefundPrefill, type Settlement } from '@/lib/lease-settlement';
import { usePermission } from '@/lib/supabase/use-permission';
import { cn, formatMoney, todayISODate } from '@/lib/utils';
import { useTxDialog } from '@/stores/transaction-dialog';
import {
  EndDateSection,
  RefundSection,
  SettlementAnchor,
  SettlementLoading,
  SettlementNotes,
  SettlementStatement,
  type RefundMode,
} from './lease-settlement-view';
import { useLeaseSettlement } from './use-lease-settlement';

/** What the statement needs to know about the lease; the list rows and the expiry alerts both have it. */
export type SettlementTarget = {
  id: string;
  unit_id: string;
  tenant_id: string;
  start_date: string;
  end_date: string;
  tenant?: { id: string; name: string; phone?: string | null } | null;
  unit?: { unit_number?: string | null; floor?: string | null } | null;
};

export type SettlementRequest = {
  contract: SettlementTarget;
  /** the button that opened the statement: it gets focus back when the statement or the refund entry closes */
  opener: HTMLElement | null;
};

const money = (n: number) => formatMoney(n, 'LYD');

/** What ending the lease leaves as it is. */
function leftoverText(s: Settlement, refundOpen: boolean): string | null {
  const owed = s.arrears?.total ?? 0;
  const held = s.deposit?.held ?? 0;
  const lines: string[] = [];
  if (owed > 0 && held > 0) lines.push(`الإنهاء لا يسدد المتأخرات ولا يرد التأمين. يبقى كل منهما مسجَّلاً: المتأخرات ${money(owed)} والتأمين ${money(held)}.`);
  else if (owed > 0) lines.push(`الإنهاء لا يسدد المتأخرات. يبقى ${money(owed)} مطلوباً من المستأجر.`);
  else if (held > 0) lines.push(`الإنهاء لا يرد التأمين. يبقى ${money(held)} محتجزاً للمستأجر في الدفاتر.`);
  if (refundOpen) lines.push('إن أردت رد التأمين فسجّله قبل الإنهاء؛ هذه الشاشة لا تُفتح للعقد بعد إنهائه.');
  return lines.length > 0 ? lines.join(' ') : null;
}

/**
 * The closing statement of a lease: what the tenant owes, the deposit held, the net, then the two things
 * that can follow: hand the deposit back (through the normal expense entry, never posted from here) and
 * end the lease. A phone gets a full-height sheet with the actions pinned at the bottom.
 */
export function LeaseSettlementDialog({
  request,
  onOpenChange,
}: {
  request: SettlementRequest | null;
  onOpenChange: (open: boolean) => void;
}) {
  const terminate = useTerminateLeaseContract();
  // keep the last request while the sheet fades out, so it does not empty before it is gone
  const [kept, setKept] = useState(request);
  if (request && request !== kept) setKept(request);
  const shown = request ?? kept;
  // set when the transaction dialog takes over: focus must not be pulled back from it
  const handoffRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <DialogPrimitive.Root
      open={request != null}
      onOpenChange={(open) => {
        // ending a lease is in flight: closing now would hide the result
        if (!open && terminate.isPending) return;
        onOpenChange(open);
      }}
    >
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={contentRef}
          dir="rtl"
          tabIndex={-1}
          // the sheet itself takes focus, not the tenant link inside it: Enter must not navigate away
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            contentRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (handoffRef.current) {
              handoffRef.current = false;
              return;
            }
            if (shown?.opener?.isConnected) shown.opener.focus();
          }}
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden bg-card text-card-foreground outline-hidden',
            // a full-height sheet on a phone, a centred card from 640px
            'inset-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(90dvh,46rem)] sm:w-[calc(100%-2rem)] sm:max-w-xl',
            'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-border sm:shadow-lift',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 duration-150',
          )}
        >
          {shown && (
            <SettlementBody
              key={shown.contract.id}
              contract={shown.contract}
              opener={shown.opener}
              terminate={terminate}
              handoffRef={handoffRef}
              onClose={() => onOpenChange(false)}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

function SettlementBody({
  contract,
  opener,
  terminate,
  handoffRef,
  onClose,
}: {
  contract: SettlementTarget;
  opener: HTMLElement | null;
  terminate: ReturnType<typeof useTerminateLeaseContract>;
  handoffRef: { current: boolean };
  onClose: () => void;
}) {
  // the day the statement opened: stable across re-renders
  const [today] = useState(() => todayISODate());
  const { can } = usePermission();
  const openTx = useTxDialog((s) => s.open);
  const { state, fetching, depositAccount, accountsFailed, retry } = useLeaseSettlement({
    tenantId: contract.tenant_id,
    contractId: contract.id,
    endDate: contract.end_date,
    today,
  });
  const [mode, setMode] = useState<RefundMode>('net');
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  // the person is told what happens next, and finds their place again when they step back
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
    else if (wasConfirming.current) endRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const tenantName = contract.tenant?.name || 'مستأجر';
  const unit = contract.unit?.unit_number;
  const settlement = state.status === 'loading' ? null : state.settlement;
  const ready = state.status === 'ready' && settlement != null;
  const plan = settlement?.refund;

  const canEnd = can('document.create');
  const canRefund = can('expense.create');
  const refundBlocked = !plan?.available
    ? null
    : !canRefund
      ? 'تسجيل رد التأمين يحتاج صلاحية المصروفات.'
      : accountsFailed
        ? 'تعذّر تحميل بنود الحسابات. أعد المحاولة.'
        : depositAccount.state === 'missing'
          ? 'بند تأمينات المستأجرين غير مفعّل في دليل الحسابات. أبلغ مسؤول النظام.'
          : depositAccount.state === 'hidden_in_dialog'
            ? 'نافذة المصروف لا تعرض بند التأمينات بعد، فلا يمكن تجهيز الرد منها. أبلغ مسؤول النظام.'
            : null;

  function startRefund() {
    if (!plan?.available || refundBlocked) return;
    const prefill = buildRefundPrefill({
      amount: mode === 'full' ? plan.full : plan.amount,
      cap: plan.full,
      tenantId: contract.tenant_id,
      tenantName,
      unitNumber: unit,
      categoryId: depositAccount.state === 'ready' ? depositAccount.id : null,
      afterArrears: mode === 'net' && plan.offset > 0,
    });
    if (!prefill) return;
    // this sheet closes first: the entry dialog is not part of its focus trap
    handoffRef.current = true;
    onClose();
    openTx(prefill);
    // when the entry closes, focus goes back to the button this statement was opened from
    if (opener?.isConnected) useTxDialog.setState({ opener });
  }

  async function endLease() {
    try {
      await terminate.mutateAsync({ id: contract.id, unitId: contract.unit_id });
      onClose();
    } catch {
      // the hook has shown the reason; the statement stays open
    }
  }

  const leftover = settlement ? leftoverText(settlement, !!plan?.available && !refundBlocked) : null;

  return (
    <>
      <div className="flex shrink-0 items-start gap-2 border-b border-border py-3 ps-4 pe-2 sm:ps-6">
        <div className="min-w-0 flex-1 pt-1">
          <DialogTitle className="text-[16px] tracking-normal">تصفية العقد</DialogTitle>
          <DialogDescription className="mt-0.5 text-[13.5px]">
            {contract.tenant_id ? (
              <Link href={`/contacts/${contract.tenant_id}`} className="font-medium text-foreground hover:underline">
                {tenantName}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{tenantName}</span>
            )}
            {` · ${unit ? `محل ${unit}` : 'بلا وحدة'}`}
            {contract.unit?.floor ? ` · الدور ${contract.unit.floor}` : ''}
          </DialogDescription>
        </div>
        <DialogPrimitive.Close asChild>
          <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 sm:size-9" aria-label="إغلاق">
            <X className="stroke-[1.6]" aria-hidden />
          </Button>
        </DialogPrimitive.Close>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6" aria-busy={state.status === 'loading'}>
        {/* always present, so the result is read out when it arrives; a failure announces itself as an alert */}
        <p role="status" className="sr-only">
          {!settlement ? 'جارٍ تحميل أرقام التصفية' : settlement.verdict.kind === 'unknown' ? '' : `${settlement.verdict.sentence}. ${settlement.verdict.detail}`}
        </p>
        {!settlement ? (
          <SettlementLoading />
        ) : (
          <div className="flex flex-col gap-5">
            <SettlementAnchor settlement={settlement} onRetry={retry} retrying={fetching} />
            <SettlementStatement settlement={settlement} />
            <SettlementNotes notes={settlement.notes} />
            <EndDateSection plan={settlement.endPlan} />
            {ready && plan && <RefundSection plan={plan} mode={mode} onMode={setMode} blocked={refundBlocked} />}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-4">
        {confirming ? (
          <div ref={confirmRef} tabIndex={-1} role="group" aria-labelledby="settle-confirm-h" className="flex flex-col gap-3 outline-hidden">
            <div className="flex flex-col gap-1">
              <p id="settle-confirm-h" className="text-[14px] font-semibold text-foreground">
                أنهِ هذا العقد؟
              </p>
              <p className="text-[13px] leading-relaxed text-ink-soft">
                {settlement && ready ? `${settlement.verdict.sentence}. ` : ''}
                يُنهى العقد بتاريخ اليوم ويصبح المحل متاحاً.
                {leftover ? ` ${leftover}` : ''}
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="h-11 sm:h-9" disabled={terminate.isPending} onClick={() => setConfirming(false)}>
                تراجع
              </Button>
              {/* the numbers this step restates must still be good: a failed refresh ends the step until they are back */}
              <Button type="button" variant="destructive" className="h-11 sm:h-9" disabled={terminate.isPending || !ready} onClick={endLease}>
                {terminate.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <DoorClosed className="stroke-[1.6]" aria-hidden />}
                أنهِ العقد
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {ready && plan?.available && (
              <Button
                type="button"
                variant="outline"
                className="h-11 sm:h-9"
                disabled={refundBlocked != null}
                aria-describedby="settle-refund-note"
                onClick={startRefund}
              >
                <HandCoins className="stroke-[1.6]" aria-hidden />
                تسجيل رد التأمين
              </Button>
            )}
            {canEnd ? (
              <Button ref={endRef} type="button" className="h-11 sm:h-9" disabled={!ready} onClick={() => setConfirming(true)}>
                <DoorClosed className="stroke-[1.6]" aria-hidden />
                إنهاء العقد
              </Button>
            ) : (
              <p className="py-1 text-[12.5px] text-ink-mute">إنهاء العقد يحتاج صلاحية توثيق العقود.</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
