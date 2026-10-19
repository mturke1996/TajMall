'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { RecordRentPaymentDialog } from '@/components/tenants/record-rent-payment-dialog';
import { useTenantRentSummary } from '@/lib/db/queries';
import { usePermission } from '@/lib/supabase/use-permission';

/**
 * What a row needs to start a collection: whether it may (and whether the data for it is in), and the
 * handler. `onCollect` takes the tapped button so focus can come back to it when the dialog closes.
 */
export type CollectControl = {
  state: 'ready' | 'loading' | 'failed';
  onCollect: (tenantId: string, trigger?: HTMLElement | null) => void;
  onRetry: () => void;
};

/** The dialog opened from a row button is not opened by a Radix trigger, so Radix leaves focus on the page. */
function giveFocusBack(opener: HTMLElement | null, fallbackId?: string) {
  const dialogGone = () => !document.querySelector('[role="dialog"]');
  let tries = 0;
  const attempt = () => {
    // the dialog fades out first; focusing sooner would be taken back by its focus trap
    if (!dialogGone() && tries++ < 20) {
      window.setTimeout(attempt, 50);
      return;
    }
    const target = opener?.isConnected ? opener : fallbackId ? document.getElementById(fallbackId) : null;
    // someone who already moved on (clicked or tabbed elsewhere) keeps their place
    const active = document.activeElement;
    if (target && (!active || active === document.body)) target.focus({ preventScroll: true });
  };
  window.setTimeout(attempt, 0);
}

/**
 * Collecting rent from a list. The dialog gets the row of the `tenant_rent_summary` view, not the row of
 * the month function the list is built from: only the view carries `rent_claim_start`, the month the
 * database starts charging rent from. Without it the dialog would fall back to the contract start and
 * offer months the database refuses.
 *
 * `dialog` must be rendered once by the screen that calls this hook.
 */
export function useCollectRent({ focusFallbackId }: { focusFallbackId?: string } = {}) {
  const { can } = usePermission();
  const rent = useTenantRentSummary();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  const viewRows = rent.data;
  const byId = useMemo(() => new Map((viewRows ?? []).map((r) => [r.id, r])), [viewRows]);
  const tenant = selectedId ? (byId.get(selectedId) ?? null) : null;

  const state: CollectControl['state'] = viewRows !== undefined ? 'ready' : rent.isError ? 'failed' : 'loading';
  const refetch = rent.refetch;

  const onCollect = useCallback<CollectControl['onCollect']>(
    (tenantId, trigger) => {
      if (!byId.has(tenantId)) {
        toast.error('تعذّر فتح التحصيل لهذا المستأجر. حدّث الصفحة وأعد المحاولة.');
        return;
      }
      opener.current = trigger ?? (document.activeElement as HTMLElement | null);
      setSelectedId(tenantId);
      setOpen(true);
    },
    [byId],
  );

  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) giveFocusBack(opener.current, focusFallbackId);
    },
    [focusFallbackId],
  );

  const control: CollectControl = useMemo(
    () => ({ state, onCollect, onRetry: () => void refetch() }),
    [state, onCollect, refetch],
  );

  // mounted once a tenant has been picked, and kept after closing so the dialog can fade out
  const dialog = tenant ? <RecordRentPaymentDialog tenant={tenant} open={open} onOpenChange={onOpenChange} /> : null;

  return { canCollect: can('revenue.create'), control, dialog };
}
