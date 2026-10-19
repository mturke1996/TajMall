'use client';

import { create } from 'zustand';
import type { ContactKind } from '@/lib/db/types';

/**
 * Lightweight UI store that owns the "new transaction" dialog.
 * Any button anywhere can call `useTxDialog().open()` — no prop drilling.
 */

export type TxKind = 'REVENUE' | 'EXPENSE';

export type TxDialogPrefill = {
  kind?: TxKind;
  contactId?: string;
  contactKind?: ContactKind | 'ALL';
  /** e.g. "سداد إيجار شهر مارس 2026 للمؤجر …": the month a schedule attributes the payment to */
  description?: string;
  amount?: number;
  categoryId?: string;
  cashboxId?: string;
  method?: 'CASH' | 'CHEQUE' | 'TRANSFER' | 'CARD';
  /** the transaction this entry repeats: the dialog says so and re-checks its party and account */
  repeatOf?: { number: number; contactName?: string };
};

type State = {
  isOpen: boolean;
  /** increases on every open(), also when already open, so the form resets for the new request */
  openedAt: number;
  defaultKind: TxKind;
  prefillContactId: string | null;
  prefillContactKind: ContactKind | 'ALL' | null;
  prefillDescription: string | null;
  prefillAmount: number | null;
  prefillCategoryId: string | null;
  prefillCashboxId: string | null;
  prefillMethod: TxDialogPrefill['method'] | null;
  repeatOf: TxDialogPrefill['repeatOf'] | null;
  /** what had focus when the dialog opened: it gets focus back when the dialog closes */
  opener: HTMLElement | null;
  open: (kindOrPrefill?: TxKind | TxDialogPrefill) => void;
  close: () => void;
};

type Resolved = Omit<State, 'open' | 'close' | 'openedAt' | 'opener'>;

const NO_PREFILL = {
  prefillContactId: null,
  prefillContactKind: null,
  prefillDescription: null,
  prefillAmount: null,
  prefillCategoryId: null,
  prefillCashboxId: null,
  prefillMethod: null,
  repeatOf: null,
} satisfies Partial<Resolved>;

function resolveOpen(arg?: TxKind | TxDialogPrefill): Resolved {
  if (!arg || typeof arg === 'string') {
    return { ...NO_PREFILL, isOpen: true, defaultKind: arg ?? 'REVENUE' };
  }
  return {
    isOpen: true,
    defaultKind: arg.kind ?? 'REVENUE',
    prefillContactId: arg.contactId ?? null,
    prefillContactKind: arg.contactKind ?? null,
    prefillDescription: arg.description ?? null,
    // amounts computed by subtraction carry float noise (1249.5500000000002); the field takes 3 decimals
    prefillAmount: arg.amount != null && arg.amount > 0 ? Math.round(arg.amount * 1000) / 1000 : null,
    prefillCategoryId: arg.categoryId ?? null,
    prefillCashboxId: arg.cashboxId ?? null,
    prefillMethod: arg.method ?? null,
    repeatOf: arg.repeatOf ?? null,
  };
}

export const useTxDialog = create<State>((set) => ({
  isOpen: false,
  openedAt: 0,
  defaultKind: 'REVENUE',
  ...NO_PREFILL,
  opener: null,
  open: (kindOrPrefill) =>
    set((st) => ({
      ...resolveOpen(kindOrPrefill),
      openedAt: st.openedAt + 1,
      // a second request while open keeps the first opener: focus inside the dialog is not a place to return to
      opener: st.isOpen ? st.opener : typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null,
    })),
  close: () => set({ isOpen: false, ...NO_PREFILL }),
}));
