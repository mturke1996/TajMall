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
  open: (kindOrPrefill?: TxKind | TxDialogPrefill) => void;
  close: () => void;
};

function resolveOpen(arg?: TxKind | TxDialogPrefill): Omit<State, 'open' | 'close' | 'openedAt'> {
  if (!arg || typeof arg === 'string') {
    return {
      isOpen: true,
      defaultKind: arg ?? 'REVENUE',
      prefillContactId: null,
      prefillContactKind: null,
      prefillDescription: null,
      prefillAmount: null,
    };
  }
  return {
    isOpen: true,
    defaultKind: arg.kind ?? 'REVENUE',
    prefillContactId: arg.contactId ?? null,
    prefillContactKind: arg.contactKind ?? null,
    prefillDescription: arg.description ?? null,
    // amounts computed by subtraction carry float noise (1249.5500000000002); the field takes 3 decimals
    prefillAmount: arg.amount != null && arg.amount > 0 ? Math.round(arg.amount * 1000) / 1000 : null,
  };
}

export const useTxDialog = create<State>((set) => ({
  isOpen: false,
  openedAt: 0,
  defaultKind: 'REVENUE',
  prefillContactId: null,
  prefillContactKind: null,
  prefillDescription: null,
  prefillAmount: null,
  open: (kindOrPrefill) => set((st) => ({ ...resolveOpen(kindOrPrefill), openedAt: st.openedAt + 1 })),
  close: () =>
    set({
      isOpen: false,
      prefillContactId: null,
      prefillContactKind: null,
      prefillDescription: null,
      prefillAmount: null,
    }),
}));
